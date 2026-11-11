import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { DEFAULT_PREFERENCES, type LoomPreferences } from '../../../src/client/features/settings/LoomSettings.tsx'
import { LoomGlobalStyles } from '../../../src/client/shell/LoomGlobalStyles.tsx'
import { useLoomWorkbenchLayout } from '../../../src/client/shell/useLoomWorkbenchLayout.ts'

function layout(loomWidth: number, sidebarWidth: number, onPersist: (next: LoomPreferences) => void = () => {}): ReturnType<typeof useLoomWorkbenchLayout> {
  return useLoomWorkbenchLayout({
    loomWidth,
    viewportHeight: 900,
    preferences: { ...DEFAULT_PREFERENCES, sidebarWidth },
    previewOpen: false,
    setPreferences: update => { onPersist(update({ ...DEFAULT_PREFERENCES, sidebarWidth })) },
  })
}

it('clamps the resizable left sidebar between 200px and 420px', () => {
  expect(layout(1280, 240).sidebarWidth).toBe(240)
  expect(layout(1280, 100).sidebarWidth).toBe(200)
  expect(layout(1280, 999).sidebarWidth).toBe(420)
  // The centre keeps its minimum: narrow panes shrink the sidebar's ceiling.
  expect(layout(600, 420).sidebarMax).toBe(340)
  expect(layout(1280, 240).sidebarMin).toBe(200)
})

it('persists the dragged width as a preference update', () => {
  let persisted: LoomPreferences | undefined
  layout(1280, 240, next => { persisted = next }).setSidebarWidth(300)
  expect(persisted?.sidebarWidth).toBe(300)
})

it('lets the inline preference control width in the medium desktop container', () => {
  const html = renderToStaticMarkup(createElement(LoomGlobalStyles, { fontSize: 13 }))
  const desktopRule = /@container \(max-width: 1180px\) \{ \.loom-sidebar \{([^}]*)\}/u.exec(html)
  expect(desktopRule?.[1]).toContain('min-width: 200px')
  expect(desktopRule?.[1]).not.toMatch(/(?<![-\w])width\s*:/u)
})

it('does not truncate the inline aside width in the medium desktop container', () => {
  const html = renderToStaticMarkup(createElement(LoomGlobalStyles, { fontSize: 13 }))
  const desktopContainer = /@container \(max-width: 1180px\) \{([\s\S]*?)@container \(max-width: 1040px\)/u.exec(html)?.[1]
  expect(desktopContainer).not.toContain('.loom-aside { max-width:')
  expect(desktopContainer).not.toContain('.loom-aside.loom-aside-preview { max-width:')
})
