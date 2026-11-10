/** Temporary-session creation: independent folder first, explicit workspace reuse with execution access. */
import { useState, type CSSProperties, type ReactNode } from 'react'
import { Button, IconFolderOpenRegular, IconWarningTriangleOutlineRegular, Modal, Tag } from '../../ui/primitives.ts'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { CatalogSnapshot, RegisterTemporarySessionRequest, TemporarySessionRecord, VersionRecord, WorkspaceRecord } from 'dsh-workloom/types'
import { COLORS } from '../../ui/tokens.ts'
import { failureReport, thrownFailureReport } from '../../ui/failure.ts'
import type { FailureReport } from '../../ui/failure.ts'
import type { LoomKey } from '../../shared/locales.ts'
import { workspaceName } from '../../shared/projection.ts'

type Translate = (key: LoomKey, params?: Readonly<Record<string, string>>) => string

/** Native Session actions the temporary dialog owns. */
export interface LoomTemporaryActions {
  pickDirectory(startPath?: string): Promise<string | null>
  createSessionInWorkspace(path: string, agentPreset?: string): Promise<SessionId>
  registerTemporarySession(request: RegisterTemporarySessionRequest): Promise<RemoteResult<TemporarySessionRecord>>
  onSession(sessionId: SessionId): void
  onChanged(): void
}

/** Inputs for the temporary-session dialog. */
export interface LoomTemporaryDialogProps {
  readonly t: Translate
  readonly open: boolean
  readonly snapshot: CatalogSnapshot | undefined
  readonly actions: LoomTemporaryActions
  readonly onClose: () => void
}

const stack: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }
const intro: CSSProperties = { margin: 0, color: COLORS.dim, fontSize: 'var(--text-compact-size)', lineHeight: 1.6 }
const section: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 7, minWidth: 0, padding: '10px 11px', border: `0.5px solid ${COLORS.border}`, borderRadius: 8, background: COLORS.panel2 }
const sectionHead: CSSProperties = { display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, flexWrap: 'wrap' }
const sectionTitle: CSSProperties = { margin: 0, fontSize: 'var(--text-compact-size)', fontWeight: 500, color: COLORS.text }
const hint: CSSProperties = { margin: 0, color: COLORS.faint, fontSize: 'var(--text-small-size)', lineHeight: 1.55 }
const warning: CSSProperties = { margin: 0, display: 'flex', alignItems: 'flex-start', gap: 6, color: COLORS.dim, fontSize: 'var(--text-label-size)', lineHeight: 1.55 }
const list: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, margin: 0, padding: '1px 2px 1px 0', listStyle: 'none', maxHeight: 236, overflowY: 'auto' }
const workspaceRow: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, width: '100%', minWidth: 0, padding: '6px 8px', textAlign: 'left', color: 'inherit', background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 6, cursor: 'pointer', font: 'inherit' }
const workspaceRowActive: CSSProperties = { borderColor: COLORS.accent, background: COLORS.selected }
const rowHead: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flexWrap: 'wrap' }
const rowName: CSSProperties = { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'ui-monospace, monospace', fontSize: 'var(--text-label-size)', color: COLORS.text }
const rowPath: CSSProperties = { ...hint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 'var(--text-label-size)' }
const rowBadges: CSSProperties = { display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', minWidth: 0 }
const selectedDetail: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, padding: '6px 8px', border: `0.5px solid ${COLORS.border}`, borderRadius: 6, background: COLORS.panel, minWidth: 0 }
const mono: CSSProperties = { minWidth: 0, overflowWrap: 'anywhere', fontFamily: 'ui-monospace, monospace', fontSize: 'var(--text-label-size)', color: COLORS.dim }
const blocked: CSSProperties = { margin: 0, color: COLORS.warn, fontSize: 'var(--text-label-size)', lineHeight: 1.5, overflowWrap: 'anywhere' }
const alert: CSSProperties = { margin: 0, color: COLORS.error, fontSize: 'var(--text-small-size)', lineHeight: 1.6 }
const success: CSSProperties = { margin: 0, color: COLORS.green, fontSize: 'var(--text-small-size)', lineHeight: 1.6 }
const actionRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }

function projectName(snapshot: CatalogSnapshot | undefined, workspace: WorkspaceRecord): string | undefined {
  const version: VersionRecord | undefined = snapshot?.versions.find(candidate => candidate.id === workspace.versionId)
  return snapshot?.projects.find(candidate => candidate.id === version?.projectId)?.config.name
}

/** Short, stable Session identity for compact chips; the full id stays in the detail line. */
function shortSession(sessionId: string): string {
  return sessionId.length > 12 ? sessionId.slice(0, 12) : sessionId
}

