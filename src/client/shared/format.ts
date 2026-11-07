/** Small display formatters shared by Loom pages. */
import type { Lock } from 'dsh-workloom/types'
import type { LoomKey } from './locales.ts'

/**
 * Short commit label for chips and context rows.
 * @param lock - version lock, when one exists.
 * @returns the first seven commit characters.
 */
export function shortCommit(lock: Lock | undefined): string | undefined {
  return lock?.repositories[0]?.commit.slice(0, 7)
}

/**
 * Render a task count with the localized unit.
 * @param count - number of cards.
 * @param t - locale lookup.
 * @returns label such as `3 卡片`.
 */
export function cardCount(count: number, t: (key: LoomKey) => string): string {
  return `${String(count)} ${t('kb.cardsUnit')}`
}

/**
 * Localized date-time for an ISO timestamp.
 * @param value - ISO 8601 timestamp from the catalog.
 * @returns readable local time, or undefined for legacy records without one.
 */
export function formatTimestamp(value: string | undefined): string | undefined {
  if (value === undefined || value === '') return undefined
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
}
