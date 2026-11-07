import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { BoardTask } from '../../../src/client/features/board/board.ts'
import type { CatalogSnapshot, ProjectRecord, TaskRecord, VersionRecord } from 'dsh-workloom/types'
import { LoomKanban } from '../../../src/client/features/board/LoomKanban.tsx'
import { TaskBoard } from '../../../src/client/features/board/TaskBoard.tsx'
import { en, type LoomKey } from '../../../src/client/shared/locales.ts'

const t = (key: LoomKey) => en[key]
const project: ProjectRecord = { id: brandString<ProjectRecord['id']>('p1'), config: { name: 'Shop', sources: [], modules: [] } }
const version: VersionRecord = { id: brandString<VersionRecord['id']>('v1'), projectId: project.id, name: 'v1', description: '', sources: [] }

function snapshotOf(tasks: readonly TaskRecord[]): CatalogSnapshot {
  return { projects: [project], versions: [version], locks: [], tasks: [...tasks], workspaces: [], temporarySessions: [], audit: [], executions: [] }
}

function kanbanHtml(snapshot: CatalogSnapshot, overrides: { liveTaskIds?: ReadonlySet<string>; wipLimit?: number; boardView?: 'kanban' | 'list' } = {}): string {
  return renderToStaticMarkup(createElement(LoomKanban, {
    t, snapshot, liveTaskIds: overrides.liveTaskIds, filter: {}, mode: 'flat', boardView: overrides.boardView ?? 'kanban',
    projectValue: '', versionValue: '', statusValue: '', priorityValue: '', moduleValue: '', searchValue: '',
    wipLimit: overrides.wipLimit ?? 3,
    onMode: () => undefined, onBoardView: () => undefined, onProject: () => undefined, onVersion: () => undefined,
    onStatus: () => undefined, onPriority: () => undefined, onModule: () => undefined, onSearch: () => undefined,
    onClearFilters: () => undefined, onSelect: () => undefined, onMove: () => undefined, onNewCard: () => undefined,
  }))
}

it('renders five labeled business columns and a real task selection button', () => {
  const task: BoardTask = { id: brandString<BoardTask['id']>('t1'), versionId: brandString<BoardTask['versionId']>('v1'), title: '<Checkout>', status: 'pending', attempts: [] }
  const html = renderToStaticMarkup(createElement(TaskBoard, { tasks: [task], filter: {}, t, onSelect: () => {} }))
  for (const label of ['Pending', 'Running', 'In review', 'Completed', 'Failed']) expect(html).toContain(label)
  expect(html).toContain('&lt;Checkout&gt;')
  expect(html).toContain('<button')
})

it('marks only cards whose bound native Session is live', () => {
  const running: TaskRecord = { id: brandString<TaskRecord['id']>('t1'), versionId: version.id, title: 'Checkout', status: 'running', attempts: [] }
  const idle: TaskRecord = { id: brandString<TaskRecord['id']>('t2'), versionId: version.id, title: 'Docs', status: 'running', attempts: [] }
  const snapshot = snapshotOf([running, idle])
  expect(kanbanHtml(snapshot, { liveTaskIds: new Set([running.id]) })).toContain('data-loom-running="true"')
  expect(kanbanHtml(snapshot, { liveTaskIds: new Set() })).not.toContain('data-loom-running="true"')
})

it('shows the advisory WIP limit and warns when running work exceeds it', () => {
  const tasks: TaskRecord[] = [1, 2, 3, 4].map(index => ({
    id: brandString<TaskRecord['id']>(`t${String(index)}`),
    versionId: version.id,
    title: `Task ${String(index)}`,
    status: 'running',
    attempts: [],
  }))
  const snapshot = snapshotOf(tasks)
  expect(kanbanHtml(snapshot, { wipLimit: 3 })).toContain('4/3')
  expect(kanbanHtml(snapshot, { wipLimit: 3 })).toContain('above the WIP limit')
  expect(kanbanHtml(snapshot, { wipLimit: 5 })).toContain('WIP limit 5')
  expect(kanbanHtml(snapshot, { wipLimit: 5 })).not.toContain('above the WIP limit')
})

it('keeps the advanced filters behind an explicit toggle until opened', () => {
  const task: TaskRecord = { id: brandString<TaskRecord['id']>('t1'), versionId: version.id, title: 'Checkout', status: 'running', attempts: [] }
  const html = kanbanHtml(snapshotOf([task]))
  expect(html).toContain(`aria-label="${en['kb.filter']}"`)
  expect(html).toContain('aria-expanded="false"')
  expect(html).not.toContain(en['kb.clearFilters'])
  expect(html).toContain(en['kb.boardHint'])
})

it('renders the dense list when the board view selects it', () => {
  const task: TaskRecord = { id: brandString<TaskRecord['id']>('t1'), versionId: version.id, title: 'Checkout', status: 'running', attempts: [] }
  const html = kanbanHtml(snapshotOf([task]), { boardView: 'list' })
  expect(html).toContain(en['kb.listGrouped'])
  expect(html).toContain(en['kb.columnTask'])
  expect(html).toContain(en['kb.columnStatus'])
  expect(html).not.toContain(`aria-label="${en['task.status.running']}"`)
})
