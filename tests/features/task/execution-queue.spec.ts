import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { brandNumber, brandString } from '@deepseek-ai/dsh-brand'
import { LoomExecutionQueue } from '../../../src/client/features/task/LoomExecutionQueue.tsx'
import { en, type LoomKey } from '../../../src/client/shared/locales.ts'
import type { ExecutionActions } from '../../../src/client/features/task/LoomExecution.tsx'
import type { ExecutionState, SessionId } from 'dsh-workloom/types'

const t = (key: LoomKey, params?: Readonly<Record<string, string>>) => {
  const copy = en[key]
  if (params === undefined) return copy
  return Object.entries(params).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, value), copy)
}
const sessionId = (value: string): SessionId => brandString<'SessionId'>(value)
const workspaceId = brandString<'loom.workspace'>('w1')
const owner = sessionId('s1')
const execution: ExecutionState = {
  workspaceId,
  generation: brandNumber<'loom.execution-generation'>(2),
  owner: { workspaceId, sessionId: owner, generation: brandNumber<'loom.execution-generation'>(2) },
  waiting: [sessionId('s2'), sessionId('s3')],
  takeover: null,
}
const sessions = [
  { sessionId: owner, title: 'Owner task', running: true, available: true },
  { sessionId: sessionId('s2'), title: 'Waiting one', running: false, available: true },
  { sessionId: sessionId('s3'), title: 'Waiting two', running: false, available: true },
  { sessionId: sessionId('s4'), title: 'Idle task', running: false, available: true },
]

it('groups the execution owner, waiting order and idle bound Sessions', () => {
  const html = renderToStaticMarkup(createElement(LoomExecutionQueue, {
    t, workspaceId, sessions, execution, selectedSessionId: 's2',
    actions: {} as ExecutionActions, onOpenSession: () => undefined,
  }))
  expect(html).toContain(en['sessionQueue.owner'])
  expect(html).toContain(en['sessionQueue.waiting'])
  expect(html).toContain(en['sessionQueue.idle'])
  expect(html).toContain('Owner task')
  expect(html).toContain('Waiting one')
  expect(html).toContain('Waiting two')
  expect(html).toContain('Idle task')
  expect(html).toContain(en['sessionQueue.position'].replace('{position}', '1'))
  expect(html).toContain(en['sessionQueue.position'].replace('{position}', '2'))
  expect(html).toContain('draggable="true"')
  expect(html).toContain('aria-current="true"')
})
