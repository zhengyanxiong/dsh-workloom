/** @vitest-environment node */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import type { LoomRoute } from '../src/client/shell/router.ts'
import { LoomTopbar } from '../src/client/shell/LoomTopbar.tsx'
import { en, type LoomKey } from '../src/client/shared/locales.ts'

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
    onOpenPalette: noop,
  }))
}

it('keeps the settings action and omits the green activity pill', () => {
  const html = render('board')
  expect(html).toContain(en['top.settings'])
  expect(html).not.toContain(en['top.activeWorkspaces'])
  expect(html).not.toContain('success-soft')
})

it('renders the New action as a labeled icon button beside the other icon actions', () => {
  const html = render('board')
  expect(html).toContain('loom-top-new')
  expect(html).toContain(`aria-label="${en['top.new']}"`)
  expect(html).toContain('aria-haspopup="menu"')
  expect(html).not.toContain(`>${en['top.new']}<`)
})

it('exposes the Ctrl K search trigger in the action cluster', () => {
  const html = render('board')
  expect(html).toContain(`aria-label="${en['top.search']} Ctrl K"`)
  expect(html).toContain('aria-keyshortcuts="Control+K Meta+K"')
  expect(html).toContain('Ctrl K')
})

it('keeps settings out of the top tabs but reachable from the gear action', () => {
  const board = render('board')
  expect(board).not.toContain('>Settings</button>')
  expect(board).toContain(`aria-label="${en['top.settings']}"`)
  expect(render('task')).not.toContain('>Settings</button>')
})

it('only offers the context-panel toggle where the aside exists', () => {
  expect(render('board')).not.toContain(en['top.contextPanel'])
  const task = render('task')
  expect(task).toContain(en['top.contextPanel'])
  expect(task).toContain('aria-pressed="true"')
})
