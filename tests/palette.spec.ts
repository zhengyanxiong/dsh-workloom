/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { CatalogSnapshot, ProjectRecord, TaskRecord, VersionRecord } from 'dsh-workloom/types'
import { LoomCommandPalette } from '../src/client/LoomCommandPalette.tsx'
import { buildPaletteItems, filterPaletteItems } from '../src/client/palette.ts'
import { en, type LoomKey } from '../src/client/locales.ts'

const t = (key: LoomKey) => en[key]
const project: ProjectRecord = { id: brandString<'loom.project'>('p1'), config: { name: 'Shop', sources: [{ id: 'web', repo: '/repos/web', path: '.' }], modules: [] } }
const version: VersionRecord = { id: brandString<VersionRecord['id']>('v1'), projectId: project.id, name: 'v1', sources: [] }
const lock = { id: brandString<'loom.lock'>('lock1'), versionId: version.id, repositories: [] }
const sessionId = brandString<'SessionId'>('session-1')
const attempt = { id: brandString<'loom.attempt'>('a1'), lock, workspaceId: brandString<'loom.workspace'>('w1'), sessionIds: [sessionId], status: 'running' as const }
const task: TaskRecord = { id: brandString<TaskRecord['id']>('t1'), versionId: version.id, title: 'Checkout flow', status: 'running', priority: 'high', attempts: [attempt] }
const snapshot: CatalogSnapshot = { projects: [project], versions: [version], locks: [lock], tasks: [task], workspaces: [], temporarySessions: [], audit: [], executions: [] }

let root: Root | undefined
afterEach(async () => {
  await act(async () => { root?.unmount() })
  root = undefined
  document.body.replaceChildren()
})

/** Modal portals to the body, so palette tests render on a client root. */
async function renderPalette(onActivate = vi.fn()): Promise<{ onActivate: ReturnType<typeof vi.fn>; onClose: ReturnType<typeof vi.fn> }> {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const onClose = vi.fn()
  const container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(LoomCommandPalette, { open: true, t, snapshot, onClose, onActivate }))
  })
  return { onActivate, onClose }
}

it('builds page rows before projects, versions, tasks and sessions', () => {
  const items = buildPaletteItems(t, snapshot)
  expect(items.slice(0, 6).map(item => item.target.kind)).toEqual(['page', 'page', 'page', 'page', 'page', 'page'])
  expect(items.map(item => item.target.kind)).toContain('project')
  expect(items.map(item => item.target.kind)).toContain('version')
  const taskRow = items.find(item => item.target.kind === 'task')
  expect(taskRow?.label).toBe('Checkout flow')
  expect(taskRow?.detail).toContain(en['task.status.running'])
  expect(items.find(item => item.target.kind === 'session')?.target).toEqual({ kind: 'session', sessionId })
})

it('filters across labels and details without case sensitivity', () => {
  const items = buildPaletteItems(t, snapshot)
  expect(filterPaletteItems(items, 'checkout').map(item => item.target.kind)).toEqual(['task', 'session'])
  expect(filterPaletteItems(items, 'SETTINGS').some(item => item.label === en['nav.settings'])).toBe(true)
  expect(filterPaletteItems(items, '')).toHaveLength(items.length)
  expect(filterPaletteItems(items, 'no-such-loom-object')).toEqual([])
})

it('renders grouped rows and activates the highlighted destination', async () => {
  const { onActivate } = await renderPalette()
  const input = document.querySelector<HTMLInputElement>('input[role="combobox"]')
  expect(input).not.toBeNull()
  expect(input?.getAttribute('placeholder')).toBe(en['palette.placeholder'])
  expect(document.body.textContent).toContain(en['palette.group.page'])
  expect(document.body.textContent).toContain(en['palette.group.task'])
  expect(document.body.textContent).toContain('Checkout flow')
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  await act(async () => {
    setValue?.call(input, 'checkout')
    input?.dispatchEvent(new Event('input', { bubbles: true }))
  })
  expect(document.body.textContent).toContain('Checkout flow')
  expect(document.body.textContent).not.toContain(en['nav.settings'])
  await act(async () => {
    input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })
  expect(onActivate).toHaveBeenCalledTimes(1)
  expect((onActivate.mock.calls[0]?.[0] as { target: { kind: string } }).target.kind).toBe('task')
})
