/**
 * Native Host adapter: maps DSH Remote and session services to LoomHostPort.
 *
 * This module owns no slot registration or panel lifecycle; it only translates
 * DSH calls into the stable client port.
 */
import type { SessionBinding } from '@deepseek-ai/dsh-api-session-controller/client'
import type { DraftInitializationOptions, DraftInitializationResult } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { SessionWorkspacePathApplication } from '@deepseek-ai/dsh-api-session-controller/types'
import type { WorkspaceFileBytes, WorkspaceFileText } from '@deepseek-ai/dsh-api-workspace-files/types'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {
  AttachSessionRequest, CleanupWorkspaceRequest, CommitWorkspaceRequest, CreateTaskRequest, CreateVersionRequest,
  DeleteProjectRequest, DeleteTaskRequest, DeleteVersionRequest, ExecutionRequest, GenerateLockRequest, InspectWorkspaceRequest,
  PrepareWorkspaceRequest, ProjectConfig, RegisterTemporarySessionRequest, RegisterWorkspaceRequest, ReleaseExecutionRequest,
  ReorderExecutionQueueRequest, RepositoryBranchesRequest, StartAttemptRequest, TransitionTaskRequest, UpdateProjectRequest,
  UpdateTaskRequest, UpdateVersionRequest, UpdateWorkspaceRequest, WorkspaceChangesRequest, WorkspaceStatusResult,
  DeleteWorkspaceRequest,
} from '../../api/index.ts'
import type { LoomHostPort } from '../../ports/loom-host.ts'
import type { LoomJobsFace } from '../../ports/loom-jobs.ts'
import { pushLoomNotice, reportLoomFailure } from '../../client/shared/feedback.ts'
import type { LoomKey } from '../../client/shared/locales.ts'
import type { LoomUi, Translate } from './ui.ts'
import './dsh-types.ts'

/**
 * Build the host port from a live DSH client context.
 */
