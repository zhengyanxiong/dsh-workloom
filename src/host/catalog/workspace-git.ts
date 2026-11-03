/**
 * Workspace Git reads and checkpoints.
 *
 * These operations are read-mostly and never persist a workspace record; the
 * catalog implementation wraps them in its transaction boundary where needed.
 */
import { commitWorkingTree, unpushedCommits, workingTreeChangeCount, workingTreeChanges, workingTreeDirty, type WorkspaceRepositoryChanges } from '../../git/workspace.ts'
import type { Branded } from '@deepseek-ai/dsh-brand'
import type { Lock } from '../../domain/task.ts'
import type { CatalogSnapshot, WorkspaceRecord } from '../../api/records.ts'
import type { WorkspaceCommitRepository, WorkspaceCommitResult, WorkspaceStatusRepository } from './contract.ts'
import { CatalogError } from './errors.ts'
import { projectOfWorkspace, workspaceBindings } from './schema.ts'
import { workspaceIn } from './selectors.ts'

/**
 * One repository worktree used by a workspace read.
 */
export interface WorkspaceWorktree {
  readonly sourceId: Branded<'loom.source'>
  readonly repo: string
  readonly directory: string
  readonly commit: string
  readonly branch?: string | undefined
}

/**
 * Resolve the repositories and pinned commits for a workspace read.
 * @param draft - Catalog snapshot.
 * @param workspaceId - Workspace identity.
 * @param lockId - Optional attempt Lock override.
 * @param allowLegacyDirect - Permit a newer Lock fallback for legacy direct roots.
 * @returns one worktree row per repository binding.
 */
export function workspaceWorktrees(
  draft: CatalogSnapshot,
  workspaceId: WorkspaceRecord['id'],
  lockId?: Lock['id'],
  allowLegacyDirect = false,
): WorkspaceWorktree[] {
  const workspace = workspaceIn(draft, workspaceId)
  const project = projectOfWorkspace(draft, workspace)
  if (!project) throw new CatalogError('missing_project')
  const lock = draft.locks.find(item => item.id === (lockId ?? workspace.lockId))
  if (!lock) throw new CatalogError('missing_lock')
  const mode = workspace.mode ?? (workspace.managed === true ? 'managed' : 'direct')
  // Direct workspaces may have been created before the project gained a
  // repository. Their pinned Lock then has no entry for the newer binding;
  // status/diff reads may use the latest Lock for that repository instead of
  // refusing the whole workspace.
  const fallback = allowLegacyDirect && mode === 'direct'
    ? draft.locks.filter(item => item.versionId === workspace.versionId).at(-1)
    : undefined
  return workspaceBindings(draft, workspace).map(binding => {
    const source = project.config.sources.find(item => item.id === binding.sourceId)
    if (source === undefined) throw new CatalogError('workspace_mismatch')
    const pinned = lock.repositories.find(repository => repository.sourceId === binding.sourceId)
      ?? fallback?.repositories.find(repository => repository.sourceId === binding.sourceId)
    if (pinned === undefined) throw new CatalogError('workspace_mismatch')
    return {
      sourceId: binding.sourceId,
      repo: source.repo,
      directory: binding.targetPath,
      commit: pinned.commit,
      branch: binding.branch ?? workspace.branches?.[binding.sourceId],
    }
  })
}

function attemptLockId(snapshot: CatalogSnapshot, attemptId: Branded<'loom.attempt'> | undefined): Lock['id'] | undefined {
  if (attemptId === undefined) return undefined
  const lockId = snapshot.tasks.flatMap(task => task.attempts).find(attempt => attempt.id === attemptId)?.lock.id
  if (lockId === undefined) throw new CatalogError('missing_task')
  return lockId
}

/**
 * Read changed files for one workspace.
 * @param snapshot - Catalog snapshot.
 * @param workspaceId - Workspace identity.
 * @param attemptId - Attempt whose Lock is the comparison baseline.
 * @returns changed files per repository.
 */
