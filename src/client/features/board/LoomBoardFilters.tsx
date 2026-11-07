/** Advanced board filters revealed by the board toolbar. */
import { IconSearchOutlineRegular } from '../../ui/primitives.ts'
import { LoomButton } from '../../ui/Button.tsx'
import { LoomSelect, type LoomSelectOption } from '../../ui/Select.tsx'
import type { LoomKey } from '../../locales.ts'
import classes from './LoomKanban.module.css'

type Translate = (key: LoomKey) => string

/** Props for the advanced filter row. */
export interface LoomBoardFiltersProps {
  readonly t: Translate
  readonly versionValue: string
  readonly statusValue: string
  readonly moduleValue: string
  readonly searchValue: string
  readonly versionOptions: readonly LoomSelectOption[]
  readonly statusOptions: readonly LoomSelectOption[]
  readonly moduleOptions: readonly LoomSelectOption[]
  readonly moduleDisabled: boolean
  readonly wipLimit: number
  readonly grouped: boolean
  readonly groupedAvailable: boolean
  readonly hasFilters: boolean
  readonly onVersion: (value: string) => void
  readonly onStatus: (value: string) => void
  readonly onModule: (value: string) => void
  readonly onSearch: (value: string) => void
  readonly onToggleGrouped: () => void
  readonly onClear: () => void
}

/**
 * Render the secondary filter controls kept out of the primary toolbar row.
 *
 * @param props - current filter values, options and callbacks.
 * @returns the filter row.
 */
export function LoomBoardFilters(props: LoomBoardFiltersProps): JSX.Element {
  const {
    t, versionValue, statusValue, moduleValue, searchValue, versionOptions, statusOptions,
    moduleOptions, moduleDisabled, wipLimit, grouped, groupedAvailable, hasFilters,
    onVersion, onStatus, onModule, onSearch, onToggleGrouped, onClear,
  } = props
  return <div className={classes.filters} role="group" aria-label={t('kb.filterPanel')}>
    <LoomSelect className={classes.filterField} value={versionValue} options={versionOptions} onChange={onVersion} ariaLabel={t('top.version')} />
    <LoomSelect className={classes.filterField} value={statusValue} options={statusOptions} onChange={onStatus} ariaLabel={t('kb.status')} />
    <LoomSelect className={classes.filterField} value={moduleValue} options={moduleOptions} onChange={onModule} ariaLabel={t('kb.module')} disabled={moduleDisabled} />
    <label className={classes.searchBox}>
      <IconSearchOutlineRegular size={12} />
      <input
        className={classes.searchInput}
        aria-label={t('kb.search')}
        placeholder={t('kb.search')}
        value={searchValue}
        onChange={event => onSearch(event.target.value)}
      />
    </label>
    {groupedAvailable && <LoomButton variant="ghost" size="sm" aria-pressed={grouped} onClick={onToggleGrouped}>{t('kb.groupedToggle')}</LoomButton>}
    <span className={classes.wipHint}>{t('kb.wip')} {String(wipLimit)}</span>
    <LoomButton variant="ghost" size="sm" disabled={!hasFilters} onClick={onClear}>{t('kb.clearFilters')}</LoomButton>
  </div>
}
