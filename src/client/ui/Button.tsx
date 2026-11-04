/**
 * Shared button primitive for Loom surfaces.
 *
 * Variants and sizes are token-driven; feature code should not recreate button
 * padding, focus rings or hover states.
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import classes from './Button.module.css'

/** Supported visual variants. */
export type LoomButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
/** Supported control heights. */
export type LoomButtonSize = 'sm' | 'md'

/** Props for the shared Loom button. */
export interface LoomButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: LoomButtonVariant
  readonly size?: LoomButtonSize
  readonly icon?: ReactNode | undefined
  readonly iconOnly?: boolean
}

/**
 * Render a token-styled Loom button.
 * @param props - native button props plus variant and optional icon.
 * @returns the button element.
 */
export function LoomButton({ variant = 'secondary', size = 'md', icon, iconOnly = false, className, children, ...rest }: LoomButtonProps): JSX.Element {
  const names = [classes.button, classes[size], classes[variant], iconOnly ? classes.icon : '', className ?? ''].filter(Boolean).join(' ')
  return <button type="button" {...rest} className={names}>
    {icon}
    {iconOnly ? null : children}
  </button>
}
