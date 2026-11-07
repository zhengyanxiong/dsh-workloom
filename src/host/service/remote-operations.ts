/**
 * Remote operation bodies for Loom, grouped separately from the service facade.
 *
 * Every method receives the owner-checked catalog runner from `LoomService`;
 * transport and lifecycle stay on the service.
 */
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { brandString, type Branded } from '@deepseek-ai/dsh-brand'
import type { Catalog } from '../catalog.ts'
import type {
  AttachSessionRequest, CatalogSnapshot, CreateTaskRequest, CreateVersionRequest, GenerateLockRequest,
  CleanupWorkspaceRequest, PrepareWorkspaceRequest, ProjectConfig, ProjectRecord, RegisterWorkspaceRequest,
  StartAttemptRequest, TaskRecord, TransitionTaskRequest, WorkspaceChangesRequest, WorkspaceRepositoryChangesRecord,
  WorkspaceStatusResult, VersionRecord, WorkspaceRecord, ExecutionRequest, ReleaseExecutionRequest,
  UpdateProjectRequest, UpdateVersionRequest, UpdateTaskRequest, DeleteProjectRequest, DeleteVersionRequest,
  DeleteTaskRequest, RegisterTemporarySessionRequest, ForgetTemporarySessionRequest, RepositoryBranchesRequest,
  InspectWorkspaceRequest, WorkspaceInspection, CommitWorkspaceRequest, WorkspaceCommitResult,
  UpdateWorkspaceRequest, DeleteWorkspaceRequest, ReorderExecutionQueueRequest,
} from '../../types.ts'
import type { Lock } from '../../domain/task.ts'
import type { TemporarySessionRecord } from '../../api/records.ts'
import type { ExecutionState } from '../../domain/execution.ts'
import { parseProject } from '../../domain/project.ts'
import { repositoryBranches } from '../../git/workspace.ts'
import { inspectWorkspace, sameRepositoryMappings } from './inspection.ts'
import { prepareVersionWorkspace } from './version-workspace.ts'
import {
  attemptRequest, cleanupWorkspaceRequest, commitWorkspaceRequest, deleteProjectRequest, deleteTaskRequest, deleteVersionRequest,
  executionRequest, forgetTemporarySessionRequest, inspectWorkspaceRequest, lockRequest, registerWorkspaceRequest,
  releaseExecutionRequest, reorderExecutionQueueRequest, repositoryBranchesRequest, sessionRequest, taskRequest,
  temporarySessionRequest, transitionRequest, updateProjectRequest, updateTaskRequest, updateVersionRequest,
  updateWorkspaceRequest, deleteWorkspaceRequest, versionRequest, workspaceChangesRequest, workspaceRequest,
} from './requests.ts'
import { serviceError } from './errors.ts'
import type { VersionContextRegistry } from './version-context.ts'

/** Owner-checked catalog runner supplied by the service facade. */
export type RunCatalog = <T>(operation: (catalog: Catalog) => T | Promise<T>) => Promise<T>

/** Remote operation bodies that do not own service lifecycle. */
export class RemoteOperations {
  constructor(
    private readonly workspacesDir: string,
    private readonly versionContext: VersionContextRegistry,
  ) {}

  /** Read a detached catalog snapshot. @returns current committed records. */
  snapshot(run: RunCatalog): Promise<CatalogSnapshot> { return run(catalog => catalog.snapshot()) }

  /** Admit imported project JSON. @param request - project configuration. @returns persisted project. */
  createProject(run: RunCatalog, request: ProjectConfig): Promise<ProjectRecord> { return run(catalog => catalog.createProject(request)) }

  /** Replace a project's admitted configuration. @param request - project identity and new configuration. @returns persisted project. */
  updateProject(run: RunCatalog, request: UpdateProjectRequest): Promise<ProjectRecord> {
    return run(catalog => {
      const parsed = updateProjectRequest.parse(request)
      return catalog.updateProject(brandString<ProjectRecord['id']>(parsed.projectId), parseProject(parsed.config))
    })
  }

  /** Delete a project with no versions. @param request - project identity. @returns nothing after the record is gone. */
  deleteProject(run: RunCatalog, request: DeleteProjectRequest): Promise<void> {
    return run(catalog => catalog.deleteProject(brandString<ProjectRecord['id']>(deleteProjectRequest.parse(request).projectId)))
  }

