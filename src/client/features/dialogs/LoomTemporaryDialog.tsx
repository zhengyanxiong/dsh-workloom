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

const stack: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }
const intro: CSSProperties = { margin: 0, color: COLORS.dim, fontSize: 'var(--text-compact-size)', lineHeight: 1.65 }
const section: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, padding: '11px 12px', border: `0.5px solid ${COLORS.border}`, borderRadius: 8, background: COLORS.panel2 }
const sectionTitle: CSSProperties = { margin: 0, fontSize: 'var(--text-compact-size)', fontWeight: 500, color: COLORS.text }
const hint: CSSProperties = { margin: 0, color: COLORS.faint, fontSize: 'var(--text-small-size)', lineHeight: 1.55 }
const warning: CSSProperties = { margin: 0, display: 'flex', alignItems: 'flex-start', gap: 6, color: COLORS.dim, fontSize: 'var(--text-small-size)', lineHeight: 1.55 }
const list: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5, margin: 0, padding: 0, listStyle: 'none' }
const workspaceRow: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, width: '100%', minWidth: 0, padding: '8px 9px', textAlign: 'left', color: 'inherit', background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 7, cursor: 'pointer', font: 'inherit' }
const workspaceRowActive: CSSProperties = { borderColor: COLORS.accent, background: COLORS.selected }
const rowHead: CSSProperties = { display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', minWidth: 0 }
const mono: CSSProperties = { minWidth: 0, overflowWrap: 'anywhere', fontFamily: 'ui-monospace, monospace', fontSize: 'var(--text-label-size)', color: COLORS.dim }
const rowMeta: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0, color: COLORS.faint, fontSize: 'var(--text-label-size)', lineHeight: 1.5 }
const blocked: CSSProperties = { margin: 0, color: COLORS.warn, fontSize: 'var(--text-label-size)', lineHeight: 1.5, overflowWrap: 'anywhere' }
const alert: CSSProperties = { margin: 0, color: COLORS.error, fontSize: 'var(--text-small-size)', lineHeight: 1.6 }
const success: CSSProperties = { margin: 0, color: COLORS.green, fontSize: 'var(--text-small-size)', lineHeight: 1.6 }
const actionRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }

function projectName(snapshot: CatalogSnapshot | undefined, workspace: WorkspaceRecord): string | undefined {
  const version: VersionRecord | undefined = snapshot?.versions.find(candidate => candidate.id === workspace.versionId)
  return snapshot?.projects.find(candidate => candidate.id === version?.projectId)?.config.name
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

  return <Modal
    open={open}
    title={t('temporary.title')}
    closeLabel={t('form.close')}
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
        <h5 style={sectionTitle}>{t('temporary.independent')}</h5>
        <p style={hint}>{t('temporary.independentHint')}</p>
        <div style={actionRow}>
          <Button variant="primary" className="loom-primary" icon={<IconFolderOpenRegular />} disabled={busy !== undefined || picking} onClick={() => { void pickIndependent() }}>
            {picking ? t('temporary.picking') : busy === 'directory' ? t('temporary.creating') : t('temporary.pickDirectory')}
          </Button>
        </div>
      </section>

      <section style={section} aria-label={t('temporary.reuse')}>
        <h5 style={sectionTitle}>{t('temporary.reuse')}</h5>
        <p style={warning}><span aria-hidden style={{ flex: 'none', marginTop: 1, color: COLORS.warn }}><IconWarningTriangleOutlineRegular size={13} /></span><span>{t('temporary.workspaceWarning')}</span></p>
        {workspaces.length === 0
          ? <p style={hint}>{t('temporary.noWorkspaces')}</p>
          : <ul style={list} role="radiogroup" aria-label={t('temporary.pickWorkspace')}>
            {workspaces.map((workspace) => {
              const execution = snapshot?.executions.find(candidate => candidate.workspaceId === workspace.id)
              const owner = execution?.owner
              const waiting = execution?.waiting.length ?? 0
              const occupying = (snapshot?.tasks ?? []).filter(task => (task.status === 'running' || task.status === 'review')
                && task.attempts.some(attempt => attempt.workspaceId === workspace.id))
              const version = snapshot?.versions.find(candidate => candidate.id === workspace.versionId)
              const project = projectName(snapshot, workspace)
              const active = workspace.id === selectedWorkspace
              return <li key={workspace.id}>
                <button type="button" role="radio" aria-checked={active} style={active ? { ...workspaceRow, ...workspaceRowActive } : workspaceRow} onClick={() => { setSelectedWorkspace(workspace.id); setFailure(undefined); setNotice(undefined); setQueued(false) }}>
                  <span style={rowHead}>
                    <span style={{ ...mono, color: COLORS.text }}>{workspaceName(workspace.rootPath ?? workspace.path) ?? workspace.path}</span>
                    {project !== undefined && <Tag tone="neutral">{project}</Tag>}
                    {version !== undefined && <Tag tone="info">{version.name}</Tag>}
                  </span>
                  <span style={mono}>{workspace.rootPath ?? workspace.path}</span>
                  <span style={rowMeta}>
                    <span>{t('temporary.owner')}: {owner == null ? t('temporary.ownerNone') : owner.sessionId}</span>
                    {waiting > 0 && <span>{t('temporary.waitingCount').replace('{count}', String(waiting))}</span>}
                  </span>
                  <span style={blocked}>
                    {t('temporary.cleanupBlocked')}: {owner != null
                      ? t('temporary.cleanupBlockedOwner').replace('{session}', owner.sessionId)
                      : occupying.length === 0
                        ? t('temporary.cleanupReady')
                        : occupying.map(task => t('temporary.cleanupBlockedTask').replace('{title}', task.title).replace('{status}', task.status)).join(' ')}
                  </span>
                </button>
              </li>
            })}
          </ul>}
        <div style={actionRow}>
          <Button variant="outline" disabled={selected === undefined || busy !== undefined} onClick={() => { if (selected !== undefined) void createInWorkspace(selected) }}>
            {busy === 'workspace' ? t('temporary.creating') : t('temporary.createIn')}
          </Button>
        </div>
        <p style={hint}>{t('temporary.reuseHint')}</p>
      </section>
    </div>
  </Modal>
}
