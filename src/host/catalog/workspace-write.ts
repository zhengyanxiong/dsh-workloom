/**
 * Workspace metadata and branch reconciliation.
 *
 * All persistence goes through the narrow runtime supplied by the catalog;
 * these functions never own the file or the transaction queue.
 */
import type { CatalogSnapshot, WorkspaceRecord } from '../../api/records.ts'
import type { AuditEntry, AuditEvent } from '../../domain/audit.ts'
import { WorkspacePreparationError, ensureWorktreeBranch, linkWorkspaceSkills } from '../../git/workspace.ts'
import { CatalogError } from './errors.ts'
import { workspaceBindings } from './schema.ts'
import { workspaceIn } from './selectors.ts'

/**
 * The catalog transaction surface required by workspace metadata writes.
 */
export interface WorkspaceWriteRuntime {
  snapshot(): CatalogSnapshot
  transaction<T>(operation: (draft: CatalogSnapshot) => Promise<T> | T): Promise<T>
  recordAudit(
    draft: CatalogSnapshot,
    event: AuditEvent,
    actor: AuditEntry['actor'],
    fields?: Omit<AuditEntry, 'id' | 'at' | 'event' | 'actor'>,
  ): void
}

/**
 * Attach requested branches to managed worktrees when they are missing.
 * @param runtime - Catalog transaction runtime.
 * @param workspaceId - Workspace identity.
 * @returns the updated or unchanged workspace.
 */
export async function ensureWorkspaceBranches(runtime: WorkspaceWriteRuntime, workspaceId: WorkspaceRecord['id']): Promise<WorkspaceRecord> {
  const state = runtime.snapshot()
  const workspace = workspaceIn(state, workspaceId)
  if (workspace.cleaned === true) return workspace
  if ((workspace.mode ?? (workspace.managed === true ? 'managed' : 'direct')) !== 'managed') return workspace
  if (state.executions.some(execution => execution.workspaceId === workspaceId && execution.owner !== null)) return workspace
  const bindings = workspaceBindings(state, workspace)
  const branches = { ...workspace.branches }
  let changed = false
  for (const binding of bindings) {
    const requested = binding.branch ?? branches[binding.sourceId]
    if (requested === undefined) continue
    let attached: string
    try {
      attached = await ensureWorktreeBranch(binding.targetPath, requested)
    } catch (error) {
      if (!(error instanceof WorkspacePreparationError)) throw error
      throw new CatalogError('workspace_branch_failed')
    }
    if (attached !== requested) { branches[binding.sourceId] = attached; changed = true }
  }
  if (!changed) return workspace
  return runtime.transaction(draft => {
    const index = draft.workspaces.findIndex(item => item.id === workspaceId)
    if (index === -1) throw new CatalogError('missing_workspace')
    draft.workspaces[index] = { ...draft.workspaces[index]!, branches }
    return draft.workspaces[index]!
  })
}

/**
 * Add the skill links required by a multi-repository workspace.
 * @param runtime - Catalog transaction runtime.
 * @param workspaceId - Workspace identity.
 * @returns the updated or unchanged workspace.
 */
export async function ensureWorkspaceSkillLinks(runtime: WorkspaceWriteRuntime, workspaceId: WorkspaceRecord['id']): Promise<WorkspaceRecord> {
  const state = runtime.snapshot()
  const workspace = workspaceIn(state, workspaceId)
  if (workspace.cleaned === true) return workspace
  const bindings = workspaceBindings(state, workspace)
  if (bindings.length < 2) return workspace
  const existing = workspace.skillLinks ?? []
  const links = await linkWorkspaceSkills(workspace.rootPath ?? workspace.path, bindings.map(binding => binding.targetPath))
  const merged = [...new Set([...existing, ...links])]
  if (merged.length === existing.length) return workspace
  return runtime.transaction(draft => {
    const index = draft.workspaces.findIndex(item => item.id === workspaceId)
    if (index === -1) throw new CatalogError('missing_workspace')
    draft.workspaces[index] = { ...draft.workspaces[index]!, skillLinks: merged }
    return draft.workspaces[index]!
  })
}

/**
 * Replace a workspace display label and record the audit entry.
 * @param runtime - Catalog transaction runtime.
 * @param workspaceId - Workspace identity.
 * @param label - New label; empty clears it.
 * @returns the updated workspace.
 */
export async function updateWorkspace(runtime: WorkspaceWriteRuntime, workspaceId: WorkspaceRecord['id'], label: string): Promise<WorkspaceRecord> {
  const admitted = label.trim()
  if (admitted.length > 80) throw new CatalogError('invalid_workspace_label')
  return runtime.transaction(draft => {
    const workspace = workspaceIn(draft, workspaceId)
    const { label: _previous, ...rest } = workspace
    const next: WorkspaceRecord = { ...rest, ...(admitted === '' ? {} : { label: admitted }) }
    draft.workspaces[draft.workspaces.indexOf(workspace)] = next
    runtime.recordAudit(draft, 'workspace.updated', 'human', { workspaceId, detail: admitted === '' ? workspace.path : admitted })
    return next
  })
}
