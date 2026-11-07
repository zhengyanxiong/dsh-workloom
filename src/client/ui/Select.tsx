/** Token-styled single-select combobox with a custom option panel. */
import { useEffect, useRef, useState } from 'react'
import { IconCheckOutlineRegular, IconChevronDownOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import classes from './Select.module.css'

/** One option rendered by LoomSelect. */
export interface LoomSelectOption {
  readonly value: string
  readonly label: string
  readonly description?: string | undefined
}

/** Props for the shared select. */
export interface LoomSelectProps {
  readonly value: string
  readonly options: readonly LoomSelectOption[]
  readonly onChange: (value: string) => void
  readonly ariaLabel: string
  readonly className?: string | undefined
  readonly disabled?: boolean
  readonly size?: 'sm' | 'md'
  /** `ghost` is transparent and used inside the top bar context. */
  readonly variant?: 'field' | 'ghost'
  /** Fill the parent width; forms and settings rows use this. */
  readonly block?: boolean
  /** Open the option panel from the right edge when the control sits near it. */
  readonly align?: 'start' | 'end'
}

/**
 * Render a custom listbox select with token styling and keyboard dismissal.
 * @param props - current value, options and change callback.
 * @returns the select trigger and option panel.
 */
export function LoomSelect({ value, options, onChange, ariaLabel, className, disabled = false, size = 'md', variant = 'field', block = false, align = 'start' }: LoomSelectProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const selected = options.find(option => option.value === value) ?? options[0]
  // Keep the visible value inside the accessible name so voice control can match it.
  const accessibleName = selected === undefined || selected.label === ariaLabel ? ariaLabel : `${ariaLabel} ${selected.label}`
  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent): void => {
      if (root.current !== null && !root.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { setOpen(false); trigger.current?.focus() }
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onPointer); document.removeEventListener('keydown', onKey) }
  }, [open])
  const wrapClass = [classes.wrap, size === 'sm' ? classes.sm : '', variant === 'ghost' ? classes.ghost : '', block ? classes.block : '', className ?? ''].filter(Boolean).join(' ')
  return <div ref={root} className={wrapClass}>
    <button ref={trigger} type="button" className={classes.trigger} aria-label={accessibleName} aria-haspopup="listbox" aria-expanded={open} disabled={disabled} onClick={() => setOpen(current => !current)} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true) } }}>
      <span className={classes.value}>{selected?.label ?? value}</span>
      <span aria-hidden className={`${classes.chevron} ${open ? classes.chevronOpen : ''}`}><IconChevronDownOutlineRegular size={13} /></span>
    </button>
    {open && <div className={`${classes.menu} ${align === 'end' ? classes.menuEnd : ''}`} role="listbox" aria-label={ariaLabel}>
      {options.map(option => {
        const active = option.value === value
        return <button key={option.value} type="button" role="option" aria-selected={active} className={`${classes.option} ${active ? classes.optionActive : ''}`} onClick={() => { onChange(option.value); setOpen(false); trigger.current?.focus() }}>
          <span className={classes.optionText}><span className={classes.optionLabel}>{option.label}</span>{option.description !== undefined && <span className={classes.optionDescription}>{option.description}</span>}</span>
          {active && <span aria-hidden className={classes.check}><IconCheckOutlineRegular size={13} /></span>}
        </button>
      })}
    </div>}
  </div>
}
