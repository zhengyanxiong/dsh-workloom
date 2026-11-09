/**
 * Create a version and bind one reused workspace to its first Lock.
 *
 * The Remote create call builds new workspaces together with the version, but a
 * reused workspace needs the version's Lock to exist first. The order is
 * therefore version (no workspace) -> Lock -> reuse; a failed Lock or reuse
 * removes the version it just created so a retry starts from a clean catalog.
 */
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { CreateVersionRequest, DeleteVersionRequest, GenerateLockRequest, Lock, VersionRecord } from 'dsh-workloom/types'
import type { ReuseWorkspaceOutcome } from './reuse-workspace.ts'

/** Host calls needed to compose version creation with a reused workspace. */
export interface CreateVersionReuseDeps {
  readonly createVersion: (request: CreateVersionRequest) => Promise<RemoteResult<VersionRecord>>
  readonly generateLock: (request: GenerateLockRequest) => Promise<RemoteResult<Lock>>
  readonly deleteVersion: (request: DeleteVersionRequest) => Promise<RemoteResult<void>>
  readonly reuse: (version: VersionRecord, lockId: string, workspaceId: string) => Promise<ReuseWorkspaceOutcome>
}

/** Either the created version or the failure that stopped it. */
export type CreateVersionReuseOutcome =
  | { readonly ok: true; readonly version: VersionRecord }
  | {
    readonly ok: false
    readonly code: string
    readonly message: string
    /** Diagnostic when removing the half-created version also failed. */
    readonly rollbackError?: string | undefined
  }

/**
 * Create a version, generate its Lock and bind a reused workspace to it.
 * @param deps - Host calls for creation, Lock generation, deletion and reuse.
 * @param request - version request without workspace drafts.
 * @param workspaceId - finished workspace to retire and bind.
 * @returns the created version, or the failure plus a rollback diagnostic.
 */
export async function createVersionReusingWorkspace(
  deps: CreateVersionReuseDeps,
  request: CreateVersionRequest,
  workspaceId: string,
): Promise<CreateVersionReuseOutcome> {
  const { workspaces: _workspaces, ...base } = request
  void _workspaces
  const created = await deps.createVersion(base)
  if (!created.ok) return { ok: false, code: created.error.code, message: created.error.message }
  const rollback = async (): Promise<string | undefined> => {
    const removed = await deps.deleteVersion({ versionId: created.value.id })
    return removed.ok ? undefined : removed.error.message
  }
  const lock = await deps.generateLock({ versionId: created.value.id })
  if (!lock.ok) {
    const rollbackError = await rollback()
    return { ok: false, code: lock.error.code, message: lock.error.message, ...(rollbackError === undefined ? {} : { rollbackError }) }
  }
  const reused = await deps.reuse(created.value, lock.value.id, workspaceId)
  if (!reused.ok) {
    const rollbackError = await rollback()
    return { ok: false, code: reused.code, message: reused.message, ...(rollbackError === undefined ? {} : { rollbackError }) }
  }
  return { ok: true, version: created.value }
}


/** Deps for adopting a directory that this project already registered. */
export interface AdoptLinkedDeps extends CreateVersionReuseDeps {
  /** Find the active direct workspace record that owns a directory. */
  readonly findWorkspace: (rootPath: string) => { readonly id: string } | undefined
}

/**
 * Create a version whose linked workspace directory is already registered.
 *
 * Linking an existing directory is a natural way to reuse it, but the catalog
 * allows one active record per directory, so `createVersion` rejects the path.
 * When the directory belongs to an active direct workspace of the same project,
 * adopt it the way explicit reuse does: create the version without the workspace
 * draft, generate the Lock, retire the old record and re-register the same
 * directories for the new version.
 * @param deps - Host calls plus the registered-workspace lookup.
 * @param request - the original create request, including the linked draft.
 * @param rootPath - linked workspace root the catalog refused.
 * @returns the created version, or undefined when no registered workspace owns the path.
 */
export async function createVersionAdoptingLinkedDirectory(
  deps: AdoptLinkedDeps,
  request: CreateVersionRequest,
  rootPath: string,
): Promise<CreateVersionReuseOutcome | undefined> {
  const created = await deps.createVersion(request)
  if (created.ok) return { ok: true, version: created.value }
  const message = `${created.error.code} ${created.error.message}`
  if (!/workspace_path_registered/u.test(message)) return { ok: false, code: created.error.code, message: created.error.message }
  const workspace = deps.findWorkspace(rootPath)
  if (workspace === undefined) return { ok: false, code: created.error.code, message: created.error.message }
  return createVersionReusingWorkspace(deps, request, workspace.id)
}
