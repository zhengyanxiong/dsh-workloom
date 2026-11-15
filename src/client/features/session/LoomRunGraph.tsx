/** Bottom-panel run graph: recursive Sessions, workflow agents and background jobs. */
import { useEffect, useSyncExternalStore, type ReactNode } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { StateDot } from '../../ui/primitives.ts'
import type { LoomJobsFace } from '../../../ports/loom-jobs.ts'
import type { LoomKey } from '../../shared/locales.ts'
import {
  buildRunGraph, flattenRunGraph, type RunGraphNode, type RunGraphSessionInput, type RunGraphStatus,
} from './run-graph.ts'
import classes from './LoomRunGraph.module.css'

type Translate = (key: LoomKey, params?: Readonly<Record<string, string>>) => string

/** Inputs for the recursive run monitor. */
export interface LoomRunGraphProps {
  readonly t: Translate
  readonly taskTitle?: string | undefined
  readonly rows: readonly RunGraphSessionInput[]
  readonly jobs?: LoomJobsFace | undefined
  readonly currentSessionId?: string | undefined
  readonly onOpenSession: (sessionId: SessionId) => void
}

const EMPTY_JOBS: { readonly rows: Readonly<Record<string, readonly never[]>> } = { rows: {} }
const NOOP = (): void => {}
const EMPTY_SUBSCRIBE = (): (() => void) => NOOP

function dotState(status: RunGraphStatus): 'ongoing' | 'done' | 'error' | 'warning' | 'idle' {
  if (status === 'running') return 'ongoing'
  if (status === 'completed') return 'done'
  if (status === 'failed') return 'error'
  if (status === 'cancelled') return 'warning'
  return 'idle'
}

function statusKey(status: RunGraphStatus): LoomKey {
  switch (status) {
    case 'running': return 'run.status.running'
    case 'completed': return 'run.status.completed'
    case 'failed': return 'run.status.failed'
    case 'cancelled': return 'run.status.cancelled'
    case 'idle': return 'run.status.idle'
  }
}

function NodeRow({ node, t, currentSessionId, onOpenSession }: {
  readonly node: RunGraphNode
  readonly t: Translate
  readonly currentSessionId: string | undefined
  readonly onOpenSession: (sessionId: SessionId) => void
}): ReactNode {
  const isSession = node.kind === 'session'
  const active = isSession && node.id === currentSessionId
  const content = <>
    <StateDot state={dotState(node.status)} size={12} />
    <span className={classes.kind}>{node.kind === 'workflow'
      ? t('run.kind.workflow')
      : node.kind === 'phase'
        ? t('run.kind.phase')
        : isSession
          ? node.origin === 'subagent' ? t('run.kind.agent') : t('run.kind.session')
          : t('run.kind.job')}</span>
    <span className={classes.label} title={node.label}>{node.kind === 'phase' && node.label === '' ? t('run.unphased') : node.label}</span>
    <span className={`${classes.status} ${node.status === 'running' ? classes.statusRunning : ''}`}>{t(statusKey(node.status))}</span>
    {node.progress !== undefined && <span className={classes.detail}>{node.progress}</span>}
    {node.detail !== undefined && <span className={classes.detail} title={node.detail}>{node.detail}</span>}
  </>
  return isSession
    ? <button type="button" className={`${classes.row} ${active ? classes.rowActive : ''} ${node.status === 'running' ? classes.rowRunning : ''}`} onClick={() => onOpenSession(node.id as SessionId)}>{content}</button>
    : <div className={`${classes.row} ${classes.jobRow} ${node.status === 'running' ? classes.rowRunning : ''}`}>{content}</div>
}

/**
 * Render the active task's recursive Session and background-job tree.
 * @param props - lineage rows, native jobs face and open-session intent.
 * @returns the run monitor.
 */
export function LoomRunGraph({ t, taskTitle, rows, jobs, currentSessionId, onOpenSession }: LoomRunGraphProps): ReactNode {
  const source = jobs?.state
  const subscribe = source === undefined ? EMPTY_SUBSCRIBE : (listener: () => void): (() => void) => source.subscribe(listener)
  const read = source === undefined ? (): typeof EMPTY_JOBS => EMPTY_JOBS : () => source.getSnapshot()
  const snapshot = useSyncExternalStore(subscribe, read, read)
  const ids = rows.map(row => row.id).join('\u0000')
  useEffect(() => {
    if (jobs === undefined || ids === '') return
    const disposers = ids.split('\u0000').map(id => jobs.watchRows(id as SessionId))
    return () => { for (const dispose of disposers) dispose() }
  }, [jobs, ids])
  const flat = flattenRunGraph(buildRunGraph(rows, snapshot.rows))
  const running = flat.filter(node => node.status === 'running').length
  const agents = flat.filter(node => node.kind === 'session' && node.origin === 'subagent').length
  const jobCount = flat.filter(node => node.kind === 'job').length
  return <section className={classes.wrap} aria-label={t('run.title')}>
    <div className={classes.head}>
      <h4 className={classes.title}>{t('run.title')}</h4>
      <span className={classes.hint}>{taskTitle ?? '—'}</span>
      <span className={classes.summary}>
        {t('run.summary', { running: String(running), agents: String(agents), jobs: String(jobCount) })}
      </span>
    </div>
    {flat.length === 0
      ? <p className={classes.empty}>{t('run.empty')}</p>
      : <div className={classes.tree} role="tree" aria-label={t('run.title')}>
        {flat.map(node => <div key={`${node.kind}:${node.id}`} role="treeitem" aria-level={node.depth + 1} className={classes.nodeWrap} style={{ marginLeft: `${String(node.depth * 20)}px` }}>
          <NodeRow node={node} t={t} currentSessionId={currentSessionId} onOpenSession={onOpenSession} />
        </div>)}
      </div>}
  </section>
}
