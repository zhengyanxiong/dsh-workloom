/**
 * Workspace preparation from a version Lock.
 *
 * Admission is persisted before any filesystem effect, then each repository is
 * prepared step by step so a failure leaves retryable progress instead of an
 * opaque failed workspace.
 */
import { randomUUID } from 'node:crypto'
import { lstat } from 'node:fs/promises'
import { isAbsolute, normalize, resolve } from 'node:path'
import { brandString, type Branded } from '@deepseek-ai/dsh-brand'
import { admitWorkspaceLayout, WorkspaceLayoutError, type WorkspaceLayout, type WorkspaceMode, type WorkspaceRepositoryBinding } from '../../domain/workspace.ts'
import type { AuditEntry, AuditEvent } from '../../domain/audit.ts'
import type { CatalogSnapshot, WorkspacePreparation, WorkspaceRecord } from '../../api/records.ts'
import {
  addLinkedWorkspaceLink, addWorkspaceWorktree, createWorkspaceRoot, linkWorkspaceSkills,
  planLinkedWorkspace, planWorkspace,
  type LinkedRepositoryPlan, type WorkspaceRepositoryPlan,
} from '../../git/workspace.ts'
import type { PrepareWorkspaceInput } from './contract.ts'
import { CatalogError } from './errors.ts'
import { nowIso, workspaceBindings } from './schema.ts'
import { versionIn, workspaceIn } from './selectors.ts'
import { pathExists, preparationFailure, repositoryRequests } from './workspace-prep.ts'

/**
 * The catalog transaction surface required by workspace preparation.
 */
export interface WorkspacePrepareRuntime {
  transaction<T>(operation: (draft: CatalogSnapshot) => Promise<T> | T): Promise<T>
  currentWorkspace(workspaceId: WorkspaceRecord['id']): WorkspaceRecord
  patchPreparation(
    draft: CatalogSnapshot,
    workspaceId: WorkspaceRecord['id'],
    patch: (preparation: WorkspacePreparation, workspace: WorkspaceRecord) => WorkspacePreparation,
  ): WorkspaceRecord
  updateWorkspaceIn(
    draft: CatalogSnapshot,
    workspaceId: WorkspaceRecord['id'],
    mutate: (workspace: WorkspaceRecord) => WorkspaceRecord,
  ): WorkspaceRecord
  recordAudit(
    draft: CatalogSnapshot,
    event: AuditEvent,
    actor: AuditEntry['actor'],
    fields?: Omit<AuditEntry, 'id' | 'at' | 'event' | 'actor'>,
  ): void
}

