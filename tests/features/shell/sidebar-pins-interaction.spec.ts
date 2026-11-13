/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { CatalogSnapshot, ProjectRecord, VersionRecord } from 'dsh-workloom/types'
import { LoomSidebar } from '../../../src/client/shell/LoomSidebar.tsx'
import { en, type LoomKey } from '../../../src/client/shared/locales.ts'

const t = (key: LoomKey) => en[key]
const project: ProjectRecord = { id: brandString<'loom.project'>('p1'), config: { name: 'Shop', sources: [], modules: [] } }
const version: VersionRecord = { id: brandString<'loom.version'>('v1'), projectId: project.id, name: 'v-one', sources: [] }
const snapshot: CatalogSnapshot = { projects: [project], versions: [version], locks: [], tasks: [], workspaces: [], temporarySessions: [], audit: [], executions: [] }

let root: Root | undefined
let container: HTMLDivElement | undefined
afterEach(async () => {
  await act(async () => { root?.unmount() })
  container?.remove()
  root = undefined
  container = undefined
})

it('opens a pinned project through its own handler without touching the project tree', async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  let pinnedOpens = 0
  let treeOpens = 0
  let unpins = 0
  const noop = (): void => undefined
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(LoomSidebar, {
      className: 'sidebar', t, snapshot, project: undefined, version: undefined, task: undefined,
      pinnedProjects: [project.id], collapsedSections: new Set(), expandedProjects: new Set(),
      expandedVersions: new Set(), search: '', taskSessionList: [], temporarySessionList: [],
      taskProjectBySession: new Map(), taskTitleBySession: new Map(), temporaryProjectBySession: new Map(), boundRows: [],
      selected: undefined, sessionLimit: 5, createDisabledTask: false,
      onToggleSection: noop, onSearch: noop,
      onProject: () => { treeOpens += 1 }, onPinnedProject: () => { pinnedOpens += 1 },
      onVersion: noop, onTask: noop, onPin: () => { unpins += 1 }, onNewVersion: noop, onEditProject: noop,
      onDeleteProject: noop, onEditVersion: noop, onDeleteVersion: noop, onNewTask: noop,
      onEditTask: noop, onDeleteTask: noop, onSelectSession: noop, onCreateProject: noop,
      onCreateTask: noop, onOpenTemporary: noop,
    }))
  })
  const pinnedButton = [...container.querySelectorAll<HTMLButtonElement>('button[title="Shop"]')][0]
  expect(pinnedButton).toBeDefined()
  await act(async () => { pinnedButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
  expect(pinnedOpens).toBe(1)
  expect(treeOpens).toBe(0)
  const unpinButton = [...container.querySelectorAll<HTMLButtonElement>(`button[aria-label="${en['side.unpin']}"]`)][0]
  expect(unpinButton).toBeDefined()
  await act(async () => { unpinButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
  expect(unpins).toBe(1)
})
