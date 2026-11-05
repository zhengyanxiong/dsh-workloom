/** @vitest-environment node */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { LoomSegmented } from '../src/client/ui/Segmented.tsx'

it('marks the active segment and uses roving tabindex', () => {
  const html = renderToStaticMarkup(createElement(LoomSegmented, {
    value: 'list',
    options: [{ value: 'kanban', label: 'Kanban' }, { value: 'list', label: 'List' }],
    onChange: () => undefined,
    ariaLabel: 'Board view',
  }))
  expect(html).toContain('role="tablist"')
  expect(html).toContain('aria-label="Board view"')
  expect(html).toContain('aria-selected="true"')
  expect(html).toContain('tabindex="0"')
  expect(html).toContain('aria-selected="false"')
  expect(html).toContain('tabindex="-1"')
})

it('renders one tab per option with its label', () => {
  const html = renderToStaticMarkup(createElement(LoomSegmented, {
    value: 'kanban',
    options: [{ value: 'kanban', label: 'Kanban' }, { value: 'list', label: 'List' }],
    onChange: () => undefined,
    ariaLabel: 'Board view',
  }))
  expect((html.match(/role="tab"/g) ?? []).length).toBe(2)
  expect(html).toContain('Kanban')
  expect(html).toContain('List')
})
