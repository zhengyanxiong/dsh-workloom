/**
 * Workspace path and repository inspection helpers used by the Host service.
 */
import { isAbsolute, join, resolve, win32 } from 'node:path'
import type { CatalogSnapshot } from '../../api/records.ts'
import type { WorkspaceInspection } from '../../api/index.ts'
import type { WorkspaceRepositoryBinding } from '../../domain/workspace.ts'
import { repositoryBranches } from '../../git/workspace.ts'
import { serviceError } from './errors.ts'

/**
 * Compare the Agent's working directory with a catalog workspace in its own path spelling.
 */
export function sameHostPath(left: string | undefined, right: string): boolean {
  if (left === undefined || left === '') return false
  const windows = /^[A-Za-z]:[\\/]/u.test(left) || /^\\\\/u.test(left) || /^[A-Za-z]:[\\/]/u.test(right) || /^\\\\/u.test(right)
  try {
    if (windows) return win32.isAbsolute(left) && win32.isAbsolute(right) && win32.resolve(left).toLowerCase() === win32.resolve(right).toLowerCase()
    return isAbsolute(left) && isAbsolute(right) && resolve(left) === resolve(right)
  } catch {
    // Path comparison must never break Agent creation for a malformed inherited path.
    return left === right
  }
}


/**
 * Compare client-requested direct bindings with the persisted workspace before reusing it.
 */
export function sameRepositoryMappings(
  requested: readonly { readonly sourceId: string; readonly path: string; readonly targetPath: string }[] | undefined,
  existing: readonly WorkspaceRepositoryBinding[] | undefined,
): boolean {
  if (requested === undefined || existing === undefined) return true
  return requested.length === existing.length
    && requested.every(repository => existing.some(binding => binding.sourceId === repository.sourceId
      && binding.path === repository.path && binding.targetPath === repository.targetPath))
}


/**
 * Inspect each version repository inside an existing workspace root.
 */
export async function inspectWorkspace(snapshot: CatalogSnapshot, path: string, versionId: string): Promise<WorkspaceInspection> {
  const version = snapshot.versions.find(candidate => candidate.id === versionId)
  if (version === undefined) throw serviceError('missing_version')
  const project = snapshot.projects.find(candidate => candidate.id === version.projectId)
  if (project === undefined) throw serviceError('missing_project')
  const repositories: WorkspaceInspection['repositories'][number][] = []
  for (const source of project.config.sources) {
    const directory = join(path, source.path)
    try {
      const branches = await repositoryBranches(directory)
      repositories.push({ sourceId: source.id, repo: source.repo, directory, topLevel: branches.topLevel, ...(branches.current === undefined ? {} : { current: branches.current }), branches: branches.branches })
    } catch (error) {
      const detail = error instanceof Error ? error.message.split(/\r?\n/u)[0] : String(error)
      repositories.push({ sourceId: source.id, repo: source.repo, directory, branches: [], error: detail ?? 'not_git' })
    }
  }
  return { path, repositories }
}

