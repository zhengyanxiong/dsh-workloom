/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import type { JSX } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  decodeApprovalSignature,
  useLoomApprovalAttention,
  type LoomApprovalAttentionInput,
} from '../src/client/shell/useLoomApprovalAttention.ts'
import { en, type LoomKey } from '../src/client/shared/locales.ts'

const t = (key: LoomKey, params?: Readonly<Record<string, string>>): string => {
  const text = en[key]
  return params === undefined ? text : Object.entries(params).reduce((value, [name, replacement]) => value.replace(`{${String(name)}}`, String(replacement)), text)
}

/** One recorded system notification. */
class FakeNotification {
  static permission: NotificationPermission = 'granted'
  static instances: FakeNotification[] = []
  static requestPermission = async (): Promise<NotificationPermission> => 'granted'
  onclick: (() => void) | null = null
  closed = false
  /** @param title - notification title. @param options - notification body and tag. */
  constructor(readonly title: string, readonly options?: NotificationOptions) {
    FakeNotification.instances.push(this)
  }
  close(): void { this.closed = true }
}

let root: Root | undefined
let container: HTMLDivElement | undefined
afterEach(async () => {
  await act(async () => { root?.unmount() })
  container?.remove()
  root = undefined
  container = undefined
  FakeNotification.instances = []
  FakeNotification.permission = 'granted'
  delete document.title
  vi.restoreAllMocks()
})

function Harness({ input }: { readonly input: LoomApprovalAttentionInput }): JSX.Element {
  useLoomApprovalAttention(input)
  return null
}

async function mount(input: LoomApprovalAttentionInput): Promise<void> {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => { root?.render(createElement(Harness, { input })) })
}

async function rerender(input: LoomApprovalAttentionInput): Promise<void> {
  await act(async () => { root?.render(createElement(Harness, { input })) })
}

function fixture(overrides: Partial<LoomApprovalAttentionInput> = {}): LoomApprovalAttentionInput {
  return {
    t,
    signature: '',
    labelOf: id => `Session ${String(id)}`,
    selectedSessionId: undefined,
    onOpenSession: () => undefined,
    ...overrides,
  }
}

function hidePage(): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
  vi.spyOn(document, 'hasFocus').mockReturnValue(false)
}

it('decodes the selector signature into approvals', () => {
  expect(decodeApprovalSignature('')).toEqual([])
  expect(decodeApprovalSignature('s1\u0000approval:1|s2\u0000approval:2')).toEqual([
    { sessionId: 's1', key: 'approval:1' },
    { sessionId: 's2', key: 'approval:2' },
  ])
})

it('badges the title and notifies once per new approval, then restores the title', async () => {
  hidePage()
  document.title = 'DeepSeek Harness'
  const opened: string[] = []
  ;(window as unknown as { Notification: unknown }).Notification = FakeNotification
  await mount(fixture({ signature: 's1\u0000approval:1', onOpenSession: id => opened.push(id) }))
  expect(document.title.startsWith('⚠ 1 ')).toBe(true)
  expect(document.title.endsWith('DeepSeek Harness')).toBe(true)
  expect(FakeNotification.instances).toHaveLength(1)
  expect(FakeNotification.instances[0]?.title).toBe(en['notice.approvalDesktopTitle'])
  expect(FakeNotification.instances[0]?.options?.body).toContain('Session s1')
  // The same request rendered again is not announced twice.
  await rerender(fixture({ signature: 's1\u0000approval:1', onOpenSession: id => opened.push(id) }))
  expect(FakeNotification.instances).toHaveLength(1)
  FakeNotification.instances[0]?.onclick?.()
  expect(opened).toEqual(['s1'])
  await rerender(fixture({ signature: '' }))
  expect(document.title).toBe('DeepSeek Harness')
})

it('keeps the badge but skips the system notification while the blocked Session is focused', async () => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  document.title = 'DeepSeek Harness'
  ;(window as unknown as { Notification: unknown }).Notification = FakeNotification
  await mount(fixture({ signature: 's1\u0000approval:1', selectedSessionId: 's1' }))
  expect(FakeNotification.instances).toHaveLength(0)
  expect(document.title.startsWith('⚠ 1 ')).toBe(true)
})

it('announces a second approval even when the first is still pending', async () => {
  hidePage()
  document.title = 'DeepSeek Harness'
  ;(window as unknown as { Notification: unknown }).Notification = FakeNotification
  await mount(fixture({ signature: 's1\u0000approval:1' }))
  await rerender(fixture({ signature: 's1\u0000approval:1|s2\u0000approval:2' }))
  expect(FakeNotification.instances).toHaveLength(2)
  expect(document.title.startsWith('⚠ 2 ')).toBe(true)
})
