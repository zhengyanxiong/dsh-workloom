/** Right-rail version dependency graph: task → workspace → owning Session and queue. */
import type { CSSProperties, ReactNode } from 'react'
import { Button, StateDot, Tag } from '../../ui/primitives.ts'
import type { CatalogSnapshot, TaskRecord, VersionRecord, WorkspaceRecord } from 'dsh-workloom/types'
import { COLORS, STATUS_DOT, STATUS_META } from '../../shell.ts'
import type { LoomKey } from '../../locales.ts'

type Translate = (key: LoomKey, params?: Readonly<Record<string, string>>) => string

/** Inputs for the version dependency graph. */
export interface LoomVersionGraphProps {
  readonly t: Translate
  readonly snapshot: CatalogSnapshot
  readonly version: VersionRecord
  /** Optional display labels for Session ids. */
  readonly sessionLabel?: ((sessionId: string) => string) | undefined
  /** Sessions whose runtime reports them as running; only these animate. */
  readonly runningSessionIds?: ReadonlySet<string> | undefined
  readonly onSelectTask: (task: TaskRecord) => void
  /** Release a stale execution owner; a live owner must be taken over from its task. */
  readonly onRelease?: ((workspaceId: string, owner: { readonly sessionId: string; readonly generation: number }) => void) | undefined
  readonly releasingWorkspaceId?: string | undefined
  readonly releaseError?: string | undefined
  /** Release every idle/lost owner in one action. */
  readonly onReleaseAll?: (() => void) | undefined
  readonly releasingAll?: boolean | undefined
}

const section: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }
const heading: CSSProperties = { display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', margin: 0 }
const title: CSSProperties = { margin: 0, color: COLORS.text, fontSize: 'var(--text-small-size)', fontWeight: 500 }
const hint: CSSProperties = { margin: 0, color: COLORS.faint, fontSize: 'var(--text-micro-size)', lineHeight: 1.4 }
const list: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 0, minWidth: 0 }
const taskRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, width: '100%', minWidth: 0, padding: '4px 0 2px', border: 'none', background: 'transparent', color: 'inherit', textAlign: 'left', cursor: 'pointer', font: 'inherit' }
const taskTitle: CSSProperties = { minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: COLORS.dim, fontSize: 'var(--text-label-size)' }
const workspaceRow: CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 5, minWidth: 0, marginLeft: 18, padding: '1px 0 2px', borderLeft: `1px solid ${COLORS.border}`, paddingLeft: 8 }
const workspaceText: CSSProperties = { minWidth: 0, flex: 1, overflowWrap: 'anywhere', color: COLORS.faint, fontFamily: 'ui-monospace, monospace', fontSize: 'var(--text-micro-size)', lineHeight: 1.4 }
const ownerRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: 5, minWidth: 0, marginLeft: 30, padding: '1px 0 3px', borderLeft: `1px solid ${COLORS.border}`, paddingLeft: 8 }
const ownerText: CSSProperties = { minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: COLORS.dim, fontSize: 'var(--text-micro-size)' }
const meta: CSSProperties = { flex: 'none', color: COLORS.faint, fontFamily: 'ui-monospace, monospace', fontSize: 'var(--text-nano-size)' }
const empty: CSSProperties = { margin: 0, color: COLORS.faint, fontSize: 'var(--text-label-size)', lineHeight: 1.5 }

function workspaceLabel(workspace: WorkspaceRecord | undefined): string {
  if (workspace === undefined) return ''
  return workspace.rootPath ?? workspace.path
}

/** Render the current version as a compact dependency graph with live execution ownership. */
export function LoomVersionGraph({ t, snapshot, version, sessionLabel, runningSessionIds, onSelectTask, onRelease, releasingWorkspaceId, releaseError, onReleaseAll, releasingAll }: LoomVersionGraphProps): ReactNode {
  const tasks = snapshot.tasks.filter(task => task.versionId === version.id)
  const executions = snapshot.executions
  const staleOwners = executions.filter(execution => execution.owner !== null && execution.owner !== undefined && runningSessionIds?.has(execution.owner.sessionId) !== true)
  return <section style={section} aria-label={t('graph.title')}>
    <div style={heading}>
      <h4 style={title}>{t('graph.title')}</h4>
      <span style={hint}>{t('graph.hint')}</span>
      <span style={{ ...hint, flexBasis: '100%' }}>{t('graph.releaseHint')}</span>
      {staleOwners.length > 0 && onReleaseAll !== undefined && <Button size="sm" variant="outline" disabled={releasingAll === true} onClick={onReleaseAll}>{releasingAll === true ? t('graph.releasing') : t('graph.releaseAll', { count: String(staleOwners.length) })}</Button>}
    </div>
    {releaseError !== undefined && <p role="alert" style={{ ...empty, color: COLORS.error }}>{releaseError}</p>}
    {tasks.length === 0
      ? <p style={empty}>{t('version.noTasks')}</p>
      : <div style={list}>{tasks.map(task => {
          const attempt = task.attempts.at(-1)
          const workspace = attempt === undefined ? undefined : snapshot.workspaces.find(candidate => candidate.id === attempt.workspaceId)
          const execution = workspace === undefined ? undefined : executions.find(candidate => candidate.workspaceId === workspace.id)
          const owner = execution?.owner
          const waiting = execution?.waiting ?? []
          return <div key={task.id} style={{ minWidth: 0 }}>
            <button type="button" style={taskRow} onClick={() => onSelectTask(task)} title={task.title}>
              <StateDot state={STATUS_DOT[task.status]} size={12} />
              <span style={taskTitle}>{task.title}</span>
              <Tag tone={task.status === 'completed' ? 'success' : task.status === 'failed' ? 'danger' : task.status === 'review' ? 'warning' : task.status === 'running' ? 'info' : 'neutral'}>{t(STATUS_META[task.status].key)}</Tag>
            </button>
            {workspace === undefined
              ? <div style={workspaceRow}><span style={workspaceText}>{t('graph.noWorkspace')}</span></div>
              : <>
                  <div style={workspaceRow}><span aria-hidden style={{ flex: 'none', color: COLORS.faint, fontSize: 'var(--text-nano-size)' }}>└</span><span style={workspaceText} title={workspaceLabel(workspace)}>{workspaceLabel(workspace)}</span></div>
                  <div style={ownerRow}>
                    <StateDot state={owner !== null && owner !== undefined && runningSessionIds?.has(owner.sessionId) === true ? 'ongoing' : 'idle'} size={12} />
                    <span style={ownerText} title={owner?.sessionId}>{owner === null || owner === undefined ? t('graph.free') : `${t('graph.owner')} · ${sessionLabel?.(owner.sessionId) ?? owner.sessionId.slice(0, 12)}`}</span>
                    {owner !== null && owner !== undefined && (runningSessionIds?.has(owner.sessionId) === true
                      ? <span style={meta}>{t('graph.ownerRunning')}</span>
                      : <Button size="sm" variant="ghost" disabled={onRelease === undefined || releasingWorkspaceId === workspace.id} onClick={() => { onRelease?.(workspace.id, { sessionId: owner.sessionId, generation: Number(owner.generation) }) }}>{releasingWorkspaceId === workspace.id ? t('graph.releasing') : t('graph.release')}</Button>)}
                  </div>
                  {waiting.length > 0 && <div style={ownerRow}><span style={{ ...ownerText, color: COLORS.warn }}>{t('graph.waiting')} · {waiting.map(id => sessionLabel?.(id) ?? id.slice(0, 8)).join(', ')}</span></div>}
                </>}
          </div>
        })}</div>}
  </section>
}