  /** Create a version. @param request - project, title, description and repository refs. @returns persisted version. */
  createVersion(run: RunCatalog, request: CreateVersionRequest): Promise<VersionRecord> {
    return run(async catalog => {
      const parsed = versionRequest.parse(request)
      const version = await catalog.createVersion(
        brandString<ProjectRecord['id']>(parsed.projectId),
        parsed.name,
        parsed.sources.map(source => ({ sourceId: brandString<VersionRecord['sources'][number]['sourceId']>(source.sourceId), ref: source.ref })),
        parsed.description,
        parsed.targets?.map(target => ({
          subProjectId: brandString<Branded<'loom.subproject'>>(target.subProjectId),
          sourceId: brandString<VersionRecord['sources'][number]['sourceId']>(target.sourceId),
          ref: target.ref,
        })),
      )
      if (parsed.workspaces === undefined) return version
      try {
        const lock = await catalog.generateLock(version.id)
        for (const input of parsed.workspaces) await prepareVersionWorkspace(catalog, version, lock, input)
        return version
      } catch (error) {
        // A partially prepared workspace can exist even when its own call rejected.
        // Remove only records created for this new version, then remove the version.
        for (const workspace of catalog.snapshot().workspaces.filter(candidate => candidate.versionId === version.id)) {
          try { await catalog.cleanupWorkspace(workspace.id, true) } catch { /* retain the original failure for the caller */ }
        }
        try { await catalog.deleteVersion(version.id) } catch { /* report the original preparation failure */ }
        throw error
      }
    })
  }

  /** Materialize one workspace while saving a version.
   * @param catalog - live catalog
   * @param version - owning version
   * @param lock - resolved baseline
   * @param input - auto-created or linked workspace input
   */
  /** Replace a version's name, description and repository refs. @param request - version identity and new values. @returns persisted version. */
  updateVersion(run: RunCatalog, request: UpdateVersionRequest): Promise<VersionRecord> {
    return run(catalog => {
      const parsed = updateVersionRequest.parse(request)
      return catalog.updateVersion(
        brandString<VersionRecord['id']>(parsed.versionId),
        parsed.name,
        parsed.sources.map(source => ({ sourceId: brandString<VersionRecord['sources'][number]['sourceId']>(source.sourceId), ref: source.ref })),
        parsed.description,
        parsed.targets?.map(target => ({
          subProjectId: brandString<Branded<'loom.subproject'>>(target.subProjectId),
          sourceId: brandString<VersionRecord['sources'][number]['sourceId']>(target.sourceId),
          ref: target.ref,
        })),
      )
    })
  }

  /** Delete a version with no tasks or workspaces. @param request - version identity. @returns nothing after its Locks are gone. */
  deleteVersion(run: RunCatalog, request: DeleteVersionRequest): Promise<void> {
    return run(catalog => catalog.deleteVersion(brandString<VersionRecord['id']>(deleteVersionRequest.parse(request).versionId)))
  }

  /** Delete a task after its workspaces are cleaned. @param request - task identity. @returns nothing after the task record is gone. */
  deleteTask(run: RunCatalog, request: DeleteTaskRequest): Promise<void> {
    return run(catalog => catalog.deleteTask(brandString<TaskRecord['id']>(deleteTaskRequest.parse(request).taskId)))
  }

  /** Resolve all version refs. @param request - owning version. @returns immutable Lock. */
  generateLock(run: RunCatalog, request: GenerateLockRequest): Promise<Lock> {
    return run(catalog => catalog.generateLock(brandString<VersionRecord['id']>(lockRequest.parse(request).versionId)))
  }

