/** Process-wide operation notices rendered by the shell overlay. */
import type { LoomKey } from './locales.ts'
import { failureReport, thrownFailureReport } from './shell.ts'

/** Visual status of one transitory operation notice. */
export type LoomNoticeTone = 'success' | 'error'

/** One operation result held until its display window expires. */
export interface LoomNotice {
  readonly id: number
  readonly tone: LoomNoticeTone
  readonly title: string
  readonly detail?: string
}

const MAX_NOTICES = 3
const SUCCESS_HOLD_MS = 2_800
const ERROR_HOLD_MS = 6_000

let sequence = 0
let notices: readonly LoomNotice[] = []
const listeners = new Set<() => void>()
const timers = new Map<number, ReturnType<typeof setTimeout>>()

function emit(): void {
  for (const listener of listeners) listener()
}

function remove(id: number): void {
  const timer = timers.get(id)
  if (timer !== undefined) {
    clearTimeout(timer)
    timers.delete(id)
  }
  const next = notices.filter(notice => notice.id !== id)
  if (next.length === notices.length) return
  notices = next
  emit()
}

/**
 * Add one operation notice, keeping only the newest few on screen.
 * @param tone - Success or failure presentation.
 * @param title - Localized one-line outcome.
 * @param detail - Optional localized diagnostic for a failure.
 */
export function pushLoomNotice(tone: LoomNoticeTone, title: string, detail?: string): void {
  const id = ++sequence
  const next: LoomNotice = { id, tone, title, ...detail === undefined ? {} : { detail } }
  notices = [...notices, next].slice(-MAX_NOTICES)
  emit()
  const hold = tone === 'error' ? ERROR_HOLD_MS : SUCCESS_HOLD_MS
  timers.set(id, setTimeout(() => { remove(id) }, hold))
}

/** Remove one notice immediately, e.g. when a replacement outcome supersedes it. */
export function dismissLoomNotice(id: number): void {
  remove(id)
}

/** Subscribe to the notice list for `useSyncExternalStore`. */
export function subscribeLoomNotices(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Current notice list snapshot. */
export function getLoomNotices(): readonly LoomNotice[] {
  return notices
}

/**
 * Report one remote operation failure through the shared notice surface.
 * The notice names the operation so a failure on a shared board or dialog says
 * which command did not take effect, and keeps the Host diagnostic for unknown codes.
 * @param t - Locale-bound translator.
 * @param failure - Wire code and message returned by a Workloom remote method.
 * @param operation - Optional localized operation name (`op.transition`, …).
 */
export function reportLoomFailure(t: (key: LoomKey) => string, failure: { readonly code: string; readonly message: string }, operation?: string): void {
  const report = failureReport(failure.code, failure.message)
  const detail = report.detail === undefined ? t(report.message) : `${t(report.message)} · ${report.detail}`
  pushLoomNotice('error', operation === undefined ? t('notice.operationFailed') : `${t('notice.operationFailed')} · ${operation}`, detail)
}

/**
 * Report one thrown operation failure, keeping the thrown diagnostic for unknown causes.
 * Workloom remotes return wire results; a rejection means the call itself broke, so the
 * notice still names the operation and promises that no unconfirmed state is shown as success.
 * @param t - Locale-bound translator.
 * @param error - Rejection value from a Remote call or a native action.
 * @param operation - Optional localized operation name.
 */
export function reportLoomThrown(t: (key: LoomKey) => string, error: unknown, operation?: string): void {
  const report = thrownFailureReport(error)
  const detail = report.detail === undefined ? t(report.message) : `${t(report.message)} · ${report.detail}`
  pushLoomNotice('error', operation === undefined ? t('notice.operationFailed') : `${t('notice.operationFailed')} · ${operation}`, detail)
}
