import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { beatPeriodMs, isGenerating, LoomTokenECG, totalTokens } from '../src/client/LoomTokenECG.tsx'
import { en, type LoomKey } from '../src/client/locales.ts'

const t = (key: LoomKey) => en[key]
const usage = { uncachedInputTokens: 700, outputTokens: 1800, cacheReadTokens: 12_000, cacheWriteTokens: 0 }

it('renders the activity card without a token counter', () => {
  const html = renderToStaticMarkup(createElement(LoomTokenECG, { t, label: 'owner task', usage, running: false }))
  expect(html).toContain('owner task')
  expect(html).toContain('<canvas')
  expect(html).toContain(en['tokenECG.idle'])
  expect(html).not.toContain('14.5k')
})

it('shows thinking while the Session runs but no token delta has been sampled yet', () => {
  const html = renderToStaticMarkup(createElement(LoomTokenECG, { t, label: 'owner task', usage, running: true }))
  expect(html).toContain(en['tokenECG.thinking'])
})

it('sums every token bucket reported by the projection', () => {
  expect(totalTokens(usage)).toBe(14_500)
  expect(totalTokens(undefined)).toBeUndefined()
})

it('treats only running Sessions above the threshold as generating', () => {
  expect(isGenerating(false, 1_000)).toBe(false)
  expect(isGenerating(true, 0)).toBe(false)
  expect(isGenerating(true, 0.5)).toBe(false)
  expect(isGenerating(true, 0.51)).toBe(true)
})

it('keeps the rhythm between the idle and the minimum beat period', () => {
  expect(beatPeriodMs(0)).toBe(2100)
  expect(beatPeriodMs(900)).toBeCloseTo(1605, 6)
  expect(beatPeriodMs(5_000)).toBeCloseTo(1605, 6)
  expect(beatPeriodMs(5_000)).toBeGreaterThanOrEqual(1250)
})