  /** Create a pending task. @param request - fixed version and title. @returns persisted task. */
  createTask(run: RunCatalog, request: CreateTaskRequest): Promise<TaskRecord> {
    return run(catalog => {
      const parsed = taskRequest.parse(request)
      return catalog.createTask(brandString<VersionRecord['id']>(parsed.versionId), parsed.title, {
        ...(parsed.workspaceId === undefined ? {} : { workspaceId: brandString<WorkspaceRecord['id']>(parsed.workspaceId) }),
        ...(parsed.agentPreset === undefined ? {} : { agentPreset: parsed.agentPreset }),
        ...(parsed.description === undefined ? {} : { description: parsed.description }),
        ...(parsed.moduleIds === undefined ? {} : { moduleIds: parsed.moduleIds.map(moduleId => brandString<Branded<'loom.module'>>(moduleId)) }),
        ...(parsed.priority === undefined ? {} : { priority: parsed.priority }),
      })
    })
  }

  /** Replace editable task metadata. @param request - task identity and metadata. @returns persisted task. */
  updateTask(run: RunCatalog, request: UpdateTaskRequest): Promise<TaskRecord> {
    return run(catalog => {
      const parsed = updateTaskRequest.parse(request)
      return catalog.updateTask(brandString<TaskRecord['id']>(parsed.taskId), parsed.title, {
        ...(parsed.agentPreset === undefined ? {} : { agentPreset: parsed.agentPreset }),
        ...(parsed.description === undefined ? {} : { description: parsed.description }),
        ...(parsed.moduleIds === undefined ? {} : { moduleIds: parsed.moduleIds.map(moduleId => brandString<Branded<'loom.module'>>(moduleId)) }),
        ...(parsed.priority === undefined ? {} : { priority: parsed.priority }),
      })
    })
  }

  /** Materialize a workspace from a version Lock and record it. @param request - owning baseline and an optional absolute root. @returns persisted workspace. */
  prepareWorkspace(run: RunCatalog, request: PrepareWorkspaceRequest): Promise<WorkspaceRecord> {
    return run(catalog => {
      const parsed = workspaceRequest.parse(request)
      const path = parsed.path ?? join(this.workspacesDir, `workspace-${randomUUID().slice(0, 8)}`)
      return catalog.prepareWorkspace({
        path,
        versionId: brandString<Lock['versionId']>(parsed.versionId),
        lockId: brandString<Lock['id']>(parsed.lockId),
        ...(parsed.branches === undefined ? {} : { branches: parsed.branches }),
        ...(parsed.mode === undefined ? {} : { mode: parsed.mode }),
        ...(parsed.repositories === undefined ? {} : {
          repositories: parsed.repositories.map(repository => ({
            sourceId: brandString<Branded<'loom.source'>>(repository.sourceId),
            path: repository.path,
            targetPath: repository.targetPath,
          })),
        }),
        ...(parsed.workspaceId === undefined ? {} : { workspaceId: brandString<WorkspaceRecord['id']>(parsed.workspaceId) }),
        ...(parsed.requireBranches === undefined ? {} : { requireBranches: parsed.requireBranches }),
      })
    })
  }

  /** Read local branches of one repository. @param request - absolute repository path. @returns current and available branches. */
  repositoryBranches(run: RunCatalog, request: RepositoryBranchesRequest): Promise<{ topLevel: string; current?: string; branches: readonly string[] }> {
    return run(() => repositoryBranches(repositoryBranchesRequest.parse(request).repo))
  }

  /** Commit all uncommitted workspace changes without pushing. @param request - workspace identity and optional subject. @returns per-repository checkpoint results. */
  commitWorkspace(run: RunCatalog, request: CommitWorkspaceRequest): Promise<WorkspaceCommitResult> {
    return run(catalog => {
      const parsed = commitWorkspaceRequest.parse(request)
      return catalog.commitWorkspace(brandString<WorkspaceRecord['id']>(parsed.workspaceId), parsed.message ?? 'Loom checkpoint')
    })
  }

  /** Check one existing workspace root against a version's repositories. @param request - absolute root and version. @returns per-repository Git status, without registering anything. */
  inspectWorkspace(run: RunCatalog, request: InspectWorkspaceRequest): Promise<WorkspaceInspection> {
    const parsed = inspectWorkspaceRequest.parse(request)
    return run(catalog => inspectWorkspace(catalog.snapshot(), parsed.path, parsed.versionId))
  }

