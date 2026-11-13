/** Recursive run graph built from native Session lineage and background jobs. */
import type { LoomJobView } from '../../../ports/loom-jobs.ts'

/** Display status shared by session and background-job nodes. */
export type RunGraphStatus = 'running' | 'completed' | 'failed' | 'cancelled' | 'idle'

/** One Session node in the run graph. */
export interface RunGraphSessionInput {
  readonly id: string
  readonly parentId?: string | undefined
  readonly label: string
  readonly running: boolean
  readonly updatedAt: number
  readonly origin?: 'subagent' | undefined
}

/** Native summary subset needed to walk Session lineage. */
export interface RunGraphSessionSummary {
  readonly parentId?: unknown
  readonly displayTitle?: string | undefined
  readonly running?: boolean | undefined
  readonly updatedAt?: number | undefined
  readonly origin?: 'subagent' | undefined
}

/**
 * Walk every loaded Session once and keep roots plus their descendants.
 * @param rootIds - task Session ids selected as graph roots.
 * @param summaries - loaded native Session summaries.
 * @returns lineage rows in catalog order, roots first.
 */
export function collectSessionLineage(
  rootIds: readonly string[],
  summaries: Readonly<Record<string, RunGraphSessionSummary | undefined>>,
): readonly RunGraphSessionInput[] {
  const roots = new Set(rootIds)
  const lineage = new Set(rootIds)
  let changed = true
  while (changed) {
    changed = false
    for (const [id, summary] of Object.entries(summaries)) {
      const parentId = summary?.parentId
      if (id === '' || lineage.has(id) || parentId === undefined || parentId === null) continue
      if (lineage.has(String(parentId))) {
        lineage.add(id)
        changed = true
      }
    }
  }
  const rows: RunGraphSessionInput[] = []
  for (const id of roots) {
    const summary = summaries[id]
    rows.push({
      id,
      label: summary?.displayTitle ?? id,
      running: summary?.running === true,
      updatedAt: summary?.updatedAt ?? 0,
      ...(summary?.parentId === undefined || summary?.parentId === null ? {} : { parentId: String(summary.parentId) }),
      ...(summary?.origin === undefined ? {} : { origin: summary.origin }),
    })
  }
  for (const [id, summary] of Object.entries(summaries)) {
    if (summary === undefined || roots.has(id) || !lineage.has(id)) continue
    rows.push({
      id,
      label: summary.displayTitle ?? id,
      running: summary.running === true,
      updatedAt: summary.updatedAt ?? 0,
      ...(summary.parentId === undefined || summary.parentId === null ? {} : { parentId: String(summary.parentId) }),
      ...(summary.origin === undefined ? {} : { origin: summary.origin }),
    })
  }
  return rows
}

/** One session or job node in the rendered run tree. */
export interface RunGraphNode {
  readonly kind: 'session' | 'job'
  readonly id: string
  readonly label: string
  readonly status: RunGraphStatus
  readonly parentId?: string | undefined
  readonly updatedAt?: number | undefined
  readonly progress?: string | undefined
  readonly detail?: string | undefined
  readonly origin?: 'subagent' | undefined
  readonly children: readonly RunGraphNode[]
}

/** One flattened node with its tree depth. */
export interface FlatRunGraphNode extends RunGraphNode {
  readonly depth: number
}

function jobStatus(status: LoomJobView['status']): RunGraphStatus {
  switch (status) {
    case 'running': return 'running'
    case 'stopping': return 'running'
    case 'completed': return 'completed'
    case 'failed': return 'failed'
    case 'killed': return 'cancelled'
  }
}

function sortNodes(nodes: readonly RunGraphNode[]): RunGraphNode[] {
  return [...nodes].sort((left, right) => {
    const running = Number(right.status === 'running') - Number(left.status === 'running')
    if (running !== 0) return running
    return (right.updatedAt ?? 0) - (left.updatedAt ?? 0)
  })
}

/**
 * Fold Session lineage and job rows into one recursive tree.
 * @param rows - Sessions belonging to the selected task's lineage.
 * @param jobsBySession - Background jobs keyed by owning Session id.
 * @returns root Session nodes with child Sessions, then their jobs.
 */
export function buildRunGraph(
  rows: readonly RunGraphSessionInput[],
  jobsBySession: Readonly<Record<string, readonly LoomJobView[] | undefined>>,
): readonly RunGraphNode[] {
  const byId = new Map<string, { node: RunGraphNode; children: RunGraphNode[] }>()
  for (const row of rows) {
    const children: RunGraphNode[] = []
    byId.set(row.id, {
      children,
      node: {
        kind: 'session',
        id: row.id,
        label: row.label,
        status: row.running ? 'running' : 'idle',
        ...(row.parentId === undefined ? {} : { parentId: row.parentId }),
        updatedAt: row.updatedAt,
        ...(row.origin === undefined ? {} : { origin: row.origin }),
        children,
      },
    })
  }
  const roots: RunGraphNode[] = []
  for (const entry of byId.values()) {
    const parent = entry.node.parentId === undefined ? undefined : byId.get(entry.node.parentId)
    if (parent === undefined) roots.push(entry.node)
    else parent.children.push(entry.node)
  }
  for (const [sessionId, jobs] of Object.entries(jobsBySession)) {
    const owner = byId.get(sessionId)
    if (owner === undefined || jobs === undefined) continue
    for (const job of jobs) {
      owner.children.push({
        kind: 'job',
        id: job.id,
        label: job.label,
        status: jobStatus(job.status),
        ...(job.progress === undefined ? {} : { progress: job.progress }),
        ...(job.detail === undefined ? {} : { detail: job.detail }),
        updatedAt: job.finishedAt ?? job.startedAt,
        children: [],
      })
    }
  }
  const sortDeep = (nodes: readonly RunGraphNode[]): RunGraphNode[] => sortNodes(nodes).map(node => ({
    ...node,
    children: sortDeep(node.children),
  }))
  return sortDeep(roots)
}

/**
 * Flatten a run tree into display order.
 * @param roots - root nodes from {@link buildRunGraph}.
 * @returns nodes with their depth, parents before children.
 */
export function flattenRunGraph(roots: readonly RunGraphNode[]): readonly FlatRunGraphNode[] {
  const result: FlatRunGraphNode[] = []
  const visit = (nodes: readonly RunGraphNode[], depth: number): void => {
    for (const node of nodes) {
      result.push({ ...node, depth })
      visit(node.children, depth + 1)
    }
  }
  visit(roots, 0)
  return result
}
