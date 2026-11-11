/** Command palette for jumping to pages, projects, versions, tasks and sessions. */
import { LOOM_PORTAL_CLASS } from '../../theme/LoomTheme.tsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  IconBranchOutlineRegular, IconBrowseOutlineRegular, IconChecklistOutlineRegular,
  IconFolderOpenRegular, IconNewChatOutlineRegular, IconSearchOutlineRegular, Modal,
} from '../../ui/primitives.ts'
import type { CatalogSnapshot } from 'dsh-workloom/types'
import type { LoomKey } from '../../shared/locales.ts'
import { PALETTE_GROUP, PALETTE_ORDER, buildPaletteItems, filterPaletteItems, type LoomPaletteItem, type LoomPaletteKind } from './palette.ts'
import classes from './LoomCommandPalette.module.css'

type Translate = (key: LoomKey) => string

const KIND_ICON: Readonly<Record<LoomPaletteKind, JSX.Element>> = {
  page: <IconBrowseOutlineRegular size={14} />,
  project: <IconFolderOpenRegular size={14} />,
  version: <IconBranchOutlineRegular size={14} />,
  task: <IconChecklistOutlineRegular size={14} />,
  session: <IconNewChatOutlineRegular size={14} />,
}

/** Inputs for the command palette. */
export interface LoomCommandPaletteProps {
  readonly open: boolean
  readonly t: Translate
  readonly snapshot: CatalogSnapshot | undefined
  readonly onClose: () => void
  readonly onActivate: (item: LoomPaletteItem) => void
}

/** One rendered group of palette rows. */
interface PaletteGroup {
  readonly kind: LoomPaletteKind
  readonly rows: readonly LoomPaletteItem[]
  readonly start: number
}

/**
 * Render the searchable command palette over the current Loom page.
 * @param props - visibility, locale, catalog and navigation intents.
 * @returns the modal palette, or null while closed.
 */
export function LoomCommandPalette({ open, t, snapshot, onClose, onActivate }: LoomCommandPaletteProps): JSX.Element | null {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const items = useMemo(() => buildPaletteItems(t, snapshot), [t, snapshot])
  const filtered = useMemo(() => filterPaletteItems(items, query), [items, query])
  useEffect(() => {
    if (!open) return
    setQuery('')
    setActive(0)
  }, [open])
  useEffect(() => { setActive(0) }, [query])
  useEffect(() => {
    if (open) input.current?.focus()
  }, [open])
  useEffect(() => {
    if (!open) return
    const row = document.getElementById(`loom-palette-option-${String(active)}`)
    if (typeof row?.scrollIntoView === 'function') row.scrollIntoView({ block: 'nearest' })
  }, [active, open, filtered])
  const groups = useMemo((): readonly PaletteGroup[] => {
    let start = 0
    return PALETTE_ORDER.flatMap(kind => {
      const rows = filtered.filter(item => item.kind === kind)
      if (rows.length === 0) return []
      const group: PaletteGroup = { kind, rows, start }
      start += rows.length
      return [group]
    })
  }, [filtered])
  const current = filtered[active]
  const activate = (item: LoomPaletteItem | undefined): void => {
    if (item === undefined) return
    onActivate(item)
  }
  return <Modal open={open} title={t('top.search')} headless onClose={onClose} className={`${LOOM_PORTAL_CLASS} loom-palette`}>
    <div className={classes.palette}>
      <div className={classes.searchRow}>
        <span aria-hidden className={classes.searchIcon}><IconSearchOutlineRegular size={15} /></span>
        <input
          ref={input}
          data-modal-autofocus
          className={classes.input}
          value={query}
          role="combobox"
          aria-expanded="true"
          aria-controls="loom-palette-listbox"
          aria-autocomplete="list"
          aria-activedescendant={current === undefined ? undefined : `loom-palette-option-${String(active)}`}
          aria-label={t('top.search')}
          placeholder={t('palette.placeholder')}
          onChange={event => setQuery(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setActive(value => filtered.length === 0 ? 0 : (value + 1) % filtered.length)
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setActive(value => filtered.length === 0 ? 0 : (value - 1 + filtered.length) % filtered.length)
            } else if (event.key === 'Enter') {
              event.preventDefault()
              activate(current)
            }
          }}
        />
        <kbd className={classes.kbd}>Esc</kbd>
      </div>
      <div id="loom-palette-listbox" role="listbox" aria-label={t('top.search')} className={classes.results}>
        {filtered.length === 0
          ? <p className={classes.empty}>{t('palette.empty')}</p>
          : groups.map(group => <div key={group.kind} className={classes.group} role="group" aria-label={t(PALETTE_GROUP[group.kind])}>
            <span className={classes.groupTitle}>{t(PALETTE_GROUP[group.kind])}</span>
            {group.rows.map((item, index) => {
              const order = group.start + index
              const selected = order === active
              return <button
                key={item.id}
                id={`loom-palette-option-${String(order)}`}
                type="button"
                role="option"
                aria-selected={selected}
                className={`${classes.option} ${selected ? classes.optionActive : ''}`}
                onMouseEnter={() => setActive(order)}
                onClick={() => activate(item)}
              >
                <span aria-hidden className={classes.optionIcon}>{KIND_ICON[item.kind]}</span>
                <span className={classes.optionText}><span className={classes.optionLabel}>{item.label}</span>{item.detail !== undefined && <span className={classes.optionDetail}>{item.detail}</span>}</span>
              </button>
            })}
          </div>)}
      </div>
      <div className={classes.footer}>
        <span><kbd className={classes.footerKbd}>↑↓</kbd>{t('palette.hint.select')}</span>
        <span><kbd className={classes.footerKbd}>Enter</kbd>{t('palette.hint.open')}</span>
        <span><kbd className={classes.footerKbd}>Esc</kbd>{t('palette.hint.close')}</span>
      </div>
    </div>
  </Modal>
}
