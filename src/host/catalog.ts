/** Persistent Loom catalog; one instance owns and serializes all mutations of its file. */
import { randomUUID } from 'node:crypto'
import { lstat } from 'node:fs/promises'
import { brandString, type Branded } from '@deepseek-ai/dsh-brand'
import { parseProject } from '../domain/project.ts'
import { resolveLock } from '../domain/version.ts'
import { isAbsolute, normalize, resolve } from 'node:path'
import { createTask as pendingTask, startAttempt, attachSession, transitionTask, type Task, type Lock, type TaskOutcome } from '../domain/task.ts'
import { createJsonStore, JsonStoreError } from '../storage/json-store.ts'
import { CatalogError } from './catalog/errors.ts'
import { admitVersionDescription, distinct, nowIso, projectOf, projectOfWorkspace, text, validVersion, versionSchema, workspaceBindings } from './catalog/schema.ts'
import { parseCatalog } from './catalog/admission.ts'
import { admitEvidence } from './catalog/task-evidence.ts'
import { pathExists, preparationFailure, repositoryRequests } from './catalog/workspace-prep.ts'
import { commitWorkspace, workspaceChangeCount, workspaceChanges, workspaceDirty, workspaceStatus, workspaceWorktrees } from './catalog/workspace-git.ts'
import { workspaceIn } from './catalog/selectors.ts'
import type { Catalog } from './catalog/contract.ts'
export type { Catalog, CreateTaskOptions, TaskConfirmation, TaskSuggestion, WorkspaceCommitRepository, WorkspaceCommitResult, WorkspaceStatusRepository } from './catalog/contract.ts'
export { findSessionAttempt, findWorkspaceByPath } from './catalog/selectors.ts'
import { migrateCatalog } from './catalog/migrations.ts'
export { CatalogError } from './catalog/errors.ts'
export { migrateCatalog } from './catalog/migrations.ts'
export { parseCatalog } from './catalog/admission.ts'
import type { CatalogSnapshot, ProjectRecord, TaskRecord, TemporarySessionRecord, VersionRecord, WorkspaceCleanup, WorkspaceCleanupRepository, WorkspaceCleanupRepositoryStatus, WorkspacePreparation, WorkspaceRecord } from '../api/records.ts'
export type { CatalogSnapshot, ProjectRecord, TaskPriority, TaskRecord, TemporarySessionRecord, VersionRecord, WorkspaceCleanup, WorkspaceCleanupRepository, WorkspaceCleanupRepositoryStatus, WorkspaceCleanupStatus, WorkspacePreparation, WorkspacePreparationRepository, WorkspacePreparationRepositoryStatus, WorkspacePreparationStatus, WorkspaceRecord } from '../api/records.ts'
import {
  addLinkedWorkspaceLink, addWorkspaceWorktree, commitsSince, createWorkspaceRoot, ensureWorktreeBranch, linkWorkspaceSkills,
  planLinkedWorkspace, planWorkspace, removeLinkedWorkspaceLink, removeLinkedWorkspaceRoot, removeWorkspaceRoot, removeWorkspaceSkills,
  removeWorkspaceWorktree, resolveHead, workingTreeChanges,
  WorkspacePreparationError,
  type LinkedRepositoryPlan, type WorkspaceRepositoryPlan,
} from '../git/workspace.ts'
import { admitWorkspaceLayout, WorkspaceLayoutError, type WorkspaceLayout, type WorkspaceMode, type WorkspaceRepositoryBinding, type WorkspaceRepositoryKind } from '../domain/workspace.ts'
import type { AuditEntry, AuditEvent } from '../domain/audit.ts'
import {
  cancelExecutionRequest, confirmStop, reorderWaiting, createExecution, releaseExecution as releaseExecutionState, requestExecution,
  requestTakeover, type ExecutionState,
} from '../domain/execution.ts'

/** Open an existing catalog or initialize a missing one; corrupt data is never overwritten.
 * @param file - File in an existing parent directory, owned exclusively by this catalog instance.
 * @param resolveCommit - Local repository ref resolver; failures abort Lock generation.
 * @returns initialized catalog with instance-serialized transactions (not cross-process locking).
 */
