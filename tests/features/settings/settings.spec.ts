import { afterEach, expect, it, vi } from 'vitest'
import { DEFAULT_PREFERENCES, readPreferences, writePreferences } from '../../../src/client/features/settings/LoomSettings.tsx'

const storage = new Map<string, string>()
afterEach(() => { vi.unstubAllGlobals(); storage.clear() })

it('round-trips browser-local Loom preferences', () => {
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value) } })
  const written = { ...DEFAULT_PREFERENCES, view: 'kanban' as const, kanbanMode: 'flat' as const, theme: 'dark' as const, density: 'compact' as const, fontSize: 15 as const, reducedMotion: true, contextOpen: false, sessionLimit: 8, wipLimit: 6, openOnLoad: true, collapseSidebar: true }
  writePreferences(written)
  expect(readPreferences()).toEqual(written)
})

it('clamps stored pane sizes and falls back for non-finite values', () => {
  vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ asideWidth: 9999, previewWidth: -4, bottomHeight: '170', sessionLimit: 99 }), setItem: () => {} })
  expect(readPreferences()).toEqual({ ...DEFAULT_PREFERENCES, asideWidth: 460, previewWidth: 300, sessionLimit: 20 })
})

it('falls back to defaults for malformed storage values', () => {
  vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ view: 'sideways', kanbanMode: 3, contextOpen: 'yes' }), setItem: () => {} })
  expect(readPreferences()).toEqual(DEFAULT_PREFERENCES)
})

it('rejects unknown appearance values instead of applying them', () => {
  vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ theme: 'solarized', density: 'spacious', fontSize: 99, reducedMotion: 'yes' }), setItem: () => {} })
  expect(readPreferences()).toEqual(DEFAULT_PREFERENCES)
})

it('accepts and exposes the 16px text size', async () => {
  vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ fontSize: 16 }), setItem: () => {} })
  expect(readPreferences().fontSize).toBe(16)
  const { createElement } = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const { LoomSettingsPage } = await import('../../../src/client/features/settings/LoomSettingsPage.tsx')
  const { en } = await import('../../../src/client/shared/locales.ts')
  const html = renderToStaticMarkup(createElement(LoomSettingsPage, {
    t: (key: keyof typeof en) => en[key],
    preferences: { ...DEFAULT_PREFERENCES, fontSize: 16 },
    pinned: [],
    onChange: () => {},
    onUnpin: () => {},
    onBack: () => {},
  }))
  expect(html).toContain('>16</button>')
})

it('shows the plugin version and an update check in the About section', async () => {
  const { createElement } = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const { LoomSettingsPage } = await import('../../../src/client/features/settings/LoomSettingsPage.tsx')
  const { en } = await import('../../../src/client/shared/locales.ts')
  const { LOOM_VERSION } = await import('../../../src/client/shared/version.ts')
  const html = renderToStaticMarkup(createElement(LoomSettingsPage, {
    t: (key: keyof typeof en) => en[key],
    preferences: DEFAULT_PREFERENCES,
    pinned: [],
    onChange: () => {},
    onUnpin: () => {},
    onBack: () => {},
  }))
  expect(html).toContain('loom-settings-about')
  expect(html).toContain(en['settings.about'].replace('&', '&amp;'))
  expect(html).toContain(en['settings.version'])
  expect(html).toContain(LOOM_VERSION)
  expect(html).toContain(en['settings.checkUpdates'])
})

it('clamps the stored left-sidebar width', () => {
  vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ sidebarWidth: 9999 }), setItem: () => {} })
  expect(readPreferences().sidebarWidth).toBe(420)
  vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ sidebarWidth: 10 }), setItem: () => {} })
  expect(readPreferences().sidebarWidth).toBe(200)
  vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ sidebarWidth: 'wide' }), setItem: () => {} })
  expect(readPreferences().sidebarWidth).toBe(DEFAULT_PREFERENCES.sidebarWidth)
})