export async function workspaceChanges(snapshot: CatalogSnapshot, workspaceId: WorkspaceRecord['id'], attemptId?: Branded<'loom.attempt'>): Promise<{ repositories: WorkspaceRepositoryChanges[] }> {
  const lockId = attemptLockId(snapshot, attemptId)
  return { repositories: await workingTreeChanges(workspaceWorktrees(snapshot, workspaceId, lockId, true)) }
}

/**
 * Count changed files in one workspace without reading diffs.
 * @param snapshot - Catalog snapshot.
 * @param workspaceId - Workspace identity.
 * @param attemptId - Attempt whose Lock is the comparison baseline.
 * @returns changed-file count.
 */
export async function workspaceChangeCount(snapshot: CatalogSnapshot, workspaceId: WorkspaceRecord['id'], attemptId?: Branded<'loom.attempt'>): Promise<number> {
  const lockId = attemptLockId(snapshot, attemptId)
  return workingTreeChangeCount(workspaceWorktrees(snapshot, workspaceId, lockId, true))
}

/**
 * Read ownership and change status for one workspace.
 * @param snapshot - Catalog snapshot.
 * @param workspaceId - Workspace identity.
 * @param attemptId - Attempt whose Lock is the comparison baseline.
 * @returns running flag and per-repository status.
 */
export async function workspaceStatus(snapshot: CatalogSnapshot, workspaceId: WorkspaceRecord['id'], attemptId?: Branded<'loom.attempt'>): Promise<{ running: boolean; repositories: WorkspaceStatusRepository[] }> {
  const running = snapshot.executions.some(execution => execution.workspaceId === workspaceId && execution.owner !== null)
  const lockId = attemptLockId(snapshot, attemptId)
  const changes = await workingTreeChanges(workspaceWorktrees(snapshot, workspaceId, lockId, true))
  // Push state is advisory: a missing upstream reports itself instead of
  // failing the whole status read.
  const repositories: WorkspaceStatusRepository[] = await Promise.all(changes.map(async repository => {
    const unpushed = await unpushedCommits(repository.directory)
    return unpushed === undefined ? { ...repository, unpushedUnavailable: true } : { ...repository, unpushed }
  }))
  return { running, repositories }
}

/**
 * Check whether a workspace has uncommitted changes.
 * @param snapshot - Catalog snapshot.
 * @param workspaceId - Workspace identity.
 * @returns true when any bound repository is dirty.
 */
export function workspaceDirty(snapshot: CatalogSnapshot, workspaceId: WorkspaceRecord['id']): Promise<boolean> {
  const workspace = workspaceIn(snapshot, workspaceId)
  // A dirtiness check reads working trees, not the Lock baseline. Requiring
  // a pin for every binding rejects valid direct workspaces whose Lock was
  // created before the project gained a repository.
  return workingTreeDirty(workspaceBindings(snapshot, workspace).map(binding => binding.targetPath))
}

/**
 * Commit every bound repository without pushing.
 * @param snapshot - Catalog snapshot.
 * @param workspaceId - Workspace identity.
 * @param message - Commit subject.
 * @returns per-repository commit results.
 */
export async function commitWorkspace(snapshot: CatalogSnapshot, workspaceId: WorkspaceRecord['id'], message: string): Promise<WorkspaceCommitResult> {
  const workspace = workspaceIn(snapshot, workspaceId)
  if (workspace.cleaned === true) throw new CatalogError('workspace_cleaned')
  const subject = message.trim() === '' ? 'Loom checkpoint' : message.trim().slice(0, 500)
  const repositories: WorkspaceCommitRepository[] = []
  for (const binding of workspaceBindings(snapshot, workspace)) {
    try {
      const commit = await commitWorkingTree(binding.targetPath, subject)
      repositories.push({ sourceId: binding.sourceId, path: binding.path, changed: commit !== undefined, ...(commit === undefined ? {} : { commit }) })
    } catch (error) {
      repositories.push({ sourceId: binding.sourceId, path: binding.path, changed: false, error: error instanceof Error ? error.message : String(error) })
    }
  }
  return { repositories, committed: repositories.filter(repository => repository.commit !== undefined).length }
}
