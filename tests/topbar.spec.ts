/** @vitest-environment node */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import type { LoomRoute } from '../src/client/shell/router.ts'
import { LoomTopbar } from '../src/client/shell/LoomTopbar.tsx'
import { en, type LoomKey } from '../src/client/locales.ts'

const t = (key: LoomKey) => en[key]
const noop = (): void => undefined

function render(route: LoomRoute): string {
  return renderToStaticMarkup(createElement(LoomTopbar, {
    t,
    narrow: false,
    sidebarOpen: false,
    sidebarCollapsed: false,
    menuOpen: false,
    project: undefined,
    version: undefined,
    snapshot: undefined,
    activeCount: 2,
    route,
    asideOpen: true,
    createDisabledVersion: false,
    createDisabledTask: false,
    newMenuRef: { current: null },
    onToggleSidebar: noop,
    onToggleSidebarCollapsed: noop,
    onToggleMenu: noop,
    onSelectProject: noop,
    onSelectVersion: noop,
    onNavigate: noop,
    onOpenCreate: noop,
    onToggleAside: noop,
    onOpenSettings: noop,
  }))
}

it('keeps the active-workspace count and settings action in the right cluster', () => {
  const html = render('board')
  expect(html).toContain(en['top.activeWorkspaces'])
  expect(html).toContain('>2<')
  expect(html).toContain(en['top.settings'])
})

it('only offers the context-panel toggle where the aside exists', () => {
  expect(render('board')).not.toContain(en['top.contextPanel'])
  const task = render('task')
  expect(task).toContain(en['top.contextPanel'])
  expect(task).toContain('aria-pressed="true"')
})
