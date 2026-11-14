import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import type { LoomJobsFace } from '../../../src/ports/loom-jobs.ts'
import { LoomRunGraph } from '../../../src/client/features/session/LoomRunGraph.tsx'
import { en, type LoomKey } from '../../../src/client/shared/locales.ts'

const t = (key: LoomKey, params?: Readonly<Record<string, string>>) => {
  const template = en[key]
  if (params === undefined) return template
  return Object.entries(params).reduce((text, [name, value]) => text.replace(`{${name}}`, value), template)
}

const jobs: LoomJobsFace = {
  state: {
    getSnapshot: () => ({ rows: {
      root: [{ id: 'root-job', label: 'Build assets', status: 'running', progress: '42%', startedAt: 1 }],
      child: [{ id: 'child-job', label: 'Run tests', status: 'completed', startedAt: 1, finishedAt: 2 }],
    } }),
    subscribe: () => () => {},
  },
  watchRows: () => () => {},
}

it('renders the recursive run tree with session, subagent and job nodes', () => {
  const html = renderToStaticMarkup(createElement(LoomRunGraph, {
    t,
    taskTitle: 'Checkout',
    jobs,
    currentSessionId: 'child',
    rows: [
      { id: 'root', label: 'Main session', running: true, updatedAt: 3 },
      { id: 'child', parentId: 'root', label: 'Workflow agent', running: true, updatedAt: 2, origin: 'subagent', workflowRuns: [{
        sessionId: 'child', runId: 'r1', name: 'review', status: 'running',
        phases: [{ phase: 'analysis', members: [{ seq: 1, label: 'workflow member', childId: 'member', phase: 'analysis', status: 'running' }] }],
      }] },
      { id: 'grandchild', parentId: 'child', label: 'Nested agent', running: false, updatedAt: 1, origin: 'subagent' },
    ],
    onOpenSession: () => {},
  }))
  expect(html).toContain(en['run.title'])
  expect(html).toContain('Main session')
  expect(html).toContain('Workflow agent')
  expect(html).toContain('Nested agent')
  expect(html).toContain('Build assets')
  expect(html).toContain('Run tests')
  expect(html).toContain(en['run.kind.agent'])
  expect(html).toContain(en['run.kind.job'])
  expect(html).toContain(en['run.kind.workflow'])
  expect(html).toContain(en['run.kind.phase'])
  expect(html).toContain('review')
  expect(html).toContain('analysis')
  expect(html).toContain('role="tree"')
  expect(html).toContain('aria-level="3"')
})
