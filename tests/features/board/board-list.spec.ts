/** @vitest-environment node */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { CatalogSnapshot, ProjectRecord, TaskRecord, VersionRecord } from 'dsh-workloom/types'
import type { BoardColumn } from '../../../src/client/features/board/board.ts'
import { LoomBoardList } from '../../../src/client/features/board/LoomBoardList.tsx'
import { en, type LoomKey } from '../../../src/client/shared/locales.ts'

const t = (key: LoomKey) => en[key]
const project: ProjectRecord = { id: brandString<'loom.project'>('p1'), config: { name: 'Shop', sources: [], modules: [] } }
const version: VersionRecord = { id: brandString<VersionRecord['id']>('v1'), projectId: project.id, name: 'v1', description: '', sources: [] }
const lock = { id: brandString<'loom.lock'>('lock1'), versionId: version.id, repositories: [] }
const sessionId = brandString<'SessionId'>('session-48b1-very-long')
const attempt = { id: brandString<'loom.attempt'>('a1'), lock, workspaceId: brandString<'loom.workspace'>('w1'), sessionIds: [sessionId], status: 'running' as const }
const running: TaskRecord = {
  id: brandString<TaskRecord['id']>('t1'), versionId: version.id, title: 'Checkout', description: 'Build the flow',
  status: 'running', priority: 'high', attempts: [attempt],
}
const review: TaskRecord = {
  id: brandString<TaskRecord['id']>('t2'), versionId: version.id, title: 'Await approval', status: 'review',
  attempts: [{ ...attempt, status: 'review' }], outcome: { state: 'suggested' },
}
const snapshot: CatalogSnapshot = {
  projects: [project], versions: [version], locks: [lock], tasks: [running, review],
  workspaces: [], temporarySessions: [], audit: [], executions: [],
}
const columns: readonly BoardColumn[] = [
  { status: 'running', tasks: [running] },
  { status: 'pending', tasks: [] },
  { status: 'review', tasks: [review] },
  { status: 'completed', tasks: [] },
  { status: 'failed', tasks: [] },
]

function render(boardColumns: readonly BoardColumn[] = columns): string {
  return renderToStaticMarkup(createElement(LoomBoardList, {
    t,
    snapshot,
    columns: boardColumns,
    versionNames: new Map([[version.id, version.name]]),
    projectNames: new Map([[version.id, project.config.name]]),
    sessionByTask: new Map([[running.id, sessionId]]),
    newTaskProject: project,
    onSelect: () => undefined,
    onNewCard: () => undefined,
  }))
}

it('renders the dense grouped table with the six list columns', () => {
  const html = render()
  for (const key of ['kb.columnTask', 'kb.columnStatus', 'kb.columnPriority', 'kb.columnProject', 'kb.columnSessions', 'kb.columnUpdated'] as const) {
    expect(html).toContain(en[key])
  }
  expect(html).toContain(en['kb.listSummary'].replace('{count}', '2'))
  expect(html).toContain(en['kb.listGrouped'])
  expect(html).toContain(en['kb.listSort'])
})

it('groups rows by business status and keeps every row a real button', () => {
  const html = render()
  expect(html).toContain(en['task.status.running'])
  expect(html).toContain(en['task.status.review'])
  expect(html).toContain('Checkout')
  expect(html).toContain('Build the flow')
  expect(html).toContain('Shop')
  expect(html).toContain('session-48b1')
  expect(html).toContain('data-loom-hover="row"')
  expect((html.match(/<button/g) ?? []).length).toBeGreaterThanOrEqual(2)
})

it('shows real evidence under the status of a review row', () => {
  expect(render()).toContain(en['kb.evidence.noTests'])
})

it('falls back to the shared empty state without any task', () => {
  const empty = columns.map(column => ({ ...column, tasks: [] }))
  const html = render(empty)
  expect(html).toContain(en['kb.empty'])
  expect(html).toContain(en['kb.listHint'])
})
