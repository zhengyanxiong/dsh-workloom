import { expect, it } from 'vitest'
import { brandNumber, brandString } from '@deepseek-ai/dsh-brand'
import type { CatalogSnapshot, Lock, ProjectRecord, TaskRecord, VersionRecord } from 'dsh-workloom/types'
import { activeWorkspaceCount, aggregateTokenUsage, boardMetrics, boundSessions, currentLock, lockTasks, lockWorkspaces, projectLanes, taskAttemptRows, taskSessionRows, versionLocks, versionOccupancy, versionRepositoryRows, versionWorkspaceRows, workspaceName } from '../src/client/projection.ts'
const projectId = brandString<ProjectRecord['id']>('p1')
const versionId = brandString<VersionRecord['id']>('v1')
const lock: Lock = { id: brandString<Lock['id']>('l1'), versionId, repositories: [{ sourceId: brandString<'loom.source'>('web'), commit: 'a'.repeat(40) }] }
const project: ProjectRecord = { id: projectId, config: { name: 'Shop', sources: [{ id: brandString<'loom.source'>('web'), repo: '/repo', path: 'web' }], modules: [] } }
const version: VersionRecord = { id: versionId, projectId, name: 'v1', sources: [{ sourceId: brandString<'loom.source'>('web'), ref: 'main' }] }
const task = (id: string, status: TaskRecord['status'], sessionIds: string[] = []): TaskRecord => ({ id: brandString<TaskRecord['id']>(id), versionId, title: id, status, attempts: status === 'pending' ? [] : [{ id: brandString<'loom.attempt'>('a1'), lock, workspaceId: brandString<'loom.workspace'>('w1'), sessionIds: sessionIds.map(value => brandString<'SessionId'>(value)), status: status === 'review' ? 'review' : 'running' }] })
const snapshot: CatalogSnapshot = { projects: [project], versions: [version], locks: [lock], workspaces: [{ id: brandString<'loom.workspace'>('w1'), path: '/tmp/w1', versionId, lockId: lock.id }], tasks: [task('one', 'running', ['s1']), task('two', 'review'), task('three', 'pending')], temporarySessions: [], audit: [], executions: [] }
it('groups cards by project and keeps empty status columns', () => {
  const lanes = projectLanes(snapshot, {})
  expect(lanes).toHaveLength(1)
  expect(lanes[0]?.count).toBe(3)
  expect(lanes[0]?.columns.map(column => column.status)).toEqual(['pending', 'running', 'review', 'completed', 'failed'])
})
it('counts cards, Sessions and active workspaces', () => {
  expect(boardMetrics(snapshot, {})).toMatchObject({ cards: 3, running: 1, review: 1, activeSessions: 1 })
  expect(activeWorkspaceCount(snapshot)).toBe(1)
  expect(boundSessions(snapshot).map(row => row.sessionId)).toEqual(['s1'])
})
it('resolves the latest Lock and keeps pending tasks without one', () => {
  expect(currentLock(snapshot, snapshot.tasks[0])?.id).toBe(lock.id)
  expect(currentLock(snapshot, snapshot.tasks[2])).toBeUndefined()
})
it('filters lanes and metrics by project and version', () => {
  expect(projectLanes(snapshot, { projectId: brandString<ProjectRecord['id']>('missing') })).toEqual([])
  expect(boardMetrics(snapshot, { versionId: brandString<VersionRecord['id']>('other') }).cards).toBe(0)
})
it('filters cards by priority and module while searching descriptions', () => {
  const moduleId = brandString<'loom.module'>('api')
  const tagged: TaskRecord = { ...task('four', 'pending'), description: 'Review totals', priority: 'high', moduleIds: [moduleId] }
  const rows = { ...snapshot, tasks: [...snapshot.tasks, tagged] }
  expect(boardMetrics(rows, { priority: 'high' })).toMatchObject({ cards: 1 })
  expect(boardMetrics(rows, { priority: 'normal' }).cards).toBe(3)
  expect(boardMetrics(rows, { moduleId: 'api' }).cards).toBe(1)
  expect(boardMetrics(rows, { search: 'totals' }).cards).toBe(1)
})

it('lists only Loom task Sessions in the task sidebar', () => {
  const rows = [1, 2, 3, 4, 5, 6, 7].map(index => ({ id: `s${String(index)}`, displayTitle: `Session ${String(index)}`, cwd: `/work/space-${String(index)}`, updatedAt: index, running: index === 7 }))
  const bound = new Set(['s2', 's5', 's7'])
  expect(taskSessionRows(rows, bound, '').map(row => row.id)).toEqual(['s7', 's5', 's2'])
  expect(taskSessionRows(rows, bound, '', 2).map(row => row.id)).toEqual(['s7', 's5'])
  expect(taskSessionRows(rows, bound, 'session 5').map(row => row.id)).toEqual(['s5'])
  expect(taskSessionRows(rows, new Set(), '').map(row => row.id)).toEqual([])
  const labeled = taskSessionRows([{ id: 'x', displayTitle: 'X', cwd: '/a/b/', updatedAt: 1, running: false }], new Set(['x']), '')
  expect(workspaceName(labeled[0]?.cwd)).toBe('b')
  expect(workspaceName(undefined)).toBeUndefined()
  expect(taskSessionRows([
    { id: 'blank', displayTitle: 'blank', updatedAt: 9, running: false, blank: true },
    { id: 'child', displayTitle: 'child', updatedAt: 8, running: false, origin: 'subagent' },
    { id: 'real', displayTitle: 'real', updatedAt: 7, running: false },
  ], new Set(['blank', 'child', 'real']), '').map(row => row.id)).toEqual(['real'])
})
it('aggregates provider token usage and ignores missing projections', () => {
  const first = { tokenUsage: { uncachedInputTokens: 10, outputTokens: 4, cacheReadTokens: 2, cacheWriteTokens: 1 } }
  const second = { tokenUsage: { uncachedInputTokens: 5, outputTokens: 6, cacheReadTokens: 0, cacheWriteTokens: 0 } }
  expect(aggregateTokenUsage([first, undefined, second])).toEqual({ uncachedInputTokens: 15, outputTokens: 10, cacheReadTokens: 2, cacheWriteTokens: 1 })
  expect(aggregateTokenUsage([undefined, {}])).toBeUndefined()
})

