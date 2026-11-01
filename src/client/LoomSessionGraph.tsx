/** Bottom-panel session view: task/fork tree beside the workspace execution gate. */
import type { CSSProperties, ReactNode } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ExecutionState } from 'dsh-workloom/types'
import { COLORS, metaLine } from './shell.ts'
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

const wrap: CSSProperties = { display: 'flex', gap: 14, minWidth: 0, alignItems: 'stretch', fontFamily: 'var(--sans)' }
const column: CSSProperties = { minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7 }
const head: CSSProperties = { display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }
const title: CSSProperties = { margin: 0, fontSize: 11, fontWeight: 500, color: COLORS.text }
const hint: CSSProperties = { color: COLORS.faint, fontSize: 9.5, lineHeight: 1.4 }
const tree: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 0, border: `0.5px solid ${COLORS.border}`, borderRadius: 8, overflow: 'hidden', background: COLORS.panel }
const rowStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, padding: '5px 8px', borderTop: `0.5px solid ${COLORS.border}`, background: 'transparent', color: 'inherit', borderLeft: 'none', borderRight: 'none', borderBottom: 'none', textAlign: 'left', cursor: 'pointer', font: 'inherit', width: '100%' }
const rowFirst: CSSProperties = { ...rowStyle, borderTop: 'none' }
const rowActive: CSSProperties = { ...rowStyle, background: COLORS.selected }
const conn: CSSProperties = { flex: 'none', width: 13, color: COLORS.faint, fontFamily: 'ui-monospace, monospace', fontSize: 9, textAlign: 'center' }
const name: CSSProperties = { minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: COLORS.dim, fontSize: 10.5 }
const time: CSSProperties = { flex: 'none', color: COLORS.faint, fontFamily: 'ui-monospace, monospace', fontSize: 9, whiteSpace: 'nowrap' }
const tag: CSSProperties = { flex: 'none', fontSize: 8, border: `0.5px solid ${COLORS.border}`, borderRadius: 4, padding: '1px 4px', color: COLORS.faint }
const ownerTag: CSSProperties = { ...tag, color: COLORS.green, borderColor: '#a7d9b8' }
const queueTag: CSSProperties = { ...tag, color: COLORS.warn, borderColor: '#f1d6a8' }
const empty: CSSProperties = { margin: 0, padding: '8px 9px', color: COLORS.faint, fontSize: 10, lineHeight: 1.5 }
const gate: CSSProperties = { border: `0.5px solid ${COLORS.border}`, borderRadius: 8, background: COLORS.panel, padding: 9, display: 'flex', flexDirection: 'column', gap: 7 }
const gateHead: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }
const gateWorkspace: CSSProperties = { minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: COLORS.dim, fontSize: 10.5, fontFamily: 'ui-monospace, monospace' }
const ownerSub: CSSProperties = { ...metaLine, display: 'flex', gap: 6, marginTop: 2, fontSize: 9 }
const queueTitle: CSSProperties = { ...metaLine, display: 'flex', alignItems: 'center', gap: 6, margin: '1px 0 0', fontSize: 8.5, textTransform: 'uppercase', letterSpacing: '.05em' }
const queueRule: CSSProperties = { flex: 1, height: 1, background: COLORS.border }
const queueRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, padding: '5px 7px', border: '0.5px dashed #e1c28d', borderRadius: 6, background: 'rgba(255,247,232,.5)', fontSize: 10, color: COLORS.dim }
const queuePos: CSSProperties = { flex: 'none', width: 14, color: COLORS.warn, fontFamily: 'ui-monospace, monospace', fontSize: 9 }
const queueName: CSSProperties = { minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const queueTime: CSSProperties = { flex: 'none', color: COLORS.faint, fontFamily: 'ui-monospace, monospace', fontSize: 8.5, whiteSpace: 'nowrap' }

function formatActivity(updatedAt: number): string {
  if (updatedAt <= 0) return '—'
  return new Date(updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

/** Render the active task's session tree and the workspace execution gate. */
export function LoomSessionGraph({ t, taskTitle, workspaceLabel, rows, groups, execution, usageBySession, currentSessionId, onOpenSession }: LoomSessionGraphProps): ReactNode {
  const allRows = groups === undefined || groups.length === 0 ? rows : groups.flatMap(group => group.rows)
  const waiting = execution?.waiting ?? []
  const owner = execution?.owner?.sessionId
  const byId = new Map(allRows.map(row => [row.id, row]))
  const renderRow = (row: LoomTaskSessionRow, depth: number, last: boolean): ReactNode => {
    const active = row.id === currentSessionId
    const isOwner = owner === row.id
    const queueIndex = waiting.indexOf(row.id as SessionId)
    const parentRows = allRows.filter(candidate => candidate.parentId === row.id)
    return <div key={row.id} style={{ minWidth: 0 }}>
      <button type="button" style={active ? rowActive : depth === 0 ? rowFirst : rowStyle} onClick={() => onOpenSession(row.id as SessionId)}>
        <span style={conn}>{depth === 0 ? '●' : last ? '└─' : '├─'}</span>
        <span style={name} title={row.label}>{row.label}</span>
        {row.parentId !== undefined && <span style={tag}>{t('bottom.sessionFork')}</span>}
        {isOwner ? <span style={ownerTag}>{t('bottom.sessionOwner')}</span> : queueIndex >= 0 ? <span style={queueTag}>{t('bottom.sessionQueue', { index: String(queueIndex + 1) })}</span> : row.unavailable === true ? <span style={tag}>{t('bottom.sessionUnavailable')}</span> : row.running ? <span style={ownerTag}>{t('bottom.sessionRunning')}</span> : null}
        <span style={time}>{isOwner ? t('bottom.sessionExecuting', { time: formatActivity(row.updatedAt) }) : queueIndex >= 0 ? t('bottom.sessionQueued', { time: formatActivity(row.updatedAt) }) : t('bottom.sessionRecent', { time: formatActivity(row.updatedAt) })}</span>
      </button>
      {parentRows.map((child, index) => renderRow(child, depth + 1, index === parentRows.length - 1))}
    </div>
  }
  const visibleGroups: readonly LoomTaskSessionGroup[] = groups === undefined || groups.length === 0
    ? [{ taskId: 'active', taskTitle: taskTitle ?? '—', rows }]
    : groups
  const ownerRow = owner === undefined ? undefined : byId.get(owner)
  const ownerTime = ownerRow === undefined ? '—' : formatActivity(ownerRow.updatedAt)
  return <div className="loom-sg" style={wrap}>
    <style>{`
      @keyframes loom-sg-pulse{0%{box-shadow:0 0 0 0 rgba(21,128,61,.32)}70%{box-shadow:0 0 0 6px rgba(21,128,61,0)}100%{box-shadow:0 0 0 0 rgba(21,128,61,0)}}
      @keyframes loom-sg-shimmer{0%{transform:translateX(-100%)}100%{transform:translateX(220%)}}
      @keyframes loom-sg-queue{0%,100%{opacity:.25;transform:translateY(-1px)}50%{opacity:1;transform:translateY(1px)}}
      .loom-sg-live{width:7px;height:7px;border-radius:50%;background:${COLORS.green};animation:loom-sg-pulse 1.8s ease-out infinite}
      .loom-sg-bar{height:100%;width:42%;border-radius:99px;background:${COLORS.green};position:relative;overflow:hidden}
      .loom-sg-bar:after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.6),transparent);animation:loom-sg-shimmer 1.8s linear infinite}
      .loom-sg-queue-dot{width:4px;height:4px;border-radius:50%;background:${COLORS.warn};flex:none;animation:loom-sg-queue 1.8s ease-in-out infinite}
      .loom-sg-help{width:15px;height:15px;flex:none;border-radius:50%;border:0.5px solid ${COLORS.border};background:transparent;color:${COLORS.faint};font:inherit;font-size:9px;line-height:1;cursor:help;display:grid;place-items:center;padding:0}
      .loom-sg-tip{display:none;position:absolute;right:0;top:20px;z-index:3;width:250px;padding:8px 9px;border:0.5px solid ${COLORS.border};border-radius:7px;background:${COLORS.panel};box-shadow:0 8px 24px rgba(0,0,0,.12);color:${COLORS.dim};font-size:9.5px;line-height:1.5;white-space:normal}
      .loom-sg-help:hover+.loom-sg-tip,.loom-sg-help:focus+.loom-sg-tip{display:block}
    `}</style>
    <section style={{ ...column, flex: '1.2 1 0' }}>
      <div style={head}><h4 style={title}>{t('bottom.sessions')}</h4><span style={hint}>{taskTitle ?? '—'} · {t('bottom.sessionsHint')}</span><span style={{ ...hint, marginLeft: 'auto', whiteSpace: 'nowrap' }}>{t('bottom.latestHint')}</span></div>
      {allRows.length === 0
        ? <p style={empty}>{t('sessionList.empty')}</p>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {visibleGroups.map(group => <div key={group.taskId} style={{ border: `0.5px solid ${COLORS.border}`, borderRadius: 8, background: COLORS.panel2, padding: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: group.taskId === 'active' || group.rows.some(row => row.id === currentSessionId) ? COLORS.accent : COLORS.faint, flex: 'none' }} /><span style={{ ...title, fontSize: 10.5, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.taskTitle}</span><span style={{ ...hint, marginLeft: 'auto', whiteSpace: 'nowrap', fontFamily: 'ui-monospace, monospace' }}>{group.rows.length} sessions</span></div>
              <div style={tree}>{group.rows.filter(row => row.parentId === undefined || !group.rows.some(candidate => candidate.id === row.parentId)).map(row => renderRow(row, 0, false))}</div>
            </div>)}
          </div>}
    </section>
    <section style={{ ...column, flex: '1 1 0' }}>
      <div style={{ ...head, position: 'relative' }}><h4 style={title}>{t('bottom.executionGate')}</h4><span style={hint}>{workspaceLabel ?? '—'}</span><button type="button" className="loom-sg-help" aria-label={t('bottom.queueTip')} title={t('bottom.queueTip')}>?</button><span className="loom-sg-tip">{t('bottom.queueTip')}</span></div>
      {allRows.length === 0
        ? <p style={empty}>{t('bottom.noExecution')}</p>
        : <div style={gate}>
            <div style={gateHead}><span className={owner === undefined ? '' : 'loom-sg-live'} style={owner === undefined ? { width: 7, height: 7, borderRadius: '50%', background: COLORS.faint, flex: 'none' } : undefined} /><span style={gateWorkspace}>{workspaceLabel ?? '—'}</span><span style={owner === undefined ? tag : ownerTag}>{owner === undefined ? t('bottom.idle') : t('bottom.sessionOwner')}</span></div>
            {owner === undefined
              ? <p style={{ ...empty, padding: 0 }}>{t('bottom.noOwner')}</p>
              : <div style={{ marginTop: 1 }}>
                  <LoomTokenECG t={t} label={ownerRow?.label ?? owner} usage={usageBySession?.[owner]} running={ownerRow?.running === true} />
                  <div style={{ ...ownerSub, marginTop: 4 }}><span>{t('bottom.sessionExecuting', { time: ownerTime })}</span></div>
                </div>}
            <div style={queueTitle}><span>{t('bottom.queue')}</span><span style={queueRule} /></div>
            {waiting.length === 0
              ? <p style={{ ...empty, padding: '2px 0' }}>{t('bottom.queueEmpty')}</p>
              : waiting.map((sessionId, index) => <div key={sessionId} style={queueRow}><span style={queuePos}>{index + 1}</span><span style={queueName}>{byId.get(sessionId)?.label ?? sessionId}</span><span className="loom-sg-queue-dot" /><span style={queueTime}>{t('bottom.sessionQueued', { time: formatActivity(byId.get(sessionId)?.updatedAt ?? 0) })}</span></div>)}
          </div>}
    </section>
  </div>
}
