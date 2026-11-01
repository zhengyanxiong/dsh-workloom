import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { isGenerating, LoomTokenECG, readTokens, writeTokens } from '../src/client/LoomTokenECG.tsx'
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

it('shows thinking while the Session runs but no write rate has been sampled yet', () => {
  const html = renderToStaticMarkup(createElement(LoomTokenECG, { t, label: 'owner task', usage, running: true }))
  expect(html).toContain(en['tokenECG.thinking'])
})

it('splits the projection into read and write token buckets', () => {
  expect(readTokens(usage)).toBe(12_700)
  expect(writeTokens(usage)).toBe(1_800)
  expect(readTokens(undefined)).toBeUndefined()
  expect(writeTokens(undefined)).toBeUndefined()
})

it('treats only running Sessions writing fast enough as generating', () => {
  expect(isGenerating(false, 1_000)).toBe(false)
  expect(isGenerating(true, 0)).toBe(false)
  expect(isGenerating(true, 5)).toBe(false)
  expect(isGenerating(true, 6)).toBe(true)
})
