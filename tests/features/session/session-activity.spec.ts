import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { LoomSessionActivity, type LoomJobsFace } from '../../../src/client/features/session/LoomSessionActivity.tsx'
import { en, type LoomKey } from '../../../src/client/shared/locales.ts'

const t = (key: LoomKey, params?: Readonly<Record<string, string>>) => {
  const copy = en[key]
  return params === undefined ? copy : Object.entries(params).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, value), copy)
}

it('shows subagents and the current session background jobs', () => {
  const jobs: LoomJobsFace = {
    state: {
      getSnapshot: () => ({ rows: { s1: [{ id: 'job-1', label: 'Build docs', status: 'running', progress: '3/10', startedAt: 1 }] } }),
      subscribe: () => () => {},
    },
    watchRows: () => () => {},
  }
  const html = renderToStaticMarkup(createElement(LoomSessionActivity, {
    t,
    sessionId: 's1' as never,
    subagents: [{ id: 'child-1', label: 'Review tests', mode: 'continuable', running: true }],
    jobs,
    workspaceAccess: { owner: { id: 'owner-1', label: 'Task four' }, waiting: [{ id: 'wait-1', label: 'Task five' }] },
    openSession: () => {},
    forkSession: () => {},
    forking: false,
    canFork: true,
  }))
  expect(html).toContain(en['runtime.title'])
  expect(html).toContain('Review tests')
  expect(html).toContain('Build docs')
  expect(html).toContain('3/10')
  expect(html).toContain(en['runtime.fork'])
  expect(html).toContain('Task four')
  expect(html).toContain('Task five')
})
