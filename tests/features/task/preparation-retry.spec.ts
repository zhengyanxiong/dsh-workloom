/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { CatalogSnapshot, Lock, TaskRecord, VersionRecord, WorkspaceRecord } from 'dsh-workloom/types'
import { ExecutionPanel, type ExecutionActions } from '../../../src/client/features/task/LoomExecution.tsx'
import { en, type LoomKey } from '../../../src/client/shared/locales.ts'

const t = (key: LoomKey) => en[key]
const versionId = brandString<VersionRecord['id']>('v1')
const lock: Lock = { id: brandString<Lock['id']>('lock1'), versionId, repositories: [{ sourceId: brandString<'loom.source'>('web'), commit: 'a'.repeat(40) }] }
const workspace: WorkspaceRecord = {
  id: brandString<WorkspaceRecord['id']>('w1'), versionId, lockId: lock.id, path: '/tmp/loom/workspace',
  preparation: {
    status: 'failed',
    repositories: [
      { sourceId: brandString<'loom.source'>('web'), status: 'done', path: '/tmp/loom/workspace/web' },
      { sourceId: brandString<'loom.source'>('api'), status: 'failed', path: '/tmp/loom/workspace/api', error: 'fatal: could not checkout' },
    ],
  },
}
const task: TaskRecord = {
  id: brandString<TaskRecord['id']>('t1'), versionId, title: 'Checkout', status: 'running',
  attempts: [{ id: brandString<'loom.attempt'>('a1'), lock, workspaceId: workspace.id, sessionIds: [], status: 'running' }],
}
const snapshot: CatalogSnapshot = {
  projects: [{ id: brandString<'loom.project'>('p1'), config: { name: 'Shop', sources: [], modules: [] } }],
  versions: [{ id: versionId, projectId: brandString<'loom.project'>('p1'), name: 'v1', description: '', sources: [] }],
  locks: [lock], tasks: [task], workspaces: [workspace], temporarySessions: [], audit: [], executions: [],
}
const unused = () => Promise.reject(new Error('unused'))

let root: Root | undefined
afterEach(async () => {
  await act(async () => { root?.unmount() })
  root = undefined
  document.body.replaceChildren()
})

async function mount(actions: ExecutionActions, data: CatalogSnapshot = snapshot): Promise<void> {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(ExecutionPanel, { t, task, snapshot: data, selectedSession: undefined, actions, loadChanges: unused, wrap: false, onToggleWrap: () => {} }))
  })
}

function button(label: string): HTMLButtonElement {
  const found = [...document.body.querySelectorAll('button')].find(candidate => candidate.textContent === label)
  if (found === undefined) throw new Error(`missing button ${label}`)
  return found
}

it('retries preparation with the failed workspace id instead of preparing a new directory', async () => {
  const prepareWorkspace = vi.fn(() => Promise.resolve({ ok: true, value: workspace } as RemoteResult<WorkspaceRecord>))
  const loadSnapshot = vi.fn(() => Promise.resolve({ ok: true, value: snapshot } as RemoteResult<CatalogSnapshot>))
  await mount({
    prepareWorkspace, registerWorkspace: unused, repositoryBranches: unused, inspectWorkspace: unused, pickDirectory: () => Promise.resolve(null),
    startAttempt: unused, attachSession: unused, transitionTask: unused, createSessionInWorkspace: unused, cleanupWorkspace: unused,
    acquireExecution: unused, releaseExecution: unused, takeoverExecution: unused, loadSnapshot, onSession: () => {}, onChanged: () => {},
  })
  expect(document.body.textContent).toContain(en['prepare.repoStatus.failed'])
  expect(document.body.textContent).toContain('fatal: could not checkout')
  await act(async () => { button(en['prepare.retryFailed']).click() })
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })
  expect(prepareWorkspace).toHaveBeenCalledWith({ versionId, lockId: lock.id, workspaceId: workspace.id })
  expect(loadSnapshot).toHaveBeenCalled()
})

it('keeps the cleanup dialog open with per-repository results when cleanup is partial', async () => {
  const partial: WorkspaceRecord = { ...workspace, preparation: { status: 'ready', repositories: [] }, cleanup: {
    status: 'partial', error: 'one worktree is locked', residual: ['/tmp/loom/workspace/api'],
    repositories: [
      { sourceId: brandString<'loom.source'>('web'), status: 'removed', path: '/tmp/loom/workspace/web' },
      { sourceId: brandString<'loom.source'>('api'), status: 'failed', path: '/tmp/loom/workspace/api', error: 'device busy', residual: '/tmp/loom/workspace/api' },
    ],
  } }
  const partialSnapshot: CatalogSnapshot = { ...snapshot, workspaces: [partial] }
  const loadSnapshot = vi.fn(() => Promise.resolve({ ok: true, value: partialSnapshot } as RemoteResult<CatalogSnapshot>))
  const onChanged = vi.fn()
  await mount({
    prepareWorkspace: unused, registerWorkspace: unused, repositoryBranches: unused, inspectWorkspace: unused, pickDirectory: () => Promise.resolve(null),
    startAttempt: unused, attachSession: unused, transitionTask: unused, createSessionInWorkspace: unused,
    cleanupWorkspace: () => Promise.resolve({ ok: true, value: undefined } as RemoteResult<void>),
    acquireExecution: unused, releaseExecution: unused, takeoverExecution: unused, loadSnapshot, onSession: () => {}, onChanged,
  })
  await act(async () => { button(en['workspace.cleanup']).click() })
  await act(async () => { button(en['workspace.cleanupConfirm']).click() })
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })
  expect(document.body.textContent).toContain(en['cleanup.partial'])
  expect(document.body.textContent).toContain(en['cleanup.retry'])
  expect(document.body.textContent).toContain('device busy')
  expect(document.body.textContent).not.toContain(en['cleanup.allRemoved'])
  expect(onChanged).toHaveBeenCalled()
})
