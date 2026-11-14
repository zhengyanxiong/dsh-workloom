/** Read-only workflow-run facts exposed to the Loom run monitor. */
export type WorkflowRunStatus = 'running' | 'completed' | 'failed' | 'cancelled'

/** One workflow member and the child Session it started. */
export interface WorkflowRunMemberView {
  readonly seq: number
  readonly label: string
  readonly childId: string
  readonly phase?: string | undefined
  readonly status: WorkflowRunStatus
}

/** One phase group in a workflow run. */
export interface WorkflowRunPhaseView {
  /** Exact phase text, or null when the member omitted its phase. */
  readonly phase: string | null
  readonly members: readonly WorkflowRunMemberView[]
}

/** One workflow run observed in a Session. */
export interface WorkflowRunView {
  readonly sessionId: string
  readonly runId: string
  readonly name: string
  readonly status: WorkflowRunStatus
  readonly phases: readonly WorkflowRunPhaseView[]
}

/** Request for workflow runs of the given Sessions. */
export interface WorkflowRunsRequest {
  readonly sessionIds: readonly string[]
}
