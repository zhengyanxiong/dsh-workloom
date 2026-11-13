/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { TaskRecord, WorkspaceRecord } from 'dsh-workloom/types'
import { useLoomForkSession } from '../../../src/client/features/session/useLoomForkSession.ts'
import { en, type LoomKey } from '../../../src/client/shared/locales.ts'

const t = (key: LoomKey) => en[key]
const workspace: WorkspaceRecord = { id: brandString<WorkspaceRecord['id']>('w1'), versionId: brandString('v1'), lockId: brandString('lock1'), path: '/tmp/workspace' }
const task: TaskRecord = { id: brandString<TaskRecord['id']>('t1'), versionId: workspace.versionId, title: 'Task', status: 'running', attempts: [] }
const sessionId = brandString<'SessionId'>('s1')
const childId = brandString<'SessionId'>('s2')

let root: Root | undefined
let container: HTMLDivElement | undefined
afterEach(async () => {
  await act(async () => { root?.unmount() })
  container?.remove()
  root = undefined
  container = undefined
})

it('forks a Session without committing the workspace automatically', async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  let forks = 0
  let action: (() => Promise<void>) | undefined
  function Probe(): null {
    const fork = useLoomForkSession({
      t, sessionId, task, workspace,
      forkSession: async () => {
        forks += 1
        return childId as SessionId
      },
      attachSession: async () => ({ ok: true, value: task }),
      onForked: () => {},
      onChanged: () => {},
    })
    action = fork.forkSessionAction
    return null
  }
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => { root?.render(createElement(Probe)) })
  await act(async () => { await action?.() })
  expect(forks).toBe(1)
})
