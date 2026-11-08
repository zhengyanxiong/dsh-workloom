/** Every execution round and its attached native Sessions, with switch/retry actions. */
import type { CSSProperties } from 'react'
import { Button, IconArchiveOutlineRegular, IconUnarchiveOutlineRegular, StateDot, Tag } from '../../ui/primitives.ts'
import { COLORS } from '../../ui/tokens.ts'
import { metaLine } from '../../ui/styles.ts'
import { shortCommit } from '../../shared/format.ts'
import { STATUS_META } from '../../ui/status.ts'
import type { LoomKey } from '../../shared/locales.ts'
import { absoluteTime, relativeTime } from '../../shared/time.ts'
import type { AttemptSessionRow, SessionUnavailableReason, TaskAttemptRow } from '../../shared/projection.ts'

type Translate = (key: LoomKey, params?: Readonly<Record<string, string>>) => string

/** Inputs for the task execution-round and Session list. */
export interface LoomSessionListProps {
  readonly t: Translate
  readonly rows: readonly TaskAttemptRow[]
  /** Session currently rendered in the conversation surface. */
  readonly selectedSessionId?: string | undefined
  onOpenSession(sessionId: string): void
  /** Whether archived Sessions are listed; they stay hidden by default. */
  readonly showArchived?: boolean | undefined
  /** Archived Session ids from the shared native archive set. */
  readonly archivedSessionIds?: ReadonlySet<string> | undefined
  readonly onToggleArchived?: (() => void) | undefined
  readonly onArchiveSession?: ((sessionId: string) => void) | undefined
  readonly onUnarchiveSession?: ((sessionId: string) => void) | undefined
  /** Sessions that hold or wait for execution access; release them first. */
  readonly blockedSessionIds?: ReadonlySet<string> | undefined
  readonly busySessionId?: string | undefined
}

const section: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }
const heading: CSSProperties = { display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', margin: 0 }
const headingTitle: CSSProperties = { margin: 0, fontSize: 'var(--text-compact-size)', fontWeight: 500, color: COLORS.text }
const hint: CSSProperties = { margin: 0, color: COLORS.faint, fontSize: 'var(--text-small-size)', lineHeight: 1.5 }
const empty: CSSProperties = { margin: 0, padding: '10px 12px', border: `0.5px dashed ${COLORS.border}`, borderRadius: 8, color: COLORS.faint, fontSize: 'var(--text-small-size)', lineHeight: 1.5 }
const roundCard: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, padding: '10px 12px', border: `0.5px solid ${COLORS.border}`, borderRadius: 8, background: COLORS.panel2 }
const roundHead: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0 }
const roundTitle: CSSProperties = { ...metaLine, fontFamily: 'ui-monospace, monospace', fontSize: 'var(--text-micro-size)', letterSpacing: '.08em', textTransform: 'uppercase', color: COLORS.faint }
const roundCommit: CSSProperties = { fontFamily: 'ui-monospace, monospace', fontSize: 'var(--text-label-size)', color: COLORS.dim }
const sessionList: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, margin: 0, padding: 0, listStyle: 'none' }
const sessionButton = (active: boolean, available: boolean): CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 8, width: '100%', minWidth: 0, padding: '6px 8px',
  textAlign: 'left', border: 'none', borderRadius: 'var(--dsw-radius-sm)', cursor: 'pointer', font: 'inherit',
  background: active ? COLORS.selected : 'transparent', color: 'inherit', opacity: available ? 1 : .72,
})
const sessionBody: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }
const sessionTitle = (active: boolean): CSSProperties => ({ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 'var(--text-compact-size)', fontWeight: active ? 500 : 400, color: active ? COLORS.text : COLORS.dim })
const sessionMeta: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0, fontSize: 'var(--text-label-size)', color: COLORS.faint }
const sessionId: CSSProperties = { fontFamily: 'ui-monospace, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const sessionTime: CSSProperties = { whiteSpace: 'nowrap' }
const reason: CSSProperties = { color: COLORS.warn, fontSize: 'var(--text-label-size)', lineHeight: 1.4, minWidth: 0 }
const sessionRow: CSSProperties = { display: 'flex', alignItems: 'stretch', gap: 2, minWidth: 0 }
const retry: CSSProperties = { flex: 'none', alignSelf: 'center', padding: '0 4px' }
const toggle: CSSProperties = { padding: '1px 8px', border: `0.5px solid ${COLORS.border}`, borderRadius: 999, background: COLORS.panel2, color: COLORS.dim, font: 'inherit', fontSize: 'var(--text-nano-size)', cursor: 'pointer' }
const actionIcon: CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '4px', border: 'none', borderRadius: 'var(--dsw-radius-sm)', background: 'transparent', color: COLORS.faint, cursor: 'pointer' }
const archivedTag: CSSProperties = { color: COLORS.faint, fontSize: 'var(--text-label-size)', whiteSpace: 'nowrap' }

const REASON_KEY: Readonly<Record<SessionUnavailableReason, LoomKey>> = {
  missing: 'sessionList.unavailableMissing',
  failed: 'sessionList.unavailableFailed',
}

