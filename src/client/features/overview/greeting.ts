/** Local greeting periods for the overview heading. */
export type GreetingPeriod = 'morning' | 'afternoon' | 'evening'

/**
 * Map an hour of day to the matching greeting period.
 * @param hour - local hour; values outside 0-23 wrap into the day.
 * @returns morning for 5:00-11:59, afternoon for 12:00-17:59 and evening
 * otherwise, so late-night hours still read as evening rather than morning.
 */
export function greetingPeriod(hour: number): GreetingPeriod {
  const normalized = Number.isFinite(hour) ? ((Math.trunc(hour) % 24) + 24) % 24 : 0
  if (normalized >= 5 && normalized < 12) return 'morning'
  if (normalized >= 12 && normalized < 18) return 'afternoon'
  return 'evening'
}
