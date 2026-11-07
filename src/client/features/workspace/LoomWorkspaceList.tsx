/** Version workspace list: directories, baseline, real change status, owners and cleanup risk. */
import { useEffect, useState, type CSSProperties } from 'react'
import { Tag } from '../../ui/primitives.ts'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { WorkspaceStatusResult } from 'dsh-workloom/types'
import { COLORS } from '../../ui/tokens.ts'
import { metaLine } from '../../ui/styles.ts'
import { shortCommit } from '../../shared/format.ts'
import type { LoomKey } from '../../shared/locales.ts'
import { workspaceName, type VersionWorkspaceRow } from '../../shared/projection.ts'

type Translate = (key: LoomKey, params?: Readonly<Record<string, string>>) => string

/** Host read of one workspace's ownership and uncommitted changes. */
export type LoadWorkspaceStatus = (request: { readonly workspaceId: string }) => Promise<RemoteResult<WorkspaceStatusResult>>

/** Inputs for the version workspace list. */
export interface LoomWorkspaceListProps {
  readonly t: Translate
  readonly rows: readonly VersionWorkspaceRow[]
  /** Optional Host status read; when absent the change rows state that they are unavailable. */
  readonly loadStatus?: LoadWorkspaceStatus | undefined
}

type StatusState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly status: WorkspaceStatusResult }
  | { readonly kind: 'failed'; readonly message: string }

const section: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }
const heading: CSSProperties = { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }
const headingTitle: CSSProperties = { margin: 0, fontSize: 'var(--text-compact-size)', fontWeight: 500, color: COLORS.text }
const hint: CSSProperties = { margin: 0, color: COLORS.faint, fontSize: 'var(--text-small-size)', lineHeight: 1.5 }
const empty: CSSProperties = { margin: 0, padding: '12px 14px', border: `0.5px dashed ${COLORS.border}`, borderRadius: 8, color: COLORS.faint, fontSize: 'var(--text-small-size)', lineHeight: 1.5 }
const card: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, padding: '11px 13px', border: `0.5px solid ${COLORS.border}`, borderRadius: 8, background: COLORS.panel2 }
const cardHead: CSSProperties = { display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap', minWidth: 0 }
const cardTitle: CSSProperties = { margin: 0, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'ui-monospace, monospace', fontSize: 'var(--text-compact-size)', fontWeight: 500, color: COLORS.text }
const grid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px 14px', minWidth: 0 }
const field: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }
const fieldLabel: CSSProperties = { ...metaLine, fontFamily: 'ui-monospace, monospace', fontSize: 'var(--text-nano-size)', letterSpacing: '.08em', textTransform: 'uppercase' }
const fieldValue: CSSProperties = { minWidth: 0, overflowWrap: 'anywhere', color: COLORS.text, fontSize: 'var(--text-small-size)', lineHeight: 1.5 }
const mono: CSSProperties = { fontFamily: 'ui-monospace, monospace', fontSize: 'var(--text-label-size)' }
const mutedValue: CSSProperties = { ...fieldValue, color: COLORS.faint }
const notice: CSSProperties = { margin: 0, color: COLORS.warn, fontSize: 'var(--text-label-size)', lineHeight: 1.5 }
const risk: CSSProperties = { margin: 0, color: COLORS.faint, fontSize: 'var(--text-label-size)', lineHeight: 1.5, paddingTop: 6, borderTop: `0.5px solid ${COLORS.border}` }

const MODE_KEY: Readonly<Record<'managed' | 'direct' | 'linked', LoomKey>> = {
  managed: 'workspace.managed',
  direct: 'workspace.direct',
  linked: 'workspace.linked',
}

function summarize(status: WorkspaceStatusResult): { readonly files: number; readonly repositories: number } {
  let files = 0
  for (const repository of status.repositories) files += repository.files.length
  return { files, repositories: status.repositories.length }
}

/** Aggregate the Host's unpushed counts while keeping "no upstream" distinct from "Host omitted it". */
function unpushedCommits(status: WorkspaceStatusResult): { readonly count: number; readonly noUpstream: boolean; readonly missing: boolean } {
  let count = 0
  let noUpstream = false
  let missing = false
  for (const repository of status.repositories) {
    if (repository.unpushedUnavailable === true) noUpstream = true
    else if (repository.unpushed === undefined) missing = true
    else count += repository.unpushed
  }
  return { count, noUpstream, missing }
}

/**
 * Render one version's workspaces with their real baseline, change and ownership facts.
 * @param props - workspace rows plus the optional Host status reader.
 * @returns the workspace list, or an explicit empty state.
 */
