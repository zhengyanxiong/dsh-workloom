/** @vitest-environment node */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { ProjectRecord } from 'dsh-workloom/types'
import { DEFAULT_PREFERENCES } from '../src/client/LoomSettings.tsx'
import { LoomSettingsPage } from '../src/client/LoomSettingsPage.tsx'
import { en, type LoomKey } from '../src/client/locales.ts'

const t = (key: LoomKey) => en[key]
const pinned: ProjectRecord = { id: brandString<ProjectRecord['id']>('p1'), config: { name: 'Shop', sources: [], modules: [] } }

function render(preferences = DEFAULT_PREFERENCES): string {
  return renderToStaticMarkup(createElement(LoomSettingsPage, {
    t,
    preferences,
    pinned: [pinned],
    onChange: () => undefined,
    onUnpin: () => undefined,
    onBack: () => undefined,
  }))
}

it('renders the settings sections and four prototype theme previews', () => {
  const html = render()
  for (const label of [en['settings.appearance'], en['settings.interfaceSection'], en['settings.workspace'], en['settings.startup'], en['settings.pinned']]) {
    expect(html).toContain(label)
  }
  for (const label of [en['theme.paper'], en['theme.white'], en['theme.blue'], en['theme.dark']]) {
    expect(html).toContain(label)
  }
  // The follow toggle keeps the fourth option available without a fifth card.
  expect(html).toContain(en['theme.auto'])
  for (const theme of ['light', 'white', 'blue', 'dark']) expect(html).toContain(`data-theme="${theme}"`)
  expect(html).toContain(en['settings.localOnly'])
})

it('marks the persisted theme and density as selected', () => {
  const html = render({ ...DEFAULT_PREFERENCES, theme: 'dark', density: 'compact', fontSize: 15, reducedMotion: true })
  expect((html.match(/aria-pressed="true"/g) ?? []).length).toBe(1)
  expect(html).toContain(en['settings.densityCompact'])
  expect(html).toContain(en['settings.reducedMotion'])
})

it('renders pinned projects with an unpin action and the empty state otherwise', () => {
  expect(render()).toContain('Shop')
  expect(render()).toContain(en['settings.unpin'])
  const empty = renderToStaticMarkup(createElement(LoomSettingsPage, {
    t, preferences: DEFAULT_PREFERENCES, pinned: [], onChange: () => undefined, onUnpin: () => undefined, onBack: () => undefined,
  }))
  expect(empty).toContain(en['settings.noPins'])
})
