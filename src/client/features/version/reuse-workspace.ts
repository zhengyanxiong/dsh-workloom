/**
 * Bind an existing direct workspace to a new version without copying files.
 *
 * A version owns its workspaces, and the catalog registers one record per
 * directory. Reusing a finished workspace therefore retires its old record and
 * re-registers the same directories for the target version and its Lock, after
 * proving the workspace is idle and clean. The order matters: registration
 * refuses a root that still belongs to another active record, so cleanup runs
 * first and the check above it keeps a half-moved workspace out of reach.
 */
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {
  CleanupWorkspaceRequest, RegisterWorkspaceRequest, WorkspaceChangesRequest, WorkspaceRecord,
  WorkspaceRepositoryBinding, WorkspaceStatusResult,
} from 'dsh-workloom/types'

/** Host calls needed to retire and re-register one workspace. */
export interface ReuseWorkspaceDeps {
  readonly cleanupWorkspace: (request: CleanupWorkspaceRequest) => Promise<RemoteResult<void>>
  readonly registerWorkspace: (request: RegisterWorkspaceRequest) => Promise<RemoteResult<WorkspaceRecord>>
  readonly workspaceStatus: (request: WorkspaceChangesRequest) => Promise<RemoteResult<WorkspaceStatusResult>>
}

/** The workspace being reused and the version that adopts it. */
export interface ReuseWorkspaceInput {
  readonly workspace: {
    readonly id: string
    readonly path: string
    readonly rootPath?: string | undefined
    readonly versionId: string
    readonly projectId?: string | undefined
    readonly repositories?: readonly WorkspaceRepositoryBinding[] | undefined
  }
  readonly versionId: string
  readonly projectId: string | undefined
  readonly lockId: string
}

/** Either the adopted workspace record or a wire-shaped failure code and message. */
export type ReuseWorkspaceOutcome =
  | { readonly ok: true; readonly workspace: WorkspaceRecord }
  | {
    readonly ok: false
    readonly code: string
    readonly message: string
    /** Where the move stopped: checks, cleanup, or re-registration. */
    readonly stage: 'check' | 'cleanup' | 'register'
  }

/**
 * Retire a finished direct workspace and bind its directories to another version.
 * @param deps - Host calls for status, cleanup and registration.
 * @param input - workspace to reuse and the adopting version and Lock.
 * @returns the new workspace record, or the failure that stopped the move.
 */
export async function reuseWorkspace(deps: ReuseWorkspaceDeps, input: ReuseWorkspaceInput): Promise<ReuseWorkspaceOutcome> {
  const bindings = input.workspace.repositories
  if (input.workspace.versionId === input.versionId) return failure('check', 'workspace_mismatch', 'the workspace already belongs to this version')
  if (bindings === undefined || bindings.length === 0) return failure('check', 'workspace_mismatch', 'the workspace has no repository mapping to reuse')
  const status = await deps.workspaceStatus({ workspaceId: input.workspace.id })
  if (!status.ok) return failure('check', status.error.code, status.error.message)
  if (status.value.running) return failure('check', 'workspace_busy', 'a Session still owns this workspace')
  // Direct workspaces keep the user's real repositories, so uncommitted work is
  // the one thing cleanup would silently leave behind in a half-reused layout.
  if (status.value.repositories.some(repository => repository.files.length > 0)) return failure('check', 'workspace_changes', 'commit every workspace change before reusing it')
  const cleaned = await deps.cleanupWorkspace({ workspaceId: input.workspace.id, discardChanges: false })
  if (!cleaned.ok) return failure('cleanup', cleaned.error.code, cleaned.error.message)
  const root = input.workspace.rootPath ?? input.workspace.path
  const registered = await deps.registerWorkspace({
    path: root,
    rootPath: root,
    versionId: input.versionId,
    lockId: input.lockId,
    mode: 'direct',
    rootOwner: 'user',
    ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
    repositories: bindings.map(binding => ({ sourceId: binding.sourceId, path: binding.path, targetPath: binding.targetPath })),
  })
  if (!registered.ok) return failure('register', registered.error.code, registered.error.message)
  return { ok: true, workspace: registered.value }
}

/** Build one outcome failure without inventing a Host code. */
function failure(stage: 'check' | 'cleanup' | 'register', code: string, message: string): ReuseWorkspaceOutcome {
  return { ok: false, code, message, stage }
}
