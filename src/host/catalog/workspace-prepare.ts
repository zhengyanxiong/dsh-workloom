/**
 * Workspace preparation from a version Lock.
 *
 * Admission is persisted before any filesystem effect, then each repository is
 * prepared step by step so a failure leaves retryable progress instead of an
 * opaque failed workspace.
 */
import { randomUUID } from 'node:crypto'
import { lstat } from 'node:fs/promises'
import { isAbsolute, join, normalize, resolve } from 'node:path'
import { brandString, type Branded } from '@deepseek-ai/dsh-brand'
import { admitWorkspaceLayout, autoWorkspaceRepositoryPath, WorkspaceLayoutError, type WorkspaceLayout, type WorkspaceMode, type WorkspaceRepositoryBinding } from '../../domain/workspace.ts'
import type { AuditEntry, AuditEvent } from '../../domain/audit.ts'
import type { CatalogSnapshot, WorkspacePreparation, WorkspaceRecord } from '../../api/records.ts'
import {
  addLinkedWorkspaceLink, addWorkspaceWorktree, createWorkspaceRoot, linkWorkspaceSkills, removeWorkspaceWorktree,
  planLinkedWorkspace, planWorkspace,
  type AddedWorkspaceWorktree, type LinkedRepositoryPlan, type WorkspaceRepositoryPlan,
} from '../../git/workspace.ts'
import type { Lock } from '../../domain/task.ts'
import type { PrepareWorkspaceInput } from './contract.ts'
import { CatalogError } from './errors.ts'
import { nowIso, workspaceBindings } from './schema.ts'
import { versionIn, workspaceIn } from './selectors.ts'
import { pathExists, preparationFailure, repositoryRequests } from './workspace-prep.ts'

/**
 * The catalog transaction surface required by workspace preparation.
 */
export interface WorkspacePrepareRuntime {
  snapshot(): CatalogSnapshot
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


/**
 * Materialize the repositories a version Lock gained after a managed workspace
 * was prepared.
 *
 * Workflows create a managed workspace from the Lock of the version they start
 * in. When the project or version later adds a repository and the Lock advances,
 * the existing workspace would otherwise keep a layout that cannot see the new
 * repository, and an Agent would write those files into a sibling checkout. This
 * extends the workspace instead: worktrees are created first, and only a
 * completely successful run records the new bindings, so a failure leaves the
 * workspace exactly as it was.
 * @param runtime - Catalog transaction, preparation and audit surface.
 * @param workspaceId - managed workspace to extend.
 * @param lockId - the version Lock whose repository set is the target coverage.
 * @returns the workspace with the new repository bindings recorded.
 */
export async function extendWorkspace(
  runtime: WorkspacePrepareRuntime,
  workspaceId: WorkspaceRecord['id'],
  lockId: Lock['id'],
): Promise<WorkspaceRecord> {
  const state = runtime.snapshot()
  const workspace = workspaceIn(state, workspaceId)
  if (workspace.cleaned === true) throw new CatalogError('workspace_cleaned')
  const mode = workspace.mode ?? (workspace.managed === true ? 'managed' : 'direct')
  if (mode !== 'managed') throw new CatalogError('workspace_incomplete', 'only a managed workspace can grow a repository worktree')
  const version = versionIn(state, workspace.versionId)
  const project = state.projects.find(item => item.id === version.projectId)
  if (project === undefined) throw new CatalogError('missing_project')
  const lock = state.locks.find(item => item.id === lockId)
  if (lock === undefined) throw new CatalogError('missing_lock')
  if (lock.versionId !== version.id) throw new CatalogError('workspace_mismatch')
  const existing = workspaceBindings(state, workspace)
  const covered = new Set(existing.map(binding => binding.sourceId))
  const missing = project.config.sources.filter(source => lock.repositories.some(repository => repository.sourceId === source.id) && !covered.has(source.id))
  if (missing.length === 0) return workspace
  const root = workspace.rootPath ?? workspace.path
  // A workspace that records a branch extends that branch; a detached workspace
  // stays detached so the extension never invents branch semantics on its own.
  const branch = existing.find(binding => binding.branch !== undefined && binding.branch !== '')?.branch
  const additions: WorkspaceRepositoryBinding[] = missing.map(source => {
    const pinned = lock.repositories.find(repository => repository.sourceId === source.id)!
    const path = autoWorkspaceRepositoryPath(String(pinned.subProjectId ?? 'default'), source)
    return {
      sourceId: source.id,
      ...(pinned.subProjectId === undefined ? {} : { subProjectId: pinned.subProjectId }),
      path,
      targetPath: join(root, path),
      kind: 'worktree' as const,
      ...(branch === undefined ? {} : { branch }),
      commit: pinned.commit,
    }
  })
  const plans = (await planWorkspace(root, repositoryRequests(project, lock, additions), { existingRoot: true })).plans
  const added: AddedWorkspaceWorktree[] = []
  try {
    for (const plan of plans) added.push(await addWorkspaceWorktree(root, plan))
  } catch (error) {
    for (const item of added.reverse()) {
      await removeWorkspaceWorktree(item.plan.repo, item.plan.target, item.createdBranch ? item.plan.branch : undefined)
    }
    const failure = preparationFailure(error)
    throw new CatalogError('workspace_incomplete', failure.error)
  }
  const skillLinks = await linkWorkspaceSkills(root, [...existing, ...additions].map(binding => binding.targetPath))
  return runtime.transaction(draft => {
    const current = workspaceIn(draft, workspaceId)
    const bindings = [...workspaceBindings(draft, current), ...additions]
    const preparation = current.preparation
    const updated = runtime.updateWorkspaceIn(draft, workspaceId, workspace => ({
      ...workspace,
      lockId: lock.id,
      repositories: bindings,
      ...(branch === undefined ? {} : { branches: { ...(workspace.branches ?? {}), ...Object.fromEntries(additions.map(binding => [binding.sourceId, branch])) } }),
      ...(skillLinks.length === 0 ? {} : { skillLinks: [...new Set([...(workspace.skillLinks ?? []), ...skillLinks])] }),
      ...(preparation === undefined ? {} : {
        preparation: {
          ...preparation,
          status: 'ready' as const,
          error: undefined,
          repositories: [...preparation.repositories, ...additions.map(binding => ({ sourceId: binding.sourceId, status: 'done' as const, path: binding.targetPath }))],
        },
      }),
    }))
    runtime.recordAudit(draft, 'workspace.updated', 'human', { workspaceId, detail: `repositories added: ${additions.map(binding => String(binding.sourceId)).join(', ')}` })
    return updated
  })
}
