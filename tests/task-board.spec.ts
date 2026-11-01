import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { LoomKanban } from '../src/client/LoomKanban.tsx'
import { TaskBoard } from '../src/client/TaskBoard.tsx'
import { en } from '../src/client/locales.ts'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { BoardTask } from '../src/client/board.ts'
import type { CatalogSnapshot, ProjectRecord, TaskRecord, VersionRecord } from 'dsh-workloom/types'
it('renders five labeled business columns and a real task selection button', () => {
  const task: BoardTask = { id: brandString<BoardTask['id']>('t1'), versionId: brandString<BoardTask['versionId']>('v1'), title: '<Checkout>', status: 'pending', attempts: [] }
  const html = renderToStaticMarkup(createElement(TaskBoard, { tasks: [task], filter: {}, t: key => en[key], onSelect: () => {} }))
  for (const label of ['Pending', 'Running', 'In review', 'Completed', 'Failed']) expect(html).toContain(label)
  expect(html).toContain('&lt;Checkout&gt;')
  expect(html).toContain('<button')
})

it('pulses only cards whose bound native Session is live', () => {
  const project: ProjectRecord = { id: brandString<ProjectRecord['id']>('p1'), config: { name: 'Shop', sources: [], modules: [] } }
  const version: VersionRecord = { id: brandString<VersionRecord['id']>('v1'), projectId: project.id, name: 'v1', description: '', sources: [] }
  const running: TaskRecord = { id: brandString<TaskRecord['id']>('t1'), versionId: version.id, title: 'Checkout', status: 'running', attempts: [] }
  const idle: TaskRecord = { id: brandString<TaskRecord['id']>('t2'), versionId: version.id, title: 'Docs', status: 'running', attempts: [] }
  const snapshot: CatalogSnapshot = { projects: [project], versions: [version], locks: [], tasks: [running, idle], workspaces: [], temporarySessions: [], audit: [], executions: [] }
  const render = (live: ReadonlySet<string>): string => renderToStaticMarkup(createElement(LoomKanban, {
    t: key => en[key], snapshot, liveTaskIds: live, filter: {}, mode: 'flat',
    projectValue: '', versionValue: '', statusValue: '', priorityValue: '', moduleValue: '', searchValue: '', wipLimit: 3,
    onMode: () => undefined, onProject: () => undefined, onVersion: () => undefined, onStatus: () => undefined, onPriority: () => undefined,
    onModule: () => undefined, onSearch: () => undefined, onClearFilters: () => undefined, onSelect: () => undefined, onMove: () => undefined, onNewCard: () => undefined,
  }))
  expect(render(new Set([running.id]))).toContain('loom-kb-card-running')
  expect(render(new Set())).not.toContain('loom-kb-card-running')
})

it('shows the advisory WIP limit and warns when running work exceeds it', () => {
  const project: ProjectRecord = { id: brandString<ProjectRecord['id']>('p1'), config: { name: 'Shop', sources: [], modules: [] } }
  const version: VersionRecord = { id: brandString<VersionRecord['id']>('v1'), projectId: project.id, name: 'v1', description: '', sources: [] }
  const tasks: TaskRecord[] = [1, 2, 3, 4].map(index => ({ id: brandString<TaskRecord['id']>(`t${String(index)}`), versionId: version.id, title: `Task ${String(index)}`, status: 'running', attempts: [] }))
  const snapshot: CatalogSnapshot = { projects: [project], versions: [version], locks: [], tasks, workspaces: [], temporarySessions: [], audit: [], executions: [] }
  const render = (wipLimit: number): string => renderToStaticMarkup(createElement(LoomKanban, {
    t: key => en[key], snapshot, filter: {}, mode: 'flat',
    projectValue: '', versionValue: '', statusValue: '', priorityValue: '', moduleValue: '', searchValue: '', wipLimit,
    onMode: () => undefined, onProject: () => undefined, onVersion: () => undefined, onStatus: () => undefined, onPriority: () => undefined,
    onModule: () => undefined, onSearch: () => undefined, onClearFilters: () => undefined, onSelect: () => undefined, onMove: () => undefined, onNewCard: () => undefined,
  }))
  expect(render(3)).toContain('4/3')
  expect(render(3)).toContain('above the WIP limit')
  expect(render(5)).toContain('WIP limit 5')
  expect(render(5)).not.toContain('above the WIP limit')
  expect(render(5)).toContain('Status')
  expect(render(5)).not.toContain('Clear filters')
})
