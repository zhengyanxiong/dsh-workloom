/**
 * Session-scoped execution ownership actions for the bottom Session dock.
 *
 * These actions release, queue and de-queue execution for an attached native
 * Session. The Host remains the source of truth; the hook only selects the
 * workspace behind a Session and refreshes the catalog afterwards.
 */
import { useState } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { CatalogSnapshot, TaskRecord } from 'dsh-workloom/types'
import type { LoomHostPort } from '../../ports/loom-host.ts'
import type { LoomKey } from '../shared/locales.ts'
import { reportLoomFailure } from '../shared/feedback.ts'

type Translate = (key: LoomKey, params?: Readonly<Record<string, string>>) => string

/**
 * Resolve the execution row behind one attached Session.
 *
 * @param task - task owning the attempt rounds, when one is selected.
 * @param snapshot - current Host catalog.
 * @param sessionId - native Session identity.
 * @returns the execution row, or undefined when the Session has no workspace.
 */
export function executionForSession(
  task: TaskRecord | undefined,
  snapshot: CatalogSnapshot | undefined,
  sessionId: string,
): CatalogSnapshot['executions'][number] | undefined {
  const workspaceId = task?.attempts.find(attempt => attempt.sessionIds.includes(sessionId as SessionId))?.workspaceId
  return workspaceId === undefined ? undefined : snapshot?.executions.find(candidate => candidate.workspaceId === workspaceId)
}

/** Inputs for {@link useLoomSessionExecution}. */
export interface LoomSessionExecutionInput {
  readonly t: Translate
  readonly task: TaskRecord | undefined
  readonly snapshot: CatalogSnapshot | undefined
  readonly releaseExecution: LoomHostPort['releaseExecution']
  readonly acquireExecution: LoomHostPort['acquireExecution']
  readonly cancelExecution: LoomHostPort['cancelExecution']
  /** Refresh the Host catalog after a successful mutation. */
  readonly onChanged: () => void
}

/** Session execution actions and the Session currently being mutated. */
export interface LoomSessionExecution {
  readonly busySessionId: string | undefined
  readonly releaseSession: (sessionId: string) => Promise<void>
  readonly queueSession: (sessionId: string) => Promise<void>
  readonly leaveQueue: (sessionId: string) => Promise<void>
}

/**
 * Own the execution ownership actions for the bottom Session dock.
 *
 * @param input - task, catalog, execution ports, locale and refresh callback.
 * @returns the busy Session and the release/queue/leave actions.
 */
export function useLoomSessionExecution(input: LoomSessionExecutionInput): LoomSessionExecution {
  const { t, task, snapshot, releaseExecution, acquireExecution, cancelExecution, onChanged } = input
  const [busySessionId, setBusySessionId] = useState<string>()
  const workspaceOf = (sessionId: string): string | undefined =>
    task?.attempts.find(attempt => attempt.sessionIds.includes(sessionId as SessionId))?.workspaceId
  const ownerOf = (sessionId: string) => executionForSession(task, snapshot, sessionId)?.owner
  const fail = (error: unknown): void => {
    reportLoomFailure(t, { code: 'unknown', message: error instanceof Error ? error.message : String(error) }, t('bottom.sessionAction'))
  }
  const releaseSession = async (sessionId: string): Promise<void> => {
    const workspaceId = workspaceOf(sessionId)
    const owner = workspaceId === undefined ? undefined : ownerOf(sessionId)
    if (workspaceId === undefined || owner === null || owner === undefined || owner.sessionId !== sessionId) return
    setBusySessionId(sessionId)
    try {
      const result = await releaseExecution({ workspaceId, sessionId: owner.sessionId, generation: Number(owner.generation) })
      if (!result.ok) reportLoomFailure(t, result.error, t('bottom.sessionAction'))
      else onChanged()
    } catch (error) {
      fail(error)
    } finally {
      setBusySessionId(undefined)
    }
  }
  const queueSession = async (sessionId: string): Promise<void> => {
    const workspaceId = workspaceOf(sessionId)
    if (workspaceId === undefined) return
    setBusySessionId(sessionId)
    try {
      const result = await acquireExecution({ workspaceId, sessionId })
      if (!result.ok) reportLoomFailure(t, result.error, t('bottom.sessionAction'))
      else onChanged()
    } catch (error) {
      fail(error)
    } finally {
      setBusySessionId(undefined)
    }
  }
  const leaveQueue = async (sessionId: string): Promise<void> => {
    const workspaceId = workspaceOf(sessionId)
    if (workspaceId === undefined) return
    setBusySessionId(sessionId)
    try {
      const result = await cancelExecution({ workspaceId, sessionId })
      if (!result.ok) reportLoomFailure(t, result.error, t('bottom.sessionAction'))
      else onChanged()
    } catch (error) {
      fail(error)
    } finally {
      setBusySessionId(undefined)
    }
  }
  return { busySessionId, releaseSession, queueSession, leaveQueue }
}
