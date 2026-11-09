/**
 * Catalog rejection codes and their human-readable defaults.
 *
 * These errors cross the Host boundary; callers own localization.
 */
/**
 * Human-readable explanation for every catalog failure code.
 */
const CATALOG_ERROR_DESCRIPTION: Readonly<Record<string, string>> = {
  missing_project: 'the requested project does not exist',
  missing_version: 'the requested version does not exist',
  invalid_version: 'the version record is invalid',
  invalid_catalog: 'the Loom catalog is corrupt or inconsistent',
  missing_lock: 'the requested Lock does not exist',
  missing_task: 'the requested task does not exist',
  missing_workspace: 'the requested workspace does not exist',
  workspace_mismatch: 'the workspace does not belong to this version or Lock',
  workspace_path_registered: 'the directory is already registered as a workspace',
  invalid_workspace_path: 'the workspace path is invalid',
  workspace_busy: 'the workspace is owned by another session',
  workspace_task_running: 'another task is running in this workspace',
  workspace_branch_failed: 'the workspace branch could not be created or recorded',
  workspace_parent_missing: 'the workspace parent directory is missing',
  workspace_in_use: 'the workspace is still referenced by a task attempt',
  invalid_workspace_label: 'the workspace display label is too long',
  invalid_task: 'the task fields are invalid',
  workspace_changes: 'the workspace has uncommitted changes',
  workspace_cleanup_failed: 'the workspace cleanup did not finish',
  workspace_cleaned: 'the workspace has already been cleaned',
  workspace_unpushed: 'the workspace has unpushed commits',
  workspace_not_prepared: 'the workspace preparation is not ready',
  workspace_incomplete: 'the workspace does not cover every repository this version needs',
  execution_not_owned: 'the session does not own this workspace execution',
  task_not_active: 'the task is not in an active round',
  project_has_versions: 'the project still has versions',
  version_has_tasks: 'the version still has tasks',
  version_has_workspaces: 'the version still has workspaces',
  task_busy: 'the task is still running or owns a workspace',
  task_workspace_uncleaned: 'the task still has an uncleaned workspace',
}
/**
 * Catalog operation rejection, suitable for caller-owned localization.
 */
export class CatalogError extends Error {
  constructor(
    readonly code: 'missing_project' | 'missing_version' | 'invalid_version' | 'invalid_catalog' | 'missing_lock' | 'missing_task' | 'missing_workspace' | 'workspace_mismatch' | 'workspace_path_registered' | 'invalid_workspace_path' | 'workspace_busy' | 'workspace_task_running' | 'workspace_branch_failed' | 'workspace_parent_missing' | 'workspace_in_use' | 'workspace_incomplete' | 'invalid_workspace_label' | 'invalid_task' | 'workspace_changes' | 'workspace_cleanup_failed' | 'workspace_cleaned' | 'workspace_unpushed' | 'workspace_not_prepared' | 'execution_not_owned' | 'task_not_active' | 'project_has_versions' | 'version_has_tasks' | 'version_has_workspaces' | 'task_busy' | 'task_workspace_uncleaned',
    /**
     * Optional concrete diagnostic naming the task, owner or step that blocked the operation.
     */
    readonly detail?: string | undefined,
  ) {
    const description = CATALOG_ERROR_DESCRIPTION[code] ?? 'the operation was rejected'
    super(detail === undefined || detail === '' ? `${code}: ${description}` : `${code}: ${description} (${detail})`)
    this.name = 'CatalogError'
  }
}
