/** Modal confirmation for stopping the current workspace owner and taking execution over. */
import { LOOM_PORTAL_CLASS } from '../../theme/LoomTheme.tsx'
import type { CSSProperties, ReactNode } from 'react'
import { Button, IconWarningTriangleOutlineRegular, Modal } from '../../ui/primitives.ts'
import type { ExecutionState, TaskOutcome, TaskRecord, WorkspaceRecord } from 'dsh-workloom/types'
import { COLORS } from '../../ui/tokens.ts'
import { formatTimestamp } from '../../shared/format.ts'
import { metaLine } from '../../ui/styles.ts'
import type { LoomKey } from '../../shared/locales.ts'

type Translate = (key: LoomKey) => string

const dangerAction = { color: COLORS.error, borderColor: COLORS.error } as const
const body = { display: 'flex', alignItems: 'flex-start', gap: 10 } as const
const warning = { margin: 0, color: COLORS.dim, fontSize: 'var(--text-compact-size)', lineHeight: 1.65 } as const
const alert = { margin: '12px 0 0', color: COLORS.error, fontSize: 'var(--text-compact-size)', lineHeight: 1.6 } as const
const section: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, marginTop: 12, padding: '10px 11px', border: `0.5px solid ${COLORS.border}`, borderRadius: 8, background: COLORS.panel2 }
const sectionTitle: CSSProperties = { margin: 0, ...metaLine, fontFamily: 'ui-monospace, monospace', fontSize: 'var(--text-nano-size)', letterSpacing: '.08em', textTransform: 'uppercase' }
const handoffNote: CSSProperties = { margin: 0, color: COLORS.warn, fontSize: 'var(--text-small-size)', lineHeight: 1.55 }
const grid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '6px 12px', minWidth: 0 }
const field: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }
const fieldLabel: CSSProperties = { ...metaLine, fontFamily: 'ui-monospace, monospace', fontSize: 'var(--text-nano-size)', letterSpacing: '.08em', textTransform: 'uppercase' }
const fieldValue: CSSProperties = { minWidth: 0, overflowWrap: 'anywhere', color: COLORS.text, fontSize: 'var(--text-small-size)', lineHeight: 1.5 }
const mono: CSSProperties = { ...fieldValue, fontFamily: 'ui-monospace, monospace', fontSize: 'var(--text-label-size)' }
const list: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, margin: 0, padding: 0, listStyle: 'none' }
const listItem: CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 6, minWidth: 0, color: COLORS.dim, fontSize: 'var(--text-small-size)', lineHeight: 1.5 }
const summaryText: CSSProperties = { margin: 0, color: COLORS.dim, fontSize: 'var(--text-small-size)', lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }
const muted: CSSProperties = { margin: 0, color: COLORS.faint, fontSize: 'var(--text-small-size)', lineHeight: 1.55 }

/** Inputs for the execution takeover confirmation modal. */
export interface LoomTakeoverDialogProps {
  readonly t: Translate
  readonly open: boolean
  readonly busy: boolean
  readonly failed: boolean
  /** Task whose previous round is being handed over. */
  readonly task?: TaskRecord | undefined
  /** Workspace whose execution access is being taken. */
  readonly workspace?: WorkspaceRecord | undefined
  /** Persisted execution state at request time, including the current owner. */
  readonly execution?: ExecutionState | undefined
  readonly onCancel: () => void
  readonly onConfirm: () => void
}

function EvidenceList({ label, items }: { label: string; items: readonly string[] | undefined }): ReactNode {
  return <div style={field}>
    <span style={fieldLabel}>{label}</span>
    {items === undefined || items.length === 0
      ? <span style={muted}>—</span>
      : <ul style={list}>{items.map((item, index) => <li key={`${String(index)}:${item}`} style={listItem}><span aria-hidden style={{ flex: 'none', color: COLORS.faint, fontFamily: 'ui-monospace, monospace' }}>{String(index + 1).padStart(2, '0')}</span><span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{item}</span></li>)}</ul>}
  </div>
}

function outcomeOf(task: TaskRecord | undefined): TaskOutcome | undefined {
  return task?.outcome
}

