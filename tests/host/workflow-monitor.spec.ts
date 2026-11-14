import { expect, it } from 'vitest'
import { WorkflowMonitor } from '../../src/host/workflow-monitor.ts'

const event = (type: string, data: unknown): { readonly type: string; readonly data: unknown } => ({ type, data })

it('folds workflow run, phase, member and settlement events into one view', () => {
  const monitor = new WorkflowMonitor()
  monitor.observe('s1', event('tool-workflow/run-start', { runId: 'r1', name: 'review' }))
  monitor.observe('s1', event('tool-workflow/agent-start', { runId: 'r1', seq: 1, label: 'schema', phase: 'analysis', childId: 'c1' }))
  monitor.observe('s1', event('tool-workflow/agent-start', { runId: 'r1', seq: 2, label: 'impl', phase: 'build', childId: 'c2' }))
  monitor.observe('s1', event('tool-workflow/agent-start', { runId: 'r1', seq: 3, label: 'audit', childId: 'c3' }))
  monitor.observe('s1', event('tool-workflow/agent-end', { runId: 'r1', seq: 1, outcome: 'completed' }))
  monitor.observe('s1', event('tool-workflow/run-end', { runId: 'r1', stopReason: 'completed' }))
  expect(monitor.read(['s1'])).toEqual([{
    sessionId: 's1',
    runId: 'r1',
    name: 'review',
    status: 'completed',
    phases: [
      { phase: 'analysis', members: [{ seq: 1, label: 'schema', childId: 'c1', phase: 'analysis', status: 'completed' }] },
      { phase: 'build', members: [{ seq: 2, label: 'impl', childId: 'c2', phase: 'build', status: 'running' }] },
      { phase: null, members: [{ seq: 3, label: 'audit', childId: 'c3', status: 'running' }] },
    ],
  }])
  expect(monitor.read(['other'])).toEqual([])
})

it('ignores unknown or malformed workflow payloads', () => {
  const monitor = new WorkflowMonitor()
  monitor.observe('s1', event('tool-workflow/run-start', { runId: 1 }))
  monitor.observe('s1', event('tool-workflow/agent-start', { runId: 'missing', seq: 1, label: 'x', childId: 'c' }))
  monitor.observe('s1', event('unrelated', { runId: 'r1' }))
  expect(monitor.read(['s1'])).toEqual([])
})
