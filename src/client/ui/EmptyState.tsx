/** Shared empty state for Loom lists and board columns. */
import type { ReactNode } from 'react'
import classes from './EmptyState.module.css'

/** Props for the shared empty state. */
export interface LoomEmptyStateProps {
  readonly text: string
  readonly hint?: string | undefined
  readonly action?: ReactNode | undefined
}

/**
 * Render one empty-state message with an optional hint and action.
 *
 * @param props - message, optional hint and optional action.
 * @returns the empty state.
 */
export function LoomEmptyState({ text, hint, action }: LoomEmptyStateProps): JSX.Element {
  return <div className={classes.empty} role="status">
    <span className={classes.text}>{text}</span>
    {hint !== undefined && <span className={classes.hint}>{hint}</span>}
    {action}
  </div>
}
