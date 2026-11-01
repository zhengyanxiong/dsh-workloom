import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { TaskStatusDot } from '../src/client/LoomStatusDot.tsx'

it('animates only when the Session is actually running', () => {
  const live = renderToStaticMarkup(createElement(TaskStatusDot, { status: 'running', live: true }))
  expect(live).toContain('<svg')
  expect(live).toContain('data-state="ongoing"')
  const idle = renderToStaticMarkup(createElement(TaskStatusDot, { status: 'running', live: false }))
  expect(idle).not.toContain('<svg')
  expect(idle).toContain('width:6px')
  expect(idle).toContain('background:var(--loom-accent)')
  const completed = renderToStaticMarkup(createElement(TaskStatusDot, { status: 'completed', live: false }))
  expect(completed).toContain('data-state="done"')
})
