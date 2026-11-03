/**
 * Workspace preparation helpers shared by catalog transactions.
 *
 * These functions only inspect inputs and filesystem state; persistence stays
 * in the catalog implementation.
 */
import { lstat } from 'node:fs/promises'
import type { Lock } from '../../domain/task.ts'
import type { WorkspaceRepositoryBinding } from '../../domain/workspace.ts'
import type { ProjectRecord } from '../../api/records.ts'
import { WorkspacePreparationError } from '../../git/workspace.ts'
import { CatalogError } from './errors.ts'

/**
 * True when a filesystem entry exists; a broken link still counts as present.
 */
export async function pathExists(path: string): Promise<boolean> {
  try { await lstat(path); return true } catch { return false }
}
/**
 * One preparation step failure rendered for persistence.
 */
export function preparationFailure(error: unknown): { error: string, rollback: string | undefined } {
  if (error instanceof WorkspacePreparationError) {
    const detail = error.detail === undefined || error.detail === '' ? error.code : `${error.code}: ${error.detail}`
    return { error: detail.slice(0, 1000), rollback: error.rollbackErrors.length === 0 ? undefined : error.rollbackErrors.join('; ').slice(0, 1000) }
  }
  return { error: String(error).slice(0, 1000), rollback: undefined }
}

/**
 * Repository worktree requests for the bindings that are still pending.
 */
export function repositoryRequests(project: ProjectRecord, lock: Lock, bindings: readonly WorkspaceRepositoryBinding[], pending?: ReadonlySet<string>): { repo: string; path: string; commit: string; branch?: string }[] {
    return bindings.filter(binding => pending === undefined || pending.has(binding.sourceId)).map(binding => {
      const source = project.config.sources.find(item => item.id === binding.sourceId)
      if (source === undefined) throw new CatalogError('workspace_mismatch')
      const pinned = lock.repositories.find(repository => repository.sourceId === binding.sourceId)
      if (pinned === undefined) throw new CatalogError('workspace_mismatch')
      return { repo: source.repo, path: binding.path, commit: pinned.commit, ...(binding.branch === undefined ? {} : { branch: binding.branch }) }
    })
  }

