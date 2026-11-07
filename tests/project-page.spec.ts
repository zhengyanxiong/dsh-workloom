/** @vitest-environment node */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { CatalogSnapshot, ProjectRecord, TaskRecord, VersionRecord } from 'dsh-workloom/types'
import { LoomProjectPage } from '../src/client/features/project/LoomProjectPage.tsx'
import { en, type LoomKey } from '../src/client/locales.ts'

const t = (key: LoomKey) => en[key]
const project: ProjectRecord = { id: brandString<'loom.project'>('p1'), config: { name: 'Shop', sources: [{ id: 'web', repo: '/repos/web', path: '.' }], modules: [] } }
const version: VersionRecord = { id: brandString<VersionRecord['id']>('v1'), projectId: project.id, name: 'v1', description: 'Checkout work', sources: [] }
const lock = { id: brandString<'loom.lock'>('lock1'), versionId: version.id, repositories: [{ sourceId: brandString<'loom.source'>('web'), commit: 'abcdef1234567' }] }
const sessionId = brandString<'SessionId'>('session-1')
const workspaceId = brandString<'loom.workspace'>('w1')
const workspace = { id: workspaceId, versionId: version.id, lock, rootPath: '/worktrees/shop', path: '/worktrees/shop', preparation: { status: 'ready' as const, at: 0 } }
const attempt = { id: brandString<'loom.attempt'>('a1'), lock, workspaceId, sessionIds: [sessionId], status: 'running' as const }
const running: TaskRecord = { id: brandString<TaskRecord['id']>('t1'), versionId: version.id, title: 'Checkout', status: 'running', priority: 'high', attempts: [attempt] }
const review: TaskRecord = { id: brandString<TaskRecord['id']>('t2'), versionId: version.id, title: 'Await approval', status: 'review', attempts: [{ ...attempt, status: 'review' }] }
const snapshot: CatalogSnapshot = {
  projects: [project], versions: [version], locks: [lock], tasks: [running, review],
  workspaces: [workspace], temporarySessions: [], audit: [], executions: [],
}

function render(): string {
  return renderToStaticMarkup(createElement(LoomProjectPage, {
    t,
    snapshot,
    project,
    version,
    onProject: () => undefined,
    onVersion: () => undefined,
    onTask: () => undefined,
    onBoard: () => undefined,
    onNewTask: () => undefined,
    onNewVersion: () => undefined,
    onEditProject: () => undefined,
    onEditVersion: () => undefined,
  }))
}

it('renders five project counters in one quiet row', () => {
  const html = render()
  for (const key of ['project.subProjects', 'project.versions', 'nav.tasks', 'kb.running', 'sessions'] as const) {
    expect(html).toContain(en[key])
  }
  expect(html).not.toContain(en['project.activeWork'])
})

it('shows the current-version status counts inline in the tasks header', () => {
  const html = render()
  expect(html).toContain('role="group"')
  expect(html).toContain(en['project.taskDistribution'])
  expect(html).toContain(en['task.status.running'])
  expect(html).toContain(en['task.status.review'])
  expect(html).not.toContain(en['task.status.completed'])
  expect(html).toContain(en['version.edit'])
  expect(html).toContain('abcdef1')
  expect(html).toContain(en['project.sessionRound'].replace('{round}', '1'))
})
