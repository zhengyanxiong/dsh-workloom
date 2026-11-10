/**
 * Derived rows for the task Session dock and runtime panel.
 *
 * Joins the Host catalog's bound Sessions with native Session summaries and
 * execution ownership so the shell can render rows, archive guards and
 * subagent descriptors without repeating the projections inline.
 */
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { CatalogSnapshot, TaskRecord } from 'dsh-workloom/types'
import { boundSessions, type ActiveSession } from '../shared/projection.ts'
import { executionForSession } from './useLoomSessionExecution.ts'
import type { LoomTaskSessionRow } from '../features/session/LoomSessionGraph.tsx'
import type { LoomSessionExecutionState } from '../features/session/LoomSessionGraph.tsx'
import type { LoomSubagentRow } from '../features/session/LoomSessionActivity.tsx'

/** Native Session summary fields used by the dock. */
export interface SessionSummaryLike {
  readonly parentId?: unknown
  readonly displayTitle?: string | undefined
  readonly running?: boolean
  readonly updatedAt?: number
}

/** Native projection fields used for the runtime subagent list. */
export interface SessionProjectionLike {
  readonly values?: {
    readonly subagentCatalog?: readonly {
      readonly id: string
      readonly label?: string | undefined
      readonly mode: string
    }[]
  }
}

/** Inputs for {@link useLoomTaskSessions}. */
export interface LoomTaskSessionsInput {
  readonly snapshot: CatalogSnapshot | undefined
  readonly task: TaskRecord | undefined
  readonly selected: SessionId | undefined
  readonly archivedSessionIds: ReadonlySet<SessionId>
  readonly sessionById: Readonly<Record<string, SessionSummaryLike | undefined>>
  readonly projections: Readonly<Record<string, SessionProjectionLike | undefined>>
}

/** Derived Session rows, states and runtime descriptors. */
export interface LoomTaskSessions {
  readonly taskSessions: readonly ActiveSession[]
  readonly activeSessionRows: readonly LoomTaskSessionRow[]
  readonly sessionStates: Readonly<Record<string, LoomSessionExecutionState>>
  readonly archiveBlockedIds: ReadonlySet<string>
  readonly liveSnapshot: boolean
  readonly runtimeSessionId: SessionId | undefined
  readonly subagentRows: readonly LoomSubagentRow[]
}

/**
 * Derive the task Session dock and runtime rows.
 *
 * @param input - catalog, task, selection and native Session state.
 * @returns rows, ownership states and runtime descriptors.
 */
export function useLoomTaskSessions(input: LoomTaskSessionsInput): LoomTaskSessions {
  const { snapshot, task, selected, archivedSessionIds, sessionById, projections } = input
  const taskSessions = snapshot === undefined || task === undefined ? [] : boundSessions(snapshot).filter(row => row.task.id === task.id)
  const activeSessionRows: readonly LoomTaskSessionRow[] = taskSessions.map(row => {
    const summary = sessionById[row.sessionId]
    return {
      id: row.sessionId,
      ...(summary?.parentId === undefined ? {} : { parentId: String(summary.parentId) }),
      label: summary?.displayTitle ?? row.task.title,
      running: summary?.running === true,
      updatedAt: summary?.updatedAt ?? 0,
      archived: archivedSessionIds.has(row.sessionId as SessionId),
    }
  })
  const sessionStates = Object.fromEntries(taskSessions.map(row => {
    const execution = executionForSession(task, snapshot, row.sessionId)
    const owner = execution?.owner
    const queueIndex = execution?.waiting.indexOf(row.sessionId as SessionId) ?? -1
    return [row.sessionId, {
      isOwner: owner?.sessionId === row.sessionId,
      waiting: queueIndex >= 0,
      queueIndex,
      hasOwner: owner !== null && owner !== undefined,
    }]
  }))
  const archiveBlockedIds = new Set(Object.entries(sessionStates).filter(([, state]) => state.isOwner || state.waiting).map(([id]) => id))
  const liveSnapshot = activeSessionRows.some(row => row.running)
  const runtimeSessionId = (selected ?? taskSessions.at(-1)?.sessionId) as SessionId | undefined
  const runtimeCatalog = runtimeSessionId === undefined ? [] : projections[runtimeSessionId]?.values?.subagentCatalog ?? []
  const subagentRows: readonly LoomSubagentRow[] = runtimeCatalog.map(entry => ({
    id: entry.id,
    label: entry.label ?? entry.id,
    mode: entry.mode,
    running: sessionById[entry.id]?.running === true,
  }))
  return { taskSessions, activeSessionRows, sessionStates, archiveBlockedIds, liveSnapshot, runtimeSessionId, subagentRows }
}
