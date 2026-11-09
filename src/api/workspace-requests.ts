/**
 * Public workspace, Git inspection and directory wire types.
 *
 * These types cross the plugin Remote boundary and contain no Host
 * implementation dependency.
 */
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
  /**
   * Local branches first, then remote-tracking refs such as `origin/main`, each
   * group sorted. Reading the list refreshes the default remote first.
   */
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
