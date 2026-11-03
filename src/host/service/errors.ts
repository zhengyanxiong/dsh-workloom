/**
 * Stable service error prefixes shared by Remote methods and runtime hooks.
 */
/**
 * Human-readable service failure with a stable code prefix.
 */
const SERVICE_ERROR_DESCRIPTION: Readonly<Record<string, string>> = {
  owner_required: 'Loom operations require the workspace owner',
  loom_disposed: 'the Loom host has been disposed; reload the panel',
  missing_project: 'the requested project does not exist',
  missing_version: 'the requested version does not exist',
  missing_workspace: 'the requested workspace does not exist',
  workspace_mismatch: 'the workspace does not belong to this version or Lock',
  invalid_workspace_path: 'the workspace path is invalid',
  workspace_cleaned: 'the workspace has already been cleaned',
  workspace_not_prepared: 'the workspace preparation is not ready',
  workspace_changes: 'the workspace has uncommitted changes',
  stale_owner: 'the execution owner token is stale',
  detached_head: 'the directory is on a detached HEAD; choose a branch',
}
export function serviceError(code: string, detail?: string): Error {
  const description = SERVICE_ERROR_DESCRIPTION[code] ?? 'the Loom operation failed'
  return new Error(`${code}: ${description}${detail === undefined || detail === '' ? '' : ` (${detail})`}`)
}

