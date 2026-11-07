import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import { LoomVersionDetail } from '../../../src/client/features/version/LoomVersionDetail.tsx'
import { en, type LoomKey } from '../../../src/client/shared/locales.ts'
import type { VersionContext } from '../../../src/shared/version-context.ts'
import type { CatalogSnapshot, Lock, ProjectRecord, TaskRecord, VersionRecord, WorkspaceRecord } from 'dsh-workloom/types'

const t = (key: LoomKey, params?: Readonly<Record<string, string>>) => {
  const copy = en[key]
  if (params === undefined) return copy
  return Object.entries(params).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, value), copy)
}
const sourceId = brandString<'loom.source'>('web')
const projectId = brandString<ProjectRecord['id']>('p1')
const versionId = brandString<VersionRecord['id']>('v1')
const project: ProjectRecord = {
  id: projectId,
  config: {
    name: 'Shop',
    sources: [{ id: sourceId, repo: '/repo/shop', path: 'web' }],
    modules: [{ id: brandString<'loom.module'>('frontend'), sourceId, path: 'src/frontend' }],
  },
}
const version: VersionRecord = {
  id: versionId,
  projectId,
  name: 'v2.1',
  description: '维护版本，只接受 bugfix',
  sources: [{ sourceId, ref: 'release/2.1' }],
}
const lockId = brandString<Lock['id']>('lock-1')
const newestLockId = brandString<Lock['id']>('lock-2')
const legacyLock: Lock = { id: lockId, versionId, repositories: [{ sourceId, commit: 'a'.repeat(40) }] }
const newestLock: Lock = { id: newestLockId, versionId, repositories: [{ sourceId, commit: 'b'.repeat(40) }], createdAt: '2026-10-20T08:30:00.000Z' }
const workspaceId = brandString<'loom.workspace'>('w1')
const workspace: WorkspaceRecord = {
  id: workspaceId,
  versionId,
  lockId: newestLockId,
  path: '/work/shop',
  rootPath: '/work/shop',
  mode: 'managed',
  branches: { web: 'loom/v2.1/web-b2' },
  repositories: [{ sourceId, path: 'web', targetPath: '/work/shop/web', kind: 'worktree', branch: 'loom/v2.1/web-b2' }],
}
const cleanedWorkspace: WorkspaceRecord = {
  id: brandString<'loom.workspace'>('w0'), versionId, lockId, path: '/work/shop-old', rootPath: '/work/shop-old', mode: 'managed', cleaned: true,
}
const attempt = (id: Lock['id']) => ({ id: brandString<'loom.attempt'>('a1'), lock: id === lockId ? legacyLock : newestLock, workspaceId, sessionIds: [brandString<'SessionId'>('s1')], status: 'running' as const })
const runningTask: TaskRecord = {
  id: brandString<TaskRecord['id']>('t1'),
  versionId,
  title: 'Checkout 修复',
  status: 'running',
  priority: 'high',
  moduleIds: [brandString<'loom.module'>('frontend')],
  attempts: [attempt(lockId), attempt(newestLockId)],
  updatedAt: '2026-10-21T09:00:00.000Z',
}
const pendingTask: TaskRecord = { id: brandString<TaskRecord['id']>('t2'), versionId, title: '导出优化', status: 'pending', attempts: [] }

const context: VersionContext = {
  projectId: String(projectId),
  projectName: 'Shop',
  versionId: String(versionId),
  versionName: 'v2.1',
  description: '维护版本，只接受 bugfix',
  repositories: [{ sourceId: String(sourceId), path: 'web', ref: 'release/2.1', commit: 'b'.repeat(40) }],
  locks: [
    { id: String(lockId), versionId: String(versionId), repositories: [{ sourceId: String(sourceId), commit: 'a'.repeat(40) }], taskIds: ['t1'] },
    { id: String(newestLockId), versionId: String(versionId), createdAt: '2026-10-20T08:30:00.000Z', repositories: [{ sourceId: String(sourceId), commit: 'b'.repeat(40) }], taskIds: ['t1'] },
  ],
  latestLock: { id: String(newestLockId), versionId: String(versionId), createdAt: '2026-10-20T08:30:00.000Z', repositories: [{ sourceId: String(sourceId), commit: 'b'.repeat(40) }], taskIds: ['t1'] },
  modules: [{ id: 'frontend', sourceId: String(sourceId), path: 'src/frontend' }],
  sameVersionTasks: [
    { id: 't1', title: 'Checkout 修复', status: 'running', lockId: String(newestLockId), branches: [{ sourceId: String(sourceId), branch: 'loom/v2.1/web-b2' }], workspaceCleaned: false },
    { id: 't2', title: '导出优化', status: 'pending', branches: [], workspaceCleaned: false },
  ],
  executions: [],
  render: { tokens: 0, maxTokens: 500, truncated: false },
}