export function createLoomHost(ui: LoomUi, t: Translate): LoomHostPort {
  const notified = async <T,>(promise: Promise<RemoteResult<T>>, success?: LoomKey): Promise<RemoteResult<T>> => {
    let result: RemoteResult<T>
    try {
      result = await promise
    } catch (error) {
      pushLoomNotice('error', t('notice.operationFailed'), error instanceof Error ? error.message : String(error))
      throw error
    }
    if (!result.ok) reportLoomFailure(t, result.error)
    else if (success !== undefined) pushLoomNotice('success', t(success))
    return result
  }
  return {
    retainSession: id => ui.sessions.retain(id, { source: 'loom' }),
    openResource: (address: string): boolean => {
      // A global main panel has no mounted native Session surface, so the
      // native right sidebar deliberately rejects writes; let Loom fall back.
      try { ui.sidebarRight.openResource(address); return true } catch { return false }
    },
    loadSnapshot: () => notified(ui.remote.loom.snapshot()),
    createProject: (request: ProjectConfig) => notified(ui.remote.loom.createProject(request), 'notice.projectCreated'),
    updateProject: (request: UpdateProjectRequest) => notified(ui.remote.loom.updateProject(request), 'notice.projectUpdated'),
    deleteProject: (request: DeleteProjectRequest) => notified(ui.remote.loom.deleteProject(request), 'notice.projectDeleted'),
    createVersion: (request: CreateVersionRequest) => notified(ui.remote.loom.createVersion(request), 'notice.versionCreated'),
    updateVersion: (request: UpdateVersionRequest) => notified(ui.remote.loom.updateVersion(request), 'notice.versionUpdated'),
    deleteVersion: (request: DeleteVersionRequest) => notified(ui.remote.loom.deleteVersion(request), 'notice.versionDeleted'),
    createTask: (request: CreateTaskRequest) => notified(ui.remote.loom.createTask(request), 'notice.taskCreated'),
    updateTask: (request: UpdateTaskRequest) => notified(ui.remote.loom.updateTask(request), 'notice.taskUpdated'),
    deleteTask: (request: DeleteTaskRequest) => notified(ui.remote.loom.deleteTask(request), 'notice.taskDeleted'),
    generateLock: (request: GenerateLockRequest) => notified(ui.remote.loom.generateLock(request), 'notice.lockGenerated'),
    prepareWorkspace: (request: PrepareWorkspaceRequest) => notified(ui.remote.loom.prepareWorkspace(request)),
    prepareWorkspaceSilent: (request: PrepareWorkspaceRequest) => ui.remote.loom.prepareWorkspace(request),
    registerWorkspace: (request: RegisterWorkspaceRequest) => notified(ui.remote.loom.registerWorkspace(request)),
    repositoryBranches: (request: RepositoryBranchesRequest) => ui.remote.loom.repositoryBranches(request),
    inspectWorkspace: (request: InspectWorkspaceRequest) => ui.remote.loom.inspectWorkspace(request),
    workspaceStatus: (request: WorkspaceChangesRequest): Promise<RemoteResult<WorkspaceStatusResult>> => ui.remote.loom.workspaceStatus(request),
    pickDirectory: async () => {
      const result = await ui.remote.directoryPicker.pick()
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
      return result.value
    },
    listDirectory: (path, signal) => ui.remote.directoryPicker.list(path, signal),
    requestDraftInitialization: (binding: SessionBinding, options: DraftInitializationOptions): DraftInitializationResult => {
      const conversation = ui.get('conversation')
      if (conversation === undefined) return 'blocked'
      return conversation.input.requestDraftInitialization(binding, options)
    },
    startAttempt: (request: StartAttemptRequest) => notified(ui.remote.loom.startAttempt(request)),
    attachSession: (request: AttachSessionRequest) => notified(ui.remote.loom.attachSession(request)),
    registerTemporarySession: (request: RegisterTemporarySessionRequest) => notified(ui.remote.loom.registerTemporarySession(request)),
    listAgentPresets: () => ui.remote.agentPresets.list(),
    transitionTask: (request: TransitionTaskRequest) => notified(ui.remote.loom.transitionTask(request), 'notice.taskMoved'),
    workspaceChanges: (request: WorkspaceChangesRequest) => ui.remote.loom.workspaceChanges(request),
    workspaceChangeCount: async (request: WorkspaceChangesRequest): Promise<RemoteResult<number>> => {
      // A refreshed client can outlive a Host that predates this lightweight
      // method. Try it, then fall back to the full read rather than failing
      // the whole panel while that Host is still running.
      const method = ui.remote.loom.workspaceChangeCount
      if (typeof method === 'function') {
        try {
          const result = await method(request)
          if (result.ok) return result
        } catch { /* The Host may not have this Remote method yet. */ }
      }
      const result = await ui.remote.loom.workspaceChanges(request)
      return result.ok
        ? { ok: true, value: result.value.repositories.reduce((total, repository) => total + repository.files.length, 0) }
        : result
    },
    readFile: (sessionId, path, offset, signal): Promise<RemoteResult<WorkspaceFileText>> => ui.remote.workspaceFiles.read(sessionId, path, { offset }, signal),
    readBytes: (sessionId, path, signal): Promise<RemoteResult<WorkspaceFileBytes>> => ui.remote.workspaceFiles.readBytes(sessionId, path, {}, signal),
    openPathApplications: (path, signal): Promise<RemoteResult<readonly SessionWorkspacePathApplication[]>> => ui.remote.session.workspacePathApplications({ path }, signal),
    openPathWith: async (path, application) => {
      const result = await ui.remote.session.openWorkspacePath({ path, application })
      return result.ok
    },
    commitWorkspace: (request: CommitWorkspaceRequest) => ui.remote.loom.commitWorkspace(request),
    forkSession: async request => ui.sessions.fork(request),
    get jobs(): LoomJobsFace | undefined {
      return ui.get('jobs') as LoomJobsFace | undefined
    },
    updateWorkspace: (request: UpdateWorkspaceRequest) => ui.remote.loom.updateWorkspace(request),
    deleteWorkspace: (request: DeleteWorkspaceRequest) => ui.remote.loom.deleteWorkspace(request),
    cleanupWorkspace: (request: CleanupWorkspaceRequest) => notified(ui.remote.loom.cleanupWorkspace(request), 'notice.workspaceCleaned'),
    cleanupWorkspaceSilent: (request: CleanupWorkspaceRequest) => ui.remote.loom.cleanupWorkspace(request),
    acquireExecution: (request: ExecutionRequest) => notified(ui.remote.loom.acquireExecution(request)),
    cancelExecution: (request: ExecutionRequest) => notified(ui.remote.loom.cancelExecution(request)),
    reorderExecutionQueue: (request: ReorderExecutionQueueRequest) => ui.remote.loom.reorderExecutionQueue(request),
    releaseExecution: (request: ReleaseExecutionRequest) => notified(ui.remote.loom.releaseExecution(request)),
    takeoverExecution: (request: ExecutionRequest) => notified(ui.remote.loom.takeoverExecution(request)),
    createSessionInWorkspace: async (path: string, agentPreset?: string) => {
      const workspace = await ui.workspaces.create({ path })
      return ui.sessions.create({ workspaceId: workspace.workspaceId, ...(agentPreset === undefined ? {} : { agentPreset }) })
    },
    openPath: async (path, action = 'open') => {
      const result = await ui.remote.session.openWorkspacePath(action === 'reveal' ? { path, action } : { path })
      return result.ok
    },
  }
}