/**
 * Create a temporary Session either in an independent folder or, only after an
 * explicit choice, in a Loom workspace whose execution access it acquires or queues for.
 * The dialog never falls back to the latest task workspace on its own.
 * @param props - open state, catalog snapshot and native Session actions.
 * @returns the modal while it is open.
 */
export function LoomTemporaryDialog({ t, open, snapshot, actions, onClose }: LoomTemporaryDialogProps): ReactNode {
  const [busy, setBusy] = useState<'directory' | 'workspace' | undefined>(undefined)
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>()
  const [failure, setFailure] = useState<{ readonly operation: string; readonly report: FailureReport }>()
  const [notice, setNotice] = useState<string>()
  const [queued, setQueued] = useState(false)
  const [picking, setPicking] = useState(false)
  const workspaces = (snapshot?.workspaces ?? []).filter(workspace => workspace.cleaned !== true)

  async function pickIndependent(): Promise<void> {
    setFailure(undefined); setNotice(undefined); setQueued(false); setPicking(true)
    try {
      const picked = await actions.pickDirectory()
      if (picked === null) { setNotice(t('temporary.noDirectory')); return }
      setBusy('directory')
      const sessionId = await actions.createSessionInWorkspace(picked)
      actions.onSession(sessionId)
      actions.onChanged()
      setNotice(t('temporary.created'))
    } catch (error) {
      setFailure({ operation: t('op.createSession'), report: thrownFailureReport(error) })
    } finally {
      setPicking(false); setBusy(undefined)
    }
  }

  async function createInWorkspace(workspace: WorkspaceRecord): Promise<void> {
    const version = snapshot?.versions.find(candidate => candidate.id === workspace.versionId)
    const agentPreset = snapshot?.projects.find(candidate => candidate.id === version?.projectId)?.config.agentPreset
    setFailure(undefined); setNotice(undefined); setQueued(false); setBusy('workspace')
    try {
      const sessionId = await actions.createSessionInWorkspace(workspace.path, agentPreset)
      const registered = await actions.registerTemporarySession({ sessionId, workspacePath: workspace.path })
      if (!registered.ok) {
        setFailure({ operation: t('op.openTemporary'), report: failureReport(registered.error.code, registered.error.message) })
        return
      }
      const execution = snapshot?.executions.find(candidate => candidate.workspaceId === workspace.id)
      const queuedNow = execution !== undefined && execution.owner !== null && execution.owner.sessionId !== sessionId
      setQueued(queuedNow)
      actions.onSession(sessionId)
      actions.onChanged()
      setNotice(queuedNow ? t('temporary.queued') : t('temporary.created'))
    } catch (error) {
      setFailure({ operation: t('op.openTemporary'), report: thrownFailureReport(error) })
    } finally {
      setBusy(undefined)
    }
  }

  const selected = workspaces.find(candidate => candidate.id === selectedWorkspace)
  const execution = selected === undefined ? undefined : snapshot?.executions.find(candidate => candidate.workspaceId === selected.id)
  const owner = execution?.owner
  const waiting = execution?.waiting.length ?? 0
  const occupying = selected === undefined ? [] : (snapshot?.tasks ?? []).filter(task => (task.status === 'running' || task.status === 'review')
    && task.attempts.some(attempt => attempt.workspaceId === selected.id))

  return <Modal
    open={open}
    title={t('temporary.title')}
    closeLabel={t('form.close')}
    className="loom-temp-modal"
    onClose={() => { if (busy === undefined) onClose() }}
    footer={<>
      <Button variant="ghost" disabled={busy !== undefined} data-modal-autofocus onClick={onClose}>{t('form.close')}</Button>
    </>}
  >
    <div style={stack}>
      <p style={intro}>{t('temporary.intro')}</p>
      {notice !== undefined && <p role="status" style={queued ? hint : success}>{notice}</p>}
      {failure !== undefined && <p role="alert" style={alert}>{failure.operation} · {t(failure.report.message)}{failure.report.detail === undefined ? '' : ` · ${failure.report.detail}`}</p>}

      <section style={section} aria-label={t('temporary.independent')}>
        <div style={sectionHead}>
          <h5 style={sectionTitle}>{t('temporary.independent')}</h5>
          <Tag tone="success">{t('temporary.recommended')}</Tag>
        </div>
        <p style={hint}>{t('temporary.independentHint')}</p>
        <div style={actionRow}>
          <Button variant="primary" className="loom-primary" icon={<IconFolderOpenRegular />} disabled={busy !== undefined || picking} onClick={() => { void pickIndependent() }}>
            {picking ? t('temporary.picking') : busy === 'directory' ? t('temporary.creating') : t('temporary.pickDirectory')}
          </Button>
        </div>
      </section>

      <section style={section} aria-label={t('temporary.reuse')}>
        <div style={sectionHead}>
          <h5 style={sectionTitle}>{t('temporary.reuse')}</h5>
          {workspaces.length > 0 && <Tag tone="neutral">{t('temporary.workspaceCount').replace('{count}', String(workspaces.length))}</Tag>}
        </div>
        <p style={warning}><span aria-hidden style={{ flex: 'none', marginTop: 1, color: COLORS.warn }}><IconWarningTriangleOutlineRegular size={13} /></span><span>{t('temporary.workspaceWarning')}</span></p>
        {workspaces.length === 0
          ? <p style={hint}>{t('temporary.noWorkspaces')}</p>
          : <ul style={list} role="radiogroup" aria-label={t('temporary.pickWorkspace')}>
            {workspaces.map((workspace) => {
              const candidateExecution = snapshot?.executions.find(candidate => candidate.workspaceId === workspace.id)
              const candidateOwner = candidateExecution?.owner
              const candidateWaiting = candidateExecution?.waiting.length ?? 0
              const candidateOccupying = (snapshot?.tasks ?? []).filter(task => (task.status === 'running' || task.status === 'review')
                && task.attempts.some(attempt => attempt.workspaceId === workspace.id))
              const candidateVersion = snapshot?.versions.find(candidate => candidate.id === workspace.versionId)
              const candidateProject = projectName(snapshot, workspace)
              const active = workspace.id === selectedWorkspace
              const root = workspace.rootPath ?? workspace.path
              const blockedDetail = candidateOwner != null
                ? t('temporary.cleanupBlockedOwner').replace('{session}', candidateOwner.sessionId)
                : candidateOccupying.length === 0
                  ? t('temporary.cleanupReady')
                  : candidateOccupying.map(task => t('temporary.cleanupBlockedTask').replace('{title}', task.title).replace('{status}', task.status)).join(' ')
              return <li key={workspace.id}>
                <button type="button" role="radio" aria-checked={active} style={active ? { ...workspaceRow, ...workspaceRowActive } : workspaceRow} onClick={() => { setSelectedWorkspace(workspace.id); setFailure(undefined); setNotice(undefined); setQueued(false) }}>
                  <span style={rowHead}>
                    <span style={rowName} title={workspaceName(root) ?? root}>{workspaceName(root) ?? root}</span>
                    {candidateProject !== undefined && <Tag tone="quiet">{candidateProject}</Tag>}
                    {candidateVersion !== undefined && <Tag tone="info">{candidateVersion.name}</Tag>}
                    <span style={{ flex: 1 }} />
                    {candidateOwner != null
                      ? <Tag tone="warning">{t('temporary.ownerBadge').replace('{session}', shortSession(candidateOwner.sessionId))}</Tag>
                      : <Tag tone="success">{t('temporary.freeBadge')}</Tag>}
                    {candidateWaiting > 0 && <Tag tone="warning">{t('temporary.waitingBadge').replace('{count}', String(candidateWaiting))}</Tag>}
                  </span>
                  <span style={rowPath} title={root}>{root}</span>
                  {blockedDetail !== t('temporary.cleanupReady') && <span style={rowBadges} title={blockedDetail}><Tag tone="warning">{t('temporary.blockedBadge')}</Tag></span>}
                </button>
              </li>
            })}
          </ul>}
        {selected !== undefined && <div style={selectedDetail}>
          <span style={mono}>{owner == null ? `${t('temporary.owner')}: ${t('temporary.ownerNone')}` : `${t('temporary.owner')}: ${owner.sessionId}`}{waiting > 0 ? ` · ${t('temporary.waitingCount').replace('{count}', String(waiting))}` : ''}</span>
          <p style={blocked}>{t('temporary.cleanupBlocked')}: {owner != null
            ? t('temporary.cleanupBlockedOwner').replace('{session}', owner.sessionId)
            : occupying.length === 0
              ? t('temporary.cleanupReady')
              : occupying.map(task => t('temporary.cleanupBlockedTask').replace('{title}', task.title).replace('{status}', task.status)).join(' ')}</p>
        </div>}
        <div style={actionRow}>
          <Button variant="primary" className="loom-primary" disabled={selected === undefined || busy !== undefined} onClick={() => { if (selected !== undefined) void createInWorkspace(selected) }}>
            {busy === 'workspace' ? t('temporary.creating') : t('temporary.createIn')}
          </Button>
          <span style={hint}>{t('temporary.reuseHint')}</span>
        </div>
      </section>
    </div>
  </Modal>
}
