/** Explicit workspace checkpoint confirmation. */
import type { CSSProperties, ReactNode } from 'react'
import type { WorkspaceRecord } from 'dsh-workloom/types'
import { COLORS } from '../../ui/tokens.ts'
import type { LoomKey } from '../../shared/locales.ts'

type Translate = (key: LoomKey, params?: Readonly<Record<string, string>>) => string

const backdrop: CSSProperties = { position: 'fixed', inset: 0, zIndex: 95, background: 'color-mix(in srgb, var(--color-ink) 50%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }
const panel: CSSProperties = { width: 520, maxWidth: 'calc(100vw - 32px)', boxSizing: 'border-box', background: 'var(--dsw-alias-bg-layer-1)', border: '0.5px solid var(--dsw-alias-border-l4)', borderRadius: 12, padding: 18, boxShadow: '0 24px 64px color-mix(in srgb, var(--color-ink) 50%, transparent)' }
const button: CSSProperties = { color: 'inherit', background: 'transparent', border: '0.5px solid var(--dsw-alias-border-l4)', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', font: 'inherit' }
const body: CSSProperties = { margin: '10px 0 0', color: 'var(--dsw-alias-label-secondary)', fontSize: 'var(--text-compact-size)', lineHeight: 1.6 }
const path: CSSProperties = { ...body, color: COLORS.dim, fontFamily: 'ui-monospace, monospace', overflowWrap: 'anywhere' }
const actions: CSSProperties = { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }

/** Inputs for the explicit checkpoint dialog. */
export interface LoomCheckpointDialogProps {
  readonly t: Translate
  readonly workspace: WorkspaceRecord
  readonly busy: boolean
  readonly failure?: string | undefined
  readonly onConfirm: () => void
  readonly onCancel: () => void
}

/**
 * Ask before committing the workspace.
 * @param props - workspace, pending state and confirmation intents.
 * @returns the checkpoint modal.
 */
export function LoomCheckpointDialog({ t, workspace, busy, failure, onConfirm, onCancel }: LoomCheckpointDialogProps): ReactNode {
  return <div style={backdrop} onClick={onCancel}>
    <div role="dialog" aria-modal="true" aria-label={t('workspace.checkpoint')} style={panel} onClick={event => { event.stopPropagation() }}>
      <strong style={{ fontSize: 'var(--text-h2-size)' }}>{t('workspace.checkpoint')}</strong>
      <p style={path}>{workspace.rootPath ?? workspace.path}</p>
      <p style={body}>{t('workspace.checkpointWarning')}</p>
      <p style={body}>{t('workspace.checkpointHint')}</p>
      {failure !== undefined && <p role="alert" style={{ ...body, color: COLORS.error }}>{failure}</p>}
      <div style={actions}>
        <button type="button" style={button} disabled={busy} onClick={onCancel}>{t('form.cancel')}</button>
        <button type="button" style={button} disabled={busy} onClick={onConfirm}>{busy ? t('form.submitPending') : t('workspace.checkpointConfirm')}</button>
      </div>
    </div>
  </div>
}
