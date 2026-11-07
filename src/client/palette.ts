/** Command palette items built from the committed catalog snapshot. */
import type { CatalogSnapshot, ProjectRecord, TaskRecord, VersionRecord } from 'dsh-workloom/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { LoomKey } from './locales.ts'
import { LOOM_ROUTES, type LoomRoute } from './shell/router.ts'
import { ROUTE_LABEL } from './shell/route-labels.ts'
import { STATUS_META } from './shell.ts'

/** Item families shown in the palette. */
export type LoomPaletteKind = 'page' | 'project' | 'version' | 'task' | 'session'

/** Destination of a palette row. */
export type LoomPaletteTarget =
  | { readonly kind: 'page'; readonly route: LoomRoute }
  | { readonly kind: 'project'; readonly projectId: ProjectRecord['id'] }
  | { readonly kind: 'version'; readonly projectId: ProjectRecord['id']; readonly versionId: VersionRecord['id'] }
  | { readonly kind: 'task'; readonly taskId: TaskRecord['id'] }
  | { readonly kind: 'session'; readonly sessionId: SessionId }

/** One searchable row in the command palette. */
export interface LoomPaletteItem {
  readonly id: string
  readonly kind: LoomPaletteKind
  readonly label: string
  readonly detail?: string | undefined
  readonly target: LoomPaletteTarget
}

/** Group labels in palette order. */
export const PALETTE_GROUP: Readonly<Record<LoomPaletteKind, LoomKey>> = {
  page: 'palette.group.page',
  project: 'palette.group.project',
  version: 'palette.group.version',
  task: 'palette.group.task',
  session: 'palette.group.session',
}

/** Page rows in palette order. */
export const PALETTE_ORDER: readonly LoomPaletteKind[] = ['page', 'project', 'version', 'task', 'session']

/**
 * Build the palette rows for every navigable Loom object.
 * @param t - locale lookup for page labels.
 * @param snapshot - committed catalog snapshot, absent while loading.
 * @returns page rows first, then projects, versions, tasks and sessions.
 */
export function buildPaletteItems(t: (key: LoomKey) => string, snapshot: CatalogSnapshot | undefined): readonly LoomPaletteItem[] {
  const pages: LoomPaletteItem[] = LOOM_ROUTES.map(route => ({
    id: `page:${route}`,
    kind: 'page',
    label: t(ROUTE_LABEL[route]),
    target: { kind: 'page', route },
  }))
  if (snapshot === undefined) return pages
  const projectById = new Map(snapshot.projects.map(project => [project.id, project]))
  const projectName = (projectId: ProjectRecord['id']): string => projectById.get(projectId)?.config.name ?? '—'
  const projects = snapshot.projects.map((project): LoomPaletteItem => ({
    id: `project:${project.id}`,
    kind: 'project',
    label: project.config.name,
    detail: `${String(project.config.sources.length)} repos · ${String(snapshot.versions.filter(version => version.projectId === project.id).length)} versions`,
    target: { kind: 'project', projectId: project.id },
  }))
  const versions = snapshot.versions.map((version): LoomPaletteItem => ({
    id: `version:${version.id}`,
    kind: 'version',
    label: version.name,
    detail: `${projectName(version.projectId)} · ${String(snapshot.tasks.filter(task => task.versionId === version.id).length)} tasks`,
    target: { kind: 'version', projectId: version.projectId, versionId: version.id },
  }))
  const projectNameOfTask = (task: TaskRecord): string => {
    const version = snapshot.versions.find(candidate => candidate.id === task.versionId)
    return version === undefined ? '—' : projectName(version.projectId)
  }
  const tasks = [...snapshot.tasks]
    .sort((left, right) => timestamp(right) - timestamp(left))
    .map((task): LoomPaletteItem => ({
      id: `task:${task.id}`,
      kind: 'task',
      label: task.title,
      detail: `${projectNameOfTask(task)} · ${t(STATUS_META[task.status].key)}`,
      target: { kind: 'task', taskId: task.id },
    }))
  const sessions = [...snapshot.tasks]
    .sort((left, right) => timestamp(right) - timestamp(left))
    .flatMap(task => (task.attempts.at(-1)?.sessionIds ?? []).map((sessionId): LoomPaletteItem => ({
      id: `session:${sessionId}`,
      kind: 'session',
      label: task.title,
      detail: projectNameOfTask(task),
      target: { kind: 'session', sessionId },
    })))
  return [...pages, ...projects, ...versions, ...tasks, ...sessions]
}

/**
 * Filter palette rows by a case-insensitive query over label and detail.
 * @param items - rows to search.
 * @param query - user query; blank keeps every row.
 * @returns matching rows in their original order.
 */
export function filterPaletteItems(items: readonly LoomPaletteItem[], query: string): readonly LoomPaletteItem[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return items
  return items.filter(item => `${item.label} ${item.detail ?? ''}`.toLowerCase().includes(needle))
}

/** Sort key for a task timestamp; missing or unparsable values sort last. */
function timestamp(task: TaskRecord): number {
  const parsed = task.updatedAt === undefined ? Number.NaN : Date.parse(task.updatedAt)
  return Number.isNaN(parsed) ? 0 : parsed
}
