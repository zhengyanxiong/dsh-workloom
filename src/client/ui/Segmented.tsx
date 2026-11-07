/** Reusable segmented control for dense view switches. */
import type { KeyboardEvent } from 'react'
import classes from './Segmented.module.css'

/** One segment shown by the control. */
export interface LoomSegmentOption {
  readonly value: string
  readonly label: string
}

/** Props for the shared segmented control. */
export interface LoomSegmentedProps {
  readonly value: string
  readonly options: readonly LoomSegmentOption[]
  readonly onChange: (value: string) => void
  readonly ariaLabel: string
  /** `choice` enlarges the control and gives the selected option an accent fill. */
  readonly variant?: 'default' | 'choice'
}

/**
 * Render a compact single-choice control with arrow-key support.
 *
 * @param props - current value, options and change callback.
 * @returns the segmented control.
 */
export function LoomSegmented({ value, options, onChange, ariaLabel, variant = 'default' }: LoomSegmentedProps): JSX.Element {
  const index = options.findIndex(option => option.value === value)
  const select = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    if (options.length === 0) return
    event.preventDefault()
    const delta = event.key === 'ArrowRight' ? 1 : -1
    const next = options[((Math.max(0, index) + delta) + options.length) % options.length]
    if (next !== undefined) onChange(next.value)
  }
  return <div role="tablist" aria-label={ariaLabel} className={`${classes.track} ${variant === 'choice' ? classes.choice : ''}`}>
    {options.map(option => <button
      key={option.value}
      type="button"
      role="tab"
      aria-selected={option.value === value}
      tabIndex={option.value === value ? 0 : -1}
      className={`${classes.segment} ${option.value === value ? classes.active : ''}`}
      onClick={() => onChange(option.value)}
      onKeyDown={select}
    >{option.label}</button>)}
  </div>
}
