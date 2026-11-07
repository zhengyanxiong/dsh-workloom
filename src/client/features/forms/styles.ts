/** Shared inline style objects for Loom create/edit forms. */
import type { CSSProperties } from 'react'
import { COLORS } from '../../shell.ts'

export const formStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 16, marginTop: 12 }
export const stack: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 }
export const card: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10, padding: 12, border: `0.5px solid ${COLORS.border}`, borderRadius: 'var(--dsw-radius-md)', background: COLORS.panel2 }
export const mono: CSSProperties = { fontFamily: 'ui-monospace, monospace', fontSize: 'var(--text-label-size)' }
export const input: CSSProperties = {
  width: '100%', height: 36, boxSizing: 'border-box', padding: '0 10px', border: `0.5px solid ${COLORS.borderStrong}`,
  borderRadius: 'var(--dsw-radius-sm)', background: COLORS.panel, color: COLORS.text, font: 'inherit', fontSize: 'var(--text-h3-size)', lineHeight: '20px',
}
export const textarea: CSSProperties = { ...input, height: 'auto', minHeight: 88, padding: '8px 10px', resize: 'vertical' }
export const field: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5 }
export const fieldLabel: CSSProperties = { color: COLORS.dim, fontSize: 'var(--text-compact-size)', fontWeight: 500 }
export const hint: CSSProperties = { margin: 0, color: COLORS.dim, fontSize: 'var(--text-small-size)', lineHeight: 1.55 }
export const alert: CSSProperties = { margin: 0, color: COLORS.dim, fontSize: 'var(--text-compact-size)' }
export const failureCode: CSSProperties = { display: 'block', marginTop: 4, color: COLORS.error, fontFamily: 'ui-monospace, monospace', fontSize: 'var(--text-small-size)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }
export const footer: CSSProperties = { position: 'sticky', bottom: 0, zIndex: 2, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4, paddingTop: 12, paddingBottom: 18, borderTop: `0.5px solid ${COLORS.border}`, background: COLORS.panel }
export const footerSpacer: CSSProperties = { flex: 1, minWidth: 8 }
export const previewRow: CSSProperties = { display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', padding: '7px 8px', borderRadius: 'var(--dsw-radius-sm)', background: COLORS.panel, border: `0.5px solid ${COLORS.border}` }
export const workspaceList: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8 }
export const workspaceCard: CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '11px 12px', borderRadius: 'var(--dsw-radius-md)', background: COLORS.panel2, border: `0.5px solid ${COLORS.border}` }
export const workspaceCopy: CSSProperties = { minWidth: 0, flex: '1 1 240px', display: 'flex', flexDirection: 'column', gap: 4 }
export const workspaceTitle: CSSProperties = { color: COLORS.text, fontSize: 'var(--text-compact-size)', lineHeight: 1.35, overflowWrap: 'anywhere' }
export const workspacePath: CSSProperties = { color: COLORS.faint, fontFamily: 'ui-monospace, monospace', fontSize: 'var(--text-label-size)', lineHeight: 1.45, overflowWrap: 'anywhere' }
export const workspaceMeta: CSSProperties = { color: COLORS.faint, fontSize: 'var(--text-label-size)', lineHeight: 1.45 }
export const workspaceActions: CSSProperties = { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }
export const workspaceConfirm: CSSProperties = { flexBasis: '100%', display: 'flex', flexDirection: 'column', gap: 8, marginTop: 2, paddingTop: 9, borderTop: `0.5px solid ${COLORS.border}`, color: COLORS.text, fontSize: 'var(--text-small-size)' }
export const workspaceConfirmText: CSSProperties = { margin: 0, color: COLORS.dim, lineHeight: 1.6 }
export const workspaceConfirmActions: CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }

export const sectionHeading: CSSProperties = { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 14 }
export const sectionHeadingTitle: CSSProperties = { margin: 0, fontSize: 'var(--text-h3-size)', fontWeight: 500, letterSpacing: '-.005em' }
export const branchCard: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10, padding: '13px 14px', border: `0.5px solid ${COLORS.border}`, borderRadius: 10, background: COLORS.panel }
export const branchTop: CSSProperties = { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, minWidth: 0 }
export const branchPath: CSSProperties = { minWidth: 0, flex: 1 }
export const branchPathText: CSSProperties = { fontFamily: 'ui-monospace, monospace', fontSize: 'var(--text-small-size)', lineHeight: 1.5, color: COLORS.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
export const branchPathNote: CSSProperties = { marginTop: 2, fontSize: 'var(--text-label-size)', color: COLORS.faint }
export const branchTag: CSSProperties = { display: 'inline-flex', alignItems: 'center', flex: 'none', maxWidth: '46%', padding: '2px 7px', borderRadius: 4, background: 'color-mix(in srgb, var(--loom-accent) 11%, transparent)', color: COLORS.accent, fontFamily: 'ui-monospace, monospace', fontSize: 'var(--text-label-size)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
export const branchTagEmpty: CSSProperties = { ...branchTag, background: 'color-mix(in srgb, var(--dsw-alias-label-error) 8%, transparent)', color: COLORS.error, border: `0.5px solid color-mix(in srgb, var(--dsw-alias-label-error) 35%, transparent)` }
export const branchError: CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 5, margin: 0, color: COLORS.error, fontSize: 'var(--text-small-size)', lineHeight: 1.5 }
export const helperStrip: CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 9, padding: '10px 12px', marginTop: 2, borderRadius: 8, background: COLORS.panel2, border: `0.5px solid ${COLORS.border}`, color: COLORS.dim, fontSize: 'var(--text-small-size)', lineHeight: 1.55 }
