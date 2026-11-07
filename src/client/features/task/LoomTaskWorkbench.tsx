/** Task-centred document: brief, execution sessions and the human acceptance decision. */
import type { ReactNode } from 'react'
import { IconCheckOutlineRegular, IconChevronLeftOutlineRegular, Tag, type TagTone } from '../../ui/primitives.ts'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { AuditEntry, CatalogSnapshot, ProjectRecord, TaskRecord, VersionRecord } from 'dsh-workloom/types'
import { ACTOR_LABEL, AUDIT_LABEL, PRIORITY_META, STATUS_META } from '../../shell.ts'
import type { LoomKey } from '../../locales.ts'
import type { LoadWorkspaceChanges } from '../preview/LoomDiff.tsx'
import { ExecutionPanel, type ExecutionActions } from './LoomExecution.tsx'
import { LoomOutcomePanel } from './LoomOutcomePanel.tsx'
import { LoomExecutionQueue } from './LoomExecutionQueue.tsx'
import type { TaskAttemptRow } from '../../projection.ts'
import { absoluteTime, relativeTime } from '../../time.ts'
import classes from './LoomTaskWorkbench.module.css'

type Translate = (key: LoomKey) => string

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

/** Last path segment, used only for display; the full path stays in the workspace facts. */
function lastSegment(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const parts = value.split(/[\\/]/u).filter(Boolean)
  return parts.at(-1)
}

/** One numbered stage with its index column and vertical track. */
function Stage({ index, title, hint, children }: {
  readonly index: string
  readonly title: string
  readonly hint: string | undefined
  readonly children: ReactNode
}): ReactNode {
  return <section className={classes.stage} aria-label={title}>
    <span className={classes.index} aria-hidden>{index}</span>
    <span className={classes.rail} aria-hidden />
    <div className={classes.body}>
      <div className={classes.head}>
        <h2 className={classes.headTitle}>{title}</h2>
        {hint !== undefined && <span className={classes.headHint}>{hint}</span>}
      </div>
      <div className={classes.stageContent}>{children}</div>
    </div>
  </section>
}

/** Inputs for the task document. */
export interface LoomTaskWorkbenchProps {
  readonly t: Translate
  readonly task: TaskRecord
  readonly project: ProjectRecord | undefined
  readonly version: VersionRecord | undefined
  readonly snapshot: CatalogSnapshot
  readonly audit: readonly AuditEntry[]
  readonly actions: ExecutionActions
  readonly loadChanges: LoadWorkspaceChanges
  readonly wrap: boolean
  readonly onToggleWrap: () => void
  /** Sessions of the current execution environment; the user picks one explicitly. */
  readonly attemptRows: readonly TaskAttemptRow[]
  readonly selectedSessionId?: string | undefined
  readonly onSelectSession?: ((sessionId: string) => void) | undefined
  readonly onOpenSession: (sessionId: string) => void
  /** Return to the board; rendered as the document's back affordance. */
  readonly onBack?: (() => void) | undefined
}

/**
 * Render the task paper: brief, execution and acceptance decision.
 *
 * @param props - task record, catalog, execution actions and navigation intents.
 * @returns the task document.
 */
