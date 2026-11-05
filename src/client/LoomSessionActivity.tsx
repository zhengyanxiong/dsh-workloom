/** Right-rail runtime view: active subagents, background jobs and a checkpointed fork action. */
import { useEffect, useSyncExternalStore, type ReactNode } from 'react'
import { Button, StateDot, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { LoomJobsFace, LoomJobView } from '../ports/loom-jobs.ts'
export type { LoomJobsFace, LoomJobView } from '../ports/loom-jobs.ts'
import type { LoomKey } from './locales.ts'
import classes from './LoomSessionActivity.module.css'

type Translate = (key: LoomKey, params?: Readonly<Record<string, string>>) => string

/** One direct subagent of the active native Session. */
export interface LoomSubagentRow {
  readonly id: string
  readonly label: string
  readonly mode: string
  readonly running: boolean
}

/** One Session's current workspace execution ownership. */
export interface LoomWorkspaceAccess {
  readonly workspaceLabel?: string | undefined
  readonly owner?: { readonly id: string; readonly label: string; readonly running?: boolean } | undefined
  readonly waiting: readonly { readonly id: string; readonly label: string }[]
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

/**
 * Render the runtime card for the current native Session.
 *
 * @param props - session identity, execution access, subagents and background jobs.
 * @returns the runtime section.
 */
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
  return <section className={classes.section} aria-label={t('runtime.title')}>
    <div className={classes.header}>
      <h4 className={classes.title}>{t('runtime.title')}</h4>
      <span className={classes.headerActions}>
        <Button size="sm" variant="outline" disabled={!canFork || forking} onClick={forkSession}>{forking ? t('runtime.forking') : t('runtime.fork')}</Button>
      </span>
    </div>
    {forkError !== undefined && <p role="alert" className={classes.alert}>{forkError}</p>}
    {claimError !== undefined && <p role="alert" className={classes.alert}>{claimError}</p>}
    {workspaceAccess !== undefined && <>
      <span className={classes.subhead}>{t('runtime.workspace')}</span>
      {workspaceAccess.owner === undefined
        ? <p className={classes.empty}>{t('runtime.noOwner')}</p>
        : <div className={classes.jobRow}>
            <div className={classes.jobHead}>
              <StateDot state={workspaceAccess.owner.running === true ? 'ongoing' : 'idle'} size={12} />
              <span className={classes.rowLabel} title={workspaceAccess.owner.id}>{workspaceAccess.owner.label}</span>
              <span className={classes.rowMeta}>{workspaceAccess.owner.id.slice(0, 12)}</span>
            </div>
            {workspaceAccess.workspaceLabel !== undefined && <p className={classes.jobDetail}>{workspaceAccess.workspaceLabel}</p>}
            {workspaceAccess.owner.running !== true && onClaim !== undefined && <div className={classes.claimActions}>
              <Button size="sm" variant="primary" disabled={claiming === true} onClick={onClaim}>{claiming === true ? t('runtime.claiming') : t('runtime.claim')}</Button>
            </div>}
            {workspaceAccess.owner.running === true && <p className={classes.jobDetail}>{t('runtime.claimLiveHint')}</p>}
          </div>}
      {workspaceAccess.waiting.length > 0 && <div className={classes.jobRow}>
        <span className={classes.rowMeta}>{t('runtime.waiting')} · {String(workspaceAccess.waiting.length)}</span>
        {workspaceAccess.waiting.map(entry => <span key={entry.id} className={classes.jobDetail} title={entry.id}>{entry.label} · {entry.id.slice(0, 12)}</span>)}
      </div>}
      <p className={classes.empty}>{workspaceAccess.owner?.id === sessionId ? t('runtime.youOwner') : workspaceAccess.waiting.some(entry => entry.id === sessionId) ? t('runtime.youWaiting') : t('runtime.youFree')}</p>
    </>}
    <span className={classes.subhead}>{t('runtime.agents')} · {String(subagents.length)}</span>
    {subagents.length === 0
      ? <p className={classes.empty}>{t('runtime.noAgents')}</p>
      : subagents.map(agent => <button key={agent.id} type="button" className={classes.row} onClick={() => openSession(agent.id as SessionId)}>
          <StateDot state={agent.running ? 'ongoing' : 'idle'} size={12} />
          <span className={classes.rowLabel} title={agent.label}>{agent.label}</span>
          <span className={classes.rowMeta}>{agent.mode}</span>
        </button>)}
    {jobs !== undefined && <>
      <span className={`${classes.subhead} ${classes.subheadRow}`}>{t('runtime.jobs')} · {String(liveJobs.length)}</span>
      {orderedJobs.length === 0
        ? <p className={classes.empty}>{t('runtime.noJobs')}</p>
        : orderedJobs.map(job => <div key={job.id} className={classes.jobRow}>
            <div className={classes.jobHead}>
              <StateDot state={job.status === 'running' ? 'ongoing' : job.status === 'failed' ? 'error' : job.status === 'completed' ? 'done' : 'warning'} size={12} />
              <span className={classes.rowLabel} title={job.label}>{job.label}</span>
              <Tag tone={jobTone(job.status)}>{jobLabel(t, job.status)}</Tag>
            </div>
            {(job.progress ?? job.detail) !== undefined && <p className={classes.jobDetail}>{job.progress ?? job.detail}</p>}
          </div>)}
    </>}
  </section>
}