/**
 * Confirm stopping the current Agent turn before acquiring its workspace, with the
 * previous round's summary visible as reference evidence rather than completion proof.
 * @param props - visibility, progress, the previous round context and the confirmed-stop command.
 * @returns the modal while takeover confirmation is open.
 */
export function LoomTakeoverDialog({ t, open, busy, failed, task, workspace, execution, onCancel, onConfirm }: LoomTakeoverDialogProps) {
  const outcome = outcomeOf(task)
  const lock = task?.attempts.at(-1)?.lock
  const owner = execution?.owner
  return <Modal
    open={open}
    title={t('execution.takeover')}
    closeLabel={t('form.close')}
    className={`${LOOM_PORTAL_CLASS} loom-modal-takeover`}
    onClose={() => { if (!busy) onCancel() }}
    footer={<>
      <Button variant="ghost" disabled={busy} data-modal-autofocus onClick={onCancel}>{t('form.cancel')}</Button>
      <Button variant="outline" disabled={busy} style={dangerAction} onClick={onConfirm}>{busy ? t('execution.stopping') : t('form.confirm')}</Button>
    </>}
  >
    <div style={body}>
      <span style={{ flex: 'none', marginTop: 1, color: COLORS.error }}><IconWarningTriangleOutlineRegular size={16} /></span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={warning}>{t('execution.takeoverWarning')}</p>
        <p style={{ ...warning, marginTop: 6 }}>{t('takeover.referenceOnly')}</p>
        {failed && <p role="alert" style={alert}>{t('state.error')}</p>}
      </div>
    </div>

    <section style={section} aria-label={t('takeover.summary')}>
      <h5 style={sectionTitle}>{t('takeover.summary')}</h5>
      <p style={handoffNote}>{t('takeover.referenceOnly')}</p>
      {outcome === undefined
        ? <p role="status" style={muted}>{t('takeover.noSummary')}</p>
        : <>
          <p style={summaryText}>{outcome.agentSummary ?? t('takeover.none')}</p>
          <div style={grid}>
            <EvidenceList label={t('takeover.notDone')} items={outcome.notDone} />
            <EvidenceList label={t('takeover.risks')} items={outcome.risks} />
          </div>
          <div style={grid}>
            <div style={field}><span style={fieldLabel}>{t('takeover.summaryFrom')}</span><span style={fieldValue}>{outcome.suggestedBy ?? '—'}</span></div>
            <div style={field}><span style={fieldLabel}>{t('outcome.suggestedAt')}</span><span style={mono}>{formatTimestamp(outcome.at) ?? '—'}</span></div>
            {outcome.state !== undefined && <div style={field}><span style={fieldLabel}>{t('outcome.title')}</span><span style={fieldValue}>{t(outcome.state === 'suggested' ? 'outcome.state.suggested' : outcome.state === 'accepted' ? 'outcome.state.accepted' : 'outcome.state.rejected')}</span></div>}
          </div>
        </>}
    </section>

    <section style={section} aria-label={t('takeover.lock')}>
      <h5 style={sectionTitle}>{t('takeover.lock')}</h5>
      {lock === undefined
        ? <p style={muted}>{t('takeover.noLock')}</p>
        : <div style={grid}>
          <div style={field}><span style={fieldLabel}>{t('lock.id')}</span><span style={mono}>{lock.id}</span></div>
          <div style={field}><span style={fieldLabel}>{t('lock.createdAt')}</span><span style={mono}>{formatTimestamp(lock.createdAt) ?? '—'}</span></div>
          {lock.repositories.map(repository => <div key={repository.sourceId} style={field}><span style={fieldLabel}>{repository.sourceId}</span><span style={mono}>{repository.commit.slice(0, 12)}</span></div>)}
        </div>}
      {workspace !== undefined && <div style={field}><span style={fieldLabel}>{t('takeover.workspace')}</span><span style={mono}>{workspace.rootPath ?? workspace.path}</span></div>}
      <div style={field}><span style={fieldLabel}>{t('takeover.owner')}</span><span style={mono}>{owner == null ? t("takeover.ownerNone") : owner.sessionId}</span></div>
      <p style={muted}>{t('takeover.confirmNote')}</p>
    </section>
  </Modal>
}
