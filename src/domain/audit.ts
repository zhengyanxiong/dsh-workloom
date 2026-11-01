/** Durable business audit entries for Loom-managed state changes. */

/** Stable audit event names; labels and presentation belong to callers. */
export type AuditEvent =
  | 'project.created'
  | 'project.updated'
  | 'project.deleted'
  | 'version.created'
  | 'version.updated'
  | 'version.deleted'
  | 'lock.generated'
  | 'task.created'
  | 'task.updated'
  | 'task.deleted'
  | 'task.transitioned'
  /** An Agent asked for human review and attached completion evidence. */
  | 'task.review-requested'
  /** An Agent suggested failure with a stated reason; the status never changed. */
  | 'task.failure-suggested'
  /** A human completed or failed a task consistently with the Agent suggestion. */
  | 'task.confirmation-accepted'
  /** A human decided against the Agent suggestion. */
  | 'task.confirmation-rejected'
  | 'workspace.prepared'
  | 'workspace.updated'
  | 'workspace.cleaned'
  | 'attempt.started'
  | 'session.attached'
  | 'execution.acquired'
  | 'execution.queued'
  | 'execution.released'
  | 'execution.takeover-requested'
  | 'execution.takeover-stopped'
  | 'execution.takeover-blocked'

/** One committed business event; detail is a short human-readable summary. */
export interface AuditEntry {
  readonly id: string
  readonly at: number
  readonly actor: 'human' | 'agent' | 'system'
  readonly event: AuditEvent
  readonly taskId?: string | undefined
  /** Execution round the event concerns, when one exists. */
  readonly attemptId?: string | undefined
  readonly workspaceId?: string | undefined
  readonly sessionId?: string | undefined
  /** Stated basis for a suggestion or human confirmation decision. */
  readonly basis?: string | undefined
  readonly detail?: string | undefined
}
