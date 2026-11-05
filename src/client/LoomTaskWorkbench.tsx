/** Task-centred Workbench page: brief, execution sessions and the human acceptance decision. */
import type { CSSProperties, ReactNode } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { Tag, type TagTone } from '@deepseek-ai/dsh-client-ui-primitives'
import type { AuditEntry, CatalogSnapshot, ProjectRecord, TaskRecord, VersionRecord } from 'dsh-workloom/types'
import { ACTOR_LABEL, AUDIT_LABEL, COLORS, metaLine, PRIORITY_META, STATUS_META } from './shell.ts'
import type { LoomKey } from './locales.ts'
import type { LoadWorkspaceChanges } from './LoomDiff.tsx'
import { ExecutionPanel, type ExecutionActions } from './LoomExecution.tsx'
import { LoomOutcomePanel } from './LoomOutcomePanel.tsx'
import { LoomExecutionQueue } from './LoomExecutionQueue.tsx'
import type { TaskAttemptRow } from './projection.ts'
import { absoluteTime, relativeTime } from './time.ts'

type Translate = (key: LoomKey, params?: Readonly<Record<string, string>>) => string

const shell: CSSProperties = { flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', background: COLORS.panel }
const head: CSSProperties = { flex: 'none', display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 22px 13px', borderBottom: `0.5px solid ${COLORS.border}`, background: COLORS.panel }
const headingBlock: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0, flex: 1 }
const titleLine: CSSProperties = { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, minWidth: 0 }
const title: CSSProperties = { margin: 0, minWidth: 0, overflowWrap: 'anywhere', fontSize: 15, lineHeight: 1.35, fontWeight: 500, color: COLORS.text }
const subtitle: CSSProperties = { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, minWidth: 0, color: COLORS.faint, fontSize: 11 }
const separator: CSSProperties = { color: COLORS.borderStrong, userSelect: 'none' }
const page: CSSProperties = { flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: '18px 22px 24px' }
const stack: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 14, width: '100%', maxWidth: 760, margin: '0 auto' }
const card: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0, padding: '16px 18px', background: COLORS.panel, border: `0.5px solid ${COLORS.border}`, borderRadius: 10 }
const sectionHeader: CSSProperties = { display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', minWidth: 0 }
const sectionTitle: CSSProperties = { margin: 0, color: COLORS.text, fontSize: 12.5, fontWeight: 500, lineHeight: 1.4 }
const sectionHint: CSSProperties = { margin: 0, ...metaLine, fontSize: 11, lineHeight: 1.5 }
const description: CSSProperties = { margin: 0, color: COLORS.dim, fontSize: 12.5, lineHeight: 1.7, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }
const muted: CSSProperties = { margin: 0, color: COLORS.faint, fontSize: 12, lineHeight: 1.6 }
const checklist: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 7, margin: 0, padding: 0, listStyle: 'none' }
const checklistRow: CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 0, color: COLORS.dim, fontSize: 12, lineHeight: 1.55 }
const check: CSSProperties = { flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, marginTop: 2, borderRadius: 999, border: `1px solid ${COLORS.borderStrong}`, color: COLORS.green, fontSize: 9 }
const activityList: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 0 }
const activityRow: CSSProperties = { display: 'grid', gridTemplateColumns: '48px minmax(0, 1fr)', gap: 10, alignItems: 'baseline', minWidth: 0, padding: '6px 0', fontSize: 11, color: COLORS.faint, borderTop: `0.5px solid ${COLORS.border}` }
const activityBody: CSSProperties = { display: 'flex', gap: 6, flexWrap: 'wrap', minWidth: 0, color: COLORS.dim }
const activityDetail: CSSProperties = { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: COLORS.faint }

const STATUS_TONE: Readonly<Record<TaskRecord['status'], TagTone>> = {
  pending: 'neutral',
  running: 'info',
  review: 'warning',
  completed: 'success',
  failed: 'danger',
}

/** Parse markdown checklist lines from the task description; nothing else is presented as acceptance. */
function acceptanceItems(description: string): readonly { readonly text: string; readonly done: boolean }[] {
  return description.split(/\r?\n/u).flatMap(line => {
    const match = /^\s*[-*]\s*\[([ xX])\]\s+(.+)$/u.exec(line)
    if (match === null) return []
    const text = match[2]?.trim() ?? ''
    return text === '' ? [] : [{ text, done: match[1]?.toLowerCase() === 'x' }]
  })
}

/** Remove checklist lines from the prose so the same item is not rendered twice. */
function descriptionBody(description: string): string {
  return description.split(/\r?\n/u).filter(line => !/^\s*[-*]\s*\[[ xX]\]\s+/u.test(line)).join('\n').trim()
}

function SectionHeading({ title: heading, hint, action }: { readonly title: string; readonly hint?: string; readonly action?: ReactNode }): ReactNode {
  return <div style={sectionHeader}>
    <h3 style={sectionTitle}>{heading}</h3>
    {hint !== undefined && <span style={sectionHint}>{hint}</span>}
    {action !== undefined && <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>{action}</span>}
  </div>
}