export async function createCatalog(file: string, resolveCommit: (repo: string, ref: string) => Promise<string>): Promise<Catalog> {
  const store = createJsonStore<CatalogSnapshot>({ file, version: 2, parse: parseCatalog, migrate: value => migrateCatalog(value) })
  let state: CatalogSnapshot
  try { state = await store.load() } catch (error) {
    if (!(error instanceof JsonStoreError) || error.code !== 'missing') throw error
    state = { projects: [], versions: [], locks: [], tasks: [], workspaces: [], temporarySessions: [], audit: [], executions: [] }
    await store.write(state)
  }
  let queue: Promise<void> = Promise.resolve()
  function transaction<T>(operation: (draft: CatalogSnapshot) => Promise<T> | T): Promise<T> {
    const result = queue.then(async () => {
      const draft = structuredClone(state)
      const result = await operation(draft)
      await store.write(draft)
      state = draft
      return structuredClone(result)
    })
    queue = result.then(() => undefined, () => undefined)
    return result
  }
  function recordAudit(draft: CatalogSnapshot, event: AuditEvent, actor: AuditEntry['actor'], fields: Omit<AuditEntry, 'id' | 'at' | 'event' | 'actor'> = {}): void {
    draft.audit.push({ id: randomUUID(), at: Date.now(), actor, event, ...fields })
    if (draft.audit.length > 500) draft.audit.splice(0, draft.audit.length - 500)
  }
  function versionIn(draft: CatalogSnapshot, versionId: VersionRecord['id']): VersionRecord {
    const version = draft.versions.find(v => v.id === versionId)
    if (!version) throw new CatalogError('missing_version')
    return version
  }
  function taskIn(draft: CatalogSnapshot, taskId: TaskRecord['id']): TaskRecord {
    const task = draft.tasks.find(item => item.id === taskId)
    if (!task) throw new CatalogError('missing_task')
    return task
  }

  function executionIn(draft: CatalogSnapshot, workspaceId: WorkspaceRecord['id']): ExecutionState {
    workspaceIn(draft, workspaceId)
    return draft.executions.find(item => item.workspaceId === workspaceId) ?? createExecution(workspaceId)
  }
  function storeExecution(draft: CatalogSnapshot, execution: ExecutionState): void {
    const index = draft.executions.findIndex(item => item.workspaceId === execution.workspaceId)
    if (index === -1) draft.executions.push(execution)
    else draft.executions[index] = execution
  }
  /** Drop one Session from every ownership queue; a confirmed takeover target stops first. */
  function releaseSessionInDraft(draft: CatalogSnapshot, sessionId: Branded<'SessionId'>): void {
    for (const previous of [...draft.executions]) {
      if (previous.owner?.sessionId !== sessionId && !previous.waiting.includes(sessionId)) continue
      const next = previous.owner?.sessionId === sessionId
        ? previous.takeover ? confirmStop(previous, previous.owner, 'stopped') : releaseExecutionState(previous, previous.owner)
        : { ...previous, waiting: previous.waiting.filter(waiter => waiter !== sessionId) }
      if (next === previous) continue
      storeExecution(draft, next)
      recordAudit(draft, 'execution.released', 'system', { workspaceId: previous.workspaceId, sessionId, detail: next.owner?.sessionId })
    }
  }
  /** Replace one workspace record inside a transaction. */
  function updateWorkspaceIn(draft: CatalogSnapshot, workspaceId: WorkspaceRecord['id'], mutate: (workspace: WorkspaceRecord) => WorkspaceRecord): WorkspaceRecord {
    const index = draft.workspaces.findIndex(item => item.id === workspaceId)
    if (index === -1) throw new CatalogError('missing_workspace')
    const next = mutate(draft.workspaces[index]!)
    draft.workspaces[index] = next
    return next
  }
  /** Patch preparation progress and stamp its update time. */
  function patchPreparation(draft: CatalogSnapshot, workspaceId: WorkspaceRecord['id'], patch: (preparation: WorkspacePreparation, workspace: WorkspaceRecord) => WorkspacePreparation): WorkspaceRecord {
    return updateWorkspaceIn(draft, workspaceId, workspace => {
      if (workspace.preparation === undefined) throw new CatalogError('invalid_catalog')
      return { ...workspace, preparation: { ...patch(workspace.preparation, workspace), updatedAt: nowIso() } }
    })
  }
  /** Patch cleanup progress and stamp its update time. */
  function patchCleanup(draft: CatalogSnapshot, workspaceId: WorkspaceRecord['id'], patch: (cleanup: WorkspaceCleanup, workspace: WorkspaceRecord) => WorkspaceCleanup): WorkspaceRecord {
    return updateWorkspaceIn(draft, workspaceId, workspace => {
      if (workspace.cleanup === undefined) throw new CatalogError('invalid_catalog')
      return { ...workspace, cleanup: { ...patch(workspace.cleanup, workspace), updatedAt: nowIso() } }
    })
  }
  /** Detached copy of one current workspace record. */
  function currentWorkspace(workspaceId: WorkspaceRecord['id']): WorkspaceRecord {
    return structuredClone(workspaceIn(state, workspaceId))
  }

  const api: Catalog = {
    prepareWorkspace: async input => {
      const requested = input.branches ?? {}
      for (const branch of Object.values(requested)) {
        if (branch !== '' && !/^(?![-.])[A-Za-z0-9._/-]+$/u.test(branch)) throw new CatalogError('invalid_workspace_path')
      }
      /** One admitted preparation: the root, its bindings and the steps still to run. */
      type PreparationWork =
        | { readonly kind: 'ready'; readonly workspaceId: WorkspaceRecord['id'] }
        | { readonly kind: 'failed'; readonly workspaceId: WorkspaceRecord['id'] }
        | {
          readonly kind: 'prepare'
          readonly workspaceId: WorkspaceRecord['id']
          readonly root: string
          readonly mode: 'managed' | 'linked'
          readonly bindings: readonly WorkspaceRepositoryBinding[]
          readonly pending: readonly Branded<'loom.source'>[]
          readonly worktreePlans: readonly WorkspaceRepositoryPlan[]
          readonly linkPlans: readonly LinkedRepositoryPlan[]
        }
      // Admission happens before any filesystem effect: a rejected plan leaves no
      // record behind, and a retry continues only the repositories that failed.
      const work: PreparationWork = await transaction(async draft => {
        const version = versionIn(draft, input.versionId)
        const lock = draft.locks.find(item => item.id === input.lockId)
        if (!lock) throw new CatalogError('missing_lock')
        if (lock.versionId !== version.id) throw new CatalogError('workspace_mismatch')
        const project = draft.projects.find(item => item.id === version.projectId)
        if (!project) throw new CatalogError('missing_project')
        const targetIds = new Set(lock.repositories.map(repository => repository.sourceId))
        const versionSources = project.config.sources.filter(source => targetIds.has(source.id))
        if (versionSources.length === 0) throw new CatalogError('workspace_mismatch')
        const retry = input.workspaceId !== undefined
        let workspaceId: WorkspaceRecord['id']
        let root: string
        let mode: WorkspaceMode
        let bindings: readonly WorkspaceRepositoryBinding[]
        let pending: readonly Branded<'loom.source'>[]
        if (input.workspaceId !== undefined) {
          const existing = workspaceIn(draft, input.workspaceId)
          if (existing.cleaned === true) throw new CatalogError('workspace_cleaned')
          if (existing.versionId !== version.id || existing.lockId !== lock.id) throw new CatalogError('workspace_mismatch')
          mode = existing.mode ?? (existing.managed === true ? 'managed' : 'direct')
          if (mode === 'direct') throw new CatalogError('invalid_workspace_path', 'a direct workspace has nothing to prepare')
          const preparation = existing.preparation
          if (preparation === undefined) throw new CatalogError('invalid_workspace_path', 'the workspace has no recorded preparation to retry')
          if (preparation.status === 'ready') return { kind: 'ready', workspaceId: existing.id }
          workspaceId = existing.id
          root = existing.rootPath ?? existing.path
          bindings = workspaceBindings(draft, existing)
          pending = preparation.repositories.filter(entry => entry.status !== 'done').map(entry => entry.sourceId)
        } else {
          if (!isAbsolute(input.path) || normalize(input.path) !== input.path) throw new CatalogError('invalid_workspace_path')
          if (draft.workspaces.some(item => item.cleaned !== true && (item.rootPath ?? item.path) === input.path)) throw new CatalogError('workspace_path_registered')
          mode = input.mode ?? 'managed'
          if (mode === 'linked') {
            if (input.repositories === undefined || input.repositories.length !== versionSources.length) throw new CatalogError('invalid_workspace_path')
            bindings = versionSources.map(source => {
              const requestedBinding = input.repositories!.find(binding => binding.sourceId === source.id)
              if (requestedBinding === undefined) throw new CatalogError('workspace_mismatch')
              const branch = requested[source.id]
              const pinned = lock.repositories.find(repository => repository.sourceId === source.id)
              return {
                sourceId: source.id,
                ...(pinned?.subProjectId === undefined ? {} : { subProjectId: pinned.subProjectId }),
                path: requestedBinding.path,
                targetPath: requestedBinding.targetPath,
                kind: 'link' as const,
                ...(branch === undefined || branch === '' ? {} : { branch }),
              }
            })
            const layout: WorkspaceLayout = { projectId: project.id, mode: 'linked', rootPath: input.path, rootOwner: 'loom', repositories: bindings }
            try { admitWorkspaceLayout(layout) } catch (error) {
              if (error instanceof WorkspaceLayoutError) throw new CatalogError('invalid_workspace_path')
              throw error
            }
          } else {
            if (input.repositories !== undefined && input.repositories.length !== versionSources.length) throw new CatalogError('workspace_mismatch')
            bindings = versionSources.map(source => {
              const requestedBinding = input.repositories?.find(binding => binding.sourceId === source.id)
              const path = requestedBinding?.path ?? source.path
              const branch = requested[source.id]
              const pinned = lock.repositories.find(repository => repository.sourceId === source.id)
              return {
                sourceId: source.id,
                ...(pinned?.subProjectId === undefined ? {} : { subProjectId: pinned.subProjectId }),
                path,
                targetPath: resolve(input.path, path),
                kind: 'worktree' as const,
                ...(branch === undefined || branch === '' ? {} : { branch }),
              }
            })
            if (input.repositories !== undefined) {
              try { admitWorkspaceLayout({ projectId: project.id, mode: 'managed', rootPath: input.path, rootOwner: 'loom', repositories: bindings }) } catch (error) {
                if (error instanceof WorkspaceLayoutError) throw new CatalogError('invalid_workspace_path')
                throw error
              }
            }
          }
          workspaceId = brandString<WorkspaceRecord['id']>(randomUUID())
          root = input.path
          pending = bindings.map(binding => binding.sourceId)
        }
        if (input.requireBranches === true && mode === 'managed' && bindings.some(binding => binding.branch === undefined || binding.branch === '')) {
          throw new CatalogError('invalid_workspace_path', 'every repository requires a branch')
        }
        // A new Loom-owned root is created with a non-recursive mkdir. Reject a
        // missing parent before persisting a workspace record, so a simple path
        // mistake never leaves a failed record that needs cleanup.
        if (!retry) {
          const parent = resolve(root, '..')
          try {
            const info = await lstat(parent)
            if (!info.isDirectory()) throw new CatalogError('workspace_parent_missing', parent)
          } catch (error) {
            if (error instanceof CatalogError) throw error
            throw new CatalogError('workspace_parent_missing', `${parent} does not exist`)
          }
        }
        const pendingSet = new Set<string>(pending)
        let worktreePlans: readonly WorkspaceRepositoryPlan[] = []
        let linkPlans: readonly LinkedRepositoryPlan[] = []
        try {
          if (mode === 'managed') {
            worktreePlans = (await planWorkspace(root, repositoryRequests(project, lock, bindings, pendingSet), { existingRoot: retry })).plans
          } else {
            linkPlans = (await planLinkedWorkspace(
              root,
              bindings.filter(binding => pendingSet.has(binding.sourceId)).map(binding => ({ path: binding.path, target: binding.targetPath })),
              { existingRoot: retry },
            )).plans
          }
        } catch (error) {
          if (!retry) throw error
          const failure = preparationFailure(error)
          patchPreparation(draft, workspaceId, preparation => ({
            ...preparation,
            status: 'failed',
            error: failure.error,
            repositories: preparation.repositories.map(entry => entry.status === 'done'
              ? entry
              : { sourceId: entry.sourceId, status: 'failed' as const, error: failure.error, ...(failure.rollback === undefined ? {} : { rollback: failure.rollback }) }),
          }))
          return { kind: 'failed', workspaceId }
        }
        if (retry) {
          patchPreparation(draft, workspaceId, preparation => ({
            ...preparation,
            status: 'preparing',
            error: undefined,
            repositories: preparation.repositories.map(entry => entry.status === 'done' ? entry : { sourceId: entry.sourceId, status: 'waiting' as const }),
          }))
        } else {
          const branches = Object.fromEntries(bindings.flatMap(binding => binding.branch === undefined ? [] : [[binding.sourceId, binding.branch] as const]))
          const record: WorkspaceRecord = {
            id: workspaceId,
            path: root,
            rootPath: root,
            versionId: version.id,
            lockId: lock.id,
            projectId: project.id,
            mode,
            rootOwner: 'loom',
            repositories: bindings,
            ...(Object.keys(branches).length === 0 ? {} : { branches }),
            ...(mode === 'managed' ? { managed: true } : {}),
            preparation: {
              status: 'waiting',
              startedAt: nowIso(),
              updatedAt: nowIso(),
              repositories: bindings.map(binding => ({ sourceId: binding.sourceId, status: 'waiting' as const })),
            },
          }
          draft.workspaces.push(record)
        }
        return { kind: 'prepare', workspaceId, root, mode, bindings, pending, worktreePlans, linkPlans }
      })
      if (work.kind !== 'prepare') return currentWorkspace(work.workspaceId)
      const prepared = work
      const pendingBindings = prepared.bindings.filter(binding => prepared.pending.includes(binding.sourceId))
      /** Mark one repository step without touching its siblings. */
      const markStep = async (sourceId: Branded<'loom.source'>, status: 'preparing' | 'done', path?: string): Promise<void> => {
        await transaction(draft => patchPreparation(draft, prepared.workspaceId, preparation => ({
          ...preparation,
          status: 'preparing',
          repositories: preparation.repositories.map(entry => entry.sourceId === sourceId
            ? { sourceId: entry.sourceId, status, ...(path === undefined ? {} : { path }) }
            : entry),
        })))
      }
      /** Persist the aggregate failure that stops the remaining steps. */
      const failPreparation = async (error: unknown, sourceId?: Branded<'loom.source'>): Promise<void> => {
        const failure = preparationFailure(error)
        await transaction(draft => patchPreparation(draft, prepared.workspaceId, preparation => ({
          ...preparation,
          status: 'failed',
          error: failure.error,
          repositories: preparation.repositories.map(entry => sourceId !== undefined && entry.sourceId === sourceId
            ? { sourceId: entry.sourceId, status: 'failed' as const, error: failure.error, ...(failure.rollback === undefined ? {} : { rollback: failure.rollback }) }
            : entry),
        })))
      }
      if (!(await pathExists(prepared.root))) {
        try { await createWorkspaceRoot(prepared.root) } catch (error) {
          await failPreparation(error)
          return currentWorkspace(prepared.workspaceId)
        }
      }
      for (const [index, binding] of pendingBindings.entries()) {
        const worktreePlan = prepared.mode === 'managed' ? prepared.worktreePlans[index] : undefined
        const linkPlan = prepared.mode === 'linked' ? prepared.linkPlans[index] : undefined
        if (worktreePlan === undefined && linkPlan === undefined) throw new CatalogError('invalid_catalog', 'preparation is missing a repository step')
        await markStep(binding.sourceId, 'preparing')
        try {
          let path: string
          if (worktreePlan !== undefined) path = (await addWorkspaceWorktree(prepared.root, worktreePlan)).plan.target
          else {
            await addLinkedWorkspaceLink(prepared.root, linkPlan!)
            path = linkPlan!.link
          }
          await markStep(binding.sourceId, 'done', path)
        } catch (error) {
          await failPreparation(error, binding.sourceId)
          return currentWorkspace(prepared.workspaceId)
        }
      }
      const skillTargets = prepared.mode === 'linked' || prepared.bindings.length > 1 ? prepared.bindings.map(binding => binding.targetPath) : []
      const skillLinks = skillTargets.length === 0 ? [] : await linkWorkspaceSkills(prepared.root, skillTargets)
      return transaction(draft => {
        const updated = updateWorkspaceIn(draft, prepared.workspaceId, workspace => ({
          ...workspace,
          ...(skillLinks.length === 0 ? {} : { skillLinks: [...new Set([...(workspace.skillLinks ?? []), ...skillLinks])] }),
          preparation: { ...(workspace.preparation!), status: 'ready' as const, error: undefined },
        }))
        recordAudit(draft, 'workspace.prepared', 'human', { workspaceId: prepared.workspaceId, detail: prepared.root })
        return updated
      })
    },
    ensureWorkspaceBranches: async workspaceId => {
      const workspace = workspaceIn(state, workspaceId)
      if (workspace.cleaned === true) return workspace
      if ((workspace.mode ?? (workspace.managed === true ? 'managed' : 'direct')) !== 'managed') return workspace
      if (state.executions.some(execution => execution.workspaceId === workspaceId && execution.owner !== null)) return workspace
      const bindings = workspaceBindings(state, workspace)
      const branches = { ...workspace.branches }
      let changed = false
      for (const binding of bindings) {
        const requested = binding.branch ?? branches[binding.sourceId]
        if (requested === undefined) continue
        let attached: string
        try { attached = await ensureWorktreeBranch(binding.targetPath, requested) }
        catch (error) {
          if (!(error instanceof WorkspacePreparationError)) throw error
          throw new CatalogError('workspace_branch_failed')
        }
        if (attached !== requested) { branches[binding.sourceId] = attached; changed = true }
      }
      if (!changed) return workspace
      return transaction(draft => {
        const index = draft.workspaces.findIndex(item => item.id === workspaceId)
        if (index === -1) throw new CatalogError('missing_workspace')
        draft.workspaces[index] = { ...draft.workspaces[index]!, branches }
        return draft.workspaces[index]!
      })
    },
    ensureWorkspaceSkillLinks: async workspaceId => {
      const workspace = workspaceIn(state, workspaceId)
      if (workspace.cleaned === true) return workspace
      const bindings = workspaceBindings(state, workspace)
      if (bindings.length < 2) return workspace
      const existing = workspace.skillLinks ?? []
      const links = await linkWorkspaceSkills(workspace.rootPath ?? workspace.path, bindings.map(binding => binding.targetPath))
      const merged = [...new Set([...existing, ...links])]
      if (merged.length === existing.length) return workspace
      return transaction(draft => {
        const index = draft.workspaces.findIndex(item => item.id === workspaceId)
        if (index === -1) throw new CatalogError('missing_workspace')
        draft.workspaces[index] = { ...draft.workspaces[index]!, skillLinks: merged }
        return draft.workspaces[index]!
      })
    },
    workspaceChanges: (workspaceId, attemptId) => workspaceChanges(state, workspaceId, attemptId),
    workspaceChangeCount: (workspaceId, attemptId) => workspaceChangeCount(state, workspaceId, attemptId),
    workspaceStatus: (workspaceId, attemptId) => workspaceStatus(state, workspaceId, attemptId),
    commitWorkspace: (workspaceId, message) => commitWorkspace(state, workspaceId, message),
    workspaceDirty: workspaceId => workspaceDirty(state, workspaceId),
    updateWorkspace: async (workspaceId, label) => {
      const admitted = label.trim()
      if (admitted.length > 80) throw new CatalogError('invalid_workspace_label')
      return transaction(draft => {
        const workspace = workspaceIn(draft, workspaceId)
        const { label: _previous, ...rest } = workspace
        const next: WorkspaceRecord = { ...rest, ...(admitted === '' ? {} : { label: admitted }) }
        draft.workspaces[draft.workspaces.indexOf(workspace)] = next
        recordAudit(draft, 'workspace.updated', 'human', { workspaceId, detail: admitted === '' ? workspace.path : admitted })
        return next
      })
    },
    deleteWorkspace: async (workspaceId, deleteFiles, confirmPath) => {
      const workspace = workspaceIn(state, workspaceId)
      const root = workspace.rootPath ?? workspace.path
      const execution = state.executions.find(item => item.workspaceId === workspaceId)
      if (execution !== undefined && execution.owner !== null) throw new CatalogError('workspace_busy', execution.owner.sessionId)
      if (state.tasks.some(task => task.attempts.some(attempt => attempt.workspaceId === workspaceId))) throw new CatalogError('workspace_in_use', root)
      if (!deleteFiles) return api.cleanupWorkspace(workspaceId, true)
      if (confirmPath !== root) throw new CatalogError('invalid_workspace_path', 'confirmPath must equal the workspace root')
      const mode = workspace.mode ?? (workspace.managed === true ? 'managed' : 'direct')
      if (mode !== 'direct') {
        await api.cleanupWorkspace(workspaceId, true)
        // Cleanup can leave a partial root when git refuses one worktree. The
        // explicit delete action promised the directory is gone, so force the
        // Loom-owned root and then drop any partial cleanup record.
        if (await pathExists(root)) {
          const residual = await removeWorkspaceRoot(root)
          if (residual.length > 0) throw new CatalogError('workspace_cleanup_failed', residual.join('; '))
          await transaction(draft => {
            const index = draft.workspaces.findIndex(item => item.id === workspaceId)
            if (index === -1) return
            draft.workspaces.splice(index, 1)
            draft.temporarySessions = draft.temporarySessions.filter(temporary => temporary.workspacePath !== root && temporary.workspacePath !== workspace.path)
            draft.executions = draft.executions.filter(item => item.workspaceId !== workspaceId)
            recordAudit(draft, 'workspace.cleaned', 'human', { workspaceId, detail: root })
          })
        }
        return
      }
      const residual = await removeWorkspaceRoot(root)
      if (residual.length > 0) throw new CatalogError('workspace_cleanup_failed', residual.join('; '))
      await transaction(draft => {
        const index = draft.workspaces.findIndex(item => item.id === workspaceId)
        if (index === -1) throw new CatalogError('missing_workspace')
        draft.workspaces.splice(index, 1)
        draft.temporarySessions = draft.temporarySessions.filter(temporary => temporary.workspacePath !== root && temporary.workspacePath !== workspace.path)
        draft.executions = draft.executions.filter(item => item.workspaceId !== workspaceId)
        recordAudit(draft, 'workspace.cleaned', 'human', { workspaceId, detail: root })
      })
    },
    cleanupWorkspace: async (workspaceId, discardChanges) => {
      const workspace = workspaceIn(state, workspaceId)
      if (workspace.cleaned === true) throw new CatalogError('workspace_cleaned')
      const mode = workspace.mode ?? (workspace.managed === true ? 'managed' : 'direct')
      const root = workspace.rootPath ?? workspace.path
      // Ownership outranks task status: a live Session has to hand the workspace
      // back before cleanup destroys its evidence.
      const execution = state.executions.find(item => item.workspaceId === workspaceId)
      if (execution !== undefined && execution.owner !== null) {
        throw new CatalogError('workspace_busy', `Session ${execution.owner.sessionId} still owns execution (generation ${execution.owner.generation}); release it or complete a takeover first`)
      }
      // A running or under-review round still needs the workspace diff; failed
      // and completed rounds keep their records and may release the files.
      const occupying = state.tasks.filter(task => (task.status === 'running' || task.status === 'review')
        && task.attempts.some(attempt => attempt.workspaceId === workspaceId))
      if (occupying.length > 0) {
        throw new CatalogError('workspace_task_running', `task ${occupying.map(task => `${task.id} (${task.status})`).join(', ')} still occupies this workspace; finish or fail the round first`)
      }
      const bindings = workspaceBindings(state, workspace)
      // Only managed cleanup deletes versioned worktrees. Direct and linked
      // workspaces keep the real repositories, so uncommitted work must not
      // block unregistering them; those checks also fail for legacy records
      // whose target points at a parent directory rather than a Git root.
      const worktrees = mode === 'managed' ? workspaceWorktrees(state, workspaceId) : []
      const prior = workspace.cleanup
      const priorStatus = (sourceId: Branded<'loom.source'>): WorkspaceCleanupRepositoryStatus | undefined =>
        prior?.repositories.find(entry => entry.sourceId === sourceId)?.status
      const units: { sourceId: Branded<'loom.source'>; kind: 'worktree' | 'link'; repo: string; directory: string; branch?: string | undefined }[] = mode === 'managed'
        ? worktrees.map(worktree => ({ sourceId: worktree.sourceId, kind: 'worktree' as const, repo: worktree.repo, directory: worktree.directory, ...(worktree.branch === undefined ? {} : { branch: worktree.branch }) }))
        : mode === 'linked'
          ? bindings.map(binding => ({ sourceId: binding.sourceId, kind: 'link' as const, repo: '', directory: resolve(root, binding.path) }))
          : []
      const pendingWorktrees = worktrees.filter(worktree => priorStatus(worktree.sourceId) !== 'removed')
      if (!discardChanges && mode === 'managed') {
        for (const worktree of pendingWorktrees) if (await commitsSince(worktree.directory, worktree.commit) > 0) throw new CatalogError('workspace_unpushed', worktree.directory)
        const changes = await workingTreeChanges(pendingWorktrees)
        if (changes.some(repository => repository.files.length > 0)) throw new CatalogError('workspace_changes', changes.filter(repository => repository.files.length > 0).map(repository => repository.directory).join(', '))
      }
      // Publish per-repository progress before the first deletion so the client
      // can poll a partial attempt instead of a single opaque busy state.
      await transaction(draft => {
        const entries: WorkspaceCleanupRepository[] = mode === 'direct'
          ? bindings.map(binding => ({ sourceId: binding.sourceId, status: 'kept' as const, path: binding.targetPath }))
          : units.map(unit => priorStatus(unit.sourceId) === 'removed'
            ? { sourceId: unit.sourceId, status: 'removed' as const, path: unit.directory }
            : { sourceId: unit.sourceId, status: 'waiting' as const, path: unit.directory })
        updateWorkspaceIn(draft, workspaceId, workspace => ({
          ...workspace,
          cleanup: { status: 'cleaning', startedAt: prior?.startedAt ?? nowIso(), updatedAt: nowIso(), repositories: entries },
        }))
      })
      /** Record one repository step without invalidating its siblings. */
      const markRepository = async (unit: typeof units[number], status: 'removed' | 'failed', diagnostic?: { error?: string | undefined; residual?: string | undefined }): Promise<void> => {
        await transaction(draft => patchCleanup(draft, workspaceId, cleanup => ({
          ...cleanup,
          repositories: cleanup.repositories.map(entry => entry.sourceId === unit.sourceId
            ? {
              sourceId: entry.sourceId,
              status,
              path: unit.directory,
              ...(diagnostic?.error === undefined ? {} : { error: diagnostic.error }),
              ...(diagnostic?.residual === undefined ? {} : { residual: diagnostic.residual }),
            }
            : entry),
        })))
      }
      const residual: string[] = []
      for (const unit of units) {
        if (priorStatus(unit.sourceId) === 'removed') continue
        let errors: string[] = []
        if (await pathExists(unit.directory)) {
          errors = unit.kind === 'link'
            ? await removeLinkedWorkspaceLink(unit.directory)
            : await removeWorkspaceWorktree(unit.repo, unit.directory, unit.branch)
        }
        if (errors.length === 0) await markRepository(unit, 'removed')
        else {
          const error = errors.join('; ').slice(0, 1000)
          residual.push(unit.directory)
          await markRepository(unit, 'failed', { error, residual: unit.directory })
        }
      }
      // Direct workspaces keep their repositories but must still remove the skill
      // links they added; a leftover link keeps the workspace retryable.
      let rootErrors: string[] = []
      if (mode === 'direct') {
        rootErrors = workspace.skillLinks === undefined ? [] : await removeWorkspaceSkills(workspace.skillLinks)
      } else if (residual.length === 0) {
        // The Loom-owned root is only destroyed once every repository step
        // succeeded, so a partial attempt keeps the evidence for a retry.
        rootErrors = mode === 'linked' ? await removeLinkedWorkspaceRoot(root) : await removeWorkspaceRoot(root)
      }
      const references = state.tasks.some(task => task.attempts.some(attempt => attempt.workspaceId === workspaceId))
      if (residual.length > 0 || rootErrors.length > 0) {
        await transaction(draft => patchCleanup(draft, workspaceId, cleanup => ({
          ...cleanup,
          status: 'partial',
          error: [...residual.map(path => `${path}: still present`), ...rootErrors].join('; ').slice(0, 1000),
          residual: [...residual, ...rootErrors].slice(0, 50),
          repositories: cleanup.repositories.map(entry => entry.status === 'waiting' || entry.status === 'failed'
            ? { sourceId: entry.sourceId, status: 'failed' as const, path: entry.path, error: 'cleanup incomplete', residual: entry.path }
            : entry),
        })))
        return
      }
      await transaction(draft => {
        const index = draft.workspaces.findIndex(item => item.id === workspaceId)
        if (index === -1) throw new CatalogError('missing_workspace')
        if (references) {
          draft.workspaces[index] = {
            ...draft.workspaces[index]!,
            cleaned: true,
            cleanup: {
              status: 'cleaned',
              startedAt: prior?.startedAt ?? nowIso(),
              updatedAt: nowIso(),
              repositories: draft.workspaces[index]!.cleanup?.repositories ?? [],
            },
          }
        } else {
          draft.workspaces.splice(index, 1)
        }
        draft.temporarySessions = draft.temporarySessions.filter(temporary => temporary.workspacePath !== root && temporary.workspacePath !== workspace.path)
        draft.executions = draft.executions.filter(item => item.workspaceId !== workspaceId)
        recordAudit(draft, 'workspace.cleaned', 'human', { workspaceId, detail: root })
      })
    },
    registerPreparedWorkspace: async input => {
      return transaction(async draft => {
        const version = versionIn(draft, input.versionId)
        const project = draft.projects.find(item => item.id === (input.projectId ?? version.projectId))
        if (!project) throw new CatalogError('missing_project')
        const lock = draft.locks.find(item => item.id === input.lockId)
        if (!lock) throw new CatalogError('missing_lock')
        if (lock.versionId !== version.id) throw new CatalogError('workspace_mismatch')
        const rootPath = input.rootPath ?? input.path
        if (!isAbsolute(rootPath) || normalize(rootPath) !== rootPath) throw new CatalogError('invalid_workspace_path')
        const mode = input.mode ?? (input.repositories === undefined ? 'direct' : 'direct')
        const kind: WorkspaceRepositoryKind = mode === 'managed' ? 'worktree' : mode === 'linked' ? 'link' : 'direct'
        const repositories: WorkspaceRepositoryBinding[] = (input.repositories ?? project.config.sources.map(source => ({
          sourceId: source.id,
          path: source.path,
          targetPath: resolve(rootPath, source.path),
        }))).map(repository => ({ ...repository, kind }))
        const layout: WorkspaceLayout = {
          projectId: project.id,
          mode,
          rootPath,
          rootOwner: input.rootOwner ?? (mode === 'managed' ? 'loom' : 'user'),
          repositories,
        }
        try { admitWorkspaceLayout(layout) } catch (error) {
          if (error instanceof WorkspaceLayoutError) throw new CatalogError('invalid_workspace_path')
          throw error
        }
        if (repositories.some(repository => !project.config.sources.some(source => source.id === repository.sourceId))) throw new CatalogError('workspace_mismatch')
        if (draft.workspaces.some(item => item.cleaned !== true && (item.rootPath ?? item.path) === rootPath)) throw new CatalogError('workspace_path_registered')
        const skillLinks = mode === 'direct' && repositories.length > 1
          ? await linkWorkspaceSkills(rootPath, repositories.map(repository => repository.targetPath))
          : []
        const record: WorkspaceRecord = {
          id: brandString<WorkspaceRecord['id']>(randomUUID()),
          path: rootPath,
          rootPath,
          versionId: version.id,
          lockId: lock.id,
          projectId: project.id,
          mode,
          rootOwner: layout.rootOwner,
          repositories,
          ...(input.branches === undefined || Object.keys(input.branches).length === 0 ? {} : { branches: input.branches }),
          ...(input.mode === 'managed' ? { managed: true } : {}),
          ...(skillLinks.length === 0 ? {} : { skillLinks }),
        }
        draft.workspaces.push(record)
        recordAudit(draft, 'workspace.prepared', 'system', { workspaceId: record.id, detail: rootPath })
        return record
      })
    },
    startAttempt: (taskId, workspaceId, options) => transaction(async draft => {
      const requestedTask = draft.tasks.find(candidate => candidate.id === taskId)
      if (requestedTask?.workspaceId !== undefined && requestedTask.workspaceId !== workspaceId) throw new CatalogError('workspace_mismatch')
      const task = taskIn(draft, taskId)
      const workspace = workspaceIn(draft, workspaceId)
      if (workspace.cleaned === true) throw new CatalogError('workspace_cleaned')
      if (workspace.preparation !== undefined && workspace.preparation.status !== 'ready') throw new CatalogError('workspace_not_prepared', `preparation is ${workspace.preparation.status}`)
      const taskProject = projectOf(draft, task.versionId)
      const workspaceProject = projectOfWorkspace(draft, workspace)
      if (taskProject === undefined || workspaceProject === undefined || taskProject.id !== workspaceProject.id) throw new CatalogError('workspace_mismatch')
      const otherExecuting = draft.executions.some(execution => execution.workspaceId === workspaceId && execution.owner !== null)
      if (otherExecuting && options?.allowBusy !== true) throw new CatalogError('workspace_task_running')
      const currentLock = draft.locks.find(item => item.id === workspace.lockId)
      if (!currentLock) throw new CatalogError('missing_lock')
      const bindings = workspaceBindings(draft, workspace)
      const baseline = await Promise.all(bindings.map(async binding => {
        const pinned = currentLock.repositories.find(repository => repository.sourceId === binding.sourceId)
        try {
          return { sourceId: binding.sourceId, commit: await resolveHead(binding.targetPath) }
        } catch {
          if (pinned === undefined) throw new CatalogError('workspace_mismatch')
          return { sourceId: binding.sourceId, commit: pinned.commit }
        }
      }))
      const sameAsCurrent = currentLock.versionId === task.versionId
        && currentLock.repositories.length === baseline.length
        && currentLock.repositories.every(repository => baseline.some(candidate => candidate.sourceId === repository.sourceId && candidate.commit === repository.commit))
      const lock: Lock = sameAsCurrent
        ? currentLock
        : { id: brandString<Lock['id']>(randomUUID()), versionId: task.versionId, repositories: baseline, createdAt: nowIso() }
      if (!sameAsCurrent) draft.locks.push(lock)
      const updated = { ...task, ...startAttempt(task, brandString<Branded<'loom.attempt'>>(randomUUID()), lock, { ...workspace, versionId: task.versionId, lockId: lock.id }), updatedAt: nowIso() }
      draft.tasks[draft.tasks.indexOf(task)] = updated
      recordAudit(draft, 'attempt.started', 'human', { taskId, workspaceId, detail: lock.id })
      return updated
    }),
    attachSession: (taskId, sessionId) => transaction(draft => {
      const task = taskIn(draft, taskId)
      const attached = attachSession(task, sessionId)
      // Re-attaching an already linked Session is a no-op that must not rewrite
      // the record's mutation time.
      const updated = attached === task ? task : { ...task, ...attached, updatedAt: nowIso() }
      draft.tasks[draft.tasks.indexOf(task)] = updated
      draft.temporarySessions = draft.temporarySessions.filter(temporary => temporary.sessionId !== sessionId)
      recordAudit(draft, 'session.attached', 'human', { taskId, sessionId, workspaceId: updated.attempts.at(-1)?.workspaceId })
      return updated
    }),
    registerTemporarySession: (sessionId, workspacePath) => transaction(draft => {
      const workspace = draft.workspaces.find(candidate => candidate.cleaned !== true
        && (candidate.path === workspacePath || (candidate.rootPath ?? candidate.path) === workspacePath))
      if (workspace === undefined) throw new CatalogError('missing_workspace')
      const previous = draft.temporarySessions.find(temporary => temporary.sessionId === sessionId)
      const record: TemporarySessionRecord = { sessionId, workspacePath, createdAt: previous?.createdAt ?? Date.now() }
      draft.temporarySessions = [...draft.temporarySessions.filter(temporary => temporary.sessionId !== sessionId), record]
      // A temporary Session gains the same execution rights a task Session gets,
      // so unbound and bound Sessions can never write one workspace at once.
      const execution = executionIn(draft, workspace.id)
      const next = requestExecution(execution, sessionId)
      if (next !== execution) {
        storeExecution(draft, next)
        if (next.owner?.sessionId === sessionId) recordAudit(draft, 'execution.acquired', 'agent', { workspaceId: workspace.id, sessionId })
        else recordAudit(draft, 'execution.queued', 'agent', { workspaceId: workspace.id, sessionId })
      }
      return record
    }),
    forgetTemporarySession: sessionId => transaction(draft => {
      draft.temporarySessions = draft.temporarySessions.filter(temporary => temporary.sessionId !== sessionId)
      releaseSessionInDraft(draft, sessionId)
    }),
    transitionTask: (taskId, target, actor, confirmation) => transaction(draft => {
      const task = taskIn(draft, taskId)
      const transitioned = transitionTask(task, target, actor)
      const previousOutcome = task.outcome
      let outcome = previousOutcome
      if (actor === 'human' && (target === 'completed' || target === 'failed') && previousOutcome?.state === 'suggested') {
        const basis = confirmation?.basis?.trim()
        if (basis !== undefined && basis.length > 2000) throw new CatalogError('invalid_task', 'confirmation basis is too long')
        const accepted = previousOutcome.suggestedStatus === 'review' ? target === 'completed' : previousOutcome.suggestedStatus === 'failed' && target === 'failed'
        outcome = {
          ...previousOutcome,
          state: accepted ? 'accepted' : 'rejected',
          confirmedAt: nowIso(),
          confirmedBy: actor,
          ...(basis === undefined || basis === '' ? {} : { confirmationBasis: basis }),
        }
        recordAudit(draft, accepted ? 'task.confirmation-accepted' : 'task.confirmation-rejected', 'human', {
          taskId,
          ...(previousOutcome.attemptId === undefined ? {} : { attemptId: previousOutcome.attemptId }),
          ...(previousOutcome.sessionId === undefined ? {} : { sessionId: previousOutcome.sessionId }),
          ...(basis === undefined || basis === '' ? {} : { basis }),
          detail: `suggested ${previousOutcome.suggestedStatus ?? target} -> ${target}`,
        })
      }
      const updated: TaskRecord = { ...task, ...transitioned, ...(outcome === undefined ? {} : { outcome }), updatedAt: nowIso() }
      draft.tasks[draft.tasks.indexOf(task)] = updated
      recordAudit(draft, 'task.transitioned', actor, { taskId, detail: `${task.status}->${target}` })
      return updated
    }),
    suggestTaskOutcome: (taskId, suggestion) => transaction(draft => {
      const task = taskIn(draft, taskId)
      const current = task.attempts.at(-1)
      if (current === undefined) throw new CatalogError('task_not_active', 'the task has no round to report on')
      if (!current.sessionIds.includes(suggestion.sessionId)) throw new CatalogError('task_not_active', 'the Session is not attached to the current round')
      if (task.status !== 'running' && task.status !== 'review') throw new CatalogError('task_not_active', `the round is ${task.status}; only a running or review round can be reported`)
      const execution = draft.executions.find(item => item.workspaceId === current.workspaceId)
      if (execution !== undefined && execution.owner !== null && execution.owner.sessionId !== suggestion.sessionId) {
        throw new CatalogError('execution_not_owned', `the workspace is owned by Session ${execution.owner.sessionId}`)
      }
      if (execution !== undefined && execution.waiting.includes(suggestion.sessionId)) throw new CatalogError('execution_not_owned', 'the Session is still queued for execution')
      const evidence = admitEvidence(suggestion)
      const basis = suggestion.basis?.trim()
      if (basis !== undefined && basis.length > 2000) throw new CatalogError('invalid_task', 'suggestion basis is too long')
      const outcome: TaskOutcome = {
        state: 'suggested',
        suggestedStatus: suggestion.suggestedStatus,
        ...evidence,
        suggestedBy: 'agent',
        at: nowIso(),
        sessionId: suggestion.sessionId,
        attemptId: current.id,
        ...(basis === undefined || basis === '' ? {} : { basis }),
      }
      const transitioned = suggestion.suggestedStatus === 'review' && task.status === 'running' ? transitionTask(task, 'review', 'agent') : task
      const updated: TaskRecord = { ...task, ...transitioned, outcome, updatedAt: nowIso() }
      draft.tasks[draft.tasks.indexOf(task)] = updated
      recordAudit(draft, suggestion.suggestedStatus === 'review' ? 'task.review-requested' : 'task.failure-suggested', 'agent', {
        taskId,
        attemptId: current.id,
        workspaceId: current.workspaceId,
        sessionId: suggestion.sessionId,
        ...(basis === undefined || basis === '' ? {} : { basis }),
        detail: suggestion.suggestedStatus === 'review' ? `review requested from ${task.status}` : 'failure suggested',
      })
      return updated
    }),
    acquireExecution: (workspaceId, sessionId) => {
      const existing = state.executions.find(execution => execution.workspaceId === workspaceId)
      if (existing !== undefined && (existing.owner?.sessionId === sessionId || existing.waiting.includes(sessionId))) {
        return Promise.resolve(structuredClone(existing))
      }
      return transaction(draft => {
        const previous = executionIn(draft, workspaceId)
        const next = requestExecution(previous, sessionId)
        storeExecution(draft, next)
        if (next.owner?.sessionId === sessionId) recordAudit(draft, 'execution.acquired', 'agent', { workspaceId, sessionId })
        else recordAudit(draft, 'execution.queued', 'agent', { workspaceId, sessionId })
        return next
      })
    },
    releaseExecution: (workspaceId, expected) => transaction(draft => {
      const next = releaseExecutionState(executionIn(draft, workspaceId), expected)
      storeExecution(draft, next)
      recordAudit(draft, 'execution.released', 'agent', { workspaceId, sessionId: expected.sessionId, detail: next.owner?.sessionId })
      return next
    }),
    cancelExecution: (workspaceId, sessionId) => transaction(draft => {
      const previous = executionIn(draft, workspaceId)
      const next = cancelExecutionRequest(previous, sessionId)
      if (next !== previous) {
        storeExecution(draft, next)
        recordAudit(draft, 'execution.released', 'human', { workspaceId, sessionId, detail: 'left waiting queue' })
      }
      return next
    }),
    reorderExecutionQueue: (workspaceId, sessionIds) => transaction(draft => {
      const previous = executionIn(draft, workspaceId)
      const next = reorderWaiting(previous, sessionIds)
      storeExecution(draft, next)
      recordAudit(draft, 'execution.released', 'human', { workspaceId, detail: `reordered waiting queue: ${sessionIds.join(', ')}` })
      return next
    }),
    beginTakeover: (workspaceId, sessionId) => transaction(draft => {
      const previous = executionIn(draft, workspaceId)
      if (!previous.owner) throw new CatalogError('workspace_busy')
      const owner = previous.owner
      const next = requestTakeover(previous, sessionId, owner)
      storeExecution(draft, next)
      recordAudit(draft, 'execution.takeover-requested', 'human', { workspaceId, sessionId, detail: owner.sessionId })
      return { state: next, owner }
    }),
    finishTakeover: (workspaceId, expected, outcome) => transaction(draft => {
      const next = confirmStop(executionIn(draft, workspaceId), expected, outcome)
      storeExecution(draft, next)
      recordAudit(draft, outcome === 'stopped' ? 'execution.takeover-stopped' : 'execution.takeover-blocked', 'system', { workspaceId, sessionId: next.owner?.sessionId, detail: outcome })
      return next
    }),
    releaseSession: sessionId => {
      const ownsExecution = state.executions.some(execution => execution.owner?.sessionId === sessionId || execution.waiting.includes(sessionId))
      // A disposed Session also drops any temporary-work registration it still holds.
      const registeredTemporary = state.temporarySessions.some(record => record.sessionId === sessionId)
      if (!ownsExecution && !registeredTemporary) return Promise.resolve()
      return transaction(draft => {
        draft.temporarySessions = draft.temporarySessions.filter(record => record.sessionId !== sessionId)
        releaseSessionInDraft(draft, sessionId)
      })
    },
    snapshot: () => structuredClone(state),
    createProject: async input => {
      const config = parseProject(input)
      return transaction(draft => {
        const record = { id: brandString<ProjectRecord['id']>(randomUUID()), config }
        draft.projects.push(record)
        recordAudit(draft, 'project.created', 'human', { detail: config.name })
        return record
      })
    },
    updateProject: async (projectId, input) => {
      const config = parseProject(input)
      return transaction(draft => {
        const project = draft.projects.find(candidate => candidate.id === projectId)
        if (project === undefined) throw new CatalogError('missing_project')
        const sourceIds = new Set(config.sources.map(source => source.id))
        if (draft.versions.some(version => version.projectId === projectId && version.sources.some(source => !sourceIds.has(source.sourceId)))) {
          throw new CatalogError('invalid_version')
        }
        const moduleIds = new Set(config.modules.map(module => module.id))
        const invalidTask = draft.tasks.some(task => {
          const version = draft.versions.find(candidate => candidate.id === task.versionId)
          return version?.projectId === projectId && (task.moduleIds ?? []).some(moduleId => !moduleIds.has(moduleId))
        })
        if (invalidTask) throw new CatalogError('invalid_task')
        const next: ProjectRecord = { ...project, config }
        draft.projects[draft.projects.indexOf(project)] = next
        recordAudit(draft, 'project.updated', 'human', { detail: config.name })
        return next
      })
    },
    deleteProject: async projectId => transaction(draft => {
      const project = draft.projects.find(candidate => candidate.id === projectId)
      if (project === undefined) throw new CatalogError('missing_project')
      if (draft.versions.some(version => version.projectId === projectId)) throw new CatalogError('project_has_versions')
      draft.projects.splice(draft.projects.indexOf(project), 1)
      recordAudit(draft, 'project.deleted', 'human', { detail: project.config.name })
    }),
    createVersion: async (projectId, name, sources, description, targets) => {
      const admittedSources = sources.length > 0 ? sources : (targets ?? []).map(target => ({ sourceId: target.sourceId, ref: target.ref }))
      const record = versionSchema.parse({
        id: randomUUID(), projectId, name,
        ...(description === undefined ? {} : { description }),
        sources: admittedSources,
        ...(targets === undefined ? {} : { targets }),
      })
      return transaction(draft => {
        const project = draft.projects.find(p => p.id === projectId)
        if (!project) throw new CatalogError('missing_project')
        if (!validVersion(project, record)) throw new CatalogError('invalid_version')
        draft.versions.push(record)
        recordAudit(draft, 'version.created', 'human', { detail: record.name })
        return record
      })
    },
    updateVersion: async (versionId, name, sources, description, targets) => {
      const admittedName = text.parse(name)
      return transaction(draft => {
        const version = versionIn(draft, versionId)
        const project = draft.projects.find(candidate => candidate.id === version.projectId)
        if (project === undefined) throw new CatalogError('missing_project')
        // An omitted description preserves the stored one; an explicit empty
        // string clears it, so older clients that do not know the field cannot
        // erase it by accident.
        const admittedDescription = description === undefined ? version.description : admitVersionDescription(description)
        const record = versionSchema.parse({ ...version, name: admittedName, description: admittedDescription, sources, ...(targets === undefined ? {} : { targets }) })
        if (!validVersion(project, record)) throw new CatalogError('invalid_version')
        const next: VersionRecord = { ...version, name: admittedName, description: record.description, sources: record.sources, ...(targets === undefined ? {} : { targets: record.targets }) }
        draft.versions[draft.versions.indexOf(version)] = next
        recordAudit(draft, 'version.updated', 'human', { detail: admittedName })
        return next
      })
    },
    deleteVersion: async versionId => transaction(draft => {
      const version = versionIn(draft, versionId)
      if (draft.tasks.some(task => task.versionId === versionId)) throw new CatalogError('version_has_tasks')
      if (draft.workspaces.some(workspace => workspace.versionId === versionId)) throw new CatalogError('version_has_workspaces')
      draft.versions.splice(draft.versions.indexOf(version), 1)
      draft.locks = draft.locks.filter(lock => lock.versionId !== versionId)
      recordAudit(draft, 'version.deleted', 'human', { detail: version.name })
    }),
    generateLock: versionId => transaction(async draft => {
      const version = versionIn(draft, versionId)
      const project = draft.projects.find(p => p.id === version.projectId)!
      const previous = draft.locks.filter(lock => lock.versionId === version.id).at(-1)
      const resolved = await resolveLock(project.config, version, randomUUID(), resolveCommit)
      const lock: Lock = { ...resolved, createdAt: nowIso() }
      draft.locks.push(lock)
      // A long-lived version advances its baseline here instead of forcing a new
      // round or version: every active workspace of the version moves onto the
      // new Lock, and the latest round of every running or reviewing task is
      // re-baselined so its Diff starts over. Completed and failed tasks keep
      // their historical baselines.
      let advancedWorkspaces = 0
      let rebasedTasks = 0
      if (previous !== undefined) {
        for (const workspace of [...draft.workspaces]) {
          if (workspace.cleaned === true || workspace.versionId !== version.id) continue
          draft.workspaces[draft.workspaces.indexOf(workspace)] = { ...workspace, lockId: lock.id }
          recordAudit(draft, 'workspace.updated', 'human', { workspaceId: workspace.id, detail: `baseline advanced to ${lock.id}` })
          advancedWorkspaces += 1
        }
        for (const task of [...draft.tasks]) {
          if (task.versionId !== version.id || (task.status !== 'running' && task.status !== 'review')) continue
          const attempt = task.attempts.at(-1)
          if (attempt === undefined) continue
          draft.tasks[draft.tasks.indexOf(task)] = { ...task, attempts: [...task.attempts.slice(0, -1), { ...attempt, lock }] }
          recordAudit(draft, 'task.updated', 'human', { taskId: task.id, workspaceId: attempt.workspaceId, detail: `round baseline advanced to ${lock.id}` })
          rebasedTasks += 1
        }
      }
      const commitDetail = lock.repositories.map(repository => repository.commit.slice(0, 8)).join(' ')
      const advanced = advancedWorkspaces === 0 && rebasedTasks === 0
        ? ''
        : ` · advanced ${advancedWorkspaces} workspace${advancedWorkspaces === 1 ? '' : 's'}, ${rebasedTasks} task${rebasedTasks === 1 ? '' : 's'}`
      recordAudit(draft, 'lock.generated', 'human', { detail: `${commitDetail}${advanced}` })
      return lock
    }),
    createTask: async (versionId, title, options = {}) => {
      const admittedTitle = text.parse(title)
      const description = options.description?.trim() ?? ''
      if (description.length > 4000) throw new CatalogError('invalid_task')
      const moduleIds = [...(options.moduleIds ?? [])]
      if (!distinct(moduleIds)) throw new CatalogError('invalid_task')
      const priority = options.priority ?? 'normal'
      return transaction(draft => {
        const version = versionIn(draft, versionId)
        const project = draft.projects.find(p => p.id === version.projectId)
        if (project === undefined || moduleIds.some(moduleId => !project.config.modules.some(module => module.id === moduleId))) throw new CatalogError('invalid_task')
        if (options.workspaceId !== undefined) {
          const workspace = draft.workspaces.find(candidate => candidate.id === options.workspaceId)
          if (workspace === undefined || workspace.cleaned === true) throw new CatalogError('missing_workspace')
          if (workspace.versionId !== versionId) throw new CatalogError('workspace_mismatch')
          if (workspace.preparation !== undefined && workspace.preparation.status !== 'ready') throw new CatalogError('workspace_not_prepared')
        }
        const record: TaskRecord = {
          ...pendingTask(brandString<Task['id']>(randomUUID()), versionId),
          ...(options.workspaceId === undefined ? {} : { workspaceId: options.workspaceId }),
          title: admittedTitle,
          description,
          moduleIds,
          priority,
          updatedAt: nowIso(),
        }
        draft.tasks.push(record)
        recordAudit(draft, 'task.created', 'human', { taskId: record.id, detail: admittedTitle })
        return record
      })
    },
    updateTask: async (taskId, title, options = {}) => {
      const admittedTitle = text.parse(title)
      const description = options.description?.trim() ?? ''
      if (description.length > 4000) throw new CatalogError('invalid_task')
      const moduleIds = [...(options.moduleIds ?? [])]
      if (!distinct(moduleIds)) throw new CatalogError('invalid_task')
      const priority = options.priority ?? 'normal'
      return transaction(draft => {
        const task = taskIn(draft, taskId)
        const version = versionIn(draft, task.versionId)
        const project = draft.projects.find(candidate => candidate.id === version.projectId)
        if (project === undefined || moduleIds.some(moduleId => !project.config.modules.some(module => module.id === moduleId))) throw new CatalogError('invalid_task')
        const next: TaskRecord = { ...task, title: admittedTitle, description, moduleIds, priority, updatedAt: nowIso() }
        draft.tasks[draft.tasks.indexOf(task)] = next
        recordAudit(draft, 'task.updated', 'human', { taskId: next.id, detail: admittedTitle })
        return next
      })
    },
    deleteTask: async taskId => transaction(draft => {
      const task = taskIn(draft, taskId)
      if (task.status === 'running') throw new CatalogError('task_busy')
      const workspaceIds = new Set<TaskRecord['attempts'][number]['workspaceId']>(task.attempts.map(attempt => attempt.workspaceId))
      // A workspace can be shared by attempts of several tasks, so only the
      // records no remaining task references may disappear with this task.
      const remaining = new Set(draft.tasks.filter(candidate => candidate !== task).flatMap(candidate => candidate.attempts.map(attempt => attempt.workspaceId)))
      const removed = new Set([...workspaceIds].filter(workspaceId => !remaining.has(workspaceId)))
      if (draft.executions.some(execution => removed.has(execution.workspaceId) && (execution.owner !== null || execution.waiting.length > 0))) throw new CatalogError('task_busy')
      if (draft.workspaces.some(workspace => removed.has(workspace.id) && workspace.cleaned !== true)) throw new CatalogError('task_workspace_uncleaned')
      draft.tasks.splice(draft.tasks.indexOf(task), 1)
      draft.workspaces = draft.workspaces.filter(workspace => !removed.has(workspace.id))
      draft.executions = draft.executions.filter(execution => !removed.has(execution.workspaceId))
      recordAudit(draft, 'task.deleted', 'human', { taskId, detail: task.title })
    }),
  }
  return api
}
