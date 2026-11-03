/**
 * Workspace cleanup and destructive delete lifecycle.
 *
 * Cleanup records per-repository progress before deleting anything so a
 * partial attempt stays retryable. The runtime owns transactions and audit;
 * this module owns the filesystem ordering.
 */
import { resolve } from 'node:path'
import type { Branded } from '@deepseek-ai/dsh-brand'
import type { AuditEntry, AuditEvent } from '../../domain/audit.ts'
import type { CatalogSnapshot, WorkspaceCleanupRepository, WorkspaceCleanupRepositoryStatus, WorkspaceRecord } from '../../api/records.ts'
import {
  commitsSince, removeLinkedWorkspaceLink, removeLinkedWorkspaceRoot, removeWorkspaceRoot, removeWorkspaceSkills,
  removeWorkspaceWorktree, workingTreeChanges,
} from '../../git/workspace.ts'
import { CatalogError } from './errors.ts'
import { nowIso, workspaceBindings } from './schema.ts'
import { workspaceIn } from './selectors.ts'
import { workspaceWorktrees } from './workspace-git.ts'
import { pathExists } from './workspace-prep.ts'

/**
 * The catalog transaction surface required by workspace destruction.
 */
export interface WorkspaceLifecycleRuntime {
  snapshot(): CatalogSnapshot
  transaction<T>(operation: (draft: CatalogSnapshot) => Promise<T> | T): Promise<T>
  updateWorkspaceIn(
    draft: CatalogSnapshot,
    workspaceId: WorkspaceRecord['id'],
    mutate: (workspace: WorkspaceRecord) => WorkspaceRecord,
  ): WorkspaceRecord
  patchCleanup(
    draft: CatalogSnapshot,
    workspaceId: WorkspaceRecord['id'],
    patch: (cleanup: NonNullable<WorkspaceRecord['cleanup']>, workspace: WorkspaceRecord) => NonNullable<WorkspaceRecord['cleanup']>,
  ): WorkspaceRecord
  recordAudit(
    draft: CatalogSnapshot,
    event: AuditEvent,
    actor: AuditEntry['actor'],
    fields?: Omit<AuditEntry, 'id' | 'at' | 'event' | 'actor'>,
  ): void
}

export async function deleteWorkspace(runtime: WorkspaceLifecycleRuntime, workspaceId: WorkspaceRecord['id'], deleteFiles: boolean, confirmPath?: string): Promise<void> {
  const state = runtime.snapshot()
  const workspace = workspaceIn(state, workspaceId)
    const root = workspace.rootPath ?? workspace.path
    const execution = state.executions.find(item => item.workspaceId === workspaceId)
    if (execution !== undefined && execution.owner !== null) throw new CatalogError('workspace_busy', execution.owner.sessionId)
    if (state.tasks.some(task => task.attempts.some(attempt => attempt.workspaceId === workspaceId))) throw new CatalogError('workspace_in_use', root)
    if (!deleteFiles) return cleanupWorkspace(runtime, workspaceId, true)
    if (confirmPath !== root) throw new CatalogError('invalid_workspace_path', 'confirmPath must equal the workspace root')
    const mode = workspace.mode ?? (workspace.managed === true ? 'managed' : 'direct')
    if (mode !== 'direct') {
      await cleanupWorkspace(runtime, workspaceId, true)
      // Cleanup can leave a partial root when git refuses one worktree. The
      // explicit delete action promised the directory is gone, so force the
      // Loom-owned root and then drop any partial cleanup record.
      if (await pathExists(root)) {
        const residual = await removeWorkspaceRoot(root)
        if (residual.length > 0) throw new CatalogError('workspace_cleanup_failed', residual.join('; '))
        await runtime.transaction(draft => {
          const index = draft.workspaces.findIndex(item => item.id === workspaceId)
          if (index === -1) return
          draft.workspaces.splice(index, 1)
          draft.temporarySessions = draft.temporarySessions.filter(temporary => temporary.workspacePath !== root && temporary.workspacePath !== workspace.path)
          draft.executions = draft.executions.filter(item => item.workspaceId !== workspaceId)
          runtime.recordAudit(draft, 'workspace.cleaned', 'human', { workspaceId, detail: root })
        })
      }
      return
    }
    const residual = await removeWorkspaceRoot(root)
    if (residual.length > 0) throw new CatalogError('workspace_cleanup_failed', residual.join('; '))
    await runtime.transaction(draft => {
      const index = draft.workspaces.findIndex(item => item.id === workspaceId)
      if (index === -1) throw new CatalogError('missing_workspace')
      draft.workspaces.splice(index, 1)
      draft.temporarySessions = draft.temporarySessions.filter(temporary => temporary.workspacePath !== root && temporary.workspacePath !== workspace.path)
      draft.executions = draft.executions.filter(item => item.workspaceId !== workspaceId)
      runtime.recordAudit(draft, 'workspace.cleaned', 'human', { workspaceId, detail: root })
    })
  }