  /** Read every repository's changes against a workspace Lock. @param request - prepared workspace identity. @returns changed files and hunks per repository. */
  workspaceChanges(run: RunCatalog, request: WorkspaceChangesRequest): Promise<{ repositories: WorkspaceRepositoryChangesRecord[] }> {
    return run(catalog => {
      const parsed = workspaceChangesRequest.parse(request)
      return catalog.workspaceChanges(
        brandString<WorkspaceRecord['id']>(parsed.workspaceId),
        parsed.attemptId === undefined ? undefined : brandString<Branded<'loom.attempt'>>(parsed.attemptId),
      )
    })
  }

  /** Count changed files in a workspace without reading their diffs. @param request - prepared workspace identity. @returns changed-file count, including untracked files. */
  workspaceChangeCount(run: RunCatalog, request: WorkspaceChangesRequest): Promise<number> {
    return run(catalog => {
      const parsed = workspaceChangesRequest.parse(request)
      return catalog.workspaceChangeCount(
        brandString<WorkspaceRecord['id']>(parsed.workspaceId),
        parsed.attemptId === undefined ? undefined : brandString<Branded<'loom.attempt'>>(parsed.attemptId),
      )
    })
  }

  /** Read whether a workspace is owned by a running task and what it has changed. @param request - prepared workspace identity. @returns ownership and changes. */
  workspaceStatus(run: RunCatalog, request: WorkspaceChangesRequest): Promise<WorkspaceStatusResult> {
    return run(catalog => {
      const parsed = workspaceChangesRequest.parse(request)
      return catalog.workspaceStatus(
        brandString<WorkspaceRecord['id']>(parsed.workspaceId),
        parsed.attemptId === undefined ? undefined : brandString<Branded<'loom.attempt'>>(parsed.attemptId),
      )
    })
  }

  /** Remove a workspace, optionally deleting its directory after path confirmation. @param request - workspace, delete-files flag and echoed root. @returns nothing after the record and optional files are gone. */
  deleteWorkspace(run: RunCatalog, request: DeleteWorkspaceRequest): Promise<void> {
    return run(catalog => {
      const parsed = deleteWorkspaceRequest.parse(request)
      return catalog.deleteWorkspace(
        brandString<WorkspaceRecord['id']>(parsed.workspaceId),
        parsed.deleteFiles === true,
        parsed.confirmPath,
      )
    })
  }

  /** Update editable Workspace metadata. @param request - workspace identity and display label. @returns persisted workspace. */
  updateWorkspace(run: RunCatalog, request: UpdateWorkspaceRequest): Promise<WorkspaceRecord> {
    return run(catalog => {
      const parsed = updateWorkspaceRequest.parse(request)
      return catalog.updateWorkspace(brandString<WorkspaceRecord['id']>(parsed.workspaceId), parsed.label ?? '')
    })
  }

  /** Remove a retained workspace after explicit confirmation. @param request - workspace and whether uncommitted changes may be discarded. @returns nothing after worktrees and the record are gone. */
  cleanupWorkspace(run: RunCatalog, request: CleanupWorkspaceRequest): Promise<void> {
    return run(async catalog => {
      const parsed = cleanupWorkspaceRequest.parse(request)
      await catalog.cleanupWorkspace(brandString<WorkspaceRecord['id']>(parsed.workspaceId), parsed.discardChanges === true)
    })
  }

