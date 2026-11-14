/** Explicit workspace checkpoint confirmation. */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
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

/** One changed file offered to the checkpoint selection. */
export interface LoomCheckpointFile {
  readonly sourceId: string
  readonly path: string
}

/** Inputs for the explicit checkpoint dialog. */
export interface LoomCheckpointDialogProps {
  readonly t: Translate
  readonly workspace: WorkspaceRecord
  readonly files: readonly LoomCheckpointFile[]
  readonly loading: boolean
  readonly busy: boolean
  readonly failure?: string | undefined
  readonly onConfirm: (paths: Readonly<Record<string, readonly string[]>>) => void
  readonly onCancel: () => void
}

/**
 * Ask before committing the workspace.
 * @param props - workspace, pending state and confirmation intents.
 * @returns the checkpoint modal.
 */
export function LoomCheckpointDialog({ t, workspace, files, loading, busy, failure, onConfirm, onCancel }: LoomCheckpointDialogProps): ReactNode {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  useEffect(() => { setSelected(new Set(files.map(file => `${file.sourceId}\u0000${file.path}`))) }, [files])
  const toggle = (key: string): void => {
    setSelected(current => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next })
  }
  const confirm = (): void => {
    const paths: Record<string, string[]> = {}
    for (const file of files) {
      if (!selected.has(`${file.sourceId}\u0000${file.path}`)) continue
      ;(paths[file.sourceId] ??= []).push(file.path)
    }
    onConfirm(paths)
  }
  return <div style={backdrop} onClick={onCancel}>
    <div role="dialog" aria-modal="true" aria-label={t('workspace.checkpoint')} style={panel} onClick={event => { event.stopPropagation() }}>
      <strong style={{ fontSize: 'var(--text-h2-size)' }}>{t('workspace.checkpoint')}</strong>
      <p style={path}>{workspace.rootPath ?? workspace.path}</p>
      <p style={body}>{t('workspace.checkpointWarning')}</p>
      <p style={body}>{t('workspace.checkpointHint')}</p>
      {loading ? <p style={body}>{t('form.submitPending')}</p> : files.length === 0 ? <p style={body}>{t('workspace.checkpointNoChanges')}</p> : <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 240, overflow: 'auto', marginTop: 8 }}>{files.map(file => { const key = `${file.sourceId}\u0000${file.path}`; return <label key={key} style={{ display: 'flex', gap: 7, alignItems: 'baseline', fontFamily: 'ui-monospace, monospace', fontSize: 'var(--text-label-size)' }}><input type="checkbox" checked={selected.has(key)} onChange={() => toggle(key)} /><span style={{ overflowWrap: 'anywhere' }}>{file.sourceId} · {file.path}</span></label> })}</div>}
      {failure !== undefined && <p role="alert" style={{ ...body, color: COLORS.error }}>{failure}</p>}
      <div style={actions}>
        <button type="button" style={button} disabled={busy} onClick={onCancel}>{t('form.cancel')}</button>
        <button type="button" style={button} disabled={busy || loading || files.length === 0} onClick={confirm}>{busy ? t('form.submitPending') : t('workspace.checkpointConfirm')}</button>
      </div>
    </div>
  </div>
}