export async function prepareWorkspace(runtime: WorkspacePrepareRuntime, input: PrepareWorkspaceInput): Promise<WorkspaceRecord> {
    const requested = input.branches ?? {}
    for (const branch of Object.values(requested)) {
      if (branch !== '' && !/^(?![-.])[A-Za-z0-9._/-]+$/u.test(branch)) throw new CatalogError('invalid_workspace_path')
    }
    /**
     * One admitted preparation: the root, its bindings and the steps still to run.
     */
    type PreparationWork =
      | { readonly kind: 'ready'; readonly workspaceId: WorkspaceRecord['id'] }
      | { readonly kind: 'failed'; readonly workspaceId: WorkspaceRecord['id'] }
      | {
        readonly kind: 'prepare'
        readonly workspaceId: WorkspaceRecord['id']
        readonly root: string
        readonly mode: 'managed' | 'linked'
        readonly bindings: readonly WorkspaceRepositoryBinding[]
        readonly pending: readonly Branded<'loom.source'>[]
        readonly worktreePlans: readonly WorkspaceRepositoryPlan[]
        readonly linkPlans: readonly LinkedRepositoryPlan[]
      }
    // Admission happens before any filesystem effect: a rejected plan leaves no
    // record behind, and a retry continues only the repositories that failed.
    const work: PreparationWork = await runtime.transaction(async draft => {
      const version = versionIn(draft, input.versionId)
      const lock = draft.locks.find(item => item.id === input.lockId)
      if (!lock) throw new CatalogError('missing_lock')
      if (lock.versionId !== version.id) throw new CatalogError('workspace_mismatch')
      const project = draft.projects.find(item => item.id === version.projectId)
      if (!project) throw new CatalogError('missing_project')
      const targetIds = new Set(lock.repositories.map(repository => repository.sourceId))
      const versionSources = project.config.sources.filter(source => targetIds.has(source.id))
      if (versionSources.length === 0) throw new CatalogError('workspace_mismatch')
      const retry = input.workspaceId !== undefined
      let workspaceId: WorkspaceRecord['id']
      let root: string
      let mode: WorkspaceMode
      let bindings: readonly WorkspaceRepositoryBinding[]
      let pending: readonly Branded<'loom.source'>[]
      if (input.workspaceId !== undefined) {
        const existing = workspaceIn(draft, input.workspaceId)
        if (existing.cleaned === true) throw new CatalogError('workspace_cleaned')
        if (existing.versionId !== version.id || existing.lockId !== lock.id) throw new CatalogError('workspace_mismatch')
        mode = existing.mode ?? (existing.managed === true ? 'managed' : 'direct')
        if (mode === 'direct') throw new CatalogError('invalid_workspace_path', 'a direct workspace has nothing to prepare')
        const preparation = existing.preparation
        if (preparation === undefined) throw new CatalogError('invalid_workspace_path', 'the workspace has no recorded preparation to retry')
        if (preparation.status === 'ready') return { kind: 'ready', workspaceId: existing.id }
        workspaceId = existing.id
        root = existing.rootPath ?? existing.path
        bindings = workspaceBindings(draft, existing)
        pending = preparation.repositories.filter(entry => entry.status !== 'done').map(entry => entry.sourceId)
      } else {
        if (!isAbsolute(input.path) || normalize(input.path) !== input.path) throw new CatalogError('invalid_workspace_path')
        if (draft.workspaces.some(item => item.cleaned !== true && (item.rootPath ?? item.path) === input.path)) throw new CatalogError('workspace_path_registered')
        mode = input.mode ?? 'managed'
        if (mode === 'linked') {
          if (input.repositories === undefined || input.repositories.length !== versionSources.length) throw new CatalogError('invalid_workspace_path')
          bindings = versionSources.map(source => {
            const requestedBinding = input.repositories!.find(binding => binding.sourceId === source.id)
            if (requestedBinding === undefined) throw new CatalogError('workspace_mismatch')
            const branch = requested[source.id]
            const pinned = lock.repositories.find(repository => repository.sourceId === source.id)
            return {
              sourceId: source.id,
              ...(pinned?.subProjectId === undefined ? {} : { subProjectId: pinned.subProjectId }),
              path: requestedBinding.path,
              targetPath: requestedBinding.targetPath,
              kind: 'link' as const,
              ...(branch === undefined || branch === '' ? {} : { branch }),
            }
          })
          const layout: WorkspaceLayout = { projectId: project.id, mode: 'linked', rootPath: input.path, rootOwner: 'loom', repositories: bindings }
          try { admitWorkspaceLayout(layout) } catch (error) {
            if (error instanceof WorkspaceLayoutError) throw new CatalogError('invalid_workspace_path')
            throw error
          }
        } else {
          if (input.repositories !== undefined && input.repositories.length !== versionSources.length) throw new CatalogError('workspace_mismatch')
          bindings = versionSources.map(source => {
            const requestedBinding = input.repositories?.find(binding => binding.sourceId === source.id)
            const path = requestedBinding?.path ?? source.path
            const branch = requested[source.id]
            const pinned = lock.repositories.find(repository => repository.sourceId === source.id)
            return {
              sourceId: source.id,
              ...(pinned?.subProjectId === undefined ? {} : { subProjectId: pinned.subProjectId }),
              path,
              targetPath: resolve(input.path, path),
              kind: 'worktree' as const,
              ...(branch === undefined || branch === '' ? {} : { branch }),
              ...(pinned === undefined ? {} : { commit: pinned.commit }),
            }
          })
          if (input.repositories !== undefined) {
            try { admitWorkspaceLayout({ projectId: project.id, mode: 'managed', rootPath: input.path, rootOwner: 'loom', repositories: bindings }) } catch (error) {
              if (error instanceof WorkspaceLayoutError) throw new CatalogError('invalid_workspace_path')
              throw error
            }
          }
        }
        workspaceId = brandString<WorkspaceRecord['id']>(randomUUID())
        root = input.path
        pending = bindings.map(binding => binding.sourceId)
      }
      if (input.requireBranches === true && mode === 'managed' && bindings.some(binding => binding.branch === undefined || binding.branch === '')) {
        throw new CatalogError('invalid_workspace_path', 'every repository requires a branch')
      }
      // A new Loom-owned root is created with a non-recursive mkdir. Reject a
      // missing parent before persisting a workspace record, so a simple path
      // mistake never leaves a failed record that needs cleanup.
      if (!retry) {
        const parent = resolve(root, '..')
        try {
          const info = await lstat(parent)
          if (!info.isDirectory()) throw new CatalogError('workspace_parent_missing', parent)
        } catch (error) {
          if (error instanceof CatalogError) throw error
          throw new CatalogError('workspace_parent_missing', `${parent} does not exist`)
        }
      }
      const pendingSet = new Set<string>(pending)
      let worktreePlans: readonly WorkspaceRepositoryPlan[] = []
      let linkPlans: readonly LinkedRepositoryPlan[] = []
      try {
        if (mode === 'managed') {
          worktreePlans = (await planWorkspace(root, repositoryRequests(project, lock, bindings, pendingSet), { existingRoot: retry })).plans
        } else {
          linkPlans = (await planLinkedWorkspace(
            root,
            bindings.filter(binding => pendingSet.has(binding.sourceId)).map(binding => ({ path: binding.path, target: binding.targetPath })),
            { existingRoot: retry },
          )).plans
        }
      } catch (error) {
        if (!retry) throw error
        const failure = preparationFailure(error)
        runtime.patchPreparation(draft, workspaceId, preparation => ({
          ...preparation,
          status: 'failed',
          error: failure.error,
          repositories: preparation.repositories.map(entry => entry.status === 'done'
            ? entry
            : { sourceId: entry.sourceId, status: 'failed' as const, error: failure.error, ...(failure.rollback === undefined ? {} : { rollback: failure.rollback }) }),
        }))
        return { kind: 'failed', workspaceId }
      }
      if (retry) {
        runtime.patchPreparation(draft, workspaceId, preparation => ({
          ...preparation,
          status: 'preparing',
          error: undefined,
          repositories: preparation.repositories.map(entry => entry.status === 'done' ? entry : { sourceId: entry.sourceId, status: 'waiting' as const }),
        }))
      } else {
        const branches = Object.fromEntries(bindings.flatMap(binding => binding.branch === undefined ? [] : [[binding.sourceId, binding.branch] as const]))
        const record: WorkspaceRecord = {
          id: workspaceId,
          path: root,
          rootPath: root,
          versionId: version.id,
          lockId: lock.id,
          projectId: project.id,
          mode,
          rootOwner: 'loom',
          repositories: bindings,
          ...(Object.keys(branches).length === 0 ? {} : { branches }),
          ...(mode === 'managed' ? { managed: true } : {}),
          preparation: {
            status: 'waiting',
            startedAt: nowIso(),
            updatedAt: nowIso(),
            repositories: bindings.map(binding => ({ sourceId: binding.sourceId, status: 'waiting' as const })),
          },
        }
        draft.workspaces.push(record)
      }
      return { kind: 'prepare', workspaceId, root, mode, bindings, pending, worktreePlans, linkPlans }
    })
    if (work.kind !== 'prepare') return runtime.currentWorkspace(work.workspaceId)
    const prepared = work
    const pendingBindings = prepared.bindings.filter(binding => prepared.pending.includes(binding.sourceId))
    /**
     * Mark one repository step without touching its siblings.
     */
    const markStep = async (sourceId: Branded<'loom.source'>, status: 'preparing' | 'done', path?: string): Promise<void> => {
      await runtime.transaction(draft => runtime.patchPreparation(draft, prepared.workspaceId, preparation => ({
        ...preparation,
        status: 'preparing',
        repositories: preparation.repositories.map(entry => entry.sourceId === sourceId
          ? { sourceId: entry.sourceId, status, ...(path === undefined ? {} : { path }) }
          : entry),
      })))
    }
    /**
     * Persist the aggregate failure that stops the remaining steps.
     */
    const failPreparation = async (error: unknown, sourceId?: Branded<'loom.source'>): Promise<void> => {
      const failure = preparationFailure(error)
      await runtime.transaction(draft => runtime.patchPreparation(draft, prepared.workspaceId, preparation => ({
        ...preparation,
        status: 'failed',
        error: failure.error,
        repositories: preparation.repositories.map(entry => sourceId !== undefined && entry.sourceId === sourceId
          ? { sourceId: entry.sourceId, status: 'failed' as const, error: failure.error, ...(failure.rollback === undefined ? {} : { rollback: failure.rollback }) }
          : entry),
      })))
    }
    if (!(await pathExists(prepared.root))) {
      try { await createWorkspaceRoot(prepared.root) } catch (error) {
        await failPreparation(error)
        return runtime.currentWorkspace(prepared.workspaceId)
      }
    }
    for (const [index, binding] of pendingBindings.entries()) {
      const worktreePlan = prepared.mode === 'managed' ? prepared.worktreePlans[index] : undefined
      const linkPlan = prepared.mode === 'linked' ? prepared.linkPlans[index] : undefined
      if (worktreePlan === undefined && linkPlan === undefined) throw new CatalogError('invalid_catalog', 'preparation is missing a repository step')
      await markStep(binding.sourceId, 'preparing')
      try {
        let path: string
        if (worktreePlan !== undefined) path = (await addWorkspaceWorktree(prepared.root, worktreePlan)).plan.target
        else {
          await addLinkedWorkspaceLink(prepared.root, linkPlan!)
          path = linkPlan!.link
        }
        await markStep(binding.sourceId, 'done', path)
      } catch (error) {
        await failPreparation(error, binding.sourceId)
        return runtime.currentWorkspace(prepared.workspaceId)
      }
    }
    const skillTargets = prepared.mode === 'linked' || prepared.bindings.length > 1 ? prepared.bindings.map(binding => binding.targetPath) : []
    const skillLinks = skillTargets.length === 0 ? [] : await linkWorkspaceSkills(prepared.root, skillTargets)
    return runtime.transaction(draft => {
      const updated = runtime.updateWorkspaceIn(draft, prepared.workspaceId, workspace => ({
        ...workspace,
        ...(skillLinks.length === 0 ? {} : { skillLinks: [...new Set([...(workspace.skillLinks ?? []), ...skillLinks])] }),
        preparation: { ...(workspace.preparation!), status: 'ready' as const, error: undefined },
      }))
      runtime.recordAudit(draft, 'workspace.prepared', 'human', { workspaceId: prepared.workspaceId, detail: prepared.root })
      return updated
    })
  }
