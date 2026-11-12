import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { LoomGlobalStyles } from '../../../src/client/shell/LoomGlobalStyles.tsx'
import { resolveLoomTheme } from '../../../src/client/theme/selection.ts'

const themeCss = readFileSync(new URL('../../../src/client/theme/tokens.module.css', import.meta.url), 'utf8')
const bridgeCss = readFileSync(new URL('../../../src/client/theme/LoomTheme.module.css', import.meta.url), 'utf8')

it('defines an independent token palette for every appearance preview', () => {
  for (const preference of ['paper', 'white', 'blue', 'dark'] as const) {
    const attribute = resolveLoomTheme(preference, false)
    expect(themeCss, `${preference} preview should not inherit another theme`).toMatch(new RegExp(`\\[data-theme='${attribute}'\\]\\s*\\{`, 'u'))
  }
})

it('keeps the native primary action on the solid accent', () => {
  expect(bridgeCss).toMatch(/--dsw-alias-button-info-fill:\s*var\(--color-accent-solid\);/u)
  expect(bridgeCss).toMatch(/--dsw-alias-button-info-hover:\s*color-mix\(in srgb, var\(--color-accent-solid\) 88%, var\(--color-bg\)\);/u)
})

it('scales Workloom body, compact and description text with the preference', () => {
  const regular = renderToStaticMarkup(createElement(LoomGlobalStyles, { fontSize: 14 }))
  expect(regular).toContain('--text-body-size: 14px')
  expect(regular).toContain('--text-compact-size: 13px')
  expect(regular).toContain('--text-small-size: 12px')

  const small = renderToStaticMarkup(createElement(LoomGlobalStyles, { fontSize: 13 }))
  expect(small).toContain('--text-body-size: 13px')
  expect(small).toContain('--text-compact-size: 12px')
  expect(small).toContain('--text-small-size: 11px')

  const large = renderToStaticMarkup(createElement(LoomGlobalStyles, { fontSize: 15 }))
  expect(large).toContain('--text-body-size: 15px')
  expect(large).toContain('--text-compact-size: 14px')
  expect(large).toContain('--text-small-size: 13px')
})

it('feeds the preference into embedded session text', () => {
  expect(renderToStaticMarkup(createElement(LoomGlobalStyles, { fontSize: 14 }))).toContain('--dsh-content-font-size: 14px')
  expect(renderToStaticMarkup(createElement(LoomGlobalStyles, { fontSize: 15 }))).toContain('--dsh-content-font-size: 15px')
})
