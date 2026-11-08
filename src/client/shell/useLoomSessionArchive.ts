/** Archive and restore state for the Workloom Session lists. */
import { useState } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { LoomSessionArchiveOutcome } from '../../ports/loom-host.ts'
import type { LoomKey } from '../shared/locales.ts'
import { pushLoomNotice, reportLoomFailure, reportLoomThrown } from '../shared/feedback.ts'
import { failureReport, thrownFailureReport } from '../ui/failure.ts'
import type { FailureReport } from '../ui/failure.ts'

type Translate = (key: LoomKey, params?: Readonly<Record<string, string>>) => string

/** Native archive and restore calls the shell owns. */
export interface LoomSessionArchiveInput {
  readonly archiveSession: (sessionId: SessionId, options: { readonly stopActivity: boolean }) => Promise<LoomSessionArchiveOutcome>
  readonly unarchiveSession: (sessionId: SessionId) => Promise<LoomSessionArchiveOutcome>
  /** Whether the Session still has running work that archiving would stop. */
  readonly isSessionRunning: (sessionId: string) => boolean
  readonly sessionLabel: (sessionId: string) => string
  readonly t: Translate
  /** Clear the open Session when it is the one being archived. */
  readonly onArchived: (sessionId: string) => void
  /** Re-read the native snapshot and the shared archive set. */
  readonly refresh: () => void
}

/** Confirmation required before archiving a Session that is still running. */
export interface LoomArchiveConfirm {
  readonly sessionId: string
  readonly title: string
}

/** Archive/restore state and actions bound to the Loom shell. */
export interface LoomSessionArchive {
  readonly showArchived: boolean
  readonly toggleArchived: () => void
  readonly archive: (sessionId: string) => void
  readonly restore: (sessionId: string) => void
  readonly busySessionId: string | undefined
  readonly confirm: LoomArchiveConfirm | undefined
  readonly confirmBusy: boolean
  readonly confirmFailure: FailureReport | undefined
  readonly cancelConfirm: () => void
  readonly confirmArchive: () => void
}

/**
 * Hide archived Sessions by default and run the reversible native archive.
 * A running Session is archived only after an explicit stop confirmation.
 * @param input - native calls, Session lookups, locale and shell refresh hooks.
 * @returns visibility state, pending confirmation and archive/restore actions.
 */
export function useLoomSessionArchive(input: LoomSessionArchiveInput): LoomSessionArchive {
  const [showArchived, setShowArchived] = useState(false)
  const [busySessionId, setBusySessionId] = useState<string>()
  const [confirm, setConfirm] = useState<LoomArchiveConfirm>()
  const [confirmBusy, setConfirmBusy] = useState(false)
  const [confirmFailure, setConfirmFailure] = useState<FailureReport>()

  const archived = (sessionId: string): void => {
    input.onArchived(sessionId)
    pushLoomNotice('success', input.t('notice.sessionArchived'))
    input.refresh()
  }
  const archiveNow = async (sessionId: string, stopActivity: boolean): Promise<void> => {
    setBusySessionId(sessionId)
    try {
      const outcome = await input.archiveSession(sessionId as SessionId, { stopActivity })
      if (outcome.ok) { archived(sessionId); return }
      if (!stopActivity && outcome.code === 'workspace/session-active') {
        setConfirm({ sessionId, title: input.sessionLabel(sessionId) })
        return
      }
      reportLoomFailure(input.t, outcome, input.t('session.archive'))
    } catch (error) {
      reportLoomThrown(input.t, error, input.t('session.archive'))
    } finally {
      setBusySessionId(undefined)
    }
  }
  const archive = (sessionId: string): void => {
    if (input.isSessionRunning(sessionId)) {
      setConfirm({ sessionId, title: input.sessionLabel(sessionId) })
      return
    }
    void archiveNow(sessionId, false)
  }
  const restoreNow = async (sessionId: string): Promise<void> => {
    setBusySessionId(sessionId)
    try {
      const outcome = await input.unarchiveSession(sessionId as SessionId)
      if (!outcome.ok) { reportLoomFailure(input.t, outcome, input.t('session.unarchive')); return }
      pushLoomNotice('success', input.t('notice.sessionRestored'))
      input.refresh()
    } catch (error) {
      reportLoomThrown(input.t, error, input.t('session.unarchive'))
    } finally {
      setBusySessionId(undefined)
    }
  }
  const restore = (sessionId: string): void => { void restoreNow(sessionId) }
  const confirmNow = async (request: LoomArchiveConfirm): Promise<void> => {
    setConfirmBusy(true)
    setConfirmFailure(undefined)
    try {
      const outcome = await input.archiveSession(request.sessionId as SessionId, { stopActivity: true })
      if (!outcome.ok) { setConfirmFailure(failureReport(outcome.code, outcome.message)); return }
      setConfirm(undefined)
      archived(request.sessionId)
    } catch (error) {
      setConfirmFailure(thrownFailureReport(error))
    } finally {
      setConfirmBusy(false)
    }
  }
  const confirmArchive = (): void => {
    if (confirm === undefined || confirmBusy) return
    void confirmNow(confirm)
  }

  return {
    showArchived,
    toggleArchived: () => setShowArchived(current => !current),
    archive,
    restore,
    busySessionId,
    confirm,
    confirmBusy,
    confirmFailure,
    cancelConfirm: (): void => { setConfirm(undefined); setConfirmFailure(undefined) },
    confirmArchive,
  }
}