export function LoomTaskWorkbench(props: LoomTaskWorkbenchProps): ReactNode {
  const { t, task, version, snapshot, audit, actions, loadChanges, wrap, onToggleWrap, attemptRows, selectedSessionId, onSelectSession, onOpenSession, onBack } = props
  const status = STATUS_META[task.status]
  const priority = PRIORITY_META[task.priority ?? 'normal']
  const items = acceptanceItems(task.description ?? '')
  const body = descriptionBody(task.description ?? '')
  const recent = audit.slice(0, 4)
  const latestAttempt = attemptRows.find(row => row.latest)
  const latestWorkspace = latestAttempt === undefined
    ? undefined
    : snapshot.workspaces.find(workspace => workspace.id === latestAttempt.workspaceId)
  const workspaceLabel = latestWorkspace === undefined
    ? undefined
    : lastSegment(latestWorkspace.rootPath ?? latestWorkspace.path)
  const execution = latestAttempt === undefined
    ? undefined
    : snapshot.executions.find(candidate => candidate.workspaceId === latestAttempt.workspaceId)
  const waiting = execution?.waiting.length ?? 0
  const sessions = latestAttempt?.sessions.length ?? task.attempts.at(-1)?.sessionIds.length ?? 0
  const queueHint = waiting === 0
    ? t('workbench.queueEmpty')
    : t('workbench.queueWaiting').replace('{count}', String(waiting))
  const outcomeCard = <LoomOutcomePanel t={t} task={task} snapshot={snapshot} actions={actions} loadChanges={loadChanges} wrap={wrap} onToggleWrap={onToggleWrap} embedded />
  return <div className={classes.root}>
    <header className={classes.header}>
      <nav className={classes.crumb} aria-label={t('nav.tasks')}>
        <span>{t('nav.tasks')}</span>
        {version !== undefined && <>
          <span aria-hidden className={classes.crumbSep}>/</span>
          <span>{version.name}</span>
        </>}
        {onBack !== undefined && <>
          <span aria-hidden className={classes.crumbSep}>/</span>
          <button type="button" className={classes.crumbLink} onClick={onBack}><IconChevronLeftOutlineRegular size={11} />{t('workbench.back')}</button>
        </>}
      </nav>
      <h1 className={classes.title}>{task.title}</h1>
      <div className={classes.meta}>
        <Tag tone={STATUS_TONE[task.status]}>{t(status.key)}</Tag>
        <Tag tone={task.priority === 'high' ? 'warning' : 'quiet'}>{t(priority.key)}</Tag>
        {workspaceLabel !== undefined && <span className={classes.metaText}>{t('workbench.workspaceLabel').replace('{label}', workspaceLabel)}</span>}
        <span className={classes.metaText}>{t('workbench.sessionsCount').replace('{count}', String(sessions))}</span>
        <time data-loom-time className={classes.metaText} dateTime={absoluteTime(task.updatedAt)} title={absoluteTime(task.updatedAt)}>{relativeTime(task.updatedAt)}</time>
      </div>
    </header>
    <div className={classes.scroll}>
      <div className={classes.paper}>
        <Stage index="01" title={t('workbench.description')} hint={undefined}>
          {body !== '' && <p className={classes.description}>{body}</p>}
          {items.length > 0 && <ul className={classes.items}>{items.map((item, index) => <li key={`${String(index)}-${item.text}`} className={`${classes.item} ${item.done ? classes.itemDone : ''}`}>
            <span className={classes.itemIndex} aria-hidden>{String(index + 1)}</span>
            <span className={classes.itemText}>{item.text}{item.done && <IconCheckOutlineRegular size={12} className={classes.itemCheck} />}</span>
          </li>)}</ul>}
          {body === '' && items.length === 0 && <p className={classes.muted}>{t('workbench.noDescription')}</p>}
        </Stage>
        <Stage index="02" title={t('workbench.execution')} hint={queueHint}>
          <LoomExecutionQueue
            t={t}
            workspaceId={latestAttempt?.workspaceId}
            sessions={latestAttempt?.sessions ?? []}
            execution={execution}
            selectedSessionId={selectedSessionId}
            actions={actions}
            onSelectSession={onSelectSession}
            onOpenSession={onOpenSession}
          />
          <ExecutionPanel
            t={t}
            task={task}
            snapshot={snapshot}
            selectedSession={selectedSessionId as SessionId | undefined}
            actions={actions}
            loadChanges={loadChanges}
            wrap={wrap}
            onToggleWrap={onToggleWrap}
          />
        </Stage>
        <Stage index="03" title={t('workbench.decision')} hint={undefined}>
          {outcomeCard}
        </Stage>
      </div>
      {recent.length > 0 && <section className={classes.activity} aria-label={t('workbench.activity')}>
        <h3 className={classes.activityHead}>{t('workbench.activity')}</h3>
        {recent.map(entry => <div key={entry.id} className={classes.activityRow}>
          <span className={classes.activityTime}>{new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
          <span className={classes.activityBody}>
            <span>{t(AUDIT_LABEL[entry.event])}</span>
            <span>{t(ACTOR_LABEL[entry.actor])}</span>
            {entry.detail !== undefined && <span className={classes.activityDetail}>{entry.detail}</span>}
          </span>
        </div>)}
      </section>}
    </div>
  </div>
}
