/** Local greeting periods for the overview heading. */
export type GreetingPeriod = 'morning' | 'afternoon' | 'evening'

/**
 * Map an hour of day to the matching greeting period.
 * @param hour - local hour; values outside 0-23 wrap into the day.
 * @returns morning before 12, afternoon before 18, evening otherwise.
 */
export function greetingPeriod(hour: number): GreetingPeriod {
  const normalized = Number.isFinite(hour) ? ((Math.trunc(hour) % 24) + 24) % 24 : 0
  if (normalized < 12) return 'morning'
  if (normalized < 18) return 'afternoon'
  return 'evening'
}
