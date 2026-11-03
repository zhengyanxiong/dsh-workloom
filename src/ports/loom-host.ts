/**
 * Host capabilities consumed by the Workloom client.
 *
 * The interface is DSH-shaped at the session boundary (session references and
 * draft initialization belong to DSH), but is implemented only by
 * `src/platform/dsh`. Feature code depends on this port, not on DSH services.
 */
import type { SessionBinding, SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type { DraftInitializationOptions, DraftInitializationResult } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceFileBytes, WorkspaceFileText } from '@deepseek-ai/dsh-api-workspace-files/types'
import type { SessionWorkspacePathApplication } from '@deepseek-ai/dsh-api-session-controller/types'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {
  AttachSessionRequest, CatalogSnapshot, CleanupWorkspaceRequest, CommitWorkspaceRequest, CreateTaskRequest,
  CreateVersionRequest, DeleteProjectRequest, DeleteTaskRequest, DeleteVersionRequest, DirectoryListing,
  ExecutionRequest, ExecutionState, GenerateLockRequest, Lock, PrepareWorkspaceRequest, ProjectConfig, ProjectRecord,
  RegisterTemporarySessionRequest, RegisterWorkspaceRequest, ReleaseExecutionRequest, ReorderExecutionQueueRequest,
  RepositoryBranches, RepositoryBranchesRequest, StartAttemptRequest, TaskRecord, TemporarySessionRecord,
  TransitionTaskRequest, UpdateProjectRequest, UpdateTaskRequest, UpdateVersionRequest, UpdateWorkspaceRequest,
  VersionRecord, WorkspaceChangesRequest, WorkspaceCommitResult, WorkspaceInspection, WorkspaceRecord,
  WorkspaceRepositoryChangesRecord, WorkspaceStatusResult, InspectWorkspaceRequest, DeleteWorkspaceRequest,
} from '../api/index.ts'
import type { AgentPresetOption } from '../api/agent.ts'
import type { LoomJobsFace } from './loom-jobs.ts'

/**
 * Host catalog and native runtime capabilities owned by the registration context.
 */
export interface LoomHostPort {
  retainSession(id: SessionId): SessionReference
  /**
   * Opens a native resource when a session surface is mounted; false lets the caller use the
   * Loom preview.
   */
  openResource(address: string): boolean
  loadSnapshot(): Promise<RemoteResult<CatalogSnapshot>>
  createProject(request: ProjectConfig): Promise<RemoteResult<ProjectRecord>>
  updateProject(request: UpdateProjectRequest): Promise<RemoteResult<ProjectRecord>>
  deleteProject(request: DeleteProjectRequest): Promise<RemoteResult<void>>
  createVersion(request: CreateVersionRequest): Promise<RemoteResult<VersionRecord>>
  updateVersion(request: UpdateVersionRequest): Promise<RemoteResult<VersionRecord>>
  deleteVersion(request: DeleteVersionRequest): Promise<RemoteResult<void>>
  createTask(request: CreateTaskRequest): Promise<RemoteResult<TaskRecord>>
  updateTask(request: UpdateTaskRequest): Promise<RemoteResult<TaskRecord>>
  deleteTask(request: DeleteTaskRequest): Promise<RemoteResult<void>>
  generateLock(request: GenerateLockRequest): Promise<RemoteResult<Lock>>
  prepareWorkspace(request: PrepareWorkspaceRequest): Promise<RemoteResult<WorkspaceRecord>>
  /**
   * Preparation used for inline add-workspace failures; must not emit a toast.
   */
  prepareWorkspaceSilent?(request: PrepareWorkspaceRequest): Promise<RemoteResult<WorkspaceRecord>>
  startAttempt(request: StartAttemptRequest): Promise<RemoteResult<TaskRecord>>
  attachSession(request: AttachSessionRequest): Promise<RemoteResult<TaskRecord>>
  registerTemporarySession(request: RegisterTemporarySessionRequest): Promise<RemoteResult<TemporarySessionRecord>>
  listAgentPresets(): Promise<RemoteResult<{ presets: readonly AgentPresetOption[] }>>
  transitionTask(request: TransitionTaskRequest): Promise<RemoteResult<TaskRecord>>
  registerWorkspace(request: RegisterWorkspaceRequest): Promise<RemoteResult<WorkspaceRecord>>
  repositoryBranches(request: RepositoryBranchesRequest): Promise<RemoteResult<RepositoryBranches>>
  inspectWorkspace(request: InspectWorkspaceRequest): Promise<RemoteResult<WorkspaceInspection>>
  pickDirectory(): Promise<string | null>
  listDirectory(path: string | undefined, signal: AbortSignal): Promise<RemoteResult<DirectoryListing>>
  requestDraftInitialization(binding: SessionBinding, options: DraftInitializationOptions): DraftInitializationResult
  createSessionInWorkspace(path: string, agentPreset?: string): Promise<SessionId>
  openPath(path: string, action?: 'open' | 'reveal'): Promise<boolean>
  openPathApplications(path: string, signal: AbortSignal): Promise<RemoteResult<readonly SessionWorkspacePathApplication[]>>
  openPathWith(path: string, application: string): Promise<boolean>
  readBytes(sessionId: SessionId, path: string, signal: AbortSignal): Promise<RemoteResult<WorkspaceFileBytes>>
  workspaceChanges(request: WorkspaceChangesRequest): Promise<RemoteResult<{ repositories: WorkspaceRepositoryChangesRecord[] }>>
  workspaceChangeCount(request: WorkspaceChangesRequest): Promise<RemoteResult<number>>
  workspaceStatus(request: WorkspaceChangesRequest): Promise<RemoteResult<WorkspaceStatusResult>>
  readFile(sessionId: SessionId, path: string, offset: number, signal: AbortSignal): Promise<RemoteResult<WorkspaceFileText>>
  commitWorkspace(request: CommitWorkspaceRequest): Promise<RemoteResult<WorkspaceCommitResult>>
  forkSession(request: { readonly sessionId: SessionId; readonly increaseTitle?: boolean }): Promise<SessionId>
  /**
   * Native jobs service, when the jobs client plugin is installed.
   */
  readonly jobs?: LoomJobsFace | undefined
  updateWorkspace(request: UpdateWorkspaceRequest): Promise<RemoteResult<WorkspaceRecord>>
  deleteWorkspace(request: DeleteWorkspaceRequest): Promise<RemoteResult<void>>
  cleanupWorkspace(request: CleanupWorkspaceRequest): Promise<RemoteResult<void>>
  /**
   * Cleanup used for rollback; must not emit a user-facing success toast.
   */
  cleanupWorkspaceSilent?(request: CleanupWorkspaceRequest): Promise<RemoteResult<void>>
  acquireExecution(request: ExecutionRequest): Promise<RemoteResult<ExecutionState>>
  cancelExecution(request: ExecutionRequest): Promise<RemoteResult<ExecutionState>>
  reorderExecutionQueue(request: ReorderExecutionQueueRequest): Promise<RemoteResult<ExecutionState>>
  releaseExecution(request: ReleaseExecutionRequest): Promise<RemoteResult<ExecutionState>>
  takeoverExecution(request: ExecutionRequest): Promise<RemoteResult<ExecutionState>>
}
