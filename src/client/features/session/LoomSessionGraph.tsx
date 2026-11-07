/** Bottom-panel session view: task/session list beside the workspace execution gate. */
import type { ReactNode } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ExecutionState } from 'dsh-workloom/types'
import { LoomTokenECG } from '../../LoomTokenECG.tsx'
import type { TokenUsageView } from '../../projection.ts'
import type { LoomKey } from '../../locales.ts'
import classes from './LoomSessionGraph.module.css'

type Translate = (key: LoomKey, params?: Readonly<Record<string, string>>) => string

/** One session row under the active task. */
export interface LoomTaskSessionRow {
  readonly id: string
  readonly parentId?: string | undefined
  readonly label: string
  readonly running: boolean
  /** Last activity timestamp; 0 when the native session has no projected time. */
  readonly updatedAt: number
  readonly unavailable?: boolean | undefined
}

/** One task group inside the bottom-panel session graph. */
export interface LoomTaskSessionGroup {
  readonly taskId: string
  readonly taskTitle: string
  readonly rows: readonly LoomTaskSessionRow[]
}

/** Inputs for the bottom-panel session tree. */
export interface LoomSessionGraphProps {
  readonly t: Translate
  readonly taskTitle?: string | undefined
  readonly workspaceLabel?: string | undefined
  readonly rows: readonly LoomTaskSessionRow[]
  readonly groups?: readonly LoomTaskSessionGroup[] | undefined
  readonly execution?: ExecutionState | undefined
  readonly usageBySession?: Readonly<Record<string, TokenUsageView | undefined>> | undefined
  readonly currentSessionId?: string | undefined
  readonly onOpenSession: (sessionId: SessionId) => void
}

type SessionTone = 'owner' | 'queue' | 'idle'

const TONE_CLASS: Readonly<Record<SessionTone, string>> = {
  owner: classes.dotOwner ?? '',
  queue: classes.dotQueue ?? '',
  idle: classes.dot ?? '',
}

