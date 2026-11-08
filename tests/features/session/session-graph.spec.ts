import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { LoomSessionGraph, type LoomTaskSessionRow } from '../../../src/client/features/session/LoomSessionGraph.tsx'
import { en, type LoomKey } from '../../../src/client/shared/locales.ts'

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
  expect(html).toContain('2 sessions')
  expect(html).toContain('1 session')
  expect(html).toContain('Task A')
  expect(html).toContain('Task B')
  expect(html).toContain('Execution gate')
  expect(html).toContain('v0.1-auto')
  expect(html).toContain('owner')
  expect(html).toContain('queue #1')
})

it('offers release, queue and leave-queue actions from per-session execution state', () => {
  const html = renderToStaticMarkup(createElement(LoomSessionGraph, {
    t, taskTitle: 'Task A', rows, execution,
    sessionStates: {
      root: { isOwner: true, waiting: false, queueIndex: -1, hasOwner: true },
      child: { isOwner: false, waiting: true, queueIndex: 0, hasOwner: true },
    },
    busySessionId: undefined,
    onReleaseSession: () => {}, onQueueSession: () => {}, onLeaveQueue: () => {},
    currentSessionId: 'root', onOpenSession: () => {},
  }))
  expect(html).toContain(en['bottom.sessionReleaseAccess'])
  expect(html).toContain(en['bottom.sessionLeaveQueue'])
})

const archivedRows: LoomTaskSessionRow[] = [
  ...rows,
  { id: 'gone', label: 'Archived session', running: false, updatedAt: Date.UTC(2026, 9, 30, 9, 0), archived: true },
]

it('hides archived Sessions until the archived toggle reveals them', () => {
  const hidden = renderToStaticMarkup(createElement(LoomSessionGraph, {
    t, taskTitle: 'Task A', rows: archivedRows, execution, currentSessionId: 'root', onOpenSession: () => {},
    archivedSessionIds: new Set(['gone']), showArchived: false, onToggleArchived: () => {},
  }))
  expect(hidden).not.toContain('Archived session')
  expect(hidden).toContain(en['session.archivedShow'].replace('{count}', '1'))
  expect(hidden).not.toContain(en['session.archivedHide'])
  const shown = renderToStaticMarkup(createElement(LoomSessionGraph, {
    t, taskTitle: 'Task A', rows: archivedRows, execution, currentSessionId: 'root', onOpenSession: () => {},
    archivedSessionIds: new Set(['gone']), showArchived: true, onToggleArchived: () => {},
  }))
  expect(shown).toContain('Archived session')
  expect(shown).toContain(en['session.archived'])
  expect(shown).toContain(en['session.archivedHide'])
})

it('renders the archive action on live rows and the restore action on archived rows', () => {
  const live = renderToStaticMarkup(createElement(LoomSessionGraph, {
    t, taskTitle: 'Task A', rows, execution, currentSessionId: 'root', onOpenSession: () => {},
    archivedSessionIds: new Set<string>(), onArchiveSession: () => {}, onUnarchiveSession: () => {},
  }))
  expect(live).toContain(`aria-label="${en['session.archive']}"`)
  expect(live).not.toContain(`aria-label="${en['session.unarchive']}"`)
  const archived = renderToStaticMarkup(createElement(LoomSessionGraph, {
    t, taskTitle: 'Task A', rows: archivedRows, execution, currentSessionId: 'root', onOpenSession: () => {},
    archivedSessionIds: new Set(['gone']), showArchived: true, onToggleArchived: () => {},
    onArchiveSession: () => {}, onUnarchiveSession: () => {},
  }))
  expect(archived).toContain(`aria-label="${en['session.unarchive']}"`)
})

it('blocks archiving the execution owner and queued Sessions', () => {
  const html = renderToStaticMarkup(createElement(LoomSessionGraph, {
    t, taskTitle: 'Task A', rows, execution, currentSessionId: 'root', onOpenSession: () => {},
    sessionStates: {
      root: { isOwner: true, waiting: false, queueIndex: -1, hasOwner: true },
      child: { isOwner: false, waiting: true, queueIndex: 0, hasOwner: true },
    },
    archivedSessionIds: new Set<string>(), onArchiveSession: () => {},
  }))
  expect(html.match(/aria-label="Archive session" title="[^"]*" disabled=""/gu)).toHaveLength(2)
  expect(html).toContain(en['session.archiveBlocked'])
})
