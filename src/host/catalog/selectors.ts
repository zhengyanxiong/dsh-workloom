/**
 * Read-only snapshot selectors shared by session binding and workspace routing.
 */
import { resolve, sep } from 'node:path'
import type { CatalogSnapshot, TaskRecord, WorkspaceRecord } from '../../api/records.ts'
import { CatalogError } from './errors.ts'
import type { Attempt } from '../../domain/task.ts'

/**
 * Look up one workspace or fail with `missing_workspace`.
 */
export function workspaceIn(snapshot: CatalogSnapshot, workspaceId: WorkspaceRecord['id']): WorkspaceRecord {
  const workspace = snapshot.workspaces.find(item => item.id === workspaceId)
  if (!workspace) throw new CatalogError('missing_workspace')
  return workspace
}

function pathWithin(root: string, candidate: string): boolean {
  const normalizedRoot = resolve(root)
  const normalized = resolve(candidate)
  if (normalized === normalizedRoot) return true
  if (process.platform === 'win32') return normalized.toLowerCase().startsWith(`${normalizedRoot.toLowerCase()}${sep}`)
  return normalized.startsWith(`${normalizedRoot}${sep}`)
}

/**
 * Find the active workspace whose root equals or contains one host path.
 */
export function findWorkspaceByPath(snapshot: CatalogSnapshot, path: string): WorkspaceRecord | undefined {
  return snapshot.workspaces.find(workspace => workspace.cleaned !== true && pathWithin(workspace.rootPath ?? workspace.path, path))
}
/**
 * Resolve the task and its current round for one attached Session; newest records win.
 */
export function findSessionAttempt(snapshot: CatalogSnapshot, sessionId: string): { task: TaskRecord; attempt: Attempt } | undefined {
  for (let taskIndex = snapshot.tasks.length - 1; taskIndex >= 0; taskIndex -= 1) {
    const task = snapshot.tasks[taskIndex]!
    for (let attemptIndex = task.attempts.length - 1; attemptIndex >= 0; attemptIndex -= 1) {
      const attempt = task.attempts[attemptIndex]!
      if (attempt.sessionIds.some(candidate => candidate === sessionId)) return { task, attempt }
    }
  }
  return undefined
}
