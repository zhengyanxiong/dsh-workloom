/** Bottom-panel session view: task/session list beside the workspace execution gate. */
import type { ReactNode } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ExecutionState } from 'dsh-workloom/types'
import { IconArchiveOutlineRegular, IconUnarchiveOutlineRegular } from '../../ui/primitives.ts'
import { LoomTokenECG } from '../../ui/LoomTokenECG.tsx'
import type { TokenUsageView } from '../../shared/projection.ts'
import type { LoomKey } from '../../shared/locales.ts'
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
  /** Whether the shared native archive currently hides this Session. */
  readonly archived?: boolean | undefined
}

/** One task group inside the bottom-panel session graph. */
export interface LoomTaskSessionGroup {
  readonly taskId: string
  readonly taskTitle: string
  readonly rows: readonly LoomTaskSessionRow[]
}

/** Per-session execution state used by the row actions. */
export interface LoomSessionExecutionState {
  readonly isOwner: boolean
  readonly waiting: boolean
  readonly queueIndex: number
  readonly hasOwner: boolean
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
  /** Execution state for sessions outside the selected workspace. */
  readonly sessionStates?: Readonly<Record<string, LoomSessionExecutionState>> | undefined
  readonly busySessionId?: string | undefined
  readonly onReleaseSession?: ((sessionId: string) => void) | undefined
  readonly onQueueSession?: ((sessionId: string) => void) | undefined
  readonly onLeaveQueue?: ((sessionId: string) => void) | undefined
  /** Whether archived rows are listed; they stay hidden by default. */
  readonly showArchived?: boolean | undefined
  /** Archived Session ids, used for the count and the row toggle state. */
  readonly archivedSessionIds?: ReadonlySet<string> | undefined
  readonly onToggleArchived?: (() => void) | undefined
  readonly onArchiveSession?: ((sessionId: string) => void) | undefined
  readonly onUnarchiveSession?: ((sessionId: string) => void) | undefined
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
export function LoomSessionGraph({ t, taskTitle, workspaceLabel, rows, groups, execution, usageBySession, currentSessionId, onOpenSession, sessionStates, busySessionId, onReleaseSession, onQueueSession, onLeaveQueue, showArchived, archivedSessionIds, onToggleArchived, onArchiveSession, onUnarchiveSession }: LoomSessionGraphProps): ReactNode {
  const allGroups: readonly LoomTaskSessionGroup[] = groups === undefined || groups.length === 0
    ? [{ taskId: 'active', taskTitle: taskTitle ?? '—', rows }]
    : groups
  const allRows = allGroups.flatMap(group => group.rows)
  const visibleGroups = showArchived === true
    ? allGroups
    : allGroups
      .map(group => ({ ...group, rows: group.rows.filter(row => archivedSessionIds?.has(row.id) !== true) }))
      .filter(group => group.rows.length > 0)
  const visibleCount = visibleGroups.reduce((total, group) => total + group.rows.length, 0)
  const archivedCount = archivedSessionIds === undefined ? 0 : allRows.filter(row => archivedSessionIds.has(row.id)).length
  const waiting = execution?.waiting ?? []
  const owner = execution?.owner?.sessionId
  const byId = new Map(allRows.map(row => [row.id, row]))
  const countLabel = (count: number): string => count === 1 ? t('bottom.sessionCountOne') : t('bottom.sessionCount', { count: String(count) })
  const ownerRow = owner === undefined ? undefined : byId.get(owner)
  const ownerTime = ownerRow === undefined ? '—' : formatActivity(ownerRow.updatedAt)
  const renderRow = (session: LoomTaskSessionRow, depth: number): ReactNode => {
    const active = session.id === currentSessionId
    const archived = session.archived === true
    const state = sessionStates?.[session.id]
    const isOwner = state?.isOwner ?? owner === session.id
    const queueIndex = state?.queueIndex ?? waiting.indexOf(session.id as SessionId)
    const isWaiting = state?.waiting ?? queueIndex >= 0
    const hasOwner = state?.hasOwner ?? owner !== undefined
    const archiveBlocked = isOwner || isWaiting
    const tone: SessionTone = isOwner ? 'owner' : isWaiting ? 'queue' : 'idle'
    const action = archived ? undefined : isOwner && onReleaseSession !== undefined
      ? { label: t('bottom.sessionReleaseAccess'), run: () => onReleaseSession(session.id) }
      : isWaiting && onLeaveQueue !== undefined
        ? { label: t('bottom.sessionLeaveQueue'), run: () => onLeaveQueue(session.id) }
        : !isWaiting && onQueueSession !== undefined
          ? { label: hasOwner ? t('bottom.sessionJoinQueue') : t('bottom.sessionAcquireAccess'), run: () => onQueueSession(session.id) }
          : undefined
    return <div key={session.id} className={`${classes.rowWrap} ${active ? classes.rowActive : ''} ${archived ? classes.rowArchived : ''}`}>
      <button type="button" className={classes.sessionRow} onClick={() => onOpenSession(session.id as SessionId)}>
        {depth > 0 ? <span className={classes.indent} /> : null}
        <span className={TONE_CLASS[tone]} aria-hidden />
        <span className={`${classes.name} ${active ? classes.nameActive : ''}`} title={session.label}>{session.label}</span>
        {session.parentId !== undefined && <span className={classes.fork}>↳ {t('bottom.sessionFork')}</span>}
        {isOwner ? <span className={`${classes.tag} ${classes.ownerTag}`}>{t('bottom.sessionOwner')}</span> : isWaiting ? <span className={`${classes.tag} ${classes.queueTag}`}>{t('bottom.sessionQueue', { index: queueIndex >= 0 ? String(queueIndex + 1) : '—' })}</span> : session.unavailable === true ? <span className={classes.tag}>{t('bottom.sessionUnavailable')}</span> : session.running ? <span className={`${classes.tag} ${classes.ownerTag}`}>{t('bottom.sessionRunning')}</span> : null}
        {archived ? <span className={classes.tag}>{t('session.archived')}</span> : null}
        <span className={classes.time}>{isOwner && session.running ? t('bottom.sessionExecuting', { time: formatActivity(session.updatedAt) }) : isWaiting ? t('bottom.sessionQueued', { time: formatActivity(session.updatedAt) }) : t('bottom.sessionRecent', { time: formatActivity(session.updatedAt) })}</span>
      </button>
      {action !== undefined && <button type="button" className={classes.rowAction} disabled={busySessionId === session.id} onClick={event => { event.stopPropagation(); action.run() }}>{busySessionId === session.id ? '…' : action.label}</button>}
      {archived
        ? onUnarchiveSession !== undefined && <button type="button" className={classes.rowIcon} aria-label={t('session.unarchive')} title={t('session.unarchive')} disabled={busySessionId === session.id} onClick={event => { event.stopPropagation(); onUnarchiveSession(session.id) }}>
          <IconUnarchiveOutlineRegular size={14} />
        </button>
        : onArchiveSession !== undefined && <button type="button" className={classes.rowIcon} aria-label={t('session.archive')} title={archiveBlocked ? t('session.archiveBlocked') : t('session.archive')} disabled={archiveBlocked || busySessionId === session.id} onClick={event => { event.stopPropagation(); onArchiveSession(session.id) }}>
          <IconArchiveOutlineRegular size={14} />
        </button>}
    </div>
  }
  return <div className={classes.wrap}>
    <section className={`${classes.column} ${classes.columnGrow}`}>
      <div className={classes.head}>
        <h4 className={classes.title}>{t('bottom.sessions')}</h4>
        <span className={classes.hint}>{taskTitle ?? '—'} · {t('bottom.sessionsHint')}</span>
        {archivedCount > 0 && onToggleArchived !== undefined
          ? <button type="button" className={classes.archiveToggle} aria-pressed={showArchived === true} onClick={onToggleArchived}>
            {showArchived === true ? t('session.archivedHide') : t('session.archivedShow', { count: String(archivedCount) })}
          </button>
          : null}
        <span className={`${classes.hint} ${classes.headHint}`}>{t('bottom.latestHint')}</span>
      </div>
      {visibleCount === 0
        ? <p className={classes.empty}>{archivedCount > 0 ? t('session.archivedOnly') : t('sessionList.empty')}</p>
        : <div className={classes.list}>
            {visibleGroups.map((group, groupIndex) => <div key={group.taskId}>
              <div className={`${classes.groupHead} ${groupIndex === 0 ? classes.groupHeadFirst : ''}`}>
                <span className={classes.groupDot} aria-hidden />
                <span className={classes.groupName}>{group.taskTitle}</span>
                <span className={classes.groupCount}>{countLabel(group.rows.length)}</span>
              </div>
              <div className={classes.groupRows}>
                {group.rows.filter(row => row.parentId === undefined || !group.rows.some(candidate => candidate.id === row.parentId)).map(row => {
                  const children = group.rows.filter(candidate => candidate.parentId === row.id)
                  return <div key={row.id}>{renderRow(row, 0)}{children.map(child => renderRow(child, 1))}</div>
                })}
              </div>
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
