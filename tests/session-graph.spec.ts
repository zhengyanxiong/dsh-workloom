import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { LoomSessionGraph, type LoomTaskSessionRow } from '../src/client/features/session/LoomSessionGraph.tsx'
import { en, type LoomKey } from '../src/client/locales.ts'

const t = (key: LoomKey, params?: Readonly<Record<string, string>>) => {
  const copy = en[key]
  return params === undefined ? copy : Object.entries(params).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, value), copy)
}
const rows: LoomTaskSessionRow[] = [
  { id: 'root', label: 'Root session', running: true, updatedAt: Date.UTC(2026, 9, 31, 14, 32) },
  { id: 'child', parentId: 'root', label: 'Forked session', running: false, updatedAt: Date.UTC(2026, 9, 31, 14, 31) },
]
const execution = {
  workspaceId: 'w1', generation: 1 as never,
  owner: { workspaceId: 'w1', sessionId: 'root', generation: 1 as never },
  waiting: ['child'], takeover: null,
} as never

it('shows fork relationships, queue position and latest activity time', () => {
  const html = renderToStaticMarkup(createElement(LoomSessionGraph, {
    t, taskTitle: 'Task A', rows, execution, currentSessionId: 'root', onOpenSession: () => {},
  }))
  expect(html).toContain('Root session')
  expect(html).toContain('Forked session')
  expect(html).toContain('Fork')
  expect(html).toContain('queue #1')
  expect(html).toMatch(/latest \d{2}:\d{2}/u)
})

it('groups sessions by task and renders the execution gate owner and queue', () => {
  const html = renderToStaticMarkup(createElement(LoomSessionGraph, {
    t, taskTitle: 'Task A', workspaceLabel: 'v0.1-auto', rows,
    groups: [
      { taskId: 'a', taskTitle: 'Task A', rows },
      { taskId: 'b', taskTitle: 'Task B', rows: [{ id: 'other', label: 'Other session', running: false, updatedAt: Date.UTC(2026, 9, 31, 14, 20) }] },
    ],
    execution, currentSessionId: 'root', onOpenSession: () => {},
  }))
  expect(html).toContain('Task A')
  expect(html).toContain('Task B')
  expect(html).toContain('Execution gate')
  expect(html).toContain('v0.1-auto')
  expect(html).toContain('owner')
  expect(html).toContain('queue #1')
})
