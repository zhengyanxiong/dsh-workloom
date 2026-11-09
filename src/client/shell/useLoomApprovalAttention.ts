/**
 * Desktop attention for approvals a Loom Session is waiting on.
 *
 * The native approval prompt lives in the conversation view. While the user is
 * on another tab, in another window or on another Loom route, a blocked round
 * otherwise waits with no visible signal. This keeps a tab-title badge while an
 * approval is pending and posts one system notification per new request, whose
 * click returns to the blocked Session.
 */
import { useEffect, useRef } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { LoomKey } from '../shared/locales.ts'

type Translate = (key: LoomKey, params?: Readonly<Record<string, string>>) => string

/** One approval a Loom-managed Session is currently waiting for. */
export interface LoomPendingApproval {
  readonly sessionId: SessionId
  readonly key: string
}

/** Inputs for {@link useLoomApprovalAttention}. */
export interface LoomApprovalAttentionInput {
  readonly t: Translate
  /**
   * Pending approvals encoded as `<sessionId>\u0000<requestKey>` joined by `|`.
   * A primitive lets the selector hook compare without allocating.
   */
  readonly signature: string
  /** Human label for a blocked Session. */
  readonly labelOf: (sessionId: SessionId) => string
  /** Session the main view currently shows, when one is selected. */
  readonly selectedSessionId: string | undefined
  /** Bring a blocked Session back into view. */
  readonly onOpenSession: (sessionId: SessionId) => void
}

/**
 * Decode the selector-friendly signature into pending approvals.
 * @param signature - encoded approvals, empty when none are pending.
 * @returns one entry per pending approval request.
 */
export function decodeApprovalSignature(signature: string): readonly LoomPendingApproval[] {
  if (signature === '') return []
  return signature.split('|').map(part => {
    const separator = part.indexOf('\u0000')
    const sessionId = separator < 0 ? part : part.slice(0, separator)
    return { sessionId: sessionId as SessionId, key: part.slice(separator + 1) }
  })
}

/**
 * Post one system notification for a pending approval.
 * @param input - copy, label and open action for the notification.
 * @param pending - approval request that appeared.
 */
function announce(input: LoomApprovalAttentionInput, pending: LoomPendingApproval): void {
  if (typeof window === 'undefined') return
  const NotificationCtor = window.Notification
  if (NotificationCtor === undefined) return
  const focused = typeof document !== 'undefined' && document.visibilityState === 'visible' && document.hasFocus()
  if (focused && input.selectedSessionId === pending.sessionId) return
  const show = (): void => {
    try {
      const notification = new NotificationCtor(input.t('notice.approvalDesktopTitle'), {
        body: input.t('notice.approvalDesktopBody', { label: input.labelOf(pending.sessionId) }),
        tag: `loom-approval:${pending.sessionId}`,
      })
      notification.onclick = () => {
        window.focus()
        input.onOpenSession(pending.sessionId)
        notification.close()
      }
    } catch {
      /* Permission-gated constructors may throw; the title badge still shows. */
    }
  }
  try {
    if (NotificationCtor.permission === 'granted') show()
    else if (NotificationCtor.permission === 'default') {
      void NotificationCtor.requestPermission().then(result => { if (result === 'granted') show() })
    }
  } catch {
    /* Some embedded webviews have no usable permission API. */
  }
}

/**
 * Keep a title badge and system notifications for pending approvals.
 * @param input - approvals, labels and the action that opens a blocked Session.
 */
export function useLoomApprovalAttention(input: LoomApprovalAttentionInput): void {
  const pending = decodeApprovalSignature(input.signature)
  const notified = useRef(new Set<string>())
  const baseTitle = useRef<string | undefined>(undefined)
  const latest = useRef(input)
  latest.current = input
  useEffect(() => {
    if (typeof document === 'undefined') return
    const dependencies = latest.current
    if (baseTitle.current === undefined) baseTitle.current = document.title
    const base = baseTitle.current
    if (pending.length === 0) {
      if (document.title !== base) document.title = base
      return
    }
    const prefix = dependencies.t('notice.approvalBadge', { count: String(pending.length) })
    const next = `${prefix}${base}`
    if (document.title !== next) document.title = next
  }, [input.signature])
  useEffect(() => {
    // One notification per request; a resolved or replaced request leaves the
    // set so its successor notifies again.
    const keys = new Set(pending.map(item => `${item.sessionId}\u0000${item.key}`))
    for (const key of notified.current) if (!keys.has(key)) notified.current.delete(key)
    for (const item of pending) {
      const key = `${item.sessionId}\u0000${item.key}`
      if (notified.current.has(key)) continue
      notified.current.add(key)
      announce(latest.current, item)
    }
  }, [input.signature])
  useEffect(() => () => {
    if (typeof document !== 'undefined' && baseTitle.current !== undefined) document.title = baseTitle.current
  }, [])
}