function formatActivity(updatedAt: number): string {
  if (updatedAt <= 0) return '—'
  return new Date(updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

/**
 * Render the active task's session list and the workspace execution gate.
 *
 * @param props - session rows, task groups, execution ownership and open-session intent.
 * @returns the grouped session list and execution gate.
 */
export function LoomSessionGraph({ t, taskTitle, workspaceLabel, rows, groups, execution, usageBySession, currentSessionId, onOpenSession }: LoomSessionGraphProps): ReactNode {
  const allRows = groups === undefined || groups.length === 0 ? rows : groups.flatMap(group => group.rows)
  const waiting = execution?.waiting ?? []
  const owner = execution?.owner?.sessionId
  const byId = new Map(allRows.map(row => [row.id, row]))
  const visibleGroups: readonly LoomTaskSessionGroup[] = groups === undefined || groups.length === 0
    ? [{ taskId: 'active', taskTitle: taskTitle ?? '—', rows }]
    : groups
  const ownerRow = owner === undefined ? undefined : byId.get(owner)
  const ownerTime = ownerRow === undefined ? '—' : formatActivity(ownerRow.updatedAt)
  const renderRow = (session: LoomTaskSessionRow, depth: number): ReactNode => {
    const active = session.id === currentSessionId
    const isOwner = owner === session.id
    const queueIndex = waiting.indexOf(session.id as SessionId)
    const tone: SessionTone = isOwner ? 'owner' : queueIndex >= 0 ? 'queue' : 'idle'
    return <button key={session.id} type="button" className={`${classes.sessionRow} ${active ? classes.rowActive : ''}`} onClick={() => onOpenSession(session.id as SessionId)}>
      {depth > 0 ? <span className={classes.indent} /> : null}
      <span className={TONE_CLASS[tone]} aria-hidden />
      <span className={`${classes.name} ${active ? classes.nameActive : ''}`} title={session.label}>{session.label}</span>
      {session.parentId !== undefined && <span className={classes.fork}>↳ {t('bottom.sessionFork')}</span>}
      {isOwner ? <span className={`${classes.tag} ${classes.ownerTag}`}>{t('bottom.sessionOwner')}</span> : queueIndex >= 0 ? <span className={`${classes.tag} ${classes.queueTag}`}>{t('bottom.sessionQueue', { index: String(queueIndex + 1) })}</span> : session.unavailable === true ? <span className={classes.tag}>{t('bottom.sessionUnavailable')}</span> : session.running ? <span className={`${classes.tag} ${classes.ownerTag}`}>{t('bottom.sessionRunning')}</span> : null}
      <span className={classes.time}>{isOwner && session.running ? t('bottom.sessionExecuting', { time: formatActivity(session.updatedAt) }) : queueIndex >= 0 ? t('bottom.sessionQueued', { time: formatActivity(session.updatedAt) }) : t('bottom.sessionRecent', { time: formatActivity(session.updatedAt) })}</span>
    </button>
  }
  return <div className={classes.wrap}>
    <section className={`${classes.column} ${classes.columnGrow}`}>
      <div className={classes.head}>
        <h4 className={classes.title}>{t('bottom.sessions')}</h4>
        <span className={classes.hint}>{taskTitle ?? '—'} · {t('bottom.sessionsHint')}</span>
        <span className={`${classes.hint} ${classes.headHint}`}>{t('bottom.latestHint')}</span>
      </div>
      {allRows.length === 0
        ? <p className={classes.empty}>{t('sessionList.empty')}</p>
        : <div className={classes.list}>
            {visibleGroups.map((group, groupIndex) => <div key={group.taskId}>
              <div className={`${classes.groupHead} ${groupIndex === 0 ? classes.groupHeadFirst : ''}`}>
                <span className={classes.groupDot} aria-hidden />
                <span className={classes.groupName}>{group.taskTitle}</span>
                <span className={classes.groupCount}>{String(group.rows.length)} sessions</span>
              </div>
              {group.rows.filter(row => row.parentId === undefined || !group.rows.some(candidate => candidate.id === row.parentId)).map(row => {
                const children = group.rows.filter(candidate => candidate.parentId === row.id)
                return <div key={row.id}>{renderRow(row, 0)}{children.map(child => renderRow(child, 1))}</div>
              })}
            </div>)}
          </div>}
    </section>
    <section className={`${classes.column} ${classes.columnGate}`}>
      <div className={classes.head}>
        <h4 className={classes.title}>{t('bottom.executionGate')}</h4>
        <span className={classes.hint}>{workspaceLabel ?? '—'}</span>
        <button type="button" className={classes.help} aria-label={t('bottom.queueTip')} title={t('bottom.queueTip')}>?</button>
      </div>
      {allRows.length === 0
        ? <p className={classes.empty}>{t('bottom.noExecution')}</p>
        : <div className={classes.gate}>
            <div className={classes.gateHead}>
              <span className={`${classes.gateDot} ${owner !== undefined ? classes.gateDotOwned : ''}`} aria-hidden />
              <span className={classes.gateWorkspace}>{workspaceLabel ?? '—'}</span>
              <span className={owner === undefined ? classes.tag : `${classes.tag} ${classes.ownerTag}`}>{owner === undefined ? t('bottom.idle') : t('bottom.sessionOwner')}</span>
              <span className={classes.queueDepth}>{t('bottom.queueDepth', { count: String(waiting.length) })}</span>
            </div>
            {owner === undefined
              ? <p className={`${classes.empty} ${classes.noOwner}`}>{t('bottom.noOwner')}</p>
              : <div className={classes.ecg}>
                <LoomTokenECG t={t} label={ownerRow?.label ?? owner} usage={usageBySession?.[owner]} running={ownerRow?.running === true} />
                <div className={classes.ecgHint}>{t('bottom.sessionExecuting', { time: ownerTime })}</div>
              </div>}
            <div className={classes.queueTitle}><span>{t('bottom.queue')}</span><span className={classes.rule} /></div>
            {waiting.length === 0
              ? <p className={`${classes.empty} ${classes.queueEmpty}`}>{t('bottom.queueEmpty')}</p>
              : waiting.map((sessionId, index) => <div key={sessionId} className={classes.queueRow}>
                <span className={classes.queuePos}>{String(index + 1)}</span>
                <span className={classes.queueName}>{byId.get(sessionId)?.label ?? sessionId}</span>
                <span className={classes.queueHint}>{t('bottom.sessionQueued', { time: formatActivity(byId.get(sessionId)?.updatedAt ?? 0) })}</span>
              </div>)}
          </div>}
    </section>
  </div>
}
