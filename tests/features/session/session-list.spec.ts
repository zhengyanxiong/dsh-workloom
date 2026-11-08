import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import { LoomSessionList } from '../../../src/client/features/session/LoomSessionList.tsx'
import { en, type LoomKey } from '../../../src/client/shared/locales.ts'
import { taskAttemptRows } from '../../../src/client/shared/projection.ts'
import type { Lock, TaskRecord } from 'dsh-workloom/types'

const t = (key: LoomKey, params?: Readonly<Record<string, string>>) => {
  const copy = en[key]
  if (params === undefined) return copy
  return Object.entries(params).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, value), copy)
}
const sourceId = brandString<'loom.source'>('web')
const versionId = brandString<'loom.version'>('v1')
const lock = (id: string): Lock => ({ id: brandString<Lock['id']>(id), versionId, repositories: [{ sourceId, commit: 'a'.repeat(40) }] })
const task: TaskRecord = {
  id: brandString<TaskRecord['id']>('t1'),
  versionId,
  title: 'Checkout',
  status: 'running',
  attempts: [
    { id: brandString<'loom.attempt'>('a1'), lock: lock('l1'), workspaceId: brandString<'loom.workspace'>('w1'), sessionIds: [brandString<'SessionId'>('s1'), brandString<'SessionId'>('s2')], status: 'review' },
    { id: brandString<'loom.attempt'>('a2'), lock: lock('l2'), workspaceId: brandString<'loom.workspace'>('w2'), sessionIds: [brandString<'SessionId'>('s3')], status: 'running' },
  ],
}
const lookup = (id: string) => id === 's1'
  ? { running: false, displayTitle: 'First round' }
  : id === 's3'
    ? { running: true, displayTitle: 'Current round' }
    : undefined

it('lists every round with all attached Sessions and their real state', () => {
  const rows = taskAttemptRows(task, lookup, new Set())
  expect(rows.map(row => row.round)).toEqual([1, 2])
  expect(rows.map(row => row.latest)).toEqual([false, true])
  expect(rows[0]?.sessions.map(session => session.sessionId)).toEqual(['s1', 's2'])
  const html = renderToStaticMarkup(createElement(LoomSessionList, { t, rows, onOpenSession: () => undefined }))
  expect(html).toContain(en['sessionList.title'])
  expect(html).toContain(en['sessionList.round'].replace('{round}', '1'))
  expect(html).toContain(en['sessionList.round'].replace('{round}', '2'))
  expect(html).toContain(en['sessionList.roundLatest'])
  expect(html).toContain('First round')
  expect(html).toContain('Current round')
  expect(html).toContain(en['sessionList.idle'])
  expect(html).toContain(en['sessionList.running'])
  expect(html).toContain(en['sessionList.unavailable'])
  expect(html).toContain(en['sessionList.unavailableMissing'])
  expect(html).not.toContain(en['sessionList.unavailableFailed'])
})

it('offers a retry for a native Session whose retain call failed', () => {
  const rows = taskAttemptRows(task, lookup, new Set(['s1']))
  const html = renderToStaticMarkup(createElement(LoomSessionList, { t, rows, onOpenSession: () => undefined }))
  expect(html).toContain(en['sessionList.unavailableFailed'])
  expect(html).toContain(en['sessionList.retry'])
  expect(rows[0]?.sessions[0]?.available).toBe(false)
})

it('marks an opened Session as selected and keeps every historical Session reachable', () => {
  const rows = taskAttemptRows(task, lookup, new Set())
  const html = renderToStaticMarkup(createElement(LoomSessionList, { t, rows, selectedSessionId: 's1', onOpenSession: () => undefined }))
  expect(html).toContain('aria-pressed="true"')
  expect(html).toContain('aria-pressed="false"')
  expect(html).toContain(en['sessionList.hint'])
})

it('renders an explicit empty state before the first execution round', () => {
  const html = renderToStaticMarkup(createElement(LoomSessionList, { t, rows: [], onOpenSession: () => undefined }))
  expect(html).toContain(en['sessionList.empty'])
  expect(html).not.toContain(en['sessionList.round'].replace('{round}', '1'))
})

it('keeps rounds selectable when a Session list entry has no native state yet', () => {
  const rows = taskAttemptRows(task, () => undefined, new Set())
  expect(rows.flatMap(row => row.sessions).every(session => session.unavailableReason === 'missing')).toBe(true)
  const html = renderToStaticMarkup(createElement(LoomSessionList, { t, rows, onOpenSession: () => undefined }))
  expect(html).toContain(en['sessionList.unavailableMissing'])
})

it('hides archived Sessions by default and reveals them from the archived toggle', () => {
  const rows = taskAttemptRows(task, lookup, new Set())
  const archived = new Set(['s1', 's3'])
  const hidden = renderToStaticMarkup(createElement(LoomSessionList, {
    t, rows, onOpenSession: () => undefined, archivedSessionIds: archived, showArchived: false,
    onToggleArchived: () => undefined, onArchiveSession: () => undefined, onUnarchiveSession: () => undefined,
  }))
  expect(hidden).not.toContain('First round')
  expect(hidden).not.toContain('>s3<')
  expect(hidden).toContain(en['session.archivedShow'].replace('{count}', '2'))
  expect(hidden).toContain(en['session.hiddenArchived'].replace('{count}', '1'))
  const shown = renderToStaticMarkup(createElement(LoomSessionList, {
    t, rows, onOpenSession: () => undefined, archivedSessionIds: archived, showArchived: true,
    onToggleArchived: () => undefined, onArchiveSession: () => undefined, onUnarchiveSession: () => undefined,
  }))
  expect(shown).toContain('First round')
  expect(shown).toContain('>s3<')
  expect(shown).toContain(en['session.archivedHide'])
  expect(shown).toContain(en['session.archived'])
  expect(shown).toContain(`aria-label="${en['session.unarchive']}"`)
})

it('disables archiving for Sessions that hold or wait for execution access', () => {
  const rows = taskAttemptRows(task, lookup, new Set())
  const html = renderToStaticMarkup(createElement(LoomSessionList, {
    t, rows, onOpenSession: () => undefined, archivedSessionIds: new Set<string>(),
    blockedSessionIds: new Set(['s1']), onArchiveSession: () => undefined,
  }))
  expect(html).toContain(`title="${en['session.archiveBlocked']}"`)
  expect(html.match(/aria-label="Archive session" title="Release[^"]*" disabled=""/gu)).toHaveLength(1)
})
