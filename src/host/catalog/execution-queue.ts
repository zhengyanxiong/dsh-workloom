/**
 * Execution ownership queue: acquire, release, cancel, reorder and takeover.
 *
 * State transitions stay in the domain; this module owns the catalog
 * transaction boundary and audit records for those transitions.
 */
import type { Branded } from '@deepseek-ai/dsh-brand'
import type { CatalogSnapshot, WorkspaceRecord } from '../../api/records.ts'
import type { AuditEntry, AuditEvent } from '../../domain/audit.ts'
import {
  cancelExecutionRequest, confirmStop, reorderWaiting, releaseExecution as releaseExecutionState, requestExecution,
  requestTakeover, type ExecutionOwner, type ExecutionState, type StopOutcome,
} from '../../domain/execution.ts'
import { CatalogError } from './errors.ts'

/**
 * The catalog transaction surface required by execution ownership.
 */
export interface ExecutionRuntime {
  snapshot(): CatalogSnapshot
  transaction<T>(operation: (draft: CatalogSnapshot) => Promise<T> | T): Promise<T>
  executionIn(draft: CatalogSnapshot, workspaceId: WorkspaceRecord['id']): ExecutionState
  storeExecution(draft: CatalogSnapshot, execution: ExecutionState): void
  releaseSessionInDraft(draft: CatalogSnapshot, sessionId: Branded<'SessionId'>): void
  recordAudit(
    draft: CatalogSnapshot,
    event: AuditEvent,
    actor: AuditEntry['actor'],
    fields?: Omit<AuditEntry, 'id' | 'at' | 'event' | 'actor'>,
  ): void
}

export function acquireExecution(runtime: ExecutionRuntime, workspaceId: WorkspaceRecord['id'], sessionId: Branded<'SessionId'>): Promise<ExecutionState> {
  const existing = runtime.snapshot().executions.find(execution => execution.workspaceId === workspaceId)
  if (existing !== undefined && (existing.owner?.sessionId === sessionId || existing.waiting.includes(sessionId))) {
    return Promise.resolve(structuredClone(existing))
  }
  return runtime.transaction(draft => {
    const previous = runtime.executionIn(draft, workspaceId)
    const next = requestExecution(previous, sessionId)
    runtime.storeExecution(draft, next)
    if (next.owner?.sessionId === sessionId) runtime.recordAudit(draft, 'execution.acquired', 'agent', { workspaceId, sessionId })
    else runtime.recordAudit(draft, 'execution.queued', 'agent', { workspaceId, sessionId })
    return next
  })
  }
export function releaseExecution(runtime: ExecutionRuntime, workspaceId: WorkspaceRecord['id'], expected: ExecutionOwner): Promise<ExecutionState> {
  return runtime.transaction(draft => {
  const next = releaseExecutionState(runtime.executionIn(draft, workspaceId), expected)
  runtime.storeExecution(draft, next)
  runtime.recordAudit(draft, 'execution.released', 'agent', { workspaceId, sessionId: expected.sessionId, detail: next.owner?.sessionId })
  return next
  })
}

export function cancelExecution(runtime: ExecutionRuntime, workspaceId: WorkspaceRecord['id'], sessionId: Branded<'SessionId'>): Promise<ExecutionState> {
  return runtime.transaction(draft => {
  const previous = runtime.executionIn(draft, workspaceId)
  const next = cancelExecutionRequest(previous, sessionId)
  if (next !== previous) {
    runtime.storeExecution(draft, next)
    runtime.recordAudit(draft, 'execution.released', 'human', { workspaceId, sessionId, detail: 'left waiting queue' })
  }
  return next
  })
}

export function reorderExecutionQueue(runtime: ExecutionRuntime, workspaceId: WorkspaceRecord['id'], sessionIds: readonly Branded<'SessionId'>[]): Promise<ExecutionState> {
  return runtime.transaction(draft => {
  const previous = runtime.executionIn(draft, workspaceId)
  const next = reorderWaiting(previous, sessionIds)
  runtime.storeExecution(draft, next)
  runtime.recordAudit(draft, 'execution.released', 'human', { workspaceId, detail: `reordered waiting queue: ${sessionIds.join(', ')}` })
  return next
  })
}

export function beginTakeover(runtime: ExecutionRuntime, workspaceId: WorkspaceRecord['id'], sessionId: Branded<'SessionId'>): Promise<{ state: ExecutionState; owner: ExecutionOwner }> {
  return runtime.transaction(draft => {
  const previous = runtime.executionIn(draft, workspaceId)
  if (!previous.owner) throw new CatalogError('workspace_busy')
  const owner = previous.owner
  const next = requestTakeover(previous, sessionId, owner)
  runtime.storeExecution(draft, next)
  runtime.recordAudit(draft, 'execution.takeover-requested', 'human', { workspaceId, sessionId, detail: owner.sessionId })
  return { state: next, owner }
  })
}

export function finishTakeover(runtime: ExecutionRuntime, workspaceId: WorkspaceRecord['id'], expected: ExecutionOwner, outcome: StopOutcome): Promise<ExecutionState> {
  return runtime.transaction(draft => {
  const next = confirmStop(runtime.executionIn(draft, workspaceId), expected, outcome)
  runtime.storeExecution(draft, next)
  runtime.recordAudit(draft, outcome === 'stopped' ? 'execution.takeover-stopped' : 'execution.takeover-blocked', 'system', { workspaceId, sessionId: next.owner?.sessionId, detail: outcome })
  return next
  })
}

export function releaseSession(runtime: ExecutionRuntime, sessionId: Branded<'SessionId'>): Promise<void> {
  const ownsExecution = runtime.snapshot().executions.some(execution => execution.owner?.sessionId === sessionId || execution.waiting.includes(sessionId))
  // A disposed Session also drops any temporary-work registration it still holds.
  const registeredTemporary = runtime.snapshot().temporarySessions.some(record => record.sessionId === sessionId)
  if (!ownsExecution && !registeredTemporary) return Promise.resolve()
  return runtime.transaction(draft => {
    draft.temporarySessions = draft.temporarySessions.filter(record => record.sessionId !== sessionId)
    runtime.releaseSessionInDraft(draft, sessionId)
  })
  }
