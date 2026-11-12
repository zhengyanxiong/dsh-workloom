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

it('scales every Workloom supporting text role with the preference', () => {
  const regular = renderToStaticMarkup(createElement(LoomGlobalStyles, { fontSize: 14 }))
  for (const declaration of [
    '--text-body-size: 14px',
    '--text-compact-size: 13px',
    '--text-small-size: 12px',
    '--text-label-size: 11.5px',
    '--text-micro-size: 10.5px',
    '--text-nano-size: 10px',
    '--text-mono-size: 12px',
  ]) expect(regular).toContain(declaration)

  const small = renderToStaticMarkup(createElement(LoomGlobalStyles, { fontSize: 13 }))
  for (const declaration of [
    '--text-body-size: 13px',
    '--text-compact-size: 12px',
    '--text-small-size: 11px',
    '--text-label-size: 10.5px',
    '--text-micro-size: 9.5px',
    '--text-nano-size: 9px',
    '--text-mono-size: 11px',
  ]) expect(small).toContain(declaration)

  const large = renderToStaticMarkup(createElement(LoomGlobalStyles, { fontSize: 15 }))
  for (const declaration of [
    '--text-body-size: 15px',
    '--text-compact-size: 14px',
    '--text-small-size: 13px',
    '--text-label-size: 12.5px',
    '--text-micro-size: 11.5px',
    '--text-nano-size: 11px',
    '--text-mono-size: 13px',
  ]) expect(large).toContain(declaration)
})

it('keeps context-panel facts on preference-driven type tokens', () => {
  const source = readFileSync(new URL('../../../src/client/features/version/LoomContextPanel.tsx', import.meta.url), 'utf8')
  expect(source).not.toContain('fontSize: useMono ? 10.5 : 11')
  expect(source).toContain("fontSize: useMono ? 'var(--text-micro-size)' : 'var(--text-label-size)'")
})

it('feeds the preference into embedded session text', () => {
  expect(renderToStaticMarkup(createElement(LoomGlobalStyles, { fontSize: 14 }))).toContain('--dsh-content-font-size: 14px')
  expect(renderToStaticMarkup(createElement(LoomGlobalStyles, { fontSize: 15 }))).toContain('--dsh-content-font-size: 15px')
})
