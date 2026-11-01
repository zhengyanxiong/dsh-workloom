/** Right-rail runtime view: active subagents, background jobs and a checkpointed fork action. */
import { useEffect, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react'
import { Button, StateDot, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { COLORS } from './shell.ts'
import type { LoomKey } from './locales.ts'

type Translate = (key: LoomKey, params?: Readonly<Record<string, string>>) => string

/** The subset of a background job the right rail renders. */
export interface LoomJobView {
  readonly id: string
  readonly label: string
  readonly status: 'running' | 'stopping' | 'completed' | 'killed' | 'failed'
  readonly progress?: string
  readonly detail?: string
  readonly startedAt: number
  readonly finishedAt?: number
}

/** One direct subagent of the active native Session. */
export interface LoomSubagentRow {
  readonly id: string
  readonly label: string
  readonly mode: string
  readonly running: boolean
}

/** The native jobs service face the right rail reads; absent when that plugin is not installed. */
/** One Session's current workspace execution ownership. */
export interface LoomWorkspaceAccess {
  readonly workspaceLabel?: string | undefined
  readonly owner?: { readonly id: string; readonly label: string; readonly running?: boolean } | undefined
  readonly waiting: readonly { readonly id: string; readonly label: string }[]
}

/** The native jobs service face the right rail reads; absent when that plugin is not installed. */
export interface LoomJobsFace {
  readonly state: {
    getSnapshot(): { readonly rows: Readonly<Record<string, readonly LoomJobView[]>> }
    subscribe(listener: () => void): () => void
  }
  watchRows(sessionId: SessionId): () => void
}

/** Inputs for the right-rail Session runtime section. */
export interface LoomSessionActivityProps {
  readonly t: Translate
  readonly sessionId?: SessionId | undefined
  readonly subagents: readonly LoomSubagentRow[]
  readonly jobs?: LoomJobsFace | undefined
  readonly workspaceAccess?: LoomWorkspaceAccess | undefined
  readonly openSession: (sessionId: SessionId) => void
  readonly forkSession: () => void
  readonly forking: boolean
  readonly forkError?: string | undefined
  readonly canFork: boolean
  readonly onClaim?: (() => void) | undefined
  readonly claiming?: boolean | undefined
  readonly claimError?: string | undefined
}

const section: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8, padding: '11px 14px', borderBottom: `0.5px solid ${COLORS.border}` }
const header: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }
const title: CSSProperties = { margin: 0, color: COLORS.text, fontSize: 11, fontWeight: 500 }
const subhead: CSSProperties = { margin: '2px 0 0', color: COLORS.faint, fontSize: 9.5, letterSpacing: '.05em', textTransform: 'uppercase' }
const empty: CSSProperties = { margin: 0, color: COLORS.faint, fontSize: 10.5, lineHeight: 1.5 }
const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, width: '100%', minWidth: 0, padding: '4px 0', border: 'none', background: 'transparent', color: 'inherit', textAlign: 'left', cursor: 'pointer', font: 'inherit' }
const rowLabel: CSSProperties = { minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: COLORS.dim, fontSize: 10.5 }
const rowMeta: CSSProperties = { flex: 'none', color: COLORS.faint, fontSize: 9.5 }
const alert: CSSProperties = { margin: 0, color: COLORS.error, fontSize: 10.5, lineHeight: 1.5 }
const jobRow: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 1, padding: '4px 0', minWidth: 0 }
const jobHead: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }
const jobDetail: CSSProperties = { margin: 0, color: COLORS.faint, fontSize: 9.5, lineHeight: 1.4, overflowWrap: 'anywhere' }

const EMPTY_JOBS: { readonly rows: Readonly<Record<string, readonly LoomJobView[]>> } = { rows: {} }
const NOOP = (): void => {}

function jobTone(status: LoomJobView['status']): 'success' | 'warning' | 'danger' | 'info' {
  if (status === 'completed') return 'success'
  if (status === 'failed') return 'danger'
  if (status === 'running') return 'info'
  return 'warning'
}

function jobLabel(t: Translate, status: LoomJobView['status']): string {
  switch (status) {
    case 'running': return t('runtime.job.running')
    case 'stopping': return t('runtime.job.stopping')
    case 'completed': return t('runtime.job.completed')
    case 'killed': return t('runtime.job.killed')
    case 'failed': return t('runtime.job.failed')
  }
}

