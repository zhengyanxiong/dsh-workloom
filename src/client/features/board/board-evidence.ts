/**
 * Real task evidence rendered by board rows and cards.
 *
 * Evidence comes from persisted execution ownership, workspace state and
 * structured outcomes; it is never inferred from model prose.
 */
import type { CatalogSnapshot, TaskRecord } from 'dsh-workloom/types'
import type { LoomKey } from '../../locales.ts'

/** Token tone family used by the evidence line. */
export type BoardEvidenceTone = 'muted' | 'accent' | 'success' | 'danger' | 'warning'

/** One short evidence line with its localized key and tone. */
export interface BoardEvidence {
  readonly key: LoomKey
  readonly tone: BoardEvidenceTone
  readonly params?: Readonly<Record<string, string>> | undefined
}

/**
 * Project the strongest real evidence for one task row.
 *
 * @param snapshot - catalog snapshot holding executions and workspaces.
 * @param task - task record to describe.
 * @returns the evidence line, or undefined when the row has nothing to add.
 */
export function boardEvidence(snapshot: CatalogSnapshot, task: TaskRecord): BoardEvidence | undefined {
  const attempt = task.attempts.at(-1)
  const workspace = attempt === undefined
    ? undefined
    : snapshot.workspaces.find(candidate => candidate.id === attempt.workspaceId)
  const execution = workspace === undefined
    ? undefined
    : snapshot.executions.find(candidate => candidate.workspaceId === workspace.id)
  const sessions = new Set<string>(attempt?.sessionIds ?? [])
  switch (task.status) {
    case 'running': {
      if (execution?.owner != null && sessions.has(execution.owner.sessionId)) {
        return { key: 'kb.evidence.owner', tone: 'muted' }
      }
      const position = execution === undefined
        ? -1
        : execution.waiting.findIndex(sessionId => sessions.has(sessionId))
      if (position >= 0) {
        return { key: 'kb.evidence.queued', tone: 'muted', params: { position: String(position + 1) } }
      }
      if (workspace?.mode === 'managed' || workspace?.rootOwner === 'loom') {
        return { key: 'kb.evidence.isolated', tone: 'muted' }
      }
      return undefined
    }
    case 'pending':
      return { key: 'kb.evidence.waitingLock', tone: 'muted' }
    case 'review': {
      const count = task.outcome?.testResults?.length ?? 0
      return count === 0
        ? { key: 'kb.evidence.noTests', tone: 'danger' }
        : { key: 'kb.evidence.tests', tone: 'success', params: { count: String(count) } }
    }
    case 'completed':
      return task.outcome?.state === 'accepted'
        ? { key: 'kb.evidence.verified', tone: 'success' }
        : { key: 'kb.evidence.archived', tone: 'muted' }
    case 'failed':
      return { key: 'kb.evidence.failed', tone: 'warning' }
  }
}

/**
 * Fill the localized evidence label.
 *
 * @param evidence - projected evidence.
 * @param translate - locale lookup.
 * @returns the display label with its placeholders filled.
 */
export function evidenceLabel(evidence: BoardEvidence, translate: (key: LoomKey) => string): string {
  const raw = translate(evidence.key)
  return Object.entries(evidence.params ?? {}).reduce(
    (label, [name, value]) => label.replace(`{${name}}`, value),
    raw,
  )
}
