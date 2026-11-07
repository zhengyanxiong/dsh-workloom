/** Task-detail execution-session list: owner/waiting/idle grouping and queue reordering. */
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ExecutionState } from 'dsh-workloom/types'
import { COLORS } from './shell.ts'
import type { LoomKey } from './locales.ts'
import type { AttemptSessionRow } from './projection.ts'
import type { ExecutionActions } from './LoomExecution.tsx'

type Translate = (key: LoomKey, params?: Readonly<Record<string, string>>) => string

const section: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }
const heading: CSSProperties = { display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }
const headingTitle: CSSProperties = { margin: 0, fontSize: 'var(--text-compact-size)', fontWeight: 500, color: COLORS.text }
const hint: CSSProperties = { margin: 0, color: COLORS.faint, fontSize: 'var(--text-label-size)', lineHeight: 1.5 }
const legend: CSSProperties = { display: 'flex', gap: 12, flexWrap: 'wrap', color: COLORS.faint, fontSize: 'var(--text-label-size)' }
const groupLabel: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, color: COLORS.faint, fontSize: 'var(--text-micro-size)', letterSpacing: '.07em', textTransform: 'uppercase' }
const rule: CSSProperties = { height: 1, flex: 1, background: COLORS.border }
const row: CSSProperties = { display: 'grid', gridTemplateColumns: '20px 8px minmax(0,1fr) auto', alignItems: 'center', gap: 8, minWidth: 0, padding: '7px 9px', border: `0.5px solid ${COLORS.border}`, borderRadius: 8, background: COLORS.panel }
const ownerRow: CSSProperties = { ...row, background: 'color-mix(in srgb, var(--dsw-alias-state-success-primary) 8%, transparent)', borderColor: 'color-mix(in srgb, var(--dsw-alias-state-success-primary) 35%, transparent)' }
const idleRow: CSSProperties = { ...row, background: COLORS.panel2 }
const draggingRow: CSSProperties = { ...row, borderColor: COLORS.borderStrong, background: COLORS.selected, boxShadow: '0 8px 20px color-mix(in srgb, var(--color-accent) 14%, transparent)' }
const handle: CSSProperties = { color: COLORS.faint, cursor: 'grab', userSelect: 'none', fontFamily: 'ui-monospace, monospace', fontSize: 'var(--text-h3-size)', textAlign: 'center', letterSpacing: -2 }
const handleOff: CSSProperties = { ...handle, visibility: 'hidden' }
const dot = (state: string): CSSProperties => ({ width: 7, height: 7, borderRadius: 999, background: state === 'owner' ? COLORS.green : state === 'waiting' ? COLORS.warn : COLORS.faint })
const main: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }
const titleLine: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flexWrap: 'wrap' }
const title: CSSProperties = { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 'var(--text-compact-size)', color: COLORS.text }
const sid: CSSProperties = { fontFamily: 'ui-monospace, monospace', fontSize: 'var(--text-micro-size)', color: COLORS.faint }
const meta: CSSProperties = { display: 'flex', gap: 7, flexWrap: 'wrap', color: COLORS.faint, fontSize: 'var(--text-label-size)' }
const tag = (tone: 'owner' | 'waiting' | 'idle'): CSSProperties => ({
  border: `0.5px solid ${tone === 'owner' ? COLORS.green : tone === 'waiting' ? COLORS.warn : COLORS.border}`,
  color: tone === 'owner' ? COLORS.green : tone === 'waiting' ? COLORS.warn : COLORS.faint,
  background: 'transparent', borderRadius: 4, padding: '0 4px', fontSize: 'var(--text-nano-size)',
})
const actionRow: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, flexWrap: 'wrap' }
const error: CSSProperties = { margin: 0, color: COLORS.error, fontSize: 'var(--text-label-size)', lineHeight: 1.5 }
const dropLine: CSSProperties = { height: 2, background: COLORS.accent, borderRadius: 2, margin: '-5px 3px 3px' }
const empty: CSSProperties = { margin: 0, padding: '9px 11px', border: `0.5px dashed ${COLORS.border}`, borderRadius: 8, color: COLORS.faint, fontSize: 'var(--text-small-size)' }

/** Props for the execution-session queue. */
export interface LoomExecutionQueueProps {
  readonly t: Translate
  readonly workspaceId: string | undefined
  readonly sessions: readonly AttemptSessionRow[]
  readonly execution: ExecutionState | undefined
  readonly selectedSessionId?: string | undefined
  readonly actions: ExecutionActions
  readonly onSelectSession?: ((sessionId: string) => void) | undefined
  readonly onOpenSession: (sessionId: string) => void
}

/**
 * Render the current round's Session queue with owner/waiting/idle roles.
 * Clicking a row selects it for task-detail actions; the open control is the
 * only path to the native DSH conversation.
 * @param props - sessions, execution state and Loom actions.
 * @returns the queue list and its drag/drop affordances.
 */
