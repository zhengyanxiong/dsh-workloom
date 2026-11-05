import { describe, expect, it } from 'vitest'
import { epochMillis, relativeTime } from '../src/client/time.ts'

const now = Date.UTC(2026, 10, 5, 12, 0, 0)
const minutes = (value: number): number => now - value * 60_000

describe('relativeTime', () => {
  it('formats recent minutes and hours with 前', () => {
    expect(relativeTime(minutes(0), now)).toBe('刚刚')
    expect(relativeTime(minutes(12), now)).toBe('12分钟前')
    expect(relativeTime(minutes(120), now)).toBe('2小时前')
  })

  it('formats yesterday and days with 前', () => {
    expect(relativeTime(minutes(24 * 60 + 30), now)).toBe('昨天')
    expect(relativeTime(minutes(3 * 24 * 60), now)).toBe('3天前')
  })

  it('falls back to an absolute month/day for older entries', () => {
    expect(relativeTime(Date.UTC(2026, 9, 21, 12, 0, 0), now)).toBe('10月21日')
  })

  it('accepts ISO strings and seconds', () => {
    expect(epochMillis('2026-11-05T11:45:00Z')).toBe(minutes(15))
    expect(relativeTime(Math.floor(minutes(15) / 1000), now)).toBe('15分钟前')
  })
})
