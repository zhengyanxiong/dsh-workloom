/** @vitest-environment node */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { CatalogSnapshot, Lock, ProjectRecord, TaskRecord, VersionRecord, WorkspaceRecord } from 'dsh-workloom/types'
import { LoomKanban, LoomKanbanAside } from '../src/client/LoomKanban.tsx'
import { en, type LoomKey } from '../src/client/locales.ts'

const t = (key: LoomKey) => en[key]
const project: ProjectRecord = { id: brandString<'loom.project'>('p1'), config: { name: 'Shop', sources: [], modules: [] } }
const version: VersionRecord = { id: brandString<VersionRecord['id']>('v1'), projectId: project.id, name: 'v1', description: '', sources: [] }
const lock: Lock = { id: brandString<Lock['id']>('lock1'), versionId: version.id, repositories: [] }
const workspace: WorkspaceRecord = {
  id: brandString<WorkspaceRecord['id']>('w1'), versionId: version.id, lockId: lock.id, path: '/tmp/loom/workspace',
  preparation: { status: 'failed', repositories: [], error: 'checkout failed' },
}
const review: TaskRecord = {
  id: brandString<TaskRecord['id']>('t1'), versionId: version.id, title: 'Await approval', status: 'review',
  attempts: [{ id: brandString<'loom.attempt'>('a1'), lock, workspaceId: workspace.id, sessionIds: [], status: 'review' }],
  outcome: { state: 'suggested', agentSummary: 'done' },
}
const running: TaskRecord = {
  id: brandString<TaskRecord['id']>('t2'), versionId: version.id, title: 'Waiting workspace', status: 'running',
  attempts: [{ id: brandString<'loom.attempt'>('a2'), lock, workspaceId: workspace.id, sessionIds: [], status: 'running' }],
}
const snapshot: CatalogSnapshot = {
  projects: [project], versions: [version], locks: [lock], tasks: [review, running], workspaces: [workspace], temporarySessions: [], audit: [], executions: [],
}
const kanbanProps = {
  t, snapshot, filter: {}, mode: 'flat' as const, projectValue: '', versionValue: '', statusValue: '', priorityValue: '', moduleValue: '', searchValue: '', wipLimit: 3,
  onMode: () => undefined, onProject: () => undefined, onVersion: () => undefined, onStatus: () => undefined, onPriority: () => undefined,
  onModule: () => undefined, onSearch: () => undefined, onClearFilters: () => undefined, onSelect: () => undefined, onMove: () => undefined, onNewCard: () => undefined,
}

it('lists blocked cards with their concrete reason instead of a generic warning', () => {
  const html = renderToStaticMarkup(createElement(LoomKanbanAside, { t, snapshot, filter: {}, onSelectSession: () => undefined }))
  expect(html).toContain(en['kb.blocked'])
  expect(html).toContain(en['kb.blockedApproval'])
  expect(html).toContain('Await approval')
  expect(html).toContain(en['kb.blockedBySuggestion'])
  expect(html).toContain(en['kb.blockedWorkspace'])
  expect(html).toContain(en['kb.blockedByPrepareFailed'])
})
it('filters by business status while keeping every other filter available', () => {
  const html = renderToStaticMarkup(createElement(LoomKanban, { ...kanbanProps, filter: { status: 'review' }, statusValue: 'review', projectValue: 'p1' }))
  expect(html).toContain(en['kb.status'])
  expect(html).toContain(en['kb.allStatuses'])
  expect(html).toContain(en['kb.clearFilters'])
  expect(html).toContain('Await approval')
  expect(html).not.toContain('Waiting workspace')
})
it('hides the clear action when no filter is active', () => {
  const html = renderToStaticMarkup(createElement(LoomKanban, kanbanProps))
  expect(html).not.toContain(en['kb.clearFilters'])
})
