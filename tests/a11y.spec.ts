/** @vitest-environment jsdom */
import axe from 'axe-core'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { CatalogSnapshot, ProjectRecord, TaskRecord, VersionRecord } from 'dsh-workloom/types'
import { LoomCommandPalette } from '../src/client/LoomCommandPalette.tsx'
import { LoomProjectPage } from '../src/client/shell/LoomProjectPage.tsx'
import { en, type LoomKey } from '../src/client/locales.ts'

const t = (key: LoomKey) => en[key]
const project: ProjectRecord = { id: brandString<'loom.project'>('p1'), config: { name: 'Shop', sources: [{ id: 'web', repo: '/repos/web', path: '.' }], modules: [] } }
const version: VersionRecord = { id: brandString<VersionRecord['id']>('v1'), projectId: project.id, name: 'v1', description: 'Checkout work', sources: [] }
const lock = { id: brandString<'loom.lock'>('lock1'), versionId: version.id, repositories: [{ sourceId: brandString<'loom.source'>('web'), commit: 'abcdef1' }] }
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

/** Render a React tree into jsdom and return the mounted body. */
async function mount(element: JSX.Element): Promise<HTMLElement> {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => { root?.render(element) })
  return document.body
}

/** Run axe without colour contrast, which jsdom cannot evaluate without layout. */
async function violationsFor(element: JSX.Element): Promise<{ id: string; impact: string | null }[]> {
  const body = await mount(element)
  const result = await axe.run(body, { rules: { 'color-contrast': { enabled: false } } })
  return result.violations.map(item => ({ id: item.id, impact: item.impact ?? null }))
}

it('keeps the project page free of serious accessibility violations', async () => {
  const violations = await violationsFor(createElement(LoomProjectPage, {
    t,
    snapshot,
    project,
    version,
    onProject: () => undefined,
    onVersion: () => undefined,
    onTask: () => undefined,
    onBoard: () => undefined,
    onNewTask: () => undefined,
    onNewVersion: () => undefined,
    onEditProject: () => undefined,
    onEditVersion: () => undefined,
    onSession: () => undefined,
  }))
  expect(violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([])
})

it('keeps the command palette free of serious accessibility violations', async () => {
  const violations = await violationsFor(createElement(LoomCommandPalette, {
    open: true,
    t,
    snapshot,
    onClose: () => undefined,
    onActivate: () => undefined,
  }))
  expect(violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([])
})
