import { expect, it } from 'vitest'
import { buildRunGraph, collectSessionLineage, flattenRunGraph, type RunGraphSessionInput } from '../../../src/client/features/session/run-graph.ts'
import type { LoomJobView } from '../../../src/ports/loom-jobs.ts'

const rows: readonly RunGraphSessionInput[] = [
  { id: 'root', label: 'Main session', running: true, updatedAt: 3 },
  { id: 'child', parentId: 'root', label: 'Workflow agent', running: true, updatedAt: 2, origin: 'subagent' },
  { id: 'grandchild', parentId: 'child', label: 'Nested agent', running: false, updatedAt: 1, origin: 'subagent' },
]
const job = (id: string, status: LoomJobView['status'], label = id): LoomJobView => ({ id, label, status, startedAt: 1 })

it('builds a recursive run graph with sessions before their background jobs', () => {
  const roots = buildRunGraph(rows, { root: [job('root-job', 'running')], child: [job('child-job', 'completed')] })
  expect(roots).toHaveLength(1)
  expect(roots[0]?.kind).toBe('session')
  expect(roots[0]?.id).toBe('root')
  expect(roots[0]?.children.map(node => `${node.kind}:${node.id}`)).toEqual(['session:child', 'job:root-job'])
  expect(roots[0]?.children[0]?.children.map(node => `${node.kind}:${node.id}`)).toEqual(['session:grandchild', 'job:child-job'])
})

it('flattens the graph in display order with depth', () => {
  const roots = buildRunGraph(rows, { root: [job('root-job', 'running')] })
  expect(flattenRunGraph(roots).map(node => `${node.depth}:${node.id}`)).toEqual([
    '0:root', '1:child', '2:grandchild', '1:root-job',
  ])
})

it('collects every descendant of the selected task Sessions', () => {
  const rows = collectSessionLineage(['root'], {
    root: { displayTitle: 'Root', running: true, updatedAt: 3 },
    child: { parentId: 'root', displayTitle: 'Child', running: true, updatedAt: 2, origin: 'subagent' },
    grandchild: { parentId: 'child', displayTitle: 'Grandchild', running: false, updatedAt: 1 },
    unrelated: { parentId: 'other-root', displayTitle: 'Unrelated', running: true, updatedAt: 4 },
  })
  expect(rows.map(row => row.id).sort()).toEqual(['child', 'grandchild', 'root'])
  expect(rows.find(row => row.id === 'child')?.origin).toBe('subagent')
})

it('keeps a session whose parent is outside the selected task as a root', () => {
  const roots = buildRunGraph([{ id: 'orphan', parentId: 'elsewhere', label: 'Orphan', running: false, updatedAt: 0 }], {})
  expect(roots.map(node => node.id)).toEqual(['orphan'])
})