export async function cleanupWorkspace(runtime: WorkspaceLifecycleRuntime, workspaceId: WorkspaceRecord['id'], discardChanges: boolean): Promise<void> {
  const state = runtime.snapshot()
  const workspace = workspaceIn(state, workspaceId)
    if (workspace.cleaned === true) throw new CatalogError('workspace_cleaned')
    const mode = workspace.mode ?? (workspace.managed === true ? 'managed' : 'direct')
    const root = workspace.rootPath ?? workspace.path
    // Ownership outranks task status: a live Session has to hand the workspace
    // back before cleanup destroys its evidence.
    const execution = state.executions.find(item => item.workspaceId === workspaceId)
    if (execution !== undefined && execution.owner !== null) {
      throw new CatalogError('workspace_busy', `Session ${execution.owner.sessionId} still owns execution (generation ${execution.owner.generation}); release it or complete a takeover first`)
    }
    // A running or under-review round still needs the workspace diff; failed
    // and completed rounds keep their records and may release the files.
    const occupying = state.tasks.filter(task => (task.status === 'running' || task.status === 'review')
      && task.attempts.some(attempt => attempt.workspaceId === workspaceId))
    if (occupying.length > 0) {
      throw new CatalogError('workspace_task_running', `task ${occupying.map(task => `${task.id} (${task.status})`).join(', ')} still occupies this workspace; finish or fail the round first`)
    }
    const bindings = workspaceBindings(state, workspace)
    // Only managed cleanup deletes versioned worktrees. Direct and linked
    // workspaces keep the real repositories, so uncommitted work must not
    // block unregistering them; those checks also fail for legacy records
    // whose target points at a parent directory rather than a Git root.
    const worktrees = mode === 'managed' ? workspaceWorktrees(state, workspaceId) : []
    const prior = workspace.cleanup
    const priorStatus = (sourceId: Branded<'loom.source'>): WorkspaceCleanupRepositoryStatus | undefined =>
      prior?.repositories.find(entry => entry.sourceId === sourceId)?.status
    const units: { sourceId: Branded<'loom.source'>; kind: 'worktree' | 'link'; repo: string; directory: string; branch?: string | undefined }[] = mode === 'managed'
      ? worktrees.map(worktree => ({ sourceId: worktree.sourceId, kind: 'worktree' as const, repo: worktree.repo, directory: worktree.directory, ...(worktree.branch === undefined ? {} : { branch: worktree.branch }) }))
      : mode === 'linked'
        ? bindings.map(binding => ({ sourceId: binding.sourceId, kind: 'link' as const, repo: '', directory: resolve(root, binding.path) }))
        : []
    const pendingWorktrees = worktrees.filter(worktree => priorStatus(worktree.sourceId) !== 'removed')
    if (!discardChanges && mode === 'managed') {
      for (const worktree of pendingWorktrees) if (await commitsSince(worktree.directory, worktree.commit) > 0) throw new CatalogError('workspace_unpushed', worktree.directory)
      const changes = await workingTreeChanges(pendingWorktrees)
      if (changes.some(repository => repository.files.length > 0)) throw new CatalogError('workspace_changes', changes.filter(repository => repository.files.length > 0).map(repository => repository.directory).join(', '))
    }
    // Publish per-repository progress before the first deletion so the client
    // can poll a partial attempt instead of a single opaque busy state.
    await runtime.transaction(draft => {
      const entries: WorkspaceCleanupRepository[] = mode === 'direct'
        ? bindings.map(binding => ({ sourceId: binding.sourceId, status: 'kept' as const, path: binding.targetPath }))
        : units.map(unit => priorStatus(unit.sourceId) === 'removed'
          ? { sourceId: unit.sourceId, status: 'removed' as const, path: unit.directory }
          : { sourceId: unit.sourceId, status: 'waiting' as const, path: unit.directory })
      runtime.updateWorkspaceIn(draft, workspaceId, workspace => ({
        ...workspace,
        cleanup: { status: 'cleaning', startedAt: prior?.startedAt ?? nowIso(), updatedAt: nowIso(), repositories: entries },
      }))
    })
    /**
     * Record one repository step without invalidating its siblings.
     */
    const markRepository = async (unit: typeof units[number], status: 'removed' | 'failed', diagnostic?: { error?: string | undefined; residual?: string | undefined }): Promise<void> => {
      await runtime.transaction(draft => runtime.patchCleanup(draft, workspaceId, cleanup => ({
        ...cleanup,
        repositories: cleanup.repositories.map(entry => entry.sourceId === unit.sourceId
          ? {
            sourceId: entry.sourceId,
            status,
            path: unit.directory,
            ...(diagnostic?.error === undefined ? {} : { error: diagnostic.error }),
            ...(diagnostic?.residual === undefined ? {} : { residual: diagnostic.residual }),
          }
          : entry),
      })))
    }
    const residual: string[] = []
    for (const unit of units) {
      if (priorStatus(unit.sourceId) === 'removed') continue
      let errors: string[] = []
      if (await pathExists(unit.directory)) {
        errors = unit.kind === 'link'
          ? await removeLinkedWorkspaceLink(unit.directory)
          : await removeWorkspaceWorktree(unit.repo, unit.directory, unit.branch)
      }
      if (errors.length === 0) await markRepository(unit, 'removed')
      else {
        const error = errors.join('; ').slice(0, 1000)
        residual.push(unit.directory)
        await markRepository(unit, 'failed', { error, residual: unit.directory })
      }
    }
    // Direct workspaces keep their repositories but must still remove the skill
    // links they added; a leftover link keeps the workspace retryable.
    let rootErrors: string[] = []
    if (mode === 'direct') {
      rootErrors = workspace.skillLinks === undefined ? [] : await removeWorkspaceSkills(workspace.skillLinks)
    } else if (residual.length === 0) {
      // The Loom-owned root is only destroyed once every repository step
      // succeeded, so a partial attempt keeps the evidence for a retry.
      rootErrors = mode === 'linked' ? await removeLinkedWorkspaceRoot(root) : await removeWorkspaceRoot(root)
    }
    const references = state.tasks.some(task => task.attempts.some(attempt => attempt.workspaceId === workspaceId))
    if (residual.length > 0 || rootErrors.length > 0) {
      await runtime.transaction(draft => runtime.patchCleanup(draft, workspaceId, cleanup => ({
        ...cleanup,
        status: 'partial',
        error: [...residual.map(path => `${path}: still present`), ...rootErrors].join('; ').slice(0, 1000),
        residual: [...residual, ...rootErrors].slice(0, 50),
        repositories: cleanup.repositories.map(entry => entry.status === 'waiting' || entry.status === 'failed'
          ? { sourceId: entry.sourceId, status: 'failed' as const, path: entry.path, error: 'cleanup incomplete', residual: entry.path }
          : entry),
      })))
      return
    }
    await runtime.transaction(draft => {
      const index = draft.workspaces.findIndex(item => item.id === workspaceId)
      if (index === -1) throw new CatalogError('missing_workspace')
      if (references) {
        draft.workspaces[index] = {
          ...draft.workspaces[index]!,
          cleaned: true,
          cleanup: {
            status: 'cleaned',
            startedAt: prior?.startedAt ?? nowIso(),
            updatedAt: nowIso(),
            repositories: draft.workspaces[index]!.cleanup?.repositories ?? [],
          },
        }
      } else {
        draft.workspaces.splice(index, 1)
      }
      draft.temporarySessions = draft.temporarySessions.filter(temporary => temporary.workspacePath !== root && temporary.workspacePath !== workspace.path)
      draft.executions = draft.executions.filter(item => item.workspaceId !== workspaceId)
      runtime.recordAudit(draft, 'workspace.cleaned', 'human', { workspaceId, detail: root })
    })
  }