it('lists every Lock of a version, its tasks and its referenced uncleaned workspaces', () => {
  const secondLock: Lock = { id: brandString<Lock['id']>('l2'), versionId, repositories: [{ sourceId: brandString<'loom.source'>('web'), commit: 'b'.repeat(40) }] }
  const rows = { ...snapshot, locks: [lock, secondLock], tasks: [task('four', 'completed', ['s2'])] }
  expect(versionLocks(rows, versionId).map(row => row.id)).toEqual([lock.id, secondLock.id])
  expect(versionLocks(rows, brandString<VersionRecord['id']>('missing'))).toEqual([])
  expect(lockTasks(rows, lock.id).map(row => row.id)).toEqual(['four'])
  expect(lockWorkspaces(rows, lock.id).map(row => row.id)).toEqual(['w1'])
  const cleaned = { ...rows, workspaces: rows.workspaces.map(row => ({ ...row, cleaned: true })) }
  expect(lockWorkspaces(cleaned, lock.id)).toEqual([])
})

it('pairs each repository with its version ref and latest Lock commit', () => {
  const rows = versionRepositoryRows(project, version, lock)
  expect(rows).toEqual([{ sourceId: 'web', path: 'web', repo: '/repo', ref: 'main', commit: 'a'.repeat(40) }])
  expect(versionRepositoryRows(project, version, undefined)[0]?.commit).toBeUndefined()
  expect(versionRepositoryRows(undefined, version, lock)).toEqual([])
})

it('projects all execution rounds and every Session with real state', () => {
  const multi: TaskRecord = {
    ...task('four', 'running', ['s1', 's2']),
    attempts: [
      { id: brandString<'loom.attempt'>('a1'), lock, workspaceId: brandString<'loom.workspace'>('w1'), sessionIds: [brandString<'SessionId'>('s1')], status: 'review' },
      { id: brandString<'loom.attempt'>('a2'), lock, workspaceId: brandString<'loom.workspace'>('w1'), sessionIds: [brandString<'SessionId'>('s2')], status: 'running' },
    ],
  }
  const lookup = (id: string) => id === 's2' ? { running: true, displayTitle: 'Current' } : undefined
  const rows = taskAttemptRows(multi, lookup, new Set())
  expect(rows.map(row => row.round)).toEqual([1, 2])
  expect(rows.map(row => row.latest)).toEqual([false, true])
  expect(rows[0]?.sessions[0]).toMatchObject({ sessionId: 's1', running: false, available: false, unavailableReason: 'missing' })
  expect(rows[1]?.sessions[0]).toMatchObject({ sessionId: 's2', running: true, available: true })
  expect(taskAttemptRows(multi, lookup, new Set(['s2']))[1]?.sessions[0]).toMatchObject({ available: false, unavailableReason: 'failed' })
  expect(taskAttemptRows(undefined, lookup, new Set())).toEqual([])
})

it('lists a version workspace with its tasks, owner and queued Sessions', () => {
  const workspace = brandString<'loom.workspace'>('w1')
  const generation = brandNumber<'loom.execution-generation'>(2)
  const executions = [{ workspaceId: workspace, generation, owner: { workspaceId: workspace, sessionId: brandString<'SessionId'>('owner'), generation }, waiting: [brandString<'SessionId'>('waiting')], takeover: null }]
  const withExecution = { ...snapshot, executions }
  const rows = versionWorkspaceRows(withExecution, versionId)
  expect(rows.map(row => row.workspace.id)).toEqual(['w1'])
  expect(rows[0]?.ownerSessionId).toBe('owner')
  expect(rows[0]?.waiting).toBe(1)
  expect(rows[0]?.tasks.map(link => link.task.id)).toEqual(['one', 'two'])
  expect(versionWorkspaceRows(withExecution, brandString<VersionRecord['id']>('missing'))).toEqual([])
  const occ = versionOccupancy(withExecution, versionId)
  expect(occ).toHaveLength(1)
  expect(occ[0]).toMatchObject({ occupied: true, waiting: 1 })
})

it('orders uncleaned workspaces before cleaned history', () => {
  const rows = { ...snapshot, workspaces: [
    { id: brandString<'loom.workspace'>('w2'), path: '/tmp/w2', versionId, lockId: lock.id, cleaned: true },
    { id: brandString<'loom.workspace'>('w1'), path: '/tmp/w1', versionId, lockId: lock.id },
  ] }
  expect(versionWorkspaceRows(rows, versionId).map(row => row.workspace.id)).toEqual(['w1', 'w2'])
})