/** One compact runtime card for the current native Session. */
export function LoomSessionActivity({ t, sessionId, subagents, jobs, workspaceAccess, openSession, forkSession, forking, forkError, canFork, onClaim, claiming, claimError }: LoomSessionActivityProps): ReactNode {
  const source = jobs?.state
  const subscribe = source === undefined ? (): (() => void) => NOOP : (listener: () => void): (() => void) => source.subscribe(listener)
  const read = source === undefined ? (): typeof EMPTY_JOBS => EMPTY_JOBS : (): ReturnType<LoomJobsFace['state']['getSnapshot']> => source.getSnapshot()
  const snapshot = useSyncExternalStore(subscribe, read, read)
  useEffect(() => {
    if (jobs === undefined || sessionId === undefined) return
    return jobs.watchRows(sessionId)
  }, [jobs, sessionId])
  const jobRows = sessionId === undefined ? [] : snapshot.rows[String(sessionId)] ?? []
  const liveJobs = jobRows.filter(job => job.status === 'running' || job.status === 'stopping')
  const orderedJobs = [...liveJobs, ...jobRows.filter(job => !liveJobs.includes(job))]
  return <section style={section} aria-label={t('runtime.title')}>
    <div style={header}>
      <h4 style={title}>{t('runtime.title')}</h4>
      <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6, alignItems: 'center' }}>
        <Button size="sm" variant="outline" disabled={!canFork || forking} onClick={forkSession}>{forking ? t('runtime.forking') : t('runtime.fork')}</Button>
      </span>
    </div>
    {forkError !== undefined && <p role="alert" style={alert}>{forkError}</p>}
    {claimError !== undefined && <p role="alert" style={alert}>{claimError}</p>}
    {workspaceAccess !== undefined && <>
      <span style={subhead}>{t('runtime.workspace')}</span>
      {workspaceAccess.owner === undefined
        ? <p style={empty}>{t('runtime.noOwner')}</p>
        : <div style={jobRow}>
            <div style={jobHead}>
              <StateDot state={workspaceAccess.owner.running === true ? 'ongoing' : 'idle'} size={12} />
              <span style={rowLabel} title={workspaceAccess.owner.id}>{workspaceAccess.owner.label}</span>
              <span style={rowMeta}>{workspaceAccess.owner.id.slice(0, 12)}</span>
            </div>
            {workspaceAccess.workspaceLabel !== undefined && <p style={jobDetail}>{workspaceAccess.workspaceLabel}</p>}
            {workspaceAccess.owner.running !== true && onClaim !== undefined && <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
              <Button size="sm" variant="primary" disabled={claiming === true} onClick={onClaim}>{claiming === true ? t('runtime.claiming') : t('runtime.claim')}</Button>
            </div>}
            {workspaceAccess.owner.running === true && <p style={jobDetail}>{t('runtime.claimLiveHint')}</p>}
          </div>}
      {workspaceAccess.waiting.length > 0 && <div style={jobRow}>
        <span style={rowMeta}>{t('runtime.waiting')} · {String(workspaceAccess.waiting.length)}</span>
        {workspaceAccess.waiting.map(entry => <span key={entry.id} style={jobDetail} title={entry.id}>{entry.label} · {entry.id.slice(0, 12)}</span>)}
      </div>}
      <p style={empty}>{workspaceAccess.owner?.id === sessionId ? t('runtime.youOwner') : workspaceAccess.waiting.some(entry => entry.id === sessionId) ? t('runtime.youWaiting') : t('runtime.youFree')}</p>
    </>}
    <span style={subhead}>{t('runtime.agents')} · {String(subagents.length)}</span>
    {subagents.length === 0
      ? <p style={empty}>{t('runtime.noAgents')}</p>
      : subagents.map(agent => <button key={agent.id} type="button" style={row} onClick={() => openSession(agent.id as SessionId)}>
          <StateDot state={agent.running ? 'ongoing' : 'idle'} size={12} />
          <span style={rowLabel} title={agent.label}>{agent.label}</span>
          <span style={rowMeta}>{agent.mode}</span>
        </button>)}
    {jobs !== undefined && <>
      <span style={{ ...subhead, display: 'flex', alignItems: 'center', gap: 6 }}>{t('runtime.jobs')} · {String(liveJobs.length)}</span>
      {orderedJobs.length === 0
        ? <p style={empty}>{t('runtime.noJobs')}</p>
        : orderedJobs.map(job => <div key={job.id} style={jobRow}>
            <div style={jobHead}>
              <StateDot state={job.status === 'running' ? 'ongoing' : job.status === 'failed' ? 'error' : job.status === 'completed' ? 'done' : 'warning'} size={12} />
              <span style={rowLabel} title={job.label}>{job.label}</span>
              <Tag tone={jobTone(job.status)}>{jobLabel(t, job.status)}</Tag>
            </div>
            {(job.progress ?? job.detail) !== undefined && <p style={jobDetail}>{job.progress ?? job.detail}</p>}
          </div>)}
    </>}
  </section>
}
