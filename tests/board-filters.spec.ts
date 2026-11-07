/** @vitest-environment node */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { en, type LoomKey } from '../src/client/locales.ts'
import { LoomBoardFilters, type LoomBoardFiltersProps } from '../src/client/LoomBoardFilters.tsx'

const t = (key: LoomKey) => en[key]
const base: LoomBoardFiltersProps = {
  t,
  versionValue: '',
  statusValue: '',
  moduleValue: '',
  searchValue: '',
  versionOptions: [{ value: '', label: en['top.allVersions'] }, { value: 'v1', label: 'v1' }],
  statusOptions: [{ value: '', label: en['kb.allStatuses'] }, { value: 'review', label: en['task.status.review'] }],
  moduleOptions: [{ value: '', label: en['kb.module'] }],
  moduleDisabled: false,
  wipLimit: 3,
  grouped: false,
  groupedAvailable: true,
  hasFilters: false,
  onVersion: () => undefined,
  onStatus: () => undefined,
  onModule: () => undefined,
  onSearch: () => undefined,
  onToggleGrouped: () => undefined,
  onClear: () => undefined,
}

function render(overrides: Partial<LoomBoardFiltersProps>): string {
  return renderToStaticMarkup(createElement(LoomBoardFilters, { ...base, ...overrides }))
}

it('renders every secondary filter, the WIP limit and the clear action', () => {
  const html = render({})
  expect(html).toContain(`aria-label="${en['top.version']} ${en['top.allVersions']}"`)
  expect(html).toContain(`aria-label="${en['kb.status']} ${en['kb.allStatuses']}"`)
  expect(html).toContain(`aria-label="${en['kb.module']}"`)
  expect(html).toContain(`placeholder="${en['kb.search']}"`)
  expect(html).toContain(`WIP 3`)
  expect(html).toContain(en['kb.clearFilters'])
  expect(html).toContain(en['kb.groupedToggle'])
  expect(html).toContain('aria-pressed="false"')
})

it('enables clearing only while a filter is active', () => {
  expect(render({ hasFilters: false })).toContain('disabled=""')
  expect(render({ hasFilters: true })).not.toContain('disabled=""')
})

it('reports the active project grouping state', () => {
  expect(render({ grouped: true })).toContain('aria-pressed="true"')
})

it('hides the grouping toggle outside the kanban view', () => {
  expect(render({ groupedAvailable: false })).not.toContain(en['kb.groupedToggle'])
})
