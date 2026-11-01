import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import { LoomTaskWorkbench } from '../src/client/LoomTaskWorkbench.tsx'
import { en, type LoomKey } from '../src/client/locales.ts'
import type { ExecutionActions } from '../src/client/LoomExecution.tsx'
import type { CatalogSnapshot, Lock, ProjectRecord, TaskRecord, VersionRecord, WorkspaceRecord } from 'dsh-workloom/types'

const t = (key: LoomKey) => en[key]
const versionId = brandString<VersionRecord['id']>('v1')
const sourceId = brandString<'loom.source'>('web')
const lock: Lock = { id: brandString<Lock['id']>('lock1'), versionId, repositories: [{ sourceId, commit: 'a'.repeat(40) }] }
const project: ProjectRecord = {
  id: brandString<'loom.project'>('p1'),
  config: { name: 'Shop', sources: [{ id: sourceId, repo: brandString<'loom.repo'>('/repo'), path: 'web' }], modules: [] },
}
const version: VersionRecord = { id: versionId, projectId: project.id, name: 'v1', description: '', sources: [{ sourceId, ref: 'main' }] }
const workspace: WorkspaceRecord = { id: brandString<WorkspaceRecord['id']>('w1'), versionId, lockId: lock.id, path: '/tmp/loom/workspace' }
const task: TaskRecord = {
  id: brandString<TaskRecord['id']>('t1'),
  versionId,
  title: 'Checkout',
  status: 'running',
  description: 'Wire the checkout total.\n- [x] server total\n- [ ] refund copy',
  attempts: [{ id: brandString<'loom.attempt'>('a1'), lock, workspaceId: workspace.id, sessionIds: [brandString<'SessionId'>('s1')], status: 'running' }],
}
const snapshot: CatalogSnapshot = { projects: [project], versions: [version], locks: [lock], tasks: [task], workspaces: [workspace], temporarySessions: [], audit: [], executions: [] }

it('renders one task brief with checklist items and keeps execution before acceptance', () => {
  const html = renderToStaticMarkup(createElement(LoomTaskWorkbench, {
    t,
    task,
    project,
    version,
    snapshot,
    audit: [],
    actions: {} as ExecutionActions,
    loadChanges: () => Promise.reject(new Error('unused')),
    wrap: false,
    onToggleWrap: () => {},
    attemptRows: [],
    onOpenSession: () => {},
  }))
  expect(html).toContain('Wire the checkout total.')
  expect(html).toContain('server total')
  expect(html).toContain('refund copy')
  expect(html).not.toContain(en['workbench.noAcceptance'])
  expect(html.indexOf(en['workbench.execution'])).toBeLessThan(html.indexOf(en['outcome.title']))
})