  /** Record a prepared workspace whose files already exist. @param request - absolute path and owning baseline. @returns persisted workspace. */
  registerWorkspace(run: RunCatalog, request: RegisterWorkspaceRequest): Promise<WorkspaceRecord> {
    return run(async catalog => {
      const parsed = registerWorkspaceRequest.parse(request)
      const snapshot = catalog.snapshot()
      const registered = parsed.mode === 'linked' ? undefined : snapshot.workspaces.find(candidate => candidate.cleaned !== true
        && (candidate.rootPath ?? candidate.path) === (parsed.rootPath ?? parsed.path)
        && (candidate.mode ?? 'direct') === 'direct'
        && sameRepositoryMappings(parsed.repositories, candidate.repositories))
      if (registered !== undefined) {
        const version = snapshot.versions.find(candidate => candidate.id === parsed.versionId)
        const projectId = registered.projectId ?? snapshot.versions.find(candidate => candidate.id === registered.versionId)?.projectId
        if (version !== undefined && projectId === version.projectId) {
          await catalog.ensureWorkspaceBranches(registered.id)
          return catalog.ensureWorkspaceSkillLinks(registered.id)
        }
      }
      const branches = { ...parsed.branches }
      let repositories: { sourceId: Branded<'loom.source'>; path: string; targetPath: string }[] | undefined
      if (parsed.repositories !== undefined) {
        repositories = parsed.repositories.map(repository => {
          const sourceId = brandString<Branded<'loom.source'>>(repository.sourceId)
          return { sourceId, path: repository.path, targetPath: repository.targetPath }
        })
        for (const repository of repositories) {
          const current = await repositoryBranches(repository.targetPath)
          if (parsed.requireBranches === true && current.current === undefined) throw serviceError('detached_head', repository.targetPath)
          if (branches[repository.sourceId] === undefined && current.current !== undefined) branches[repository.sourceId] = current.current
        }
      } else {
        const inspection = await inspectWorkspace(catalog.snapshot(), parsed.path, parsed.versionId)
        const failed = inspection.repositories.find(repository => repository.error !== undefined)
        if (failed !== undefined) throw new Error(`invalid_workspace_path: ${failed.directory} (${failed.error ?? 'not_git'})`)
        for (const repository of inspection.repositories) {
          if (parsed.requireBranches === true && repository.current === undefined) throw serviceError('detached_head', repository.directory)
          if (branches[repository.sourceId] === undefined && repository.current !== undefined) branches[repository.sourceId] = repository.current
        }
      }
      const workspace = await catalog.registerPreparedWorkspace({
        path: parsed.path,
        versionId: brandString<Lock['versionId']>(parsed.versionId),
        lockId: brandString<Lock['id']>(parsed.lockId),
        ...(Object.keys(branches).length === 0 ? {} : { branches }),
        ...(parsed.mode === undefined ? {} : { mode: parsed.mode }),
        ...(parsed.projectId === undefined ? {} : { projectId: brandString<Branded<'loom.project'>>(parsed.projectId) }),
        ...(parsed.rootPath === undefined ? {} : { rootPath: parsed.rootPath }),
        ...(parsed.rootOwner === undefined ? {} : { rootOwner: parsed.rootOwner }),
        ...(repositories === undefined ? {} : { repositories }),
      })
      await catalog.ensureWorkspaceBranches(workspace.id)
      return catalog.ensureWorkspaceSkillLinks(workspace.id)
    })
  }

  /** Start the next execution round on a prepared workspace. @param request - task and workspace identities. @returns the running task. */
  startAttempt(run: RunCatalog, request: StartAttemptRequest): Promise<TaskRecord> {
    return run(async catalog => {
      const parsed = attemptRequest.parse(request)
      const workspaceId = brandString<WorkspaceRecord['id']>(parsed.workspaceId)
      const record = catalog.snapshot().workspaces.find(candidate => candidate.id === workspaceId)
      if (record === undefined) throw serviceError('missing_workspace')
      if (record.cleaned === true) throw serviceError('workspace_cleaned')
      // A partially prepared workspace has no complete worktree set to reconcile.
      if (record.preparation !== undefined && record.preparation.status !== 'ready') throw serviceError('workspace_not_prepared', `preparation is ${record.preparation.status}`)
      const workspace = await catalog.ensureWorkspaceBranches(workspaceId)
      if (workspace.cleaned === true) throw serviceError('workspace_cleaned')
      if (await catalog.workspaceDirty(workspaceId)) throw serviceError('workspace_changes')
      await catalog.ensureWorkspaceSkillLinks(workspaceId)
      return catalog.startAttempt(brandString<TaskRecord['id']>(parsed.taskId), workspaceId, parsed.allowBusy === true ? { allowBusy: true } : undefined)
    })
  }

  /** Associate another native Session with the current round. @param request - task and Session identities. @returns the updated task. */
  attachSession(run: RunCatalog, request: AttachSessionRequest): Promise<TaskRecord> {
    const parsed = sessionRequest.parse(request)
    const sessionId = brandString<Branded<'SessionId'>>(parsed.sessionId)
    const call = run(catalog => catalog.attachSession(brandString<TaskRecord['id']>(parsed.taskId), sessionId))
    // The Agent may predate the attachment; register after the catalog write and
    // its snapshot refresh, without delaying the Remote reply.
    void call.then(() => this.versionContext.syncVersionContext(sessionId), () => undefined)
    return call
  }

