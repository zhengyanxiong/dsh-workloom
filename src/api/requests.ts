/**
 * Public Loom request and response wire types.
 *
 * These values cross the plugin Remote boundary. Host persistence and catalog
 * implementation types remain in `src/host`.
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
 * Read changes against a workspace's Lock baseline.
 */
export interface WorkspaceChangesRequest {
  readonly workspaceId: string
  /**
   * Attempt whose actual HEAD is the comparison baseline; omitted uses the workspace's last
   * Lock.
   */
  readonly attemptId?: string
}
/**
 * Workspace ownership and uncommitted-change state.
 */
export interface WorkspaceStatusResult {
  readonly running: boolean
  readonly repositories: readonly WorkspaceRepositoryStatusRecord[]
}
/**
 * One repository's changes plus its push state inside a prepared workspace.
 */
export interface WorkspaceRepositoryStatusRecord extends WorkspaceRepositoryChangesRecord {
  /**
   * Commits HEAD has that its upstream does not; absent when no upstream is configured.
   */
  readonly unpushed?: number | undefined
  /**
   * True when the branch has no upstream, so no ahead count exists.
   */
  readonly unpushedUnavailable?: boolean | undefined
}
/**
 * Commit every repository's uncommitted changes in a workspace, without pushing.
 */
export interface CommitWorkspaceRequest {
  readonly workspaceId: string
  /**
   * Commit subject; the Host trims and caps it.
   */
  readonly message?: string
}
/**
 * One repository's commit result, including a per-repository failure.
 */
export interface WorkspaceCommitRepository {
  readonly sourceId: string
  readonly path: string
  readonly changed: boolean
  readonly commit?: string
  readonly error?: string
}
/**
 * Per-repository checkpoint result for a workspace commit.
 */
export interface WorkspaceCommitResult {
  readonly repositories: readonly WorkspaceCommitRepository[]
  readonly committed: number
}
/**
 * Reorder the FIFO waiting queue for one workspace.
 */
export interface ReorderExecutionQueueRequest {
  readonly workspaceId: string
  /**
   * Every currently waiting Session, in the new priority order.
   */
  readonly sessionIds: readonly string[]
}
/**
 * Remove a workspace, optionally deleting its on-disk directory after explicit path
 * confirmation.
 */
export interface DeleteWorkspaceRequest {
  readonly workspaceId: string
  /**
   * Delete the workspace directory itself; direct/linked directories are user data.
   */
  readonly deleteFiles?: boolean
  /**
   * Exact workspace root echoed back by the UI when deleteFiles is true.
   */
  readonly confirmPath?: string
}
/**
 * Update editable Workspace metadata without changing its execution identity.
 */
export interface UpdateWorkspaceRequest {
  readonly workspaceId: string
  /**
   * Display label; omitted or empty clears it.
   */
  readonly label?: string
}
/**
 * Explicit cleanup of one retained workspace.
 */
export interface CleanupWorkspaceRequest {
  readonly workspaceId: string
  readonly discardChanges?: boolean
}
/**
 * One changed file with unified hunks; binary files carry no hunks.
 */
export interface WorkspaceFileChangeRecord {
  readonly path: string
  readonly added: number
  readonly deleted: number
  readonly binary: boolean
  readonly before: boolean
  readonly after: boolean
  readonly hunks: readonly { oldStart: number; oldLines: number; newStart: number; newLines: number; lines: readonly string[] }[]
}
/**
 * One repository's changes inside a prepared workspace.
 */
export interface WorkspaceRepositoryChangesRecord {
  readonly repo: string
  readonly directory: string
  readonly files: readonly WorkspaceFileChangeRecord[]
}
/**
 * One repository input for a direct or linked workspace.
 */
export interface WorkspaceRepositoryInput {
  readonly sourceId: string
  /**
   * Path below the workspace root; `.` only for a single-repository direct workspace.
   */
  readonly path: string
  /**
   * Real directory Git operates on.
   */
  readonly targetPath: string
}
/**
 * Materialize one prepared workspace from a version Lock.
 */
export interface PrepareWorkspaceRequest {
  /**
   * Explicit absolute root; the Host creates its own directory when omitted.
   */
  readonly path?: string
  readonly versionId: string
  readonly lockId: string
  /**
   * Optional branch per source id; an omitted source stays on a detached HEAD.
   */
  readonly branches?: Readonly<Record<string, string>>
  /**
   * `managed` creates worktrees; `linked` creates a root of links to existing directories.
   */
  readonly mode?: 'managed' | 'linked'
  /**
   * Refuse to create worktrees on a detached HEAD; V2 version creation sets this.
   */
  readonly requireBranches?: boolean
  readonly repositories?: readonly WorkspaceRepositoryInput[]
  /**
   * Retry a failed preparation: continues only the repositories that are not done.
   */
  readonly workspaceId?: string
}
/**
 * Record one prepared workspace whose directories already exist.
 */
export interface RegisterWorkspaceRequest {
  readonly path: string
  readonly versionId: string
  readonly lockId: string
  /**
   * Branch per source id; omitted entries keep the repository's current branch.
   */
  readonly branches?: Readonly<Record<string, string>>
  /**
   * `direct` records existing directories; `linked` records links created by prepare.
   */
  readonly mode?: 'direct' | 'linked'
  /**
   * Refuse a repository that is not currently on a branch.
   */
  readonly requireBranches?: boolean
  readonly projectId?: string
  readonly rootPath?: string
  readonly rootOwner?: 'loom' | 'user'
  readonly repositories?: readonly WorkspaceRepositoryInput[]
}
/**
 * Read branches of one local Git repository.
 */
export interface RepositoryBranchesRequest {
  readonly repo: string
}
/**
 * One local Git repository's checked-out and available branches.
 */
export interface RepositoryBranches {
  readonly topLevel: string
  readonly current?: string
  readonly branches: readonly string[]
}
/**
 * Validate one existing workspace root against a version's repositories.
 */
export interface InspectWorkspaceRequest {
  readonly path: string
  readonly versionId: string
}
/**
 * Per-repository inspection of an existing workspace root.
 */
export interface WorkspaceInspection {
  readonly path: string
  readonly repositories: readonly {
    readonly sourceId: string
    readonly repo: string
    readonly directory: string
    readonly topLevel?: string
    readonly current?: string
    readonly branches: readonly string[]
    readonly error?: string
  }[]
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

/**
 * One directory row in the native directory browser.
 */
export interface DirectoryEntry {
  readonly name: string
  readonly path: string
  readonly hidden: boolean
}
/**
 * One directory level and its ancestry, as the Host browse backend reports it.
 */
export interface DirectoryListing {
  readonly path: string
  readonly home: string
  readonly crumbs: readonly DirectoryEntry[]
  readonly entries: readonly DirectoryEntry[]
  readonly truncated: boolean
}
