/**
 * Public project, version, task and execution wire types.
 *
 * These types cross the plugin Remote boundary and contain no Host
 * implementation dependency.
 */
import type { ProjectConfig } from '../domain/project.ts'

/**
 * Auto-created version workspace: parent path + worktree name + branch prefix.
 */
export interface AutoVersionWorkspaceInput {
  readonly mode: 'auto'
  readonly parentPath: string
  readonly name: string
  readonly branchPrefix?: string | undefined
}
/**
 * One existing repository directory mapped into a linked version workspace.
 */
export interface LinkedVersionRepositoryInput {
  readonly sourceId: string
  readonly targetPath: string
}
/**
 * Existing working directories bound to a version without copying.
 */
export interface LinkedVersionWorkspaceInput {
  readonly mode: 'linked'
  readonly rootPath: string
  readonly repositories: readonly LinkedVersionRepositoryInput[]
}
/**
 * One workspace created or registered while saving a version.
 */
export type VersionWorkspaceInput = AutoVersionWorkspaceInput | LinkedVersionWorkspaceInput
/**
 * Admit one project configuration.
 */
export interface CreateVersionRequest {
  readonly projectId: string
  readonly name: string
  /**
   * Trimmed human description; omitted persists an empty string, at most
   * `VERSION_DESCRIPTION_MAX_CHARS`.
   */
  readonly description?: string
  /**
   * Flattened compatibility refs; new clients also send `targets`.
   */
  readonly sources: readonly { readonly sourceId: string; readonly ref: string }[]
  /**
   * Canonical V2 refs scoped to sub-projects.
   */
  readonly targets?: readonly { readonly subProjectId: string; readonly sourceId: string; readonly ref: string }[]
  /**
   * Workspaces created/registered as part of saving the version.
   */
  readonly workspaces?: readonly VersionWorkspaceInput[]
}
/**
 * Create one task under a version.
 */
export interface CreateTaskRequest {
  readonly versionId: string
  /**
   * Ready workspace bound to the version; required for V2 task creation.
   */
  readonly workspaceId?: string
  readonly title: string
  /** Per-task Agent preset; omitted inherits the project preset. */
  readonly agentPreset?: string
  readonly description?: string
  readonly moduleIds?: readonly string[]
  readonly priority?: 'low' | 'normal' | 'high'
}
/**
 * Replace an existing project's admitted configuration.
 */
export interface UpdateProjectRequest {
  readonly projectId: string
  readonly config: ProjectConfig
}
/**
 * Replace one version's name, description and repository refs.
 */
export interface UpdateVersionRequest {
  readonly versionId: string
  readonly name: string
  /**
   * Omitted preserves the stored description; an empty string clears it.
   */
  readonly description?: string
  readonly sources: readonly { readonly sourceId: string; readonly ref: string }[]
  /**
   * Canonical V2 targets; omitted preserves the stored targets.
   */
  readonly targets?: readonly { readonly subProjectId: string; readonly sourceId: string; readonly ref: string }[]
}
/**
 * Replace editable task metadata without changing its version or execution history.
 */
export interface UpdateTaskRequest {
  readonly taskId: string
  readonly title: string
  /** Per-task Agent preset; omitting it clears an existing override. */
  readonly agentPreset?: string
  readonly description?: string
  readonly moduleIds?: readonly string[]
  readonly priority?: 'low' | 'normal' | 'high'
}
/**
 * Delete one project that no longer owns versions.
 */
export interface DeleteProjectRequest {
  readonly projectId: string
}
/**
 * Delete one version that no longer owns tasks or workspaces.
 */
export interface DeleteVersionRequest {
  readonly versionId: string
}
/**
 * Delete one task after its workspaces have been cleaned.
 */
export interface DeleteTaskRequest {
  readonly taskId: string
}
/**
 * Resolve every repository ref of one version.
 */
export interface GenerateLockRequest {
  readonly versionId: string
}

/**
 * Start the next execution round of one task.
 */
export interface StartAttemptRequest {
  readonly taskId: string
  readonly workspaceId: string
  /**
   * Allow a forked task to share a workspace whose execution is currently owned; execution
   * rights still serialize.
   */
  readonly allowBusy?: boolean
}
/**
 * Associate a native Session with one task round.
 */
export interface AttachSessionRequest {
  readonly taskId: string
  readonly sessionId: string
}
/**
 * Mark a native Session as a Loom temporary Session for one prepared workspace.
 */
export interface RegisterTemporarySessionRequest {
  readonly sessionId: string
  readonly workspacePath: string
}
/**
 * Stop treating one native Session as a Loom temporary Session.
 */
export interface ForgetTemporarySessionRequest {
  readonly sessionId: string
}
/**
 * Change one task's business status.
 */
export interface TransitionTaskRequest {
  readonly taskId: string
  readonly target: 'pending' | 'running' | 'review' | 'completed' | 'failed'
  readonly actor: 'human' | 'agent'
  /**
   * Human rationale recorded when a terminal transition accepts or rejects an Agent suggestion.
   */
  readonly basis?: string
}

/**
 * One Session requesting execution access to a prepared workspace.
 */
export interface ExecutionRequest {
  readonly workspaceId: string
  readonly sessionId: string
}
/**
 * Release an exact ownership generation after its Agent turn finished.
 */
export interface ReleaseExecutionRequest extends ExecutionRequest {
  readonly generation: number
}