/** One task header plus its brief, execution sessions, acceptance decision and recent audit slice. */
export function LoomTaskWorkbench({ t, task, project, version, snapshot, audit, actions, loadChanges, wrap, onToggleWrap, attemptRows, selectedSessionId, onSelectSession, onOpenSession }: {
  t: Translate
  task: TaskRecord
  project: ProjectRecord | undefined
  version: VersionRecord | undefined
  snapshot: CatalogSnapshot
  audit: readonly AuditEntry[]
  actions: ExecutionActions
  loadChanges: LoadWorkspaceChanges
  wrap: boolean
  onToggleWrap: () => void
  /** Sessions of the current execution environment; the user picks one explicitly. */
  attemptRows: readonly TaskAttemptRow[]
  selectedSessionId?: string | undefined
  onSelectSession?: ((sessionId: string) => void) | undefined
  onOpenSession: (sessionId: string) => void
}): ReactNode {
  const status = STATUS_META[task.status]
  const priority = PRIORITY_META[task.priority ?? 'normal']
  const modules = (task.moduleIds ?? []).map(moduleId => project?.config.modules.find(module => module.id === moduleId)?.path ?? moduleId)
  const items = acceptanceItems(task.description ?? '')
  const body = descriptionBody(task.description ?? '')
  const recent = audit.slice(0, 4)
  const outcomeCard = <LoomOutcomePanel t={t} task={task} snapshot={snapshot} actions={actions} loadChanges={loadChanges} wrap={wrap} onToggleWrap={onToggleWrap} />
  const latestAttempt = attemptRows.find(row => row.latest)
  const execution = latestAttempt === undefined ? undefined : snapshot.executions.find(candidate => candidate.workspaceId === latestAttempt.workspaceId)
  const outcomeFirst = task.status === 'review' || task.status === 'completed' || task.status === 'failed'
  return <div style={shell}>
    <header style={head}>
      <div style={headingBlock}>
        <div style={titleLine}>
          <h2 style={title}>{task.title}</h2>
          <Tag tone={STATUS_TONE[task.status]}>{t(status.key)}</Tag>
          <Tag tone={task.priority === 'high' ? 'warning' : 'quiet'}>{t(priority.key)}</Tag>
        </div>
        <div style={subtitle}>
          {version !== undefined && <span>{version.name}</span>}
          {modules.length > 0 && <>
            <span aria-hidden style={separator}>·</span>
            <span>{modules.join(', ')}</span>
          </>}
          <span aria-hidden style={separator}>·</span>
          <time data-loom-time dateTime={absoluteTime(task.updatedAt)} title={absoluteTime(task.updatedAt)}>{relativeTime(task.updatedAt)}</time>
        </div>
      </div>
    </header>

    <div style={page}>
      <div style={stack}>
        <section style={card} aria-label={t('workbench.description')}>
          <SectionHeading title={t('workbench.description')} />
          {body !== '' ? <p style={description}>{body}</p> : items.length === 0 ? <p style={muted}>{t('workbench.noDescription')}</p> : null}
          {items.length > 0 && <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <span style={{ ...metaLine, fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase' }}>{t('workbench.acceptance')}</span>
            <ul style={checklist}>{items.map((item, index) => <li key={`${String(index)}-${item.text}`} style={checklistRow}>
              <span aria-hidden style={{ ...check, ...(item.done ? { borderColor: COLORS.green, background: `color-mix(in srgb, ${COLORS.green} 12%, transparent)` } : {}) }}>{item.done ? '✓' : ''}</span>
              <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{item.text}</span>
            </li>)}</ul>
          </div>}
        </section>

        {outcomeFirst && outcomeCard}

        <section style={card} aria-label={t('workbench.execution')}>
          <SectionHeading title={t('workbench.execution')} />
          <LoomExecutionQueue t={t} workspaceId={latestAttempt?.workspaceId} sessions={latestAttempt?.sessions ?? []} execution={execution}
            selectedSessionId={selectedSessionId} actions={actions} onSelectSession={onSelectSession} onOpenSession={onOpenSession} />
          <ExecutionPanel t={t} task={task} snapshot={snapshot} selectedSession={selectedSessionId as SessionId | undefined} actions={actions} loadChanges={loadChanges} wrap={wrap} onToggleWrap={onToggleWrap} />
        </section>

        {!outcomeFirst && outcomeCard}

        {recent.length > 0 && <section style={{ display: 'flex', flexDirection: 'column', gap: 6 }} aria-label={t('workbench.activity')}>
          <SectionHeading title={t('workbench.activity')} />
          <div style={activityList}>{recent.map(entry => <div key={entry.id} style={activityRow}>
            <span style={{ color: COLORS.faint, fontFamily: 'ui-monospace, monospace', whiteSpace: 'nowrap' }}>{new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
            <span style={activityBody}>
              <span style={{ color: COLORS.text }}>{t(AUDIT_LABEL[entry.event])}</span>
              <span>{t(ACTOR_LABEL[entry.actor])}</span>
              {entry.detail !== undefined && <span style={activityDetail}>{entry.detail}</span>}
            </span>
          </div>)}</div>
        </section>}
      </div>
    </div>
  </div>
}
