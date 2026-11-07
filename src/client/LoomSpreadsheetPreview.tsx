/** Read-only XLSX table preview rendered from the real workbook bytes. */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { Button, FileTypeIcon } from '@deepseek-ai/dsh-client-ui-primitives'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { WorkspaceFileBytes } from '@deepseek-ai/dsh-api-workspace-files/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { readSpreadsheet, type SpreadsheetWorkbook } from './xlsx.ts'
import { COLORS } from './shell.ts'
import type { LoomKey } from './locales.ts'

type Translate = (key: LoomKey) => string

/** Inputs for one workbook preview. */
export interface LoomSpreadsheetPreviewProps {
  readonly t: Translate
  readonly sessionId: SessionId
  readonly filePath: string
  readonly readBytes: (sessionId: SessionId, path: string, signal: AbortSignal) => Promise<RemoteResult<WorkspaceFileBytes>>
  readonly onOpenPath?: (() => void) | undefined
}

type State =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | { readonly kind: 'ready'; readonly workbook: SpreadsheetWorkbook }

const wrap: CSSProperties = { display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }
const tabs: CSSProperties = { display: 'flex', gap: 4, padding: '6px 10px', borderBottom: `0.5px solid ${COLORS.border}`, overflowX: 'auto', flex: 'none' }
const tab = (active: boolean): CSSProperties => ({ border: 'none', borderBottom: `1.5px solid ${active ? COLORS.accent : 'transparent'}`, background: 'transparent', color: active ? COLORS.text : COLORS.dim, padding: '3px 7px', cursor: 'pointer', font: 'inherit', fontSize: 'var(--text-small-size)', whiteSpace: 'nowrap' })
const viewport: CSSProperties = { minHeight: 0, flex: 1, overflow: 'auto', padding: 8 }
const table: CSSProperties = { borderCollapse: 'separate', borderSpacing: 0, fontFamily: 'var(--sans)', fontSize: 'var(--text-small-size)', lineHeight: 1.45, minWidth: '100%' }
const th: CSSProperties = { position: 'sticky', top: 0, zIndex: 1, textAlign: 'left', padding: '4px 7px', background: COLORS.panel2, borderBottom: `0.5px solid ${COLORS.borderStrong}`, color: COLORS.text, fontWeight: 500, whiteSpace: 'nowrap', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }
const thFirst: CSSProperties = { ...th, zIndex: 2, left: 0, background: COLORS.panel2, color: COLORS.faint, textAlign: 'right', minWidth: 34 }
const td: CSSProperties = { padding: '4px 7px', borderBottom: `0.5px solid ${COLORS.border}`, color: COLORS.dim, whiteSpace: 'nowrap', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }
const tdFirst: CSSProperties = { ...td, position: 'sticky', left: 0, background: COLORS.panel, color: COLORS.faint, textAlign: 'right', minWidth: 34 }
const empty: CSSProperties = { display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, padding: 18, color: COLORS.faint, fontSize: 'var(--text-compact-size)', textAlign: 'center' }
const hint: CSSProperties = { margin: '4px 2px 0', color: COLORS.faint, fontSize: 'var(--text-label-size)', lineHeight: 1.5 }

/**
 * Load and render one workbook without inventing data: the table is built from
 * shared strings, cached formula values, and worksheet cells.
 */
export function LoomSpreadsheetPreview({ t, sessionId, filePath, readBytes, onOpenPath }: LoomSpreadsheetPreviewProps): ReactNode {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [active, setActive] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setState({ kind: 'loading' }); setActive(0)
    void readBytes(sessionId, filePath, controller.signal).then(async (result) => {
      if (controller.signal.aborted) return
      if (!result.ok) { setState({ kind: 'error' }); return }
      try {
        const workbook = await readSpreadsheet(new Uint8Array(result.value.data))
        if (!controller.signal.aborted) setState({ kind: 'ready', workbook })
      } catch {
        if (!controller.signal.aborted) setState({ kind: 'error' })
      }
    }, () => { if (!controller.signal.aborted) setState({ kind: 'error' }) })
    return () => { controller.abort() }
  }, [sessionId, filePath, readBytes])
  if (state.kind === 'loading') {
    return <div style={empty} role="status"><FileTypeIcon path={filePath} size={28} /><span>{t('diff.spreadsheetLoading')}</span></div>
  }
  if (state.kind === 'error') {
    return <div style={empty} role="alert">
      <FileTypeIcon path={filePath} size={28} />
      <span>{t('diff.spreadsheetError')}</span>
      {onOpenPath !== undefined && <Button size="sm" variant="outline" onClick={onOpenPath}>{t('diff.openExternal')}</Button>}
    </div>
  }
  const sheet = state.workbook.sheets[Math.min(active, state.workbook.sheets.length - 1)]!
  return <div style={wrap}>
    {state.workbook.sheets.length > 1 && <div style={tabs} role="tablist" aria-label={t('diff.spreadsheetSheets')}>
      {state.workbook.sheets.map((entry, index) => <button key={`${String(index)}:${entry.name}`} type="button" role="tab" aria-selected={index === active} style={tab(index === active)} onClick={() => setActive(index)}>{entry.name}</button>)}
    </div>}
    <div style={viewport} data-loom-spreadsheet-viewport>
      {sheet.rows.length === 0
        ? <p style={empty}>{t('diff.spreadsheetEmpty')}</p>
        : <table style={table}>
            <thead><tr><th style={thFirst} aria-label={t('diff.spreadsheetRow')} /><>{sheet.rows[0]?.map((cell, index) => <th key={String(index)} style={th} title={cell}>{cell}</th>)}</></tr></thead>
            <tbody>{sheet.rows.slice(1).map((row, rowIndex) => <tr key={String(rowIndex)}>
              <th style={tdFirst}>{String(rowIndex + 2)}</th>
              {row.map((cell, columnIndex) => <td key={String(columnIndex)} style={td} title={cell}>{cell}</td>)}
            </tr>)}</tbody>
          </table>}
    </div>
    <p style={hint}>{sheet.truncated ? t('diff.spreadsheetTruncated') : t('diff.spreadsheetHint')}</p>
  </div>
}