function dotState(row: AttemptSessionRow): 'ongoing' | 'idle' | 'error' {
  if (row.unavailableReason !== undefined) return 'error'
  return row.running ? 'ongoing' : 'idle'
}

/**
 * Render every round of a task with all of its Sessions.
 * @param props - task rounds, the currently open Session, and the open/retry action.
 * @returns the round list, or an explicit empty state before the first attempt.
 */
export function LoomSessionList({ t, rows, selectedSessionId, onOpenSession, showArchived, archivedSessionIds, onToggleArchived, onArchiveSession, onUnarchiveSession, blockedSessionIds, busySessionId }: LoomSessionListProps) {
  const archivedCount = archivedSessionIds === undefined
    ? 0
    : rows.reduce((total, round) => total + round.sessions.filter(session => archivedSessionIds.has(session.sessionId)).length, 0)
  return <section style={section} aria-label={t('sessionList.title')}>
    <div style={heading}>
      <h3 style={headingTitle}>{t('sessionList.title')}</h3>
      <span style={hint}>{t('sessionList.hint')}</span>
      {archivedCount > 0 && onToggleArchived !== undefined
        ? <button type="button" style={toggle} aria-pressed={showArchived === true} onClick={onToggleArchived}>
          {showArchived === true ? t('session.archivedHide') : t('session.archivedShow', { count: String(archivedCount) })}
        </button>
        : null}
    </div>
    {rows.length === 0
      ? <p style={empty}>{t('sessionList.empty')}</p>
      : rows.map((row) => {
        const sessions = showArchived === true
          ? row.sessions
          : row.sessions.filter(session => archivedSessionIds?.has(session.sessionId) !== true)
        const hidden = row.sessions.length - sessions.length
        return <div key={row.attemptId} style={roundCard}>
          <div style={roundHead}>
            <span style={roundTitle}>{t('sessionList.round', { round: String(row.round) })}</span>
            {row.latest && <Tag tone="info">{t('sessionList.roundLatest')}</Tag>}
            <Tag tone="neutral">{t(STATUS_META[row.status].key)}</Tag>
            <span style={roundCommit} title={row.lock.repositories.map(repository => `${repository.sourceId}@${repository.commit}`).join('\n')}>🔒 {shortCommit(row.lock) ?? '—'}</span>
          </div>
          {sessions.length === 0
            ? <p style={hint}>{hidden > 0 ? t('session.hiddenArchived', { count: String(hidden) }) : t('sessionList.empty')}</p>
            : <ul style={sessionList}>
                {sessions.map((session) => {
                  const active = selectedSessionId === session.sessionId
                  const stateLabel = session.unavailableReason !== undefined
                    ? t('sessionList.unavailable')
                    : session.running ? t('sessionList.running') : t('sessionList.idle')
                  const archived = archivedSessionIds?.has(session.sessionId) === true
                  const busy = busySessionId === session.sessionId
                  const blocked = blockedSessionIds?.has(session.sessionId) === true
                  return <li key={session.sessionId} style={sessionRow} className="loom-session-row">
                    <button type="button" aria-pressed={active} aria-label={`${t('session.open')} ${session.title ?? session.sessionId}`}
                      onClick={() => onOpenSession(session.sessionId)} style={sessionButton(active, session.available)} className="loom-session-button" data-loom-hover="row">
                      <StateDot state={dotState(session)} />
                      <span style={sessionBody}>
                        <span style={sessionTitle(active)}>{session.title ?? t('untitledSession')}</span>
                        <span style={sessionMeta}>
                          <span>{stateLabel}</span>
                          {archived ? <span style={archivedTag}>{t('session.archived')}</span> : null}
                          {session.updatedAt !== undefined && <><span aria-hidden style={{ color: COLORS.border }}>·</span><time data-loom-time style={sessionTime} dateTime={absoluteTime(session.updatedAt)} title={absoluteTime(session.updatedAt)}>{relativeTime(session.updatedAt)}</time></>}
                          <span aria-hidden style={{ color: COLORS.border }}>·</span>
                          <span style={sessionId}>{session.sessionId.slice(0, 12)}</span>
                        </span>
                        {session.unavailableReason !== undefined && <span style={reason}>{t(REASON_KEY[session.unavailableReason])}</span>}
                      </span>
                    </button>
                    {session.unavailableReason === 'failed' && <span style={retry}><Button size="sm" variant="outline" onClick={() => onOpenSession(session.sessionId)}>{t('sessionList.retry')}</Button></span>}
                    {archived
                      ? onUnarchiveSession !== undefined && <span style={retry}><button type="button" style={actionIcon} aria-label={t('session.unarchive')} title={t('session.unarchive')} disabled={busy} onClick={() => onUnarchiveSession(session.sessionId)}><IconUnarchiveOutlineRegular size={14} /></button></span>
                      : onArchiveSession !== undefined && <span style={retry}><button type="button" style={actionIcon} aria-label={t('session.archive')} title={blocked ? t('session.archiveBlocked') : t('session.archive')} disabled={busy || blocked} onClick={() => onArchiveSession(session.sessionId)}><IconArchiveOutlineRegular size={14} /></button></span>}
                  </li>
                })}
              </ul>}
        </div>
      })}
  </section>
}
