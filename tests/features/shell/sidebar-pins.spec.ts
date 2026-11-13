import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { CatalogSnapshot, ProjectRecord, TaskRecord, VersionRecord } from 'dsh-workloom/types'
import { LoomSidebar } from '../../../src/client/shell/LoomSidebar.tsx'
import { en, type LoomKey } from '../../../src/client/shared/locales.ts'

const t = (key: LoomKey) => en[key]
const project: ProjectRecord = { id: brandString<'loom.project'>('p1'), config: { name: 'Shop', sources: [], modules: [] } }
const version: VersionRecord = { id: brandString<'loom.version'>('v1'), projectId: project.id, name: 'v-one', sources: [] }
const task: TaskRecord = { id: brandString<TaskRecord['id']>('t1'), versionId: version.id, title: 'Checkout task', status: 'running', attempts: [] }
const snapshot: CatalogSnapshot = { projects: [project], versions: [version], locks: [], tasks: [task], workspaces: [], temporarySessions: [], audit: [], executions: [] }

it('renders a pinned project as a shortcut without duplicating its expanded tree', () => {
  const noop = (): void => undefined
  const html = renderToStaticMarkup(createElement(LoomSidebar, {
    className: 'sidebar', t, snapshot, project: undefined, version: undefined, task: undefined,
    pinnedProjects: [project.id], collapsedSections: new Set(), expandedProjects: new Set([String(project.id)]),
    expandedVersions: new Set([String(version.id)]), search: '', taskSessionList: [], temporarySessionList: [],
    taskProjectBySession: new Map(), taskTitleBySession: new Map(), temporaryProjectBySession: new Map(), boundRows: [],
    selected: undefined, sessionLimit: 5, createDisabledTask: false,
    onToggleSection: noop, onSearch: noop, onProject: noop, onVersion: noop, onTask: noop, onPin: noop,
    onNewVersion: noop, onEditProject: noop, onDeleteProject: noop, onEditVersion: noop, onDeleteVersion: noop,
    onNewTask: noop, onEditTask: noop, onDeleteTask: noop, onSelectSession: noop, onCreateProject: noop,
    onCreateTask: noop, onOpenTemporary: noop,
  }))
  expect(html.match(/v-one/gu)).toHaveLength(2)
  expect(html.match(/Checkout task/gu)).toHaveLength(2)
})
