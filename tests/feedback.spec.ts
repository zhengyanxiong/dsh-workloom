import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dismissLoomNotice, getLoomNotices, pushLoomNotice, reportLoomFailure, reportLoomThrown, subscribeLoomNotices } from '../src/client/shared/feedback.ts'
import type { LoomKey } from '../src/client/shared/locales.ts'

const t = (key: LoomKey): string => `t:${key}`

beforeEach(() => {
  vi.useFakeTimers()
  for (const notice of getLoomNotices()) dismissLoomNotice(notice.id)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('operation notices', () => {
  it('holds a success for 2.8 seconds and an error for 6 seconds', () => {
    pushLoomNotice('success', 'saved')
    pushLoomNotice('error', 'failed', 'detail')
    expect(getLoomNotices().map(notice => notice.tone)).toEqual(['success', 'error'])
    vi.advanceTimersByTime(2_799)
    expect(getLoomNotices()).toHaveLength(2)
    vi.advanceTimersByTime(1)
    expect(getLoomNotices().map(notice => notice.title)).toEqual(['failed'])
    vi.advanceTimersByTime(6_000)
    expect(getLoomNotices()).toHaveLength(0)
  })

  it('keeps only the newest three notices', () => {
    for (const title of ['one', 'two', 'three', 'four']) pushLoomNotice('success', title)
    expect(getLoomNotices().map(notice => notice.title)).toEqual(['two', 'three', 'four'])
  })

  it('notifies subscribers and allows an immediate dismissal', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeLoomNotices(listener)
    pushLoomNotice('error', 'failed')
    expect(listener).toHaveBeenCalledTimes(1)
    dismissLoomNotice(getLoomNotices()[0]?.id ?? 0)
    expect(listener).toHaveBeenCalledTimes(2)
    expect(getLoomNotices()).toHaveLength(0)
    unsubscribe()
    pushLoomNotice('success', 'saved')
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('localizes a known failure and keeps an unknown diagnostic', () => {
    reportLoomFailure(t, { code: 'gateway/internal', message: 'task_busy' })
    reportLoomFailure(t, { code: 'gateway/internal', message: 'boom' })
    expect(getLoomNotices().map(notice => [notice.title, notice.detail])).toEqual([
      ['t:notice.operationFailed', 't:error.taskBusy'],
      ['t:notice.operationFailed', 't:delete.unknownFailure · gateway/internal: boom'],
    ])
  })
})

  it('names the failed operation and localizes the known execution codes', () => {
    reportLoomFailure(t, { code: 'gateway/internal', message: 'workspace_not_prepared' }, 't:op.prepare')
    reportLoomFailure(t, { code: 'gateway/internal', message: 'execution_not_owned' }, 't:op.acquire')
    reportLoomFailure(t, { code: 'gateway/internal', message: 'task_not_active' }, 't:op.transition')
    expect(getLoomNotices().map(notice => [notice.title, notice.detail])).toEqual([
      ['t:notice.operationFailed · t:op.prepare', 't:error.workspaceNotPrepared'],
      ['t:notice.operationFailed · t:op.acquire', 't:error.executionNotOwned'],
      ['t:notice.operationFailed · t:op.transition', 't:error.taskNotActive'],
    ])
  })

  it('reports a thrown rejection with its diagnostic instead of swallowing it', () => {
    reportLoomThrown(t, new Error('network down'), 't:op.cleanup')
    const [notice] = getLoomNotices()
    expect(notice?.title).toBe('t:notice.operationFailed · t:op.cleanup')
    expect(notice?.detail).toContain('network down')
  })
