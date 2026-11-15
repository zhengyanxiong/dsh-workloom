/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { CatalogSnapshot, Lock, ProjectRecord, TaskRecord, VersionRecord, WorkspaceRecord } from 'dsh-workloom/types'
import { useLoomSelection, type LoomSelection } from '../../../src/client/shell/useLoomSelection.ts'
import type { ActiveSession } from '../../../src/client/shared/projection.ts'

const project: ProjectRecord = { id: brandString<'loom.project'>('p1'), config: { name: 'Shop', sources: [], modules: [] } }
const version: VersionRecord = { id: brandString<'loom.version'>('v1'), projectId: project.id, name: 'v1', sources: [] }
const lock: Lock = { id: brandString<'loom.lock'>('lock1'), versionId: version.id, repositories: [] }
const workspace: WorkspaceRecord = { id: brandString<'loom.workspace'>('w1'), versionId: version.id, lockId: lock.id, path: '/tmp/temp-workspace' }
const task: TaskRecord = {
  id: brandString<TaskRecord['id']>('t1'), versionId: version.id, title: 'Task', status: 'running',
  attempts: [{ id: brandString<'loom.attempt'>('a1'), lock, workspaceId: workspace.id, sessionIds: [brandString<'SessionId'>('s1')], status: 'running' }],
}
const snapshot: CatalogSnapshot = {
  projects: [project], versions: [version], locks: [lock], tasks: [task], workspaces: [workspace],
  temporarySessions: [{ sessionId: brandString<'SessionId'>('s2'), workspacePath: workspace.path, createdAt: 1 }],
  audit: [], executions: [],
}
const bound: ActiveSession = { sessionId: 's1', task, projectId: project.id, versionId: version.id }

let root: Root | undefined
let container: HTMLDivElement | undefined
afterEach(async () => {
  await act(async () => { root?.unmount() })
  container?.remove()
  root = undefined
  container = undefined
})

it('aligns project and version for task, temporary and unbound Sessions', async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const selected: { project?: string; version?: string; task?: string } = {}
  let selection: LoomSelection | undefined
  function Probe(): null {
    selection = useLoomSelection({
      snapshot, boundRows: [bound], selected: undefined, displayVersion: undefined, displayVersionProject: undefined,
      setProject: id => { selected.project = id === undefined ? undefined : String(id) },
      setVersion: id => { selected.version = id === undefined ? undefined : String(id) },
      setTask: record => { selected.task = record?.id === undefined ? undefined : String(record.id) },
      setSelected: () => {}, setExecutionSession: () => {}, setView: () => {}, setPaletteOpen: () => {},
      navigate: () => {}, retrySession: () => {}, openCreate: () => {},
    })
    return null
  }
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => { root?.render(createElement(Probe)) })
  await act(async () => { selection?.selectSession(brandString<'SessionId'>('s1')) })
  expect(selected).toEqual({ project: String(project.id), version: String(version.id), task: String(task.id) })
  await act(async () => { selection?.selectSession(brandString<'SessionId'>('s2')) })
  expect(selected).toEqual({ project: String(project.id), version: String(version.id), task: undefined })
  await act(async () => { selection?.selectSession(brandString<'SessionId'>('s3') as SessionId) })
  expect(selected).toEqual({ project: undefined, version: undefined, task: undefined })
})
