/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { Lock, TaskOutcome, TaskRecord, VersionRecord, WorkspacePreparation, WorkspaceRecord } from 'dsh-workloom/types'
import { LoomTakeoverDialog } from '../src/client/features/dialogs/LoomTakeoverDialog.tsx'
import { LoomPreparationPanel } from '../src/client/features/task/LoomPreparationPanel.tsx'
import { LoomCleanupDialog } from '../src/client/features/dialogs/LoomCleanupDialog.tsx'
import { en, type LoomKey } from '../src/client/locales.ts'

const t = (key: LoomKey) => en[key]

let root: Root | undefined
afterEach(async () => {
  await act(async () => { root?.unmount() })
  root = undefined
  document.body.replaceChildren()
})

/** Modal portals to the body, so handoff tests render on a client root. */
async function renderTakeover(props: Parameters<typeof LoomTakeoverDialog>[0]): Promise<string> {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => { root?.render(createElement(LoomTakeoverDialog, props)) })
  return document.body.innerHTML
}
const versionId = brandString<VersionRecord['id']>('v1')
const lock: Lock = { id: brandString<Lock['id']>('lock1'), versionId, repositories: [{ sourceId: brandString<'loom.source'>('web'), commit: 'a'.repeat(40) }] }
const outcome: TaskOutcome = {
  state: 'suggested', suggestedBy: 'agent', at: '2025-01-02T10:00:00.000Z', agentSummary: 'Half of the refactor landed.',
  completed: ['Moved the parser'], notDone: ['Migration is pending'], risks: ['API is temporarily unstable'],
}
const task: TaskRecord = {
  id: brandString<TaskRecord['id']>('t1'), versionId, title: 'Checkout', status: 'review', outcome,
  attempts: [{ id: brandString<'loom.attempt'>('a1'), lock, workspaceId: brandString<WorkspaceRecord['id']>('w1'), sessionIds: [], status: 'review' }],
}

it('shows the previous-round handoff evidence as reference, never as completion proof', async () => {
  const workspace: WorkspaceRecord = { id: brandString<WorkspaceRecord['id']>('w1'), versionId, lockId: lock.id, path: '/tmp/loom/workspace' }
  const html = await renderTakeover({
    t, open: true, busy: false, failed: false, task, workspace,
    execution: { workspaceId: workspace.id, generation: 1 as never, owner: { workspaceId: workspace.id, sessionId: brandString<'SessionId'>('s2'), generation: 1 as never }, waiting: [], takeover: null },
    onCancel: () => {}, onConfirm: () => {},
  })
  expect(html).toContain(en['takeover.summary'])
  expect(html).toContain('Half of the refactor landed.')
  expect(html).toContain('Migration is pending')
  expect(html).toContain('API is temporarily unstable')
  expect(html).toContain(en['takeover.referenceOnly'])
  expect(html).toContain(lock.id)
  expect(html).toContain('/tmp/loom/workspace')
  expect(html).toContain('s2')
  expect(html).toContain(en['takeover.confirmNote'])
})
it('states explicitly when the previous round has no summary', async () => {
  const html = await renderTakeover({ t, open: true, busy: false, failed: false, task: { ...task, outcome: undefined }, onCancel: () => {}, onConfirm: () => {} })
  expect(html).toContain(en['takeover.noSummary'])
  expect(html).not.toContain('Half of the refactor landed.')
})

it('lists every repository preparation step and retries only failures', () => {
  const preparation: WorkspacePreparation = {
    status: 'failed',
    repositories: [
      { sourceId: brandString<'loom.source'>('web'), status: 'done', path: '/tmp/loom/workspace/web' },
      { sourceId: brandString<'loom.source'>('api'), status: 'failed', path: '/tmp/loom/workspace/api', error: 'fatal: could not checkout' },
    ],
  }
  const failed = renderToStaticMarkup(createElement(LoomPreparationPanel, { t, preparation, busy: false, onRetry: () => {} }))
  expect(failed).toContain('web')
  expect(failed).toContain('api')
  expect(failed).toContain('/tmp/loom/workspace/api')
  expect(failed).toContain('fatal: could not checkout')
  expect(failed).toContain(en['prepare.retryFailed'])
  expect(failed).toContain(en['prepare.failedSummary'].replace('{count}', '1'))
  expect(failed).toContain(en['prepare.repoStatus.done'])
  expect(failed).toContain(en['prepare.repoStatus.failed'])
})
it('has no retry action when every repository is ready and no progress is not a failure', () => {
  const ready = renderToStaticMarkup(createElement(LoomPreparationPanel, { t, preparation: { status: 'ready', repositories: [{ sourceId: brandString<'loom.source'>('web'), status: 'done' }] }, busy: false, onRetry: () => {} }))
  expect(ready).toContain(en['prepare.ready'])
  expect(ready).not.toContain(en['prepare.retryFailed'])
  const unknown = renderToStaticMarkup(createElement(LoomPreparationPanel, { t, preparation: undefined, busy: false, onRetry: () => {} }))
  expect(unknown).toContain(en['prepare.progressUnknown'])
})

it('never reports a partial cleanup as completed and keeps the retry reachable', () => {
  const workspace: WorkspaceRecord = {
    id: brandString<WorkspaceRecord['id']>('w1'), versionId, lockId: lock.id, path: '/tmp/loom/workspace',
    cleanup: {
      status: 'partial',
      error: 'one worktree is locked',
      residual: ['/tmp/loom/workspace/api'],
      repositories: [
        { sourceId: brandString<'loom.source'>('web'), status: 'removed', path: '/tmp/loom/workspace/web' },
        { sourceId: brandString<'loom.source'>('api'), status: 'failed', path: '/tmp/loom/workspace/api', error: 'device busy', residual: '/tmp/loom/workspace/api' },
      ],
    },
  }
  const html = renderToStaticMarkup(createElement(LoomCleanupDialog, {
    t, workspace, busy: false, failure: undefined, discardAllowed: false,
    loadChanges: () => Promise.reject(new Error('unused')), wrap: false, onToggleWrap: () => {},
    onConfirm: () => {}, onDiscard: () => {}, onCancel: () => {},
  }))
  expect(html).toContain(en['cleanup.partial'])
  expect(html).toContain(en['cleanup.partialHint'])
  expect(html).toContain(en['cleanup.retry'])
  expect(html).toContain(en['cleanup.repoStatus.removed'])
  expect(html).toContain(en['cleanup.repoStatus.failed'])
  expect(html).toContain('device busy')
  expect(html).toContain('/tmp/loom/workspace/api')
  expect(html).not.toContain(en['cleanup.allRemoved'])
})
it('localizes the blocking cleanup code and keeps the Host diagnostic', () => {
  const workspace: WorkspaceRecord = { id: brandString<WorkspaceRecord['id']>('w1'), versionId, lockId: lock.id, path: '/tmp/loom/workspace' }
  const html = renderToStaticMarkup(createElement(LoomCleanupDialog, {
    t, workspace, busy: false, failure: { code: 'workspace_task_running', message: 'task t1 is running' }, discardAllowed: false,
    loadChanges: () => Promise.reject(new Error('unused')), wrap: false, onToggleWrap: () => {},
    onConfirm: () => {}, onDiscard: () => {}, onCancel: () => {},
  }))
  expect(html).toContain(en['error.workspaceTaskRunning'])
  expect(html).toContain('task t1 is running')
  expect(html).toContain(en['cleanup.blocked'])
  expect(html).toContain(en['cleanup.blockedHint'])
})
