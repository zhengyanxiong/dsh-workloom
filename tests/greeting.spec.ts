import { expect, it } from 'vitest'
import { greetingPeriod } from '../src/client/greeting.ts'

it.each([
  [0, 'evening'],
  [4, 'evening'],
  [5, 'morning'],
  [8, 'morning'],
  [11, 'morning'],
  [12, 'afternoon'],
  [17, 'afternoon'],
  [18, 'evening'],
  [23, 'evening'],
] as const)('maps hour %s to %s', (hour, period) => {
  expect(greetingPeriod(hour)).toBe(period)
})

it('wraps out-of-range hours and falls back for non-finite input', () => {
  expect(greetingPeriod(24)).toBe('evening')
  expect(greetingPeriod(-1)).toBe('evening')
  expect(greetingPeriod(Number.NaN)).toBe('evening')
})
