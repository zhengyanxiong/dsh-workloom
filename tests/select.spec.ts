/** @vitest-environment node */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { LoomSelect } from '../src/client/ui/Select.tsx'

const options = [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }]

it('renders a closed custom listbox with the selected label', () => {
  const html = renderToStaticMarkup(createElement(LoomSelect, {
    value: 'b',
    options,
    onChange: () => undefined,
    ariaLabel: 'Choice',
    variant: 'ghost',
    size: 'sm',
    block: true,
    align: 'end',
  }))
  expect(html).toContain('aria-haspopup="listbox"')
  expect(html).toContain('aria-expanded="false"')
  expect(html).toContain('Beta')
  expect(html).not.toContain('Alpha')
  expect(html).not.toContain('role="listbox"')
})

it('honours the disabled state without opening a panel', () => {
  const html = renderToStaticMarkup(createElement(LoomSelect, {
    value: 'a',
    options,
    onChange: () => undefined,
    ariaLabel: 'Choice',
    disabled: true,
  }))
  expect(html).toContain('disabled=""')
  expect(html).toContain('Alpha')
  expect(html).not.toContain('role="listbox"')
})
