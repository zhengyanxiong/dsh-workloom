/**
 * Task lifecycle inside the catalog: attempts, Session attachment, transitions
 * and Agent outcome suggestions.
 */
import { randomUUID } from 'node:crypto'
import { brandString, type Branded } from '@deepseek-ai/dsh-brand'
import { resolveHead } from '../../git/workspace.ts'
import type { ExecutionState } from '../../domain/execution.ts'
import type { Lock } from '../../domain/task.ts'
import { attachSession as attachSessionToTask, startAttempt as startTaskAttempt, transitionTask as transitionTaskState, type TaskOutcome } from '../../domain/task.ts'
import { requestExecution } from '../../domain/execution.ts'
import type { AuditEntry, AuditEvent } from '../../domain/audit.ts'
import type { CatalogSnapshot, TaskRecord, TemporarySessionRecord, WorkspaceRecord } from '../../api/records.ts'
import type { TaskConfirmation, TaskSuggestion } from './contract.ts'
import { CatalogError } from './errors.ts'
import { nowIso, projectOf, projectOfWorkspace, workspaceBindings } from './schema.ts'
import { taskIn, workspaceIn } from './selectors.ts'
import { admitEvidence } from './task-evidence.ts'

/**
 * The catalog transaction surface required by task lifecycle operations.
 */
