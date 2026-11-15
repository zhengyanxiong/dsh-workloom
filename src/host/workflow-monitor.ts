/** In-memory workflow run fold fed by native Session events. */
import type {
  WorkflowRunMemberView, WorkflowRunPhaseView, WorkflowRunStatus, WorkflowRunView,
} from '../api/workflow-runs.ts'

/** Minimal event surface the monitor consumes from the Host session stream. */
export interface WorkflowMonitorEvent {
  readonly type: string
  readonly data: unknown
}

interface MemberState {
  readonly seq: number
  readonly label: string
  readonly childId: string
  readonly phase?: string | undefined
  status: WorkflowRunStatus
}

interface RunState {
  readonly runId: string
  readonly name: string
  status: WorkflowRunStatus
  readonly members: Map<number, MemberState>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function stringField(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key]
  return typeof value === 'string' && value !== '' ? value : undefined
}

function numberField(data: Record<string, unknown>, key: string): number | undefined {
  const value = data[key]
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined
}

function outcomeStatus(value: unknown): WorkflowRunStatus {
  return value === 'completed' ? 'completed' : value === 'cancelled' ? 'cancelled' : 'failed'
}

function runStatus(stopReason: unknown): WorkflowRunStatus {
  return stopReason === 'completed' ? 'completed' : stopReason === 'cancelled' ? 'cancelled' : 'failed'
}

/** Fold `tool-workflow/*` records into the views the run graph renders. */
export class WorkflowMonitor {
  private readonly sessions = new Map<string, Map<string, RunState>>()

  /**
   * Apply one committed Session event.
   * @param sessionId - Session that owns the workflow record.
   * @param event - committed event type and payload.
   */
  observe(sessionId: string, event: WorkflowMonitorEvent): void {
    if (!event.type.startsWith('tool-workflow/') || !isRecord(event.data)) return
    const data = event.data
    const runId = stringField(data, 'runId')
    if (runId === undefined) return
    let runs = this.sessions.get(sessionId)
    if (event.type === 'tool-workflow/run-start') {
      const name = stringField(data, 'name')
      if (name === undefined) return
      if (runs === undefined) { runs = new Map(); this.sessions.set(sessionId, runs) }
      runs.set(runId, { runId, name, status: 'running', members: new Map() })
      return
    }
    if (runs === undefined) return
    const run = runs.get(runId)
    if (run === undefined) return
    if (event.type === 'tool-workflow/agent-start') {
      const seq = numberField(data, 'seq')
      const label = stringField(data, 'label')
      const childId = stringField(data, 'childId')
      if (seq === undefined || label === undefined || childId === undefined) return
      const phase = stringField(data, 'phase')
      run.members.set(seq, {
        seq, label, childId, status: 'running',
        ...(phase === undefined ? {} : { phase }),
      })
      return
    }
    if (event.type === 'tool-workflow/agent-end') {
      const seq = numberField(data, 'seq')
      const member = seq === undefined ? undefined : run.members.get(seq)
      if (member !== undefined) member.status = outcomeStatus(data.outcome)
      return
    }
    if (event.type === 'tool-workflow/run-end') run.status = runStatus(data.stopReason)
  }

  /**
   * Read runs for the requested Sessions.
   * @param sessionIds - Session identities to include.
   * @returns one flat list of run views.
   */
  read(sessionIds: readonly string[]): readonly WorkflowRunView[] {
    const result: WorkflowRunView[] = []
    for (const sessionId of sessionIds) {
      const runs = this.sessions.get(sessionId)
      if (runs === undefined) continue
      for (const run of runs.values()) result.push(viewOf(sessionId, run))
    }
    return result
  }
}

function viewOf(sessionId: string, run: RunState): WorkflowRunView {
  const phases = new Map<string | null, WorkflowRunMemberView[]>()
  for (const member of [...run.members.values()].sort((left, right) => left.seq - right.seq)) {
    const phase = member.phase === undefined ? null : member.phase
    const group = phases.get(phase)
    const view: WorkflowRunMemberView = {
      seq: member.seq,
      label: member.label,
      childId: member.childId,
      status: member.status,
      ...(member.phase === undefined ? {} : { phase: member.phase }),
    }
    if (group === undefined) phases.set(phase, [view])
    else group.push(view)
  }
  const grouped: WorkflowRunPhaseView[] = [...phases].map(([phase, members]) => ({ phase, members }))
  return { sessionId, runId: run.runId, name: run.name, status: run.status, phases: grouped }
}
