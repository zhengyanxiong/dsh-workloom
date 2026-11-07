/** Modal cleanup confirmation with native workspace Diff and per-repository cleanup results. */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { IconFullscreenOutlineRegular, Tag } from '../../ui/primitives.ts'
import type { WorkspaceRecord } from 'dsh-workloom/types'
import { LoomDiff, type LoadWorkspaceChanges } from '../preview/LoomDiff.tsx'
import { COLORS } from '../../ui/tokens.ts'
import { failureKey } from '../../ui/failure.ts'
import { metaLine } from '../../ui/styles.ts'
import type { LoomKey } from '../../shared/locales.ts'

type Translate = (key: LoomKey, params?: Readonly<Record<string, string>>) => string

const backdrop: CSSProperties = { position: 'fixed', inset: 0, zIndex: 95, background: 'color-mix(in srgb, var(--color-ink) 50%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }
const panel: CSSProperties = { width: 880, maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 48px)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxSizing: 'border-box', background: 'var(--dsw-alias-bg-layer-1)', border: '0.5px solid var(--dsw-alias-border-l4)', borderRadius: 12, padding: 18, boxShadow: '0 24px 64px color-mix(in srgb, var(--color-ink) 50%, transparent)' }
const button: CSSProperties = { color: 'inherit', background: 'transparent', border: '0.5px solid var(--dsw-alias-border-l4)', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', font: 'inherit' }
const alert: CSSProperties = { margin: 0, color: 'var(--dsw-alias-label-secondary)', fontSize: 'var(--text-compact-size)', lineHeight: 1.6 }
const diffBox: CSSProperties = { marginTop: 12, display: 'flex', flexDirection: 'column', minHeight: 0, border: '0.5px solid var(--dsw-alias-border-l4)', borderRadius: 8, overflow: 'hidden', background: 'var(--dsw-alias-bg-layer-2)' }
const section: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, marginTop: 10, padding: '10px 11px', border: `0.5px solid ${COLORS.border}`, borderRadius: 8, background: COLORS.panel2 }
const sectionTitle: CSSProperties = { margin: 0, ...metaLine, fontFamily: 'ui-monospace, monospace', fontSize: 'var(--text-nano-size)', letterSpacing: '.08em', textTransform: 'uppercase' }
const list: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, margin: 0, padding: 0, listStyle: 'none' }
const row: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, padding: '6px 8px', borderRadius: 6, background: COLORS.panel, border: `0.5px solid ${COLORS.border}` }
const rowHead: CSSProperties = { display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', minWidth: 0 }
const mono: CSSProperties = { minWidth: 0, overflowWrap: 'anywhere', fontFamily: 'ui-monospace, monospace', fontSize: 'var(--text-label-size)', color: COLORS.dim }
const diagnostic: CSSProperties = { margin: 0, color: COLORS.error, fontFamily: 'ui-monospace, monospace', fontSize: 'var(--text-label-size)', lineHeight: 1.5, overflowWrap: 'anywhere' }
const residual: CSSProperties = { margin: 0, color: COLORS.warn, fontFamily: 'ui-monospace, monospace', fontSize: 'var(--text-label-size)', lineHeight: 1.5, overflowWrap: 'anywhere' }
const partialNote: CSSProperties = { margin: 0, color: COLORS.warn, fontSize: 'var(--text-small-size)', lineHeight: 1.6 }
const muted: CSSProperties = { margin: 0, color: COLORS.faint, fontSize: 'var(--text-small-size)', lineHeight: 1.55 }

/** Remote failure the dialog explains; the code drives localized copy, the message keeps Host detail. */
export interface LoomCleanupFailure {
  readonly code: string
  readonly message: string
}

/** Inputs for the cleanup confirmation modal. */
export interface LoomCleanupDialogProps {
  readonly t: Translate
  readonly workspace: WorkspaceRecord
  readonly busy: boolean
  readonly failure: LoomCleanupFailure | undefined
  readonly discardAllowed: boolean
  readonly loadChanges: LoadWorkspaceChanges
  /** Whether comparisons wrap wide lines instead of scrolling sideways. */
  readonly wrap: boolean
  readonly onToggleWrap: () => void
  readonly onConfirm: () => void
  readonly onDiscard: () => void
  readonly onCancel: () => void
}

const STATUS_KEY = {
  waiting: 'cleanup.repoStatus.waiting',
  removed: 'cleanup.repoStatus.removed',
  kept: 'cleanup.repoStatus.kept',
  failed: 'cleanup.repoStatus.failed',
} as const

/**
 * Confirm workspace cleanup and let the user inspect real working-tree changes first.
 * Once cleanup started, every repository's real status is listed so a partial failure
 * is never reported as a completed cleanup.
 * @param props - workspace, cleanup outcome and native Diff wiring.
 * @returns the modal.
 */
export function LoomCleanupDialog({ t, workspace, busy, failure, discardAllowed, loadChanges, wrap, onToggleWrap, onConfirm, onDiscard, onCancel }: LoomCleanupDialogProps): ReactNode {
  const [showDiff, setShowDiff] = useState(false)
  const [maximized, setMaximized] = useState(false)
  const failureLabel = failure === undefined ? undefined : failureKey(failure.code)
  const cleanup = workspace.cleanup
  const partial = cleanup?.status === 'partial'
  useEffect(() => {
    if (failure !== undefined && failureKey(failure.code) === 'error.workspaceChanges') setShowDiff(true)
  }, [failure])
  return <div style={backdrop} onClick={onCancel}>
    <div role="dialog" aria-modal="true" aria-label={t('workspace.cleanup')} style={maximized ? { ...panel, width: 'calc(100vw - 24px)', height: 'calc(100vh - 24px)', maxHeight: 'none' } : panel} onClick={(event) => { event.stopPropagation() }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10, flexShrink: 0 }}>
        <div style={{ minWidth: 0 }}>
          <strong style={{ fontSize: 'var(--text-h2-size)' }}>{t('workspace.cleanup')}</strong>
          <p style={{ ...alert, marginTop: 4, overflowWrap: 'anywhere', fontFamily: 'ui-monospace, monospace', fontSize: 'var(--text-small-size)' }}>{workspace.rootPath ?? workspace.path}</p>
        </div>
        <button type="button" aria-pressed={maximized} style={{ ...button, marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => setMaximized(value => !value)}>
          <IconFullscreenOutlineRegular size={13} />{maximized ? t('workspace.cleanupRestore') : t('workspace.cleanupMaximize')}
        </button>
        <button type="button" style={button} onClick={onCancel}>{t('form.close')}</button>
      </div>
      <div style={{ minHeight: 0, overflowY: 'auto', flexShrink: 0 }}>
      <p style={alert}>{t(workspace.mode === 'direct' ? 'workspace.cleanupDirectWarning' : workspace.mode === 'linked' ? 'workspace.cleanupLinkedWarning' : 'workspace.cleanupWarning')}</p>
      {failure !== undefined && <div role="alert" style={{ ...section, borderColor: COLORS.error }}>
        <h5 style={sectionTitle}>{t('cleanup.blocked')}</h5>
        <p style={{ ...diagnostic, color: COLORS.error }}>{failureLabel === undefined ? failure.message : t(failureLabel)}</p>
        {failureLabel !== undefined && failure.message !== '' && <p style={mono}>{failure.message}</p>}
        <p style={muted}>{t('cleanup.blockedHint')}</p>
      </div>}
      {discardAllowed && <p role="alert" style={{ ...alert, marginTop: 8 }}>{t('workspace.cleanupDiscardHint')}</p>}
      {cleanup !== undefined && cleanup.repositories.length > 0 && <section style={section} aria-label={t('cleanup.progressTitle')} role="status" aria-busy={busy}>
        <h5 style={sectionTitle}>{t('cleanup.progressTitle')}</h5>
        {partial
          ? <><p style={partialNote}>{t('cleanup.partial')}</p><p style={muted}>{t('cleanup.partialHint')}</p></>
          : cleanup.status === 'cleaned' ? <p style={{ ...partialNote, color: COLORS.green }}>{t('cleanup.allRemoved')}</p>
            : <p style={muted}>{busy ? t('cleanup.retrying') : t('cleanup.progressTitle')}</p>}
        <ul style={list}>{cleanup.repositories.map(entry => <li key={entry.sourceId} style={row}>
          <span style={rowHead}>
            <span style={{ ...mono, color: COLORS.text }}>{entry.sourceId}</span>
            <Tag tone={entry.status === 'removed' ? 'success' : entry.status === 'failed' ? 'danger' : entry.status === 'kept' ? 'neutral' : 'quiet'}>{t(STATUS_KEY[entry.status])}</Tag>
            {entry.path !== undefined && <span style={{ ...mono, marginLeft: 'auto' }}>{entry.path}</span>}
          </span>
          {entry.error !== undefined && <p style={diagnostic}>{t('cleanup.error')}: {entry.error}</p>}
          {entry.residual !== undefined && <p style={residual}>{t('cleanup.residual')}: {entry.residual}</p>}
        </li>)}</ul>
        {cleanup.residual !== undefined && cleanup.residual.length > 0 && <p style={residual}>{t('cleanup.residual')}: {cleanup.residual.join(', ')}</p>}
        {cleanup.error !== undefined && <p style={mono}>{cleanup.error}</p>}
      </section>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
        <button type="button" style={button} disabled={busy} onClick={() => setShowDiff(value => !value)}>{showDiff ? t('workspace.cleanupHideChanges') : t('workspace.cleanupViewChanges')}</button>
        <span style={{ flex: 1 }} />
        {discardAllowed
          ? <button type="button" style={button} disabled={busy} onClick={onDiscard}>{t('workspace.cleanupDiscard')}</button>
          : <button type="button" style={button} disabled={busy} onClick={onConfirm}>{busy ? t('cleanup.retrying') : partial ? t('cleanup.retry') : t('workspace.cleanupConfirm')}</button>}
        <button type="button" style={button} disabled={busy} onClick={onCancel}>{t('form.cancel')}</button>
      </div>
      </div>
      {showDiff && <div style={{ ...diffBox, ...(maximized ? { flex: 1 } : { height: 420 }) }}><LoomDiff t={key => t(key)} workspaceId={workspace.id} loadChanges={loadChanges} wrap={wrap} onToggleWrap={onToggleWrap} /></div>}
    </div>
  </div>
}
