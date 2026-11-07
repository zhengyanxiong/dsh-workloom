/** Legacy inline style constants shared by the Loom shell. */
import type { CSSProperties } from 'react'
import { COLORS } from './tokens.ts'

/** Host for a workspace comparison: bounds the height so its body owns scrolling. */
export const diffViewport: CSSProperties = { display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, minHeight: 0 }

/** Compact status pill. */
export const pill: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, border: `0.5px solid ${COLORS.border}`, borderRadius: 999, padding: '1px 8px', fontSize: 'var(--text-small-size)', color: COLORS.dim, whiteSpace: 'nowrap' }

/** Compact secondary button. */
export const button: CSSProperties = { color: 'inherit', background: 'transparent', border: `0.5px solid ${COLORS.border}`, borderRadius: 6, padding: '5px 10px', cursor: 'pointer', font: 'inherit' }

/** Compact select control. */
export const select: CSSProperties = { ...button, background: COLORS.panel, cursor: 'pointer' }

/** Uppercase section caption. */
export const sectionTitle: CSSProperties = { margin: '0 0 8px', fontSize: 'var(--text-small-size)', fontWeight: 600, letterSpacing: 0.4, color: COLORS.faint, textTransform: 'uppercase' as const }

/** Muted metadata line. */
export const metaLine: CSSProperties = { color: COLORS.faint, fontSize: 'var(--text-small-size)' }
