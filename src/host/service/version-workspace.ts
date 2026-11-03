/**
 * Creation of the optional workspaces attached to a version save.
 *
 * Auto workspaces are managed worktrees with a generated branch; linked
 * workspaces validate existing directories and bind their current branches.
 */
import { isAbsolute, join, normalize } from 'node:path'
import type { Branded } from '@deepseek-ai/dsh-brand'
import type { Catalog } from '../catalog.ts'
import type { Lock } from '../../domain/task.ts'
import { autoWorkspaceRepositoryPath } from '../../domain/workspace.ts'
import { repositoryBranches } from '../../git/workspace.ts'
import type { VersionRecord, VersionWorkspaceInput, WorkspaceRecord } from '../../api/index.ts'
import { serviceError } from './errors.ts'

/**
 * Materialize or register one version workspace.
 * @param catalog - Committed catalog.
 * @param version - Version being saved.
 * @param lock - Exact baseline for the workspace.
 * @param input - Auto worktree or linked directories.
 * @returns the prepared workspace.
 */
export async function prepareVersionWorkspace(
  catalog: Catalog,
  version: VersionRecord,
  lock: Lock,
  input: VersionWorkspaceInput,
): Promise<WorkspaceRecord> {
  const snapshot = catalog.snapshot()
  const project = snapshot.projects.find(candidate => candidate.id === version.projectId)
  if (project === undefined) throw serviceError('missing_project')
  const targetIds = new Set(lock.repositories.map(repository => repository.sourceId))
  const sources = project.config.sources.filter(source => targetIds.has(source.id))
  if (sources.length === 0) throw serviceError('workspace_mismatch')
  if (input.mode === 'auto') {
    if (!isAbsolute(input.parentPath) || normalize(input.parentPath) !== input.parentPath) throw serviceError('invalid_workspace_path')
    if (!/^[A-Za-z0-9._-]+$/u.test(input.name) || input.name === '.' || input.name === '..') throw serviceError('invalid_workspace_path')
    const root = join(input.parentPath, input.name)
    const prefix = input.branchPrefix ?? 'loom'
    if (!/^(?![-.])[A-Za-z0-9._/-]+$/u.test(prefix)) throw serviceError('invalid_workspace_path')
    const branch = `${prefix}/${input.name}`
    const branches: Record<string, string> = {}
    const repositories = sources.map(source => {
      const pinned = lock.repositories.find(repository => repository.sourceId === source.id)
      const subProjectId = pinned?.subProjectId === undefined ? 'default' : String(pinned.subProjectId)
      const path = autoWorkspaceRepositoryPath(subProjectId, source)
      branches[source.id] = branch
      return { sourceId: source.id, path, targetPath: join(root, path) }
    })
    const prepared = await catalog.prepareWorkspace({ path: root, versionId: version.id, lockId: lock.id, mode: 'managed', repositories, branches, requireBranches: true })
    if (prepared.preparation?.status === 'failed') {
      const failed = prepared.preparation.repositories.filter(repository => repository.status === 'failed')
      const reason = failed.length > 0
        ? failed.map(repository => `${repository.path ?? String(repository.sourceId)}: ${repository.error ?? 'failed'}`).join('; ')
        : prepared.preparation.error ?? 'workspace preparation failed'
      throw new Error(reason)
    }
    return prepared
  }
  if (!isAbsolute(input.rootPath) || normalize(input.rootPath) !== input.rootPath) throw serviceError('invalid_workspace_path')
  if (input.repositories.length !== sources.length) throw serviceError('workspace_mismatch')
  const branches: Record<string, string> = {}
  const repositories: { sourceId: Branded<'loom.source'>; path: string; targetPath: string }[] = []
  for (const source of sources) {
    const mapping = input.repositories.find(candidate => candidate.sourceId === source.id)
    if (mapping === undefined) throw serviceError('workspace_mismatch')
    if (!isAbsolute(mapping.targetPath) || normalize(mapping.targetPath) !== mapping.targetPath) throw serviceError('invalid_workspace_path')
    const current = await repositoryBranches(mapping.targetPath)
    if (current.current === undefined) throw serviceError('detached_head', mapping.targetPath)
    branches[source.id] = current.current
    const pinned = lock.repositories.find(repository => repository.sourceId === source.id)
    const subProjectId = pinned?.subProjectId === undefined ? 'default' : String(pinned.subProjectId)
    repositories.push({ sourceId: source.id, path: autoWorkspaceRepositoryPath(subProjectId, source), targetPath: mapping.targetPath })
  }
  return catalog.registerPreparedWorkspace({
    path: input.rootPath,
    rootPath: input.rootPath,
    rootOwner: 'user',
    versionId: version.id,
    lockId: lock.id,
    mode: 'direct',
    branches,
    repositories,
  })
}
