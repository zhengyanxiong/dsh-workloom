/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it } from 'vitest'
import { useHostTheme } from '../src/client/theme/useHostTheme.ts'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | undefined
let container: HTMLDivElement | undefined

afterEach(async () => {
  await act(async () => { root?.unmount() })
  container?.remove()
  root = undefined
  container = undefined
  document.body.removeAttribute('data-ds-dark-theme')
})

function Probe({ theme }: { readonly theme: 'auto' | 'dark' | 'paper' }) {
  const dark = useHostTheme(theme)
  return createElement('span', { 'data-dark': String(dark) })
}

async function mount(theme: 'auto' | 'dark' | 'paper'): Promise<void> {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => { root?.render(createElement(Probe, { theme })) })
}

/** Let a host mutation flush through the observer. */
async function flush(): Promise<void> {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
}

it('keeps the DSH dark attribute while Loom uses an explicit dark theme', async () => {
  await mount('dark')
  expect(document.body.hasAttribute('data-ds-dark-theme')).toBe(true)

  // DSH chrome boots after the Loom panel and clears the attribute.
  document.body.removeAttribute('data-ds-dark-theme')
  await flush()
  expect(document.body.hasAttribute('data-ds-dark-theme')).toBe(true)
})

it('restores the host theme when Loom returns to auto', async () => {
  await mount('dark')
  expect(document.body.hasAttribute('data-ds-dark-theme')).toBe(true)
  await act(async () => { root?.render(createElement(Probe, { theme: 'auto' })) })
  expect(document.body.hasAttribute('data-ds-dark-theme')).toBe(false)
})

it('forces the host light when Loom uses an explicit light theme', async () => {
  document.body.setAttribute('data-ds-dark-theme', '')
  await mount('paper')
  expect(document.body.hasAttribute('data-ds-dark-theme')).toBe(false)
})