export function LoomExecutionQueue({ t, workspaceId, sessions, execution, selectedSessionId, actions, onSelectSession, onOpenSession }: LoomExecutionQueueProps) {
  const waiting = execution?.waiting ?? []
  const [order, setOrder] = useState<readonly SessionId[]>(waiting)
  const [busy, setBusy] = useState<string>()
  const [failure, setFailure] = useState<string>()
  const [dragId, setDragId] = useState<string>()
  const [dropBefore, setDropBefore] = useState<string>()
  const [takeoverId, setTakeoverId] = useState<string>()
  const waitingKey = waiting.join('|')
  useEffect(() => { setOrder(waiting) }, [waitingKey])
  const owner = execution?.owner?.sessionId
  const remaining = useMemo(() => {
    const byId = new Map(sessions.map(session => [session.sessionId, session]))
    const ordered = order.flatMap(id => byId.get(id) === undefined ? [] : [byId.get(id)!])
    return { owner: owner === undefined ? undefined : byId.get(owner), ordered, idle: sessions.filter(session => session.sessionId !== owner && !order.includes(session.sessionId as SessionId)) }
  }, [sessions, owner, order])
  async function run(key: string, operation: () => Promise<{ ok: boolean; error?: { code: string; message: string } }>): Promise<void> {
    setBusy(key); setFailure(undefined)
    try {
      const result = await operation()
      if (!result.ok) { setFailure(result.error === undefined ? t('state.error') : `${result.error.code}: ${result.error.message}`); return }
      actions.onChanged()
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error))
    } finally { setBusy(undefined) }
  }
  function release(): void {
    if (workspaceId === undefined || execution?.owner === null || execution?.owner === undefined) return
    const ownerToken = execution.owner
    void run('release', () => actions.releaseExecution({ workspaceId, sessionId: ownerToken.sessionId, generation: Number(ownerToken.generation) }))
  }
  function acquire(sessionId: string): void {
    if (workspaceId === undefined) return
    void run(sessionId, () => actions.acquireExecution({ workspaceId, sessionId: sessionId as SessionId }))
  }
  function cancel(sessionId: string): void {
    if (workspaceId === undefined) return
    void run(sessionId, () => actions.cancelExecution({ workspaceId, sessionId: sessionId as SessionId }))
  }
  function takeover(sessionId: string): void {
    if (workspaceId === undefined) return
    void run(sessionId, () => actions.takeoverExecution({ workspaceId, sessionId: sessionId as SessionId }))
    setTakeoverId(undefined)
  }
  function reorder(id: string, before: string | undefined): void {
    const next = [...order].filter(candidate => candidate !== id)
    const at = before === undefined ? next.length : next.indexOf(before as SessionId)
    next.splice(at < 0 ? next.length : at, 0, id as SessionId)
    if (next.join('|') === order.join('|') || workspaceId === undefined) return
    const previous = order
    setOrder(next)
    void run('reorder', async () => {
      const result = await actions.reorderExecutionQueue({ workspaceId, sessionIds: next })
      if (!result.ok) setOrder(previous)
      return result
    })
  }
  function keyboard(id: string, direction: -1 | 1): void {
    const index = order.indexOf(id as SessionId)
    const target = index + direction
    if (index < 0 || target < 0 || target >= order.length) return
    reorder(id, order[target] as string)
  }
  function rowFor(session: AttemptSessionRow, role: 'owner' | 'waiting' | 'idle'): JSX.Element {
    const position = role === 'waiting' ? order.indexOf(session.sessionId as SessionId) + 1 : undefined
    const isOwner = role === 'owner'
    const waiting = role === 'waiting'
    const active = selectedSessionId === session.sessionId
    const style = isOwner ? ownerRow : role === 'idle' ? idleRow : dragId === session.sessionId ? draggingRow : row
    return <div key={session.sessionId} role="listitem" aria-current={active ? 'true' : undefined} style={{ ...style, ...(active ? { outline: `1px solid ${COLORS.accent}`, outlineOffset: -1 } : {}) }}
      draggable={waiting}
      onDragStart={event => { if (!waiting) return; setDragId(session.sessionId); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', session.sessionId) }}
      onDragOver={event => { if (dragId === undefined || !waiting) return; event.preventDefault(); setDropBefore(session.sessionId) }}
      onDragEnd={() => { setDragId(undefined); setDropBefore(undefined) }}
      onDrop={event => { event.preventDefault(); if (dragId !== undefined && dragId !== session.sessionId) reorder(dragId, session.sessionId); setDragId(undefined); setDropBefore(undefined) }}
      onClick={() => { onSelectSession?.(session.sessionId) }}>
      <span role="button" tabIndex={waiting ? 0 : -1} aria-label={waiting ? t('sessionQueue.reorder') : undefined} className="loom-session-handle" style={waiting ? handle : handleOff}
        onKeyDown={event => {
          if (event.key === 'ArrowUp' && event.altKey) { event.preventDefault(); keyboard(session.sessionId, -1) }
          if (event.key === 'ArrowDown' && event.altKey) { event.preventDefault(); keyboard(session.sessionId, 1) }
        }}>⋮⋮</span>
      <i style={dot(role)} aria-hidden />
      <span style={main}>
        <span style={titleLine}>
          {position !== undefined && <span style={{ ...tag('waiting'), fontFamily: 'ui-monospace, monospace', minWidth: 18, textAlign: 'center' }}>{position}</span>}
          <span style={title} title={session.title ?? session.sessionId}>{session.title ?? t('untitledSession')}</span>
          <span style={tag(role)}>{t(role === 'owner' ? 'sessionQueue.owner' : role === 'waiting' ? 'sessionQueue.waiting' : 'sessionQueue.idle')}</span>
          <span style={sid}>{session.sessionId.slice(0, 12)}</span>
        </span>
        <span style={meta}>
          {session.unavailableReason !== undefined ? <span style={{ color: COLORS.warn }}>{t('sessionList.unavailable')}</span> : <span>{session.running ? t('sessionList.running') : t('sessionList.idle')}</span>}
          {waiting && <span>{t('sessionQueue.position', { position: String(position) })}</span>}
        </span>
      </span>
      <span style={actionRow} onClick={event => event.stopPropagation()}>
        <Button size="sm" variant="ghost" title={t('session.open')} onClick={() => onOpenSession(session.sessionId)}>↗</Button>
        {isOwner && <Button size="sm" variant="outline" disabled={busy !== undefined} onClick={release}>{busy === 'release' ? t('form.submitPending') : t('sessionQueue.release')}</Button>}
        {waiting && <>
          <Button size="sm" variant="outline" disabled={busy !== undefined} onClick={() => cancel(session.sessionId)}>{busy === session.sessionId ? t('form.submitPending') : t('sessionQueue.leave')}</Button>
          {takeoverId === session.sessionId
            ? <Button size="sm" variant="primary" disabled={busy !== undefined} onClick={() => takeover(session.sessionId)}>{t('sessionQueue.confirmTakeover')}</Button>
            : <Button size="sm" variant="outline" disabled={busy !== undefined} onClick={() => setTakeoverId(session.sessionId)}>{t('sessionQueue.takeover')}</Button>}
        </>}
        {role === 'idle' && <Button size="sm" variant="outline" disabled={busy !== undefined} onClick={() => acquire(session.sessionId)}>{execution?.owner === null || execution?.owner === undefined ? t('sessionQueue.acquire') : t('sessionQueue.join')}</Button>}
      </span>
      {dropBefore === session.sessionId && dragId !== undefined && dragId !== session.sessionId && <span aria-hidden style={{ gridColumn: '1 / -1', height: 2, background: COLORS.accent, borderRadius: 2, marginTop: -4 }} />}
    </div>
  }
  if (sessions.length === 0) return <p style={empty}>{t('sessionList.empty')}</p>
  return <section style={section} aria-label={t('sessionQueue.title')}>
    <div style={heading}><h3 style={headingTitle}>{t('sessionQueue.title')}</h3><span style={hint}>{t('sessionQueue.hint')}</span></div>
    <div style={legend}><span>● {t('sessionQueue.owner')}</span><span>● {t('sessionQueue.waiting')}</span><span>● {t('sessionQueue.idle')}</span></div>
    {remaining.owner !== undefined && <><div style={groupLabel}>{t('sessionQueue.owner')}<span style={rule} /></div>{rowFor(remaining.owner, 'owner')}</>}
    {remaining.ordered.length > 0 && <><div style={groupLabel}>{t('sessionQueue.waiting')}<span style={rule} /></div>
      {remaining.ordered.map(session => <div key={session.sessionId}>{dropBefore === session.sessionId && dragId !== undefined && dragId !== session.sessionId && <div style={dropLine} />}{rowFor(session, 'waiting')}</div>)}
      <div style={{ ...empty, padding: '5px 9px' }} onDragOver={event => { if (dragId !== undefined) { event.preventDefault(); setDropBefore(undefined) } }} onDrop={event => { event.preventDefault(); if (dragId !== undefined) reorder(dragId, undefined); setDragId(undefined); setDropBefore(undefined) }}>{t('sessionQueue.dropEnd')}</div></>}
    {remaining.idle.length > 0 && <><div style={groupLabel}>{t('sessionQueue.idle')}<span style={rule} /></div>{remaining.idle.map(session => rowFor(session, 'idle'))}</>}
    {failure !== undefined && <p role="alert" style={error}>{failure}</p>}
    <p style={hint}>{t('sessionQueue.keyboardHint')}</p>
  </section>
}
