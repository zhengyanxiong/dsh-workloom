/** Pure ownership transitions; the Host must serialize and persist them before dispatching execution. */
import { brandNumber, type Branded, type BrandedNumber } from '@deepseek-ai/dsh-brand'

/** Ownership token fences delayed callbacks, including when the same Session acquires again. */
export interface ExecutionOwner {
  readonly workspaceId: Branded<'loom.workspace'>
  readonly sessionId: Branded<'SessionId'>
  readonly generation: BrandedNumber<'loom.execution-generation'>
}

/** Stop evidence comes from trusted runtime observation, never directly from model arguments. */
export type StopOutcome = 'stopped' | 'unknown' | 'failed'

/** A pending takeover keeps the original owner until stopping all its work is confirmed. */
export interface Takeover {
  readonly sessionId: ExecutionOwner['sessionId']
  readonly stopStatus: 'requested' | 'unknown' | 'failed'
}

/** Durable scheduling state for one workspace; generation survives periods with no owner. */
export interface ExecutionState {
  readonly workspaceId: ExecutionOwner['workspaceId']
  readonly generation: ExecutionOwner['generation']
  readonly owner: ExecutionOwner | null
  readonly waiting: readonly ExecutionOwner['sessionId'][]
  readonly takeover: Takeover | null
}

/** Caller-localized rejection codes; failed transitions have no side effects. */
export type ExecutionErrorCode = 'stale_owner' | 'takeover_pending' | 'already_owner' | 'no_takeover' | 'generation_exhausted' | 'invalid_waiting_order'

/** Human-readable explanation for each execution ownership failure. */
const EXECUTION_ERROR_DESCRIPTION: Readonly<Record<ExecutionErrorCode, string>> = {
  stale_owner: 'the execution owner token is stale or no longer matches the workspace',
  takeover_pending: 'a takeover is already pending for this workspace',
  already_owner: 'the session already owns this workspace execution',
  no_takeover: 'there is no pending takeover to confirm',
  generation_exhausted: 'the execution generation counter is exhausted',
  invalid_waiting_order: 'the waiting order does not match the current queue',
}

/** Rejected ownership transition. */
export class ExecutionError extends Error {
  constructor(readonly code: ExecutionErrorCode) {
    super(`${code}: ${EXECUTION_ERROR_DESCRIPTION[code]}`)
    this.name = 'ExecutionError'
  }
}

/** Create an unoccupied scheduling record, not a runtime lock.
 * @param workspaceId - Stable workspace identity.
 * @returns a record with no owner or waiting Sessions.
 */
export function createExecution(workspaceId: ExecutionState['workspaceId']): ExecutionState {
  return { workspaceId, generation: brandNumber<ExecutionOwner['generation']>(0), owner: null, waiting: [], takeover: null }
}

function grant(state: ExecutionState, sessionId: ExecutionOwner['sessionId'], waiting: ExecutionState['waiting']): ExecutionState {
  if (state.generation >= Number.MAX_SAFE_INTEGER) throw new ExecutionError('generation_exhausted')
  const generation = brandNumber<ExecutionOwner['generation']>(state.generation + 1)
  return { ...state, generation, owner: { workspaceId: state.workspaceId, sessionId, generation }, waiting, takeover: null }
}

function requireOwner(state: ExecutionState, expected: ExecutionOwner): void {
  if (!state.owner || expected.workspaceId !== state.workspaceId
    || expected.sessionId !== state.owner.sessionId || expected.generation !== state.owner.generation) {
    throw new ExecutionError('stale_owner')
  }
}

/** Acquire an idle workspace or enqueue once, preserving FIFO order.
 * @param state - Latest persisted scheduling state.
 * @param sessionId - Requesting Session.
 * @returns a new snapshot, or the input if already owned or queued by this Session.
 */
export function requestExecution(state: ExecutionState, sessionId: ExecutionOwner['sessionId']): ExecutionState {
  if (!state.owner) return grant(state, sessionId, state.waiting)
  if (state.owner.sessionId === sessionId || state.waiting.includes(sessionId)) return state
  return { ...state, waiting: [...state.waiting, sessionId] }
}

/** Record a user-approved takeover request without transferring execution rights.
 * @param state - Latest scheduling state.
 * @param sessionId - Session that will take ownership after confirmed stopping.
 * @param expected - Owner token observed when takeover was requested.
 * @returns a stopping snapshot; the Host must stop this exact owner and its child work.
 */
export function requestTakeover(state: ExecutionState, sessionId: ExecutionOwner['sessionId'], expected: ExecutionOwner): ExecutionState {
  requireOwner(state, expected)
  if (sessionId === expected.sessionId) throw new ExecutionError('already_owner')
  if (state.takeover) {
    if (state.takeover.sessionId === sessionId) return state
    throw new ExecutionError('takeover_pending')
  }
  const queued = requestExecution(state, sessionId)
  return { ...queued, takeover: { sessionId, stopStatus: 'requested' } }
}

/** Apply trusted stop evidence for the original ownership generation.
 * @param state - Latest scheduling state with a pending takeover.
 * @param expected - Token supplied to the stop operation, including its generation.
 * @param outcome - Whether the owner and all its work are confirmed stopped.
 * @returns a new owner only for stopped; unknown and failed keep the original owner blocked.
 */
export function confirmStop(state: ExecutionState, expected: ExecutionOwner, outcome: StopOutcome): ExecutionState {
  requireOwner(state, expected)
  if (!state.takeover) throw new ExecutionError('no_takeover')
  if (outcome !== 'stopped') return { ...state, takeover: { ...state.takeover, stopStatus: outcome } }
  const sessionId = state.takeover.sessionId
  return grant(state, sessionId, state.waiting.filter(waiter => waiter !== sessionId))
}

/** Replace the waiting order exactly; unknown or missing Sessions are rejected. */
export function reorderWaiting(state: ExecutionState, sessionIds: readonly ExecutionOwner['sessionId'][]): ExecutionState {
  const unique = new Set(sessionIds)
  if (unique.size !== sessionIds.length
    || unique.size !== state.waiting.length
    || state.waiting.some(id => !unique.has(id))) {
    throw new ExecutionError('invalid_waiting_order')
  }
  return { ...state, waiting: [...sessionIds] }
}

/** Remove one Session from the waiting queue without touching the current owner. */
export function cancelExecutionRequest(state: ExecutionState, sessionId: ExecutionOwner['sessionId']): ExecutionState {
  if (!state.waiting.includes(sessionId)) return state
  return {
    ...state,
    waiting: state.waiting.filter(waiter => waiter !== sessionId),
    takeover: state.takeover?.sessionId === sessionId ? null : state.takeover,
  }
}

/** Release a confirmed-finished owner and promote the FIFO head, if present.
 * @param state - Latest scheduling state.
 * @param expected - Exact owner token whose execution has finished.
 * @returns an idle snapshot or the next owner; pending takeovers require confirmStop instead.
 */
export function releaseExecution(state: ExecutionState, expected: ExecutionOwner): ExecutionState {
  requireOwner(state, expected)
  if (state.takeover) throw new ExecutionError('takeover_pending')
  const [next, ...waiting] = state.waiting
  if (next !== undefined) return grant(state, next, waiting)
  return { ...state, owner: null }
}
