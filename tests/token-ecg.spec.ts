import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { LoomTokenECG } from '../src/client/LoomTokenECG.tsx'
import { en, type LoomKey } from '../src/client/locales.ts'

const t = (key: LoomKey) => en[key]
const usage = { uncachedInputTokens: 700, outputTokens: 1800, cacheReadTokens: 12_000, cacheWriteTokens: 0 }

it('shows real cumulative tokens and idle state without a running Session', () => {
  const html = renderToStaticMarkup(createElement(LoomTokenECG, { t, label: 'owner task', usage, running: false }))
  expect(html).toContain('14.5k')
  expect(html).toContain(en['tokenECG.used'])
  expect(html).toContain(en['tokenECG.idle'])
  expect(html).toContain('<canvas')
})

it('shows thinking while the Session runs but no token delta has been sampled yet', () => {
  const html = renderToStaticMarkup(createElement(LoomTokenECG, { t, label: 'owner task', usage, running: true }))
  expect(html).toContain(en['tokenECG.thinking'])
})

it('does not invent tokens when the projection has no usage', () => {
  const html = renderToStaticMarkup(createElement(LoomTokenECG, { t, label: 'owner task', usage: undefined, running: false }))
  expect(html).toContain('—')
  expect(html).toContain(en['tokenECG.idle'])
})
