/** Bottom-panel session view: task/session list beside the workspace execution gate. */
import type { CSSProperties, ReactNode } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ExecutionState } from 'dsh-workloom/types'
import { COLORS } from './shell.ts'
import { LoomTokenECG } from './LoomTokenECG.tsx'
import type { TokenUsageView } from './projection.ts'
import type { LoomKey } from './locales.ts'

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

const wrap: CSSProperties = { display: 'flex', gap: 12, minWidth: 0, alignItems: 'flex-start', fontFamily: 'var(--sans)' }
const column: CSSProperties = { minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }
const head: CSSProperties = { display: 'flex', alignItems: 'baseline', gap: 7, minWidth: 0, flexWrap: 'wrap' }
const title: CSSProperties = { margin: 0, fontSize: 11.5, fontWeight: 500, color: COLORS.text }
const hint: CSSProperties = { color: COLORS.faint, fontSize: 9.5, lineHeight: 1.4, minWidth: 0 }
const list: CSSProperties = { display: 'flex', flexDirection: 'column', border: `0.5px solid ${COLORS.border}`, borderRadius: 8, overflow: 'hidden', background: COLORS.panel }
const groupHead: CSSProperties = { display: 'flex', alignItems: 'center', gap: 7, padding: '7px 10px', borderTop: `0.5px solid ${COLORS.border}`, background: COLORS.panel2, minWidth: 0 }
const groupHeadFirst: CSSProperties = { ...groupHead, borderTop: 'none' }
const groupDot: CSSProperties = { width: 6, height: 6, borderRadius: '50%', background: COLORS.accent, flex: 'none' }
const groupName: CSSProperties = { minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10.5, color: COLORS.text }
const groupCount: CSSProperties = { color: COLORS.faint, fontFamily: 'ui-monospace, monospace', fontSize: 9 }
const sessionRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, padding: '7px 10px', borderTop: `0.5px solid ${COLORS.border}`, background: COLORS.panel, color: 'inherit', borderLeft: 'none', borderRight: 'none', borderBottom: 'none', textAlign: 'left', cursor: 'pointer', font: 'inherit', width: '100%' }
const rowActive: CSSProperties = { ...sessionRow, background: COLORS.selected }
const dot = (tone: 'owner' | 'queue' | 'idle'): CSSProperties => ({ width: 6, height: 6, borderRadius: '50%', flex: 'none', background: tone === 'owner' ? COLORS.green : tone === 'queue' ? COLORS.warn : '#b8bec7' })
const name: CSSProperties = { minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: COLORS.dim, fontSize: 11 }
const nameActive: CSSProperties = { ...name, color: COLORS.text }
const time: CSSProperties = { flex: 'none', color: COLORS.faint, fontFamily: 'ui-monospace, monospace', fontSize: 9, whiteSpace: 'nowrap' }
const tag: CSSProperties = { flex: 'none', fontSize: 8, border: `0.5px solid ${COLORS.border}`, borderRadius: 4, padding: '1px 4px', color: COLORS.faint, background: COLORS.panel }
const ownerTag: CSSProperties = { ...tag, color: COLORS.green, borderColor: '#a7d9b8', background: 'transparent' }
const queueTag: CSSProperties = { ...tag, color: COLORS.warn, borderColor: '#f1d6a8', background: COLORS.panel }
const fork: CSSProperties = { flex: 'none', color: COLORS.faint, fontFamily: 'ui-monospace, monospace', fontSize: 9 }
const indent: CSSProperties = { display: 'inline-block', width: 12, flex: 'none' }
const empty: CSSProperties = { margin: 0, padding: '9px 10px', color: COLORS.faint, fontSize: 10, lineHeight: 1.5 }
const gate: CSSProperties = { display: 'flex', flexDirection: 'column', border: `0.5px solid ${COLORS.border}`, borderRadius: 8, overflow: 'hidden', background: COLORS.panel }
const gateHead: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, padding: '8px 10px', borderBottom: `0.5px solid ${COLORS.border}`, fontSize: 10.5 }
const gateWorkspace: CSSProperties = { minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: COLORS.dim, fontFamily: 'ui-monospace, monospace' }
const gateDot = (owned: boolean): CSSProperties => ({ width: 7, height: 7, borderRadius: '50%', flex: 'none', background: owned ? COLORS.green : COLORS.faint })
const queueTitle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 7, padding: '9px 10px 2px', color: COLORS.faint, fontSize: 9, letterSpacing: '.05em', textTransform: 'uppercase' }
const rule: CSSProperties = { flex: 1, height: 1, background: COLORS.border }
const queueRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: 7, margin: '7px 10px 10px', padding: '8px 9px', border: `1px dashed #f1d6a8`, borderRadius: 7, background: 'rgba(255,247,232,.55)', fontSize: 10.5, color: COLORS.dim }
const queuePos: CSSProperties = { flex: 'none', width: 15, color: COLORS.warn, fontFamily: 'ui-monospace, monospace', fontSize: 9 }
const queueName: CSSProperties = { minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const queueHint: CSSProperties = { flex: 'none', color: COLORS.faint, fontSize: 9 }
const help: CSSProperties = { width: 14, height: 14, flex: 'none', borderRadius: '50%', border: `0.5px solid ${COLORS.border}`, background: 'transparent', color: COLORS.faint, font: 'inherit', fontSize: 9, lineHeight: 1, cursor: 'help', display: 'grid', placeItems: 'center', padding: 0 }
const tipWrap: CSSProperties = { position: 'relative', display: 'inline-flex', alignItems: 'center' }
const tip: CSSProperties = { display: 'none', position: 'absolute', right: 0, top: 19, zIndex: 3, width: 240, padding: '7px 8px', border: `0.5px solid ${COLORS.border}`, borderRadius: 6, background: COLORS.panel, boxShadow: '0 8px 24px rgba(0,0,0,.12)', color: COLORS.dim, fontSize: 9, lineHeight: 1.5, whiteSpace: 'normal' }

function formatActivity(updatedAt: number): string {
  if (updatedAt <= 0) return '—'
  return new Date(updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

/** Render the active task's session list and the workspace execution gate. */
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
    const tone = isOwner ? 'owner' : queueIndex >= 0 ? 'queue' : 'idle'
    return <button key={session.id} type="button" style={active ? rowActive : sessionRow} onClick={() => onOpenSession(session.id as SessionId)}>
      {depth > 0 ? <span style={indent} /> : null}
      <span style={dot(tone)} aria-hidden />
      <span style={active ? nameActive : name} title={session.label}>{session.label}</span>
      {session.parentId !== undefined && <span style={fork}>↳ {t('bottom.sessionFork')}</span>}
      {isOwner ? <span style={ownerTag}>{t('bottom.sessionOwner')}</span> : queueIndex >= 0 ? <span style={queueTag}>{t('bottom.sessionQueue', { index: String(queueIndex + 1) })}</span> : session.unavailable === true ? <span style={tag}>{t('bottom.sessionUnavailable')}</span> : session.running ? <span style={ownerTag}>{t('bottom.sessionRunning')}</span> : null}
      <span style={time}>{isOwner ? t('bottom.sessionExecuting', { time: formatActivity(session.updatedAt) }) : queueIndex >= 0 ? t('bottom.sessionQueued', { time: formatActivity(session.updatedAt) }) : t('bottom.sessionRecent', { time: formatActivity(session.updatedAt) })}</span>
    </button>
  }
  return <div className="loom-sg" style={wrap}>
    <section style={{ ...column, flex: '1.1 1 0' }}>
      <div style={head}><h4 style={title}>{t('bottom.sessions')}</h4><span style={hint}>{taskTitle ?? '—'} · {t('bottom.sessionsHint')}</span><span style={{ ...hint, marginLeft: 'auto', whiteSpace: 'nowrap' }}>{t('bottom.latestHint')}</span></div>
      {allRows.length === 0
        ? <p style={empty}>{t('sessionList.empty')}</p>
        : <div style={list}>
            {visibleGroups.map((group, groupIndex) => <div key={group.taskId} style={{ minWidth: 0 }}>
              <div style={groupIndex === 0 ? groupHeadFirst : groupHead}><span style={groupDot} /><span style={groupName}>{group.taskTitle}</span><span style={groupCount}>{group.rows.length} sessions</span></div>
              {group.rows.filter(row => row.parentId === undefined || !group.rows.some(candidate => candidate.id === row.parentId)).map(row => {
                const children = group.rows.filter(candidate => candidate.parentId === row.id)
                return <div key={row.id}>{renderRow(row, 0)}{children.map(child => renderRow(child, 1))}</div>
              })}
            </div>)}
          </div>}
    </section>
    <section style={{ ...column, flex: '1 1 0', position: 'relative' }}>
      <div style={head}><h4 style={title}>{t('bottom.executionGate')}</h4><span style={hint}>{workspaceLabel ?? '—'}</span><span style={tipWrap}><button type="button" style={help} aria-label={t('bottom.queueTip')} title={t('bottom.queueTip')}>?</button><span style={tip}>{t('bottom.queueTip')}</span></span></div>
      {allRows.length === 0
        ? <p style={empty}>{t('bottom.noExecution')}</p>
        : <div style={gate}>
            <div style={gateHead}><span style={gateDot(owner !== undefined)} /><span style={gateWorkspace}>{workspaceLabel ?? '—'}</span><span style={owner === undefined ? tag : ownerTag}>{owner === undefined ? t('bottom.idle') : t('bottom.sessionOwner')}</span><span style={{ marginLeft: 'auto', color: COLORS.faint, fontSize: 9 }}>{t('bottom.queueDepth', { count: String(waiting.length) })}</span></div>
            {owner === undefined
              ? <p style={{ ...empty, padding: '12px 10px 10px' }}>{t('bottom.noOwner')}</p>
              : <div style={{ margin: '10px 10px 4px' }}><LoomTokenECG t={t} label={ownerRow?.label ?? owner} usage={usageBySession?.[owner]} running={ownerRow?.running === true} /><div style={{ marginTop: 3, color: COLORS.faint, fontSize: 9.5 }}>{t('bottom.sessionExecuting', { time: ownerTime })}</div></div>}
            <div style={queueTitle}><span>{t('bottom.queue')}</span><span style={rule} /></div>
            {waiting.length === 0
              ? <p style={{ ...empty, padding: '1px 10px 9px' }}>{t('bottom.queueEmpty')}</p>
              : waiting.map((sessionId, index) => <div key={sessionId} style={queueRow}><span style={queuePos}>{index + 1}</span><span style={queueName}>{byId.get(sessionId)?.label ?? sessionId}</span><span style={queueHint}>{t('bottom.sessionQueued', { time: formatActivity(byId.get(sessionId)?.updatedAt ?? 0) })}</span></div>)}
          </div>}
    </section>
  </div>
}
