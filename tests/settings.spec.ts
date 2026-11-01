import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, expect, it, vi } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { ProjectRecord } from 'dsh-workloom/types'
import { DEFAULT_PREFERENCES, LoomSettings, readPreferences, writePreferences } from '../src/client/LoomSettings.tsx'
import { en } from '../src/client/locales.ts'
const storage = new Map<string, string>()
afterEach(() => { vi.unstubAllGlobals(); storage.clear() })
it('round-trips browser-local Loom preferences', () => {
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value) } })
  const written = { ...DEFAULT_PREFERENCES, view: 'kanban' as const, kanbanMode: 'flat' as const, contextOpen: false, sessionLimit: 8, wipLimit: 6, openOnLoad: true, collapseSidebar: true }
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
it('renders pinned projects and local-only preference copy', () => {
  const pinned: ProjectRecord = { id: brandString<ProjectRecord['id']>('p1'), config: { name: 'Shop', sources: [{ id: brandString<'loom.source'>('web'), repo: '/repo', path: 'web' }], modules: [] } }
  const html = renderToStaticMarkup(createElement(LoomSettings, {
    t: key => en[key],
    open: true,
    preferences: DEFAULT_PREFERENCES,
    pinned: [pinned],
    onChange: () => {},
    onUnpin: () => {},
    onClose: () => {},
  }))
  expect(html).toContain(en['settings.title'])
  expect(html).toContain('Shop')
  expect(html).toContain(en['settings.sessionLimit'])
  expect(html).toContain(en['settings.localOnly'])
  expect(html).toContain(en['settings.wipLimit'])
  expect(html).toContain(en['settings.wipLimitHint'])
  expect(html).toContain(en['settings.openOnLoad'])
  expect(html).toContain(en['settings.collapseSidebar'])
  expect(html).toContain(en['settings.startupHint'])
})
