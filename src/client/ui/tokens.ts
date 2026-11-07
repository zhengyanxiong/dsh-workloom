/**
 * Typed access to Loom design tokens.
 *
 * Components should reference tokens through these helpers or the `COLORS`
 * semantic aliases instead of writing raw colours or sizes.
 */

/** Theme aliases shared by every Loom shell region. */
export const COLORS = {
  /** Workloom canvas; DSH's light layers are all white, so the shell owns the paper/panel split. */
  bg: 'var(--loom-canvas)',
  panel: 'var(--loom-surface)',
  panel2: 'var(--loom-surface-2)',
  panel3: 'var(--loom-surface-3)',
  selected: 'var(--loom-selected)',
  border: 'var(--loom-border)',
  borderStrong: 'var(--loom-border-strong)',
  text: 'var(--color-ink)',
  dim: 'var(--color-ink-3)',
  faint: 'var(--color-muted)',
  /** Design brand blue; DSH's brand alias is monochrome, so accents use this token. */
  accent: 'var(--loom-accent)',
  business: 'var(--color-accent)',
  green: 'var(--color-success)',
  warn: 'var(--color-warning)',
  error: 'var(--color-danger)',
  cyan: 'var(--color-accent)',
  purple: 'var(--color-accent-ink)',
} as const

/** Colour roles defined by `design/tokens.json`. */
export type LoomColorRole =
  | 'bg' | 'surface' | 'panel' | 'line' | 'line-soft' | 'line-strong'
  | 'ink' | 'ink-2' | 'ink-3' | 'muted'
  | 'accent' | 'accent-solid' | 'accent-soft' | 'accent-ink'
  | 'success' | 'success-soft' | 'success-line' | 'warning' | 'warning-soft'
  | 'danger' | 'danger-soft'

/** Text scale roles defined by `design/tokens.json`. */
export type LoomTextRole = 'display' | 'h1' | 'stat' | 'h2' | 'h3' | 'compact' | 'body' | 'small' | 'label' | 'micro' | 'nano' | 'mono'

/** Radius roles defined by `design/tokens.json`. */
export type LoomRadiusRole = 'xs' | 'sm' | 'md' | 'lg' | 'pill'

/** Shadow roles defined by `design/tokens.json`. */
export type LoomShadowRole = 'card' | 'popover' | 'button'

/**
 * Reference one theme colour variable.
 * @param role - colour role from the token sheet.
 * @returns a CSS custom-property reference.
 */
export function colorVar(role: LoomColorRole): string {
  return `var(--color-${role})`
}

/**
 * Reference one text-scale variable.
 * @param role - type role from the token sheet.
 * @param part - size, line height, tracking or weight.
 * @returns a CSS custom-property reference.
 */
export function textVar(role: LoomTextRole, part: 'size' | 'lh' | 'tracking' | 'weight' = 'size'): string {
  return `var(--text-${role}-${part})`
}

/**
 * Reference one spacing step.
 * @param step - numeric spacing step.
 * @returns a CSS custom-property reference.
 */
export function spaceVar(step: number): string {
  return `var(--space-${String(step)})`
}

/**
 * Reference one radius variable.
 * @param role - radius role.
 * @returns a CSS custom-property reference.
 */
export function radiusVar(role: LoomRadiusRole): string {
  return `var(--radius-${role})`
}

/**
 * Reference one shadow variable.
 * @param role - shadow role.
 * @returns a CSS custom-property reference.
 */
export function shadowVar(role: LoomShadowRole): string {
  return `var(--shadow-${role})`
}
