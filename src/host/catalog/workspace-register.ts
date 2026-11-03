/**
 * Registration of an existing directory as a prepared workspace.
 *
 * Registration validates the layout and records the workspace in one catalog
 * transaction; it never creates or deletes directories.
 */
import { randomUUID } from 'node:crypto'
import { isAbsolute, normalize, resolve } from 'node:path'
import { brandString } from '@deepseek-ai/dsh-brand'
import { admitWorkspaceLayout, WorkspaceLayoutError, type WorkspaceLayout, type WorkspaceRepositoryBinding, type WorkspaceRepositoryKind } from '../../domain/workspace.ts'
import type { AuditEntry, AuditEvent } from '../../domain/audit.ts'
import type { CatalogSnapshot, WorkspaceRecord } from '../../api/records.ts'
import { linkWorkspaceSkills } from '../../git/workspace.ts'
import type { RegisterPreparedWorkspaceInput } from './contract.ts'
import { CatalogError } from './errors.ts'
import { versionIn } from './selectors.ts'

/**
 * The catalog transaction surface required by workspace registration.
 */
export interface WorkspaceRegisterRuntime {
  transaction<T>(operation: (draft: CatalogSnapshot) => Promise<T> | T): Promise<T>
  recordAudit(
    draft: CatalogSnapshot,
    event: AuditEvent,
    actor: AuditEntry['actor'],
    fields?: Omit<AuditEntry, 'id' | 'at' | 'event' | 'actor'>,
  ): void
}

/**
 * Register one prepared workspace whose directory already exists.
 * @param runtime - Catalog transaction and audit surface.
 * @param input - Existing root, Lock and optional repository bindings.
 * @returns the persisted workspace record.
 */
export async function registerPreparedWorkspace(runtime: WorkspaceRegisterRuntime, input: RegisterPreparedWorkspaceInput): Promise<WorkspaceRecord> {
  return runtime.transaction(async draft => {
    const version = versionIn(draft, input.versionId)
    const project = draft.projects.find(item => item.id === (input.projectId ?? version.projectId))
    if (!project) throw new CatalogError('missing_project')
    const lock = draft.locks.find(item => item.id === input.lockId)
    if (!lock) throw new CatalogError('missing_lock')
    if (lock.versionId !== version.id) throw new CatalogError('workspace_mismatch')
    const rootPath = input.rootPath ?? input.path
    if (!isAbsolute(rootPath) || normalize(rootPath) !== rootPath) throw new CatalogError('invalid_workspace_path')
    const mode = input.mode ?? 'direct'
    const kind: WorkspaceRepositoryKind = mode === 'managed' ? 'worktree' : mode === 'linked' ? 'link' : 'direct'
    const repositories: WorkspaceRepositoryBinding[] = (input.repositories ?? project.config.sources.map(source => ({
      sourceId: source.id,
      path: source.path,
      targetPath: resolve(rootPath, source.path),
    }))).map(repository => ({ ...repository, kind }))
    const layout: WorkspaceLayout = {
      projectId: project.id,
      mode,
      rootPath,
      rootOwner: input.rootOwner ?? (mode === 'managed' ? 'loom' : 'user'),
      repositories,
    }
    try {
      admitWorkspaceLayout(layout)
    } catch (error) {
      if (error instanceof WorkspaceLayoutError) throw new CatalogError('invalid_workspace_path')
      throw error
    }
    if (repositories.some(repository => !project.config.sources.some(source => source.id === repository.sourceId))) throw new CatalogError('workspace_mismatch')
    if (draft.workspaces.some(item => item.cleaned !== true && (item.rootPath ?? item.path) === rootPath)) throw new CatalogError('workspace_path_registered')
    const skillLinks = mode === 'direct' && repositories.length > 1
      ? await linkWorkspaceSkills(rootPath, repositories.map(repository => repository.targetPath))
      : []
    const record: WorkspaceRecord = {
      id: brandString<WorkspaceRecord['id']>(randomUUID()),
      path: rootPath,
      rootPath,
      versionId: version.id,
      lockId: lock.id,
      projectId: project.id,
      mode,
      rootOwner: layout.rootOwner,
      repositories,
      ...(input.branches === undefined || Object.keys(input.branches).length === 0 ? {} : { branches: input.branches }),
      ...(input.mode === 'managed' ? { managed: true } : {}),
      ...(skillLinks.length === 0 ? {} : { skillLinks }),
    }
    draft.workspaces.push(record)
    runtime.recordAudit(draft, 'workspace.prepared', 'system', { workspaceId: record.id, detail: rootPath })
    return record
  })
}
