/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { brandNumber, brandString } from '@deepseek-ai/dsh-brand'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { CatalogSnapshot, Lock, TaskRecord, TemporarySessionRecord, VersionRecord, WorkspaceRecord } from 'dsh-workloom/types'
import { LoomTemporaryDialog, type LoomTemporaryActions } from '../src/client/features/dialogs/LoomTemporaryDialog.tsx'
import { en, type LoomKey } from '../src/client/locales.ts'

const t = (key: LoomKey) => en[key]
const versionId = brandString<VersionRecord['id']>('v1')
const lock: Lock = { id: brandString<Lock['id']>('lock1'), versionId, repositories: [{ sourceId: brandString<'loom.source'>('web'), commit: 'a'.repeat(40) }] }
const workspace: WorkspaceRecord = { id: brandString<WorkspaceRecord['id']>('w1'), versionId, lockId: lock.id, path: '/tmp/loom/workspace' }
const task: TaskRecord = {
  id: brandString<TaskRecord['id']>('t1'), versionId, title: 'Checkout', status: 'running',
  attempts: [{ id: brandString<'loom.attempt'>('a1'), lock, workspaceId: workspace.id, sessionIds: [], status: 'running' }],
}
const owner = { workspaceId: workspace.id, sessionId: brandString<'SessionId'>('s2'), generation: brandNumber<'loom.execution-generation'>(1) }
const snapshot: CatalogSnapshot = {
  projects: [], versions: [{ id: versionId, projectId: brandString<'loom.project'>('p1'), name: 'v1', description: '', sources: [] }],
  locks: [lock], tasks: [task], workspaces: [workspace], temporarySessions: [], audit: [], executions: [],
}

let root: Root | undefined
let container: HTMLDivElement | undefined
afterEach(async () => {
  await act(async () => { root?.unmount() })
  container?.remove()
  root = undefined
  container = undefined
})

async function mount(actions: LoomTemporaryActions, open = true, data: CatalogSnapshot = snapshot): Promise<void> {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => { root?.render(createElement(LoomTemporaryDialog, { t, open, snapshot: data, actions, onClose: () => {} })) })
}

function buttonIn(host: ParentNode, label: string): HTMLButtonElement {
  const found = [...host.querySelectorAll('button')].find(candidate => candidate.textContent === label)
  if (found === undefined) throw new Error(`missing button ${label}`)
  return found
}

it('never creates a temporary session in the latest workspace by default', async () => {
  const register = vi.fn()
  const create = vi.fn()
  await mount({
    pickDirectory: () => Promise.resolve(null),
    createSessionInWorkspace: create,
    registerTemporarySession: register,
    onSession: () => {},
    onChanged: () => {},
  })
  const createIn = buttonIn(document.body, en['temporary.createIn'])
  expect(createIn.disabled).toBe(true)
  expect(document.body.textContent).toContain(en['temporary.workspaceWarning'])
  await act(async () => { buttonIn(document.body, en['temporary.pickDirectory']).click() })
  await act(async () => { await Promise.resolve() })
  expect(document.body.textContent).toContain(en['temporary.noDirectory'])
  expect(create).not.toHaveBeenCalled()
  expect(register).not.toHaveBeenCalled()
})

it('creates the independent folder session without registering a Loom workspace', async () => {
  const sessionId = brandString<'SessionId'>('s9')
  const create = vi.fn(() => Promise.resolve(sessionId))
  const register = vi.fn()
  const onSession = vi.fn()
  await mount({
    pickDirectory: () => Promise.resolve('/tmp/independent'),
    createSessionInWorkspace: create,
    registerTemporarySession: register,
    onSession,
    onChanged: () => {},
  })
  await act(async () => { buttonIn(document.body, en['temporary.pickDirectory']).click() })
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
  expect(create).toHaveBeenCalledWith('/tmp/independent')
  expect(register).not.toHaveBeenCalled()
  expect(onSession).toHaveBeenCalledWith(sessionId)
  expect(document.body.textContent).toContain(en['temporary.created'])
})

it('reuses a workspace only after an explicit choice and reports the execution owner', async () => {
  const sessionId = brandString<'SessionId'>('s9')
  const register = vi.fn(() => Promise.resolve({ ok: true, value: {} } as RemoteResult<TemporarySessionRecord>))
  const withOwner: CatalogSnapshot = { ...snapshot, executions: [{ workspaceId: workspace.id, generation: owner.generation, owner, waiting: [], takeover: null }] }
  await mount({
    pickDirectory: () => Promise.resolve(null),
    createSessionInWorkspace: vi.fn(() => Promise.resolve(sessionId)),
    registerTemporarySession: register,
    onSession: () => {},
    onChanged: () => {},
  }, true, withOwner)
  const radio = document.body.querySelector('[role="radio"]')
  if (radio === null) throw new Error('missing workspace radio')
  await act(async () => { (radio as HTMLButtonElement).click() })
  expect(document.body.textContent).toContain('s2')
  expect(document.body.textContent).toContain(en['temporary.cleanupBlockedOwner'].replace('{session}', 's2'))
  await act(async () => { buttonIn(document.body, en['temporary.createIn']).click() })
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
  expect(register).toHaveBeenCalledWith({ sessionId, workspacePath: workspace.path })
  expect(document.body.textContent).toContain(en['temporary.queued'])
})