  /** Mark a native Session as a Loom temporary Session. @param request - Session identity and prepared workspace path. @returns the committed record. */
  registerTemporarySession(run: RunCatalog, request: RegisterTemporarySessionRequest): Promise<TemporarySessionRecord> {
    const parsed = temporarySessionRequest.parse(request)
    const sessionId = brandString<Branded<'SessionId'>>(parsed.sessionId)
    const call = run(catalog => catalog.registerTemporarySession(sessionId, parsed.workspacePath))
    // Temporary Sessions are never task-bound; drop any stale registration.
    void call.then(() => this.versionContext.syncVersionContext(sessionId), () => undefined)
    return call
  }

  /** Stop treating a native Session as a Loom temporary Session. @param request - Session identity. @returns nothing after the record is gone. */
  forgetTemporarySession(run: RunCatalog, request: ForgetTemporarySessionRequest): Promise<void> {
    return run(catalog => catalog.forgetTemporarySession(brandString<Branded<'SessionId'>>(forgetTemporarySessionRequest.parse(request).sessionId)))
  }

  /** Change business status under the trusted caller identity. @param request - task, target state and actor. @returns the updated task. */
  transitionTask(run: RunCatalog, request: TransitionTaskRequest): Promise<TaskRecord> {
    return run(catalog => {
      const parsed = transitionRequest.parse(request)
      return catalog.transitionTask(brandString<TaskRecord['id']>(parsed.taskId), parsed.target, parsed.actor, parsed.basis === undefined ? undefined : { basis: parsed.basis })
    })
  }

  /** Acquire workspace execution access or join its FIFO wait queue. @param request - workspace and requesting Session. @returns the committed scheduling state. */
  acquireExecution(run: RunCatalog, request: ExecutionRequest): Promise<ExecutionState> {
    return run(catalog => {
      const parsed = executionRequest.parse(request)
      return catalog.acquireExecution(
        brandString<WorkspaceRecord['id']>(parsed.workspaceId),
        brandString<Branded<'SessionId'>>(parsed.sessionId),
      )
    })
  }

  /** Replace the FIFO waiting order for one workspace. @param request - workspace and every waiting Session in the new order. @returns scheduling state after reordering. */
  reorderExecutionQueue(run: RunCatalog, request: ReorderExecutionQueueRequest): Promise<ExecutionState> {
    return run(catalog => {
      const parsed = reorderExecutionQueueRequest.parse(request)
      return catalog.reorderExecutionQueue(
        brandString<WorkspaceRecord['id']>(parsed.workspaceId),
        parsed.sessionIds.map(id => brandString<Branded<'SessionId'>>(id)),
      )
    })
  }

  /** Leave the execution waiting queue for one Session. @param request - workspace and Session. @returns scheduling state after removal. */
  cancelExecution(run: RunCatalog, request: ExecutionRequest): Promise<ExecutionState> {
    return run(catalog => {
      const parsed = executionRequest.parse(request)
      return catalog.cancelExecution(
        brandString<WorkspaceRecord['id']>(parsed.workspaceId),
        brandString<Branded<'SessionId'>>(parsed.sessionId),
      )
    })
  }

  /** Release an exact owned generation after its Agent turn settles. @param request - workspace, Session and generation. @returns the scheduling state after FIFO promotion. */
  releaseExecution(run: RunCatalog, request: ReleaseExecutionRequest): Promise<ExecutionState> {
    return run(catalog => {
      const parsed = releaseExecutionRequest.parse(request)
      const workspaceId = brandString<WorkspaceRecord['id']>(parsed.workspaceId)
      const sessionId = brandString<Branded<'SessionId'>>(parsed.sessionId)
      const state = catalog.snapshot().executions.find(candidate => candidate.workspaceId === workspaceId)
      if (state?.owner?.sessionId !== sessionId || Number(state.owner.generation) !== parsed.generation) throw serviceError('stale_owner')
      return catalog.releaseExecution(workspaceId, state.owner)
    })
  }

}