function render(overrides: {
  readonly version?: VersionRecord | undefined
  readonly locks?: readonly Lock[]
  readonly tasks?: readonly TaskRecord[]
  readonly workspaces?: readonly WorkspaceRecord[]
  readonly context?: VersionContext | undefined
} = {}): string {
  const snapshot: CatalogSnapshot = {
    projects: [project],
    versions: [version],
    locks: [...(overrides.locks ?? [legacyLock, newestLock])],
    tasks: [...(overrides.tasks ?? [runningTask, pendingTask])],
    workspaces: [...(overrides.workspaces ?? [workspace, cleanedWorkspace])],
    temporarySessions: [],
    audit: [],
    executions: [],
  }
  const props = {
    t,
    snapshot,
    project,
    version: 'version' in overrides ? overrides.version : version,
    context: 'context' in overrides ? overrides.context : context,
    generateLock: () => Promise.reject(new Error('unused')),
    onLockChanged: () => undefined,
    onCreateTask: () => undefined,
    onEditVersion: () => undefined,
    onSelectTask: () => undefined,
  }
  return renderToStaticMarkup(createElement(LoomVersionDetail, props))
}

it('renders the version configuration, description and repository refs', () => {
  const html = render()
  expect(html).toContain('v2.1')
  expect(html).toContain(en['version.detail'])
  expect(html).toContain('维护版本，只接受 bugfix')
  expect(html).toContain('release/2.1')
  expect(html).toContain('bbbbbbbbbbbb')
  expect(html).toContain(en['version.moduleScope'])
  expect(html).toContain('src/frontend')
})

it('lists every immutable Lock with its timestamp, commits and source task', () => {
  const html = render()
  expect(html).toContain(en['version.lockHistory'])
  expect(html).toContain('lock-1')
  expect(html).toContain('lock-2')
  // The legacy Lock keeps its record but states that the Host stored no time.
  expect(html).toContain(en['version.lockNoTimestamp'])
  expect(html).toContain(en['version.lockLatest'])
  expect(html).toContain(en['version.lockSourceTask'])
  expect(html).toContain('Checkout 修复')
  expect(html).toContain(en['version.lockReferenced'].replace('{count}', '1'))
  expect(html).toContain(en['version.lockReferencedBy'])
  // Newest Lock first: operators act on the head of the history, not the tail.
  expect(html.indexOf('lock-2')).toBeLessThan(html.indexOf('lock-1'))
  // The header owns the regenerate action so a long-lived version can advance
  // its baseline from the version page, not only from the context panel.
  expect(html).toContain(en['lock.regenerate'])
})

it('shows an explicit empty state and Lock call to action before the first Lock', () => {
  const html = render({ locks: [], context: undefined, tasks: [] })
  expect(html).toContain(en['lock.empty'])
  expect(html).toContain(en['lock.new'])
  expect(html).not.toContain(en['lock.regenerate'])
  expect(html).toContain(en['version.noTasks'])
  expect(html).toContain(en['ctx.notInjected'])
})

it('renders tasks with their status and rounds and a version without tasks', () => {
  const html = render()
  expect(html).toContain(en['version.tasks'])
  expect(html).toContain('Checkout 修复')
  expect(html).toContain('导出优化')
  expect(html).toContain(en['sessionList.round'].replace('{round}', '2'))
  expect(html).toContain(en['task.status.running'])
  expect(html).toContain(en['task.status.pending'])
  const empty = render({ tasks: [] })
  expect(empty).toContain(en['version.noTasks'])
})

it('renders version-context facts without inventing occupancy', () => {
  const html = render()
  expect(html).toContain(en['ctx.version'])
  expect(html).toContain(en['ctx.versionDescription'])
  expect(html).toContain(en['ctx.sameVersionTasks'])
  expect(html).toContain(en['ctx.noOccupancy'])
  expect(html).toContain(en['version.contextPreview'])
})

it('renders workspace directories, branches, owners and the unpushed gap', () => {
  const html = render()
  expect(html).toContain(en['version.workspaces'])
  expect(html).toContain('loom/v2.1/web-b2')
  expect(html).toContain(en['workspace.unpushedUnknown'])
  expect(html).toContain(en['workspace.ownerNone'])
  expect(html).toContain(en['workspace.tasks'])
  expect(html).toContain(en['workspace.cleanedNotice'])
})
