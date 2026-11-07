/** Hold the selected native Session and retry it safely. */
import { useEffect, useRef, useState } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type { LoomPanelProps } from '../LoomPanel.tsx'

/** Result of holding the selected Session. */
export interface LoomSessionHold {
  readonly held: { readonly id: SessionId; readonly reference: SessionReference } | undefined
  readonly failure: SessionId | undefined
  readonly available: boolean
  readonly setPendingDraft: (draft: { readonly sessionId: SessionId; readonly prompt: string } | undefined) => void
  readonly retry: () => void
}

/**
 * Retain the selected Session, release it on change and retry mount failures.
 * @param selected - selected native Session id.
 * @param retainSession - host retain call.
 * @param requestDraftInitialization - host composer draft bridge.
 * @returns held Session state and a retry trigger.
 */
export function useLoomSessionHold(selected: SessionId | undefined, retainSession: LoomPanelProps['retainSession'], requestDraftInitialization: LoomPanelProps['requestDraftInitialization']): LoomSessionHold {
  const [held, setHeld] = useState<{ id: SessionId; reference: SessionReference }>()
  const [failure, setFailure] = useState<SessionId>()
  const [sessionRetry, setSessionRetry] = useState(0)
  const [pendingDraft, setPendingDraft] = useState<{ sessionId: SessionId; prompt: string }>()
  const [draftAttempt, setDraftAttempt] = useState(0)
  const heldRef = useRef<{ id: SessionId; reference: SessionReference } | undefined>(undefined)
  useEffect(() => {
    if (selected === undefined) return
    let reference: SessionReference
    try { reference = retainSession(selected) }
    catch { setFailure(selected); return }
    let active = true
    setFailure(undefined)
    heldRef.current = { id: selected, reference }
    setHeld({ id: selected, reference })
    void reference.ready.catch(() => { if (active) setFailure(selected) })
    return () => {
      active = false
      if (heldRef.current?.reference === reference) heldRef.current = undefined
      reference.release()
    }
  }, [selected, retainSession, sessionRetry])
  const available = held !== undefined && held.id === selected && failure !== selected && heldRef.current?.reference === held.reference
  useEffect(() => {
    if (pendingDraft === undefined || pendingDraft.sessionId !== selected || !available || held === undefined) return
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    try {
      const result = requestDraftInitialization(held.reference.binding, { prompt: pendingDraft.prompt, clearPreviousDraft: true })
      if (result === 'blocked' && draftAttempt < 20) retryTimer = setTimeout(() => setDraftAttempt(value => value + 1), 150)
      else setPendingDraft(undefined)
    } catch { /* the native composer may have been replaced by a newer navigation */ setPendingDraft(undefined) }
    return () => { if (retryTimer !== undefined) clearTimeout(retryTimer) }
  }, [pendingDraft, selected, available, held, requestDraftInitialization, draftAttempt])
  return { held, failure, available, setPendingDraft: (draft) => { setDraftAttempt(0); setPendingDraft(draft) }, retry: () => setSessionRetry(value => value + 1) }
}