export interface TaskRuntime {
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

export async function startAttempt(runtime: TaskRuntime, taskId: TaskRecord['id'], workspaceId: WorkspaceRecord['id'], options?: { readonly allowBusy?: boolean }): Promise<TaskRecord> {
  return runtime.transaction(async draft => {
    const requestedTask = draft.tasks.find(candidate => candidate.id === taskId)
    if (requestedTask?.workspaceId !== undefined && requestedTask.workspaceId !== workspaceId) throw new CatalogError('workspace_mismatch')
    const task = taskIn(draft, taskId)
    const workspace = workspaceIn(draft, workspaceId)
    if (workspace.cleaned === true) throw new CatalogError('workspace_cleaned')
    if (workspace.preparation !== undefined && workspace.preparation.status !== 'ready') throw new CatalogError('workspace_not_prepared', `preparation is ${workspace.preparation.status}`)
    const taskProject = projectOf(draft, task.versionId)
    const workspaceProject = projectOfWorkspace(draft, workspace)
    if (taskProject === undefined || workspaceProject === undefined || taskProject.id !== workspaceProject.id) throw new CatalogError('workspace_mismatch')
    const otherExecuting = draft.executions.some(execution => execution.workspaceId === workspaceId && execution.owner !== null)
    if (otherExecuting && options?.allowBusy !== true) throw new CatalogError('workspace_task_running')
    const currentLock = draft.locks.find(item => item.id === workspace.lockId)
    if (!currentLock) throw new CatalogError('missing_lock')
    const bindings = workspaceBindings(draft, workspace)
    const baseline = await Promise.all(bindings.map(async binding => {
      const pinned = currentLock.repositories.find(repository => repository.sourceId === binding.sourceId)
      try {
        return { sourceId: binding.sourceId, commit: await resolveHead(binding.targetPath) }
      } catch {
        if (pinned === undefined) throw new CatalogError('workspace_mismatch')
        return { sourceId: binding.sourceId, commit: pinned.commit }
      }
    }))
    const sameAsCurrent = currentLock.versionId === task.versionId
      && currentLock.repositories.length === baseline.length
      && currentLock.repositories.every(repository => baseline.some(candidate => candidate.sourceId === repository.sourceId && candidate.commit === repository.commit))
    const lock: Lock = sameAsCurrent
      ? currentLock
      : { id: brandString<Lock['id']>(randomUUID()), versionId: task.versionId, repositories: baseline, createdAt: nowIso() }
    if (!sameAsCurrent) draft.locks.push(lock)
    const updated = { ...task, ...startTaskAttempt(task, brandString<Branded<'loom.attempt'>>(randomUUID()), lock, { ...workspace, versionId: task.versionId, lockId: lock.id }), updatedAt: nowIso() }
    draft.tasks[draft.tasks.indexOf(task)] = updated
    runtime.recordAudit(draft, 'attempt.started', 'human', { taskId, workspaceId, detail: lock.id })
    return updated
  })
}
export function attachSession(runtime: TaskRuntime, taskId: TaskRecord['id'], sessionId: Branded<'SessionId'>): Promise<TaskRecord> {
  return runtime.transaction(draft => {
    const task = taskIn(draft, taskId)
    const attached = attachSessionToTask(task, sessionId)
    // Re-attaching an already linked Session is a no-op that must not rewrite
    // the record's mutation time.
    const updated = attached === task ? task : { ...task, ...attached, updatedAt: nowIso() }
    draft.tasks[draft.tasks.indexOf(task)] = updated
    draft.temporarySessions = draft.temporarySessions.filter(temporary => temporary.sessionId !== sessionId)
    runtime.recordAudit(draft, 'session.attached', 'human', { taskId, sessionId, workspaceId: updated.attempts.at(-1)?.workspaceId })
    return updated
  })
}
export function registerTemporarySession(runtime: TaskRuntime, sessionId: Branded<'SessionId'>, workspacePath: string): Promise<TemporarySessionRecord> {
  return runtime.transaction(draft => {
    const workspace = draft.workspaces.find(candidate => candidate.cleaned !== true
      && (candidate.path === workspacePath || (candidate.rootPath ?? candidate.path) === workspacePath))
    if (workspace === undefined) throw new CatalogError('missing_workspace')
    const previous = draft.temporarySessions.find(temporary => temporary.sessionId === sessionId)
    const record: TemporarySessionRecord = { sessionId, workspacePath, createdAt: previous?.createdAt ?? Date.now() }
    draft.temporarySessions = [...draft.temporarySessions.filter(temporary => temporary.sessionId !== sessionId), record]
    // A temporary Session gains the same execution rights a task Session gets,
    // so unbound and bound Sessions can never write one workspace at once.
    const execution = runtime.executionIn(draft, workspace.id)
    const next = requestExecution(execution, sessionId)
    if (next !== execution) {
      runtime.storeExecution(draft, next)
      if (next.owner?.sessionId === sessionId) runtime.recordAudit(draft, 'execution.acquired', 'agent', { workspaceId: workspace.id, sessionId })
      else runtime.recordAudit(draft, 'execution.queued', 'agent', { workspaceId: workspace.id, sessionId })
    }
    return record
  })
}
export function forgetTemporarySession(runtime: TaskRuntime, sessionId: Branded<'SessionId'>): Promise<void> {
  return runtime.transaction(draft => {
    draft.temporarySessions = draft.temporarySessions.filter(temporary => temporary.sessionId !== sessionId)
    runtime.releaseSessionInDraft(draft, sessionId)
  })
}
export function transitionTask(runtime: TaskRuntime, taskId: TaskRecord['id'], target: TaskRecord['status'], actor: 'human' | 'agent', confirmation?: TaskConfirmation): Promise<TaskRecord> {
  return runtime.transaction(draft => {
    const task = taskIn(draft, taskId)
    const transitioned = transitionTaskState(task, target, actor)
    const previousOutcome = task.outcome
    let outcome = previousOutcome
    if (actor === 'human' && (target === 'completed' || target === 'failed') && previousOutcome?.state === 'suggested') {
      const basis = confirmation?.basis?.trim()
      if (basis !== undefined && basis.length > 2000) throw new CatalogError('invalid_task', 'confirmation basis is too long')
      const accepted = previousOutcome.suggestedStatus === 'review' ? target === 'completed' : previousOutcome.suggestedStatus === 'failed' && target === 'failed'
      outcome = {
        ...previousOutcome,
        state: accepted ? 'accepted' : 'rejected',
        confirmedAt: nowIso(),
        confirmedBy: actor,
        ...(basis === undefined || basis === '' ? {} : { confirmationBasis: basis }),
      }
      runtime.recordAudit(draft, accepted ? 'task.confirmation-accepted' : 'task.confirmation-rejected', 'human', {
        taskId,
        ...(previousOutcome.attemptId === undefined ? {} : { attemptId: previousOutcome.attemptId }),
        ...(previousOutcome.sessionId === undefined ? {} : { sessionId: previousOutcome.sessionId }),
        ...(basis === undefined || basis === '' ? {} : { basis }),
        detail: `suggested ${previousOutcome.suggestedStatus ?? target} -> ${target}`,
      })
    }
    const updated: TaskRecord = { ...task, ...transitioned, ...(outcome === undefined ? {} : { outcome }), updatedAt: nowIso() }
    draft.tasks[draft.tasks.indexOf(task)] = updated
    runtime.recordAudit(draft, 'task.transitioned', actor, { taskId, detail: `${task.status}->${target}` })
    return updated
  })
}
export function suggestTaskOutcome(runtime: TaskRuntime, taskId: TaskRecord['id'], suggestion: TaskSuggestion): Promise<TaskRecord> {
  return runtime.transaction(draft => {
    const task = taskIn(draft, taskId)
    const current = task.attempts.at(-1)
    if (current === undefined) throw new CatalogError('task_not_active', 'the task has no round to report on')
    if (!current.sessionIds.includes(suggestion.sessionId)) throw new CatalogError('task_not_active', 'the Session is not attached to the current round')
    if (task.status !== 'running' && task.status !== 'review') throw new CatalogError('task_not_active', `the round is ${task.status}; only a running or review round can be reported`)
    const execution = draft.executions.find(item => item.workspaceId === current.workspaceId)
    if (execution !== undefined && execution.owner !== null && execution.owner.sessionId !== suggestion.sessionId) {
      throw new CatalogError('execution_not_owned', `the workspace is owned by Session ${execution.owner.sessionId}`)
    }
    if (execution !== undefined && execution.waiting.includes(suggestion.sessionId)) throw new CatalogError('execution_not_owned', 'the Session is still queued for execution')
    const evidence = admitEvidence(suggestion)
    const basis = suggestion.basis?.trim()
    if (basis !== undefined && basis.length > 2000) throw new CatalogError('invalid_task', 'suggestion basis is too long')
    const outcome: TaskOutcome = {
      state: 'suggested',
      suggestedStatus: suggestion.suggestedStatus,
      ...evidence,
      suggestedBy: 'agent',
      at: nowIso(),
      sessionId: suggestion.sessionId,
      attemptId: current.id,
      ...(basis === undefined || basis === '' ? {} : { basis }),
    }
    const transitioned = suggestion.suggestedStatus === 'review' && task.status === 'running' ? transitionTaskState(task, 'review', 'agent') : task
    const updated: TaskRecord = { ...task, ...transitioned, outcome, updatedAt: nowIso() }
    draft.tasks[draft.tasks.indexOf(task)] = updated
    runtime.recordAudit(draft, suggestion.suggestedStatus === 'review' ? 'task.review-requested' : 'task.failure-suggested', 'agent', {
      taskId,
      attemptId: current.id,
      workspaceId: current.workspaceId,
      sessionId: suggestion.sessionId,
      ...(basis === undefined || basis === '' ? {} : { basis }),
      detail: suggestion.suggestedStatus === 'review' ? `review requested from ${task.status}` : 'failure suggested',
    })
    return updated
  })
}
