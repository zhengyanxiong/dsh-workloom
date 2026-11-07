/** @vitest-environment node */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { brandString, brandNumber } from '@deepseek-ai/dsh-brand'
import type { CatalogSnapshot, ExecutionState, Lock, TaskRecord, VersionRecord, WorkspaceRecord } from 'dsh-workloom/types'
import { boardEvidence } from '../../../src/client/features/board/board-evidence.ts'

const version: VersionRecord = { id: brandString<VersionRecord['id']>('v1'), projectId: brandString<'loom.project'>('p1'), name: 'v1', description: '', sources: [] }
const lock: Lock = { id: brandString<Lock['id']>('lock1'), versionId: version.id, repositories: [] }
const workspace: WorkspaceRecord = { id: brandString<WorkspaceRecord['id']>('w1'), versionId: version.id, lockId: lock.id, path: '/tmp/w', mode: 'managed' }
const owner = brandString<'SessionId'>('s-owner')
const queued = brandString<'SessionId'>('s-queued')
const generation = brandNumber<'loom.execution-generation'>(1)
const execution: ExecutionState = { workspaceId: workspace.id, generation, owner: { workspaceId: workspace.id, sessionId: owner, generation }, waiting: [queued], takeover: null }
const emptyExecution: ExecutionState = { ...execution, owner: null, waiting: [] }

function task(overrides: Partial<TaskRecord> & { sessionIds?: readonly string[] }): TaskRecord {
  const { sessionIds = [], ...rest } = overrides
  return {
    id: brandString<TaskRecord['id']>('t1'),
    versionId: version.id,
    title: 'Task',
    status: 'running',
    attempts: [{ id: brandString<'loom.attempt'>('a1'), lock, workspaceId: workspace.id, sessionIds: sessionIds.map(id => brandString<'SessionId'>(id)), status: 'running' }],
    ...rest,
  }
}

function snapshot(tasks: readonly TaskRecord[], executions: readonly ExecutionState[]): CatalogSnapshot {
  return { projects: [], versions: [version], locks: [lock], tasks: [...tasks], workspaces: [workspace], temporarySessions: [], audit: [], executions: [...executions] }
}

it('marks the task-owned Session as the execution owner', () => {
  const record = task({ sessionIds: [owner] })
  expect(boardEvidence(snapshot([record], [execution]), record)).toMatchObject({ key: 'kb.evidence.owner', tone: 'muted' })
})

it('shows the queue position when the task waits for execution rights', () => {
  const record = task({ sessionIds: [queued] })
  expect(boardEvidence(snapshot([record], [execution]), record)).toMatchObject({ key: 'kb.evidence.queued', tone: 'muted', params: { position: '1' } })
})

it('falls back to the isolated workspace state when the task owns no Session', () => {
  const record = task({})
  expect(boardEvidence(snapshot([record], [emptyExecution]), record)).toMatchObject({ key: 'kb.evidence.isolated', tone: 'muted' })
})

it('waits for a Lock on a pending task', () => {
  const record = task({ status: 'pending' })
  expect(boardEvidence(snapshot([record], []), record)).toMatchObject({ key: 'kb.evidence.waitingLock', tone: 'muted' })
})

it('requires real test evidence before calling a review task tested', () => {
  const untested = task({ status: 'review' })
  expect(boardEvidence(snapshot([untested], []), untested)).toMatchObject({ key: 'kb.evidence.noTests', tone: 'danger' })
  const tested = task({ status: 'review', outcome: { state: 'suggested', testResults: [{ name: 'vitest', status: 'passed' }] } })
  expect(boardEvidence(snapshot([tested], []), tested)).toMatchObject({ key: 'kb.evidence.tests', tone: 'success', params: { count: '1' } })
})

it('separates a human-verified completion from an untouched archive', () => {
  const verified = task({ status: 'completed', outcome: { state: 'accepted' } })
  expect(boardEvidence(snapshot([verified], []), verified)).toMatchObject({ key: 'kb.evidence.verified', tone: 'success' })
  const archived = task({ status: 'completed' })
  expect(boardEvidence(snapshot([archived], []), archived)).toMatchObject({ key: 'kb.evidence.archived', tone: 'muted' })
})

it('marks a failed round for retry', () => {
  const record = task({ status: 'failed' })
  expect(boardEvidence(snapshot([record], []), record)).toMatchObject({ key: 'kb.evidence.failed', tone: 'warning' })
})
