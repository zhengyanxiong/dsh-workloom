/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import { createElement } from 'react'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { CatalogSnapshot, Lock, TaskRecord, TransitionTaskRequest, VersionRecord, WorkspaceRecord } from 'dsh-workloom/types'
import { LoomOutcomePanel, type LoomOutcomeActions } from '../../../src/client/features/task/LoomOutcomePanel.tsx'
import { en, type LoomKey } from '../../../src/client/locales.ts'

const t = (key: LoomKey) => en[key]
const versionId = brandString<VersionRecord['id']>('v1')
const lock: Lock = { id: brandString<Lock['id']>('lock1'), versionId, repositories: [{ sourceId: brandString<'loom.source'>('web'), commit: 'a'.repeat(40) }] }
const workspace: WorkspaceRecord = { id: brandString<WorkspaceRecord['id']>('w1'), versionId, lockId: lock.id, path: '/tmp/loom/workspace', preparation: { status: 'ready', repositories: [], startedAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z' } }
const snapshot: CatalogSnapshot = {
  projects: [], versions: [{ id: versionId, projectId: brandString<'loom.project'>('p1'), name: 'v1', description: '', sources: [] }],
  locks: [lock], tasks: [], workspaces: [workspace], temporarySessions: [], audit: [], executions: [],
}
const outcome = {
  state: 'suggested' as const,
  suggestedStatus: 'review' as const,
  suggestedBy: 'agent' as const,
  at: '2025-01-02T10:00:00.000Z',
  basis: 'all acceptance checks pass',
  agentSummary: 'Wired the checkout total through the API.',
  completed: ['Totals are computed server-side'],
  notDone: ['Refund flow is untouched'],
  risks: ['Currency rounding changes'],
  impact: ['checkout', 'orders'],
  testResults: [{ name: 'tests/checkout.spec.ts', status: 'passed' as const, command: 'pnpm exec vitest run tests/checkout.spec.ts', detail: '12 passed' }],
}
const reviewTask: TaskRecord = {
  id: brandString<TaskRecord['id']>('t1'), versionId, title: 'Checkout', status: 'review',
  attempts: [{ id: brandString<'loom.attempt'>('a1'), lock, workspaceId: workspace.id, sessionIds: [brandString<'SessionId'>('s1')], status: 'review' }],
  outcome,
}
const noTests: TaskRecord = { ...reviewTask, outcome: { ...outcome, testResults: undefined } }
const runningTask: TaskRecord = { ...reviewTask, status: 'running', outcome: undefined, attempts: [{ ...reviewTask.attempts[0]!, status: 'running' }] }
const loadChanges = () => Promise.reject(new Error('unused'))
const props = { t, snapshot, loadChanges, wrap: false, onToggleWrap: () => {} }

let root: Root | undefined
let container: HTMLDivElement | undefined
afterEach(async () => {
  await act(async () => { root?.unmount() })
  container?.remove()
  root = undefined
  container = undefined
})

async function mount(task: TaskRecord, actions: LoomOutcomeActions): Promise<HTMLDivElement> {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => { root?.render(createElement(LoomOutcomePanel, { ...props, task, actions })) })
  return container
}

function button(host: HTMLElement, label: string): HTMLButtonElement {
  const found = [...host.querySelectorAll('button')].find(candidate => candidate.textContent === label)
  if (found === undefined) throw new Error(`missing button ${label}`)
  return found
}

it('shows the Agent summary, evidence and explicit no-test state without confirming anything', () => {
  const html = renderToStaticMarkup(createElement(LoomOutcomePanel, { ...props, task: noTests, actions: { transitionTask: () => Promise.reject(new Error('unused')), onChanged: () => {} } }))
  expect(html).toContain(outcome.agentSummary)
  expect(html).toContain('Totals are computed server-side')
  expect(html).toContain('Refund flow is untouched')
  expect(html).toContain('Currency rounding changes')
  expect(html).toContain(en['outcome.testsNone'])
  expect(html).toContain(en['outcome.testsNoneHint'])
  expect(html).toContain(en['outcome.referenceOnly'])
  expect(html).toContain(en['outcome.accept'])
  expect(html).toContain(en['outcome.reject'])
  expect(html).toContain(lock.id)
})
it('renders only real test results with their command and status', () => {
  const html = renderToStaticMarkup(createElement(LoomOutcomePanel, { ...props, task: reviewTask, actions: { transitionTask: () => Promise.reject(new Error('unused')), onChanged: () => {} } }))
  expect(html).toContain('tests/checkout.spec.ts')
  expect(html).toContain('pnpm exec vitest run tests/checkout.spec.ts')
  expect(html).toContain('12 passed')
  expect(html).toContain(en['outcome.test.passed'])
  expect(html).not.toContain(en['outcome.testsNone'])
})
it('requires a human basis before completing and records the accepted decision', async () => {
  const calls: TransitionTaskRequest[] = []
  const actions: LoomOutcomeActions = {
    transitionTask: (request) => {
      calls.push(request)
      return Promise.resolve({ ok: true, value: { ...reviewTask, status: 'completed', outcome: { ...outcome, state: 'accepted', confirmedAt: '2025-01-03T00:00:00.000Z', confirmationBasis: request.basis } } } as RemoteResult<TaskRecord>)
    },
    onChanged: () => {},
  }
  const host = await mount(reviewTask, actions)
  await act(async () => { button(host, en['outcome.accept']).click() })
  expect(host.textContent).toContain(en['outcome.basisRequired'])
  expect(calls).toHaveLength(0)
  const textarea = host.querySelector('textarea')
  if (textarea === null) throw new Error('missing basis textarea')
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
    setter?.call(textarea, 'checked the Diff and ran the suite')
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => { button(host, en['outcome.accept']).click() })
  await act(async () => { await Promise.resolve() })
  expect(calls).toHaveLength(1)
  expect(calls[0]).toMatchObject({ taskId: reviewTask.id, target: 'completed', actor: 'human', basis: 'checked the Diff and ran the suite' })
  expect(host.textContent).toContain(en['outcome.submittedAccepted'])
})
it('offers review and failure for a running task but never a bare pass', async () => {
  const host = await mount(runningTask, { transitionTask: () => Promise.reject(new Error('unused')), onChanged: () => {} })
  expect(host.textContent).toContain(en['task.review'])
  expect(host.textContent).toContain(en['outcome.reject'])
  expect(host.textContent).not.toContain(en['outcome.accept'])
})
