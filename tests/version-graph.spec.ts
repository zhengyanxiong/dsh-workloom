import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import { LoomVersionGraph } from '../src/client/LoomVersionGraph.tsx'
import { en, type LoomKey } from '../src/client/locales.ts'
import type { CatalogSnapshot, Lock, TaskRecord, VersionRecord, WorkspaceRecord } from 'dsh-workloom/types'

const t = (key: LoomKey) => en[key]
const versionId = brandString<VersionRecord['id']>('v1')
const lock: Lock = { id: brandString<Lock['id']>('lock1'), versionId, repositories: [{ sourceId: brandString<'loom.source'>('web'), commit: 'a'.repeat(40) }] }
const workspace: WorkspaceRecord = { id: brandString<WorkspaceRecord['id']>('w1'), versionId, lockId: lock.id, path: '/work/task-a' }
const task: TaskRecord = {
  id: brandString<TaskRecord['id']>('t1'), versionId, title: 'Checkout', status: 'running',
  attempts: [{ id: brandString<'loom.attempt'>('a1'), lock, workspaceId: workspace.id, sessionIds: [brandString<'SessionId'>('s1')], status: 'running' }],
}
const snapshot: CatalogSnapshot = {
  projects: [], versions: [{ id: versionId, projectId: brandString<'loom.project'>('p1'), name: 'v1', description: '', sources: [] }],
  locks: [lock], tasks: [task], workspaces: [workspace], temporarySessions: [], audit: [],
  executions: [{
    workspaceId: workspace.id,
    generation: 1 as never,
    owner: { workspaceId: workspace.id, sessionId: brandString<'SessionId'>('s1'), generation: 1 as never },
    waiting: [brandString<'SessionId'>('s2')], takeover: null,
  }],
}

it('draws tasks, workspaces and the Session that owns each workspace', () => {
  const html = renderToStaticMarkup(createElement(LoomVersionGraph, {
    t,
    snapshot,
    version: snapshot.versions[0]!,
    sessionLabel: id => id === 's1' ? 'Build agent' : 'Review agent',
    runningSessionIds: new Set(['s1']),
    onSelectTask: () => {},
  }))
  expect(html).toContain(en['graph.title'])
  expect(html).toContain('Checkout')
  expect(html).toContain('/work/task-a')
  expect(html).toContain('Build agent')
  expect(html).toContain('Review agent')
})
