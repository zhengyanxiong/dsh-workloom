/** Token-styled native select with an explicit affordance. */
import type { SelectHTMLAttributes } from 'react'
import { IconChevronDownOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import classes from './Select.module.css'

/** Props for the shared select. */
export interface LoomSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  readonly children: React.ReactNode
}

/**
 * Render a select with the same border, height and focus ring as Loom inputs.
 * @param props - native select attributes plus options.
 * @returns the styled select.
 */
export function LoomSelect({ className, children, ...rest }: LoomSelectProps): JSX.Element {
  return <span className={classes.wrap}>
    <select {...rest} className={`${classes.select} ${className ?? ''}`}>{children}</select>
    <span aria-hidden className={classes.chevron}><IconChevronDownOutlineRegular size={12} /></span>
  </span>
}
