/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import type { JSX } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  useLoomSessionArchive,
  type LoomSessionArchiveInput,
} from '../src/client/shell/useLoomSessionArchive.ts'
import { getLoomNotices } from '../src/client/shared/feedback.ts'
import { en, type LoomKey } from '../src/client/shared/locales.ts'

const t = (key: LoomKey): string => en[key]

interface Fixture {
  readonly calls: Array<{ readonly sessionId: string; readonly stopActivity: boolean }>
  readonly archived: string[]
  refreshes: number
  input: LoomSessionArchiveInput
}

function fixture(overrides: Partial<LoomSessionArchiveInput> = {}): Fixture {
  const fixture: Fixture = {
    calls: [], archived: [], refreshes: 0,
    input: {
      archiveSession: async (sessionId, options) => { fixture.calls.push({ sessionId, stopActivity: options.stopActivity }); return { ok: true } },
      unarchiveSession: async () => ({ ok: true }),
      isSessionRunning: () => false,
      sessionLabel: id => `Session ${id}`,
      t,
      onArchived: (sessionId) => { fixture.archived.push(sessionId) },
      refresh: () => { fixture.refreshes += 1 },
      ...overrides,
    },
  }
  return fixture
}

let root: Root | undefined
let container: HTMLDivElement | undefined
afterEach(async () => {
  await act(async () => { root?.unmount() })
  container?.remove()
  root = undefined
  container = undefined
})

function Harness({ input }: { readonly input: LoomSessionArchiveInput }): JSX.Element {
  const state = useLoomSessionArchive(input)
  return createElement('div', undefined,
    createElement('button', { 'data-testid': 'archive', onClick: () => state.archive('s1') }),
    createElement('button', { 'data-testid': 'restore', onClick: () => state.restore('s1') }),
    createElement('button', { 'data-testid': 'confirm', onClick: () => state.confirmArchive() }),
    createElement('button', { 'data-testid': 'toggle', onClick: () => state.toggleArchived() }),
    createElement('span', { 'data-testid': 'confirm-title' }, state.confirm?.title ?? ''),
    createElement('span', { 'data-testid': 'show-archived' }, String(state.showArchived)),
    createElement('span', { 'data-testid': 'failure' }, state.confirmFailure === undefined ? '' : state.confirmFailure.message))
}

async function mount(input: LoomSessionArchiveInput): Promise<void> {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => { root?.render(createElement(Harness, { input })) })
}

async function click(testId: string): Promise<void> {
  const button = container?.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)
  if (button === undefined || button === null) throw new Error(`missing ${testId}`)
  await act(async () => { button.click() })
}

function text(testId: string): string {
  return container?.querySelector(`[data-testid="${testId}"]`)?.textContent ?? ''
}

it('archives an idle Session directly and refreshes the lists', async () => {
  const data = fixture()
  await mount(data.input)
  await click('archive')
  expect(data.calls).toEqual([{ sessionId: 's1', stopActivity: false }])
  expect(data.archived).toEqual(['s1'])
  expect(data.refreshes).toBe(1)
  expect(text('confirm-title')).toBe('')
  expect(getLoomNotices().at(-1)?.title).toBe(en['notice.sessionArchived'])
})

it('asks before stopping a running Session and archives it with stopActivity', async () => {
  const data = fixture({ isSessionRunning: () => true })
  await mount(data.input)
  await click('archive')
  expect(data.calls).toEqual([])
  expect(text('confirm-title')).toBe('Session s1')
  await click('confirm')
  expect(data.calls).toEqual([{ sessionId: 's1', stopActivity: true }])
  expect(data.archived).toEqual(['s1'])
  expect(text('confirm-title')).toBe('')
})

it('opens the stop confirmation when the Host refuses an active Session', async () => {
  const data = fixture({ archiveSession: async () => ({ ok: false, code: 'workspace/session-active', message: 'active' }) })
  await mount(data.input)
  await click('archive')
  expect(data.calls).toEqual([])
  expect(text('confirm-title')).toBe('Session s1')
})

it('keeps other archive failures visible in the confirmation and as a notice', async () => {
  const data = fixture({ archiveSession: async () => ({ ok: false, code: 'boom', message: 'native exploded' }) })
  await mount(data.input)
  await click('archive')
  expect(text('confirm-title')).toBe('')
  const notice = getLoomNotices().at(-1)
  expect(notice?.tone).toBe('error')
  expect(notice?.detail).toContain('native exploded')
})

it('restores an archived Session and toggles the archived rows', async () => {
  let restoredId: string | undefined
  const data = fixture({ unarchiveSession: async (sessionId: SessionId) => { restoredId = sessionId; return { ok: true } } })
  await mount(data.input)
  expect(text('show-archived')).toBe('false')
  await click('toggle')
  expect(text('show-archived')).toBe('true')
  await click('restore')
  expect(restoredId).toBe('s1')
  expect(data.refreshes).toBe(1)
  expect(getLoomNotices().at(-1)?.title).toBe(en['notice.sessionRestored'])
})