export function LoomWorkspaceList({ t, rows, loadStatus }: LoomWorkspaceListProps) {
  const [statuses, setStatuses] = useState<Readonly<Record<string, StatusState>>>({})
  const liveIds = rows.filter(row => row.workspace.cleaned !== true).map(row => row.workspace.id)
  const requestKey = liveIds.join('\n')
  useEffect(() => {
    if (loadStatus === undefined || requestKey === '') { setStatuses({}); return }
    let active = true
    const ids = requestKey.split('\n') as ReadonlyArray<string>
    setStatuses(Object.fromEntries(ids.map(id => [id, { kind: 'loading' } satisfies StatusState])))
    for (const id of ids) {
      loadStatus({ workspaceId: id }).then((result) => {
        if (!active) return
        setStatuses(current => ({
          ...current,
          [id]: result.ok ? { kind: 'ready', status: result.value } : { kind: 'failed', message: result.error.message },
        }))
      }, (error: unknown) => {
        if (!active) return
        setStatuses(current => ({ ...current, [id]: { kind: 'failed', message: error instanceof Error ? error.message : String(error) } }))
      })
    }
    return () => { active = false }
  }, [requestKey, loadStatus])

  return <section style={section} aria-label={t('version.workspaces')}>
    <div style={heading}>
      <h3 style={headingTitle}>{t('version.workspaces')}</h3>
      <span style={hint}>{t('version.workspacesHint')}</span>
    </div>
    {rows.length === 0
      ? <p style={empty}>{t('version.noWorkspaces')}</p>
      : rows.map((row) => {
          const workspace = row.workspace
          const cleaned = workspace.cleaned === true
          const label = workspaceName(workspace.rootPath ?? workspace.path) ?? workspace.path
          const state: StatusState = cleaned ? { kind: 'idle' } : statuses[workspace.id] ?? { kind: 'idle' }
          const summary = state.kind === 'ready' ? summarize(state.status) : undefined
          const unpushed = state.kind === 'ready' ? unpushedCommits(state.status) : undefined
          const branches = Object.entries(workspace.branches ?? {})
          // "Idle" means the Host has not answered yet; never present that as a clean tree.
          const uncommitted = state.kind === 'loading'
            ? t('workspace.readingStatus')
            : state.kind === 'idle'
              ? t('workspace.statusIdle')
              : state.kind === 'failed'
                ? `${t('workspace.statusFailed')}${state.message}`
                : summary !== undefined && summary.files > 0
                  ? t('workspace.changedFiles', { count: String(summary.files) })
                  : t('workspace.noChanges')
          const unpushedLine = unpushed === undefined
            ? t('workspace.unpushedUnknown')
            : unpushed.missing
              ? t('workspace.unpushedUnavailable')
              : unpushed.count > 0
                ? `${t('workspace.unpushedCount', { count: String(unpushed.count) })}${unpushed.noUpstream ? ` · ${t('workspace.unpushedNoUpstream')}` : ''}`
                : unpushed.noUpstream ? t('workspace.unpushedNoUpstream') : t('workspace.unpushedNone')
          const riskLine = cleaned
            ? t('workspace.cleanedNotice')
            : state.kind === 'idle' || state.kind === 'loading' || state.kind === 'failed'
              ? t('workspace.cleanRiskUnknown')
              : summary !== undefined && summary.files > 0
                ? t('workspace.cleanRiskHint')
                : unpushed !== undefined && unpushed.count > 0
                  ? t('workspace.cleanRiskUnpushed')
                  : unpushed !== undefined && unpushed.noUpstream
                    ? t('workspace.cleanRiskUnknown')
                    : t('workspace.cleanSafe')
          return <article key={workspace.id} style={card}>
            <div style={cardHead}>
              <h4 style={cardTitle} title={workspace.rootPath ?? workspace.path}>{label}</h4>
              <Tag tone={workspace.mode === 'direct' ? 'warning' : 'neutral'}>{t(MODE_KEY[workspace.mode ?? 'managed'])}</Tag>
              {cleaned && <Tag tone="quiet">{t('workspace.cleanedNotice')}</Tag>}
            </div>
            <div style={grid}>
              <div style={field}><span style={fieldLabel}>{t('ctx.workspaceRoot')}</span><span style={fieldValue}>{workspace.rootPath ?? workspace.path}</span></div>
              <div style={field}><span style={fieldLabel}>{t('workspace.lockBaseline')}</span>
                <span style={fieldValue}>{row.lock === undefined ? t('ctx.noLock') : <span style={mono}>{shortCommit(row.lock) ?? row.lock.id}</span>}</span>
              </div>
              <div style={field}><span style={fieldLabel}>{t('workspace.branchDrift')}</span>
                <span style={branches.length === 0 ? mutedValue : fieldValue}>{branches.length === 0
                  ? t('ctx.noBranch')
                  : branches.map(([sourceId, branch]) => <span key={sourceId} style={{ display: 'block', minWidth: 0 }}><span style={mono}>{sourceId}</span> · {branch}</span>)}</span>
              </div>
              <div style={field}><span style={fieldLabel}>{t('workspace.uncommitted')}</span>
                <span style={summary !== undefined && summary.files > 0 ? { ...fieldValue, color: COLORS.warn } : state.kind === 'failed' ? { ...fieldValue, color: COLORS.error } : mutedValue}>{uncommitted}</span>
              </div>
              <div style={field}><span style={fieldLabel}>{t('workspace.unpushed')}</span>
                <span style={unpushed !== undefined && unpushed.count > 0 ? { ...fieldValue, color: COLORS.warn } : mutedValue}>{unpushedLine}</span>
              </div>
              <div style={field}><span style={fieldLabel}>{t('execution.owner')}</span>
                <span style={row.ownerSessionId === undefined ? mutedValue : fieldValue}>{row.ownerSessionId === undefined ? t('workspace.ownerNone') : <span style={mono}>{row.ownerSessionId.slice(0, 12)}</span>}</span>
              </div>
              <div style={field}><span style={fieldLabel}>{t('workspace.tasks')}</span>
                <span style={row.tasks.length === 0 ? mutedValue : fieldValue}>{row.tasks.length === 0
                  ? t('workspace.tasksNone')
                  : [...new Set(row.tasks.map(link => link.task.title))].map(title => <span key={title} style={{ display: 'block' }}>{title}</span>)}</span>
              </div>
              <div style={field}><span style={fieldLabel}>{t('workspace.cleanup')}</span>
                <span style={mutedValue}>{row.waiting > 0 ? t('ctx.occupancyWaiting', { count: String(row.waiting) }) : row.takeover ? t('execution.stopping') : t('ctx.ready')}</span>
              </div>
            </div>
            {state.kind === 'failed' && <p role="alert" style={notice}>{t('workspace.statusFailed')}{state.message}</p>}
            <p style={risk}>{riskLine}</p>
          </article>
        })}
  </section>
}
