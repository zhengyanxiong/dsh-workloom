/** Shared relative-time formatting for task and Session lists. */

/** Normalize seconds and milliseconds to epoch milliseconds. */
export function epochMillis(value: number | string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined
  const raw = typeof value === 'string' ? Date.parse(value) : value
  if (!Number.isFinite(raw) || raw <= 0) return undefined
  return raw < 1_000_000_000_000 ? raw * 1000 : raw
}

/**
 * Format a compact relative time label used by list rows.
 * @param value - epoch seconds or milliseconds.
 * @param now - current epoch milliseconds, injectable for tests.
 * @returns a compact label such as `12m`, `2h`, `昨天`, or `3d`.
 */
export function relativeTime(value: number | string | undefined, now = Date.now()): string {
  const millis = epochMillis(value)
  if (millis === undefined) return ''
  const minutes = Math.max(0, Math.round((now - millis) / 60_000))
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${String(minutes)}m`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${String(hours)}h`
  if (hours < 48) return '昨天'
  const days = Math.round(hours / 24)
  return days < 7 ? `${String(days)}d` : new Date(millis).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })
}

/** Format the absolute timestamp for a native tooltip. */
export function absoluteTime(value: number | string | undefined): string | undefined {
  const millis = epochMillis(value)
  return millis === undefined ? undefined : new Date(millis).toLocaleString()
}
