/** Loom-local preferences and the shared setting-row controls. */
import type { ReactNode } from 'react'
import type { LoomThemePreference } from '../../theme/selection.ts'
import { LoomSelect, type LoomSelectOption } from '../../ui/Select.tsx'
import classes from './LoomSettings.module.css'

/** Text-size steps offered by the settings page. */
export const FONT_SIZES = [13, 14, 15, 16] as const

/** One text-size preference value. */
export type LoomFontSize = (typeof FONT_SIZES)[number]

/** Browser-persisted workbench defaults. */
export interface LoomPreferences {
  readonly view: 'workbench' | 'kanban'
  readonly kanbanMode: 'flat' | 'grouped'
  /** Board opening mode; kanban is the drag surface, list is the dense table. */
  readonly boardView: 'kanban' | 'list'
  /** Theme choice; `auto` follows the DSH light/dark state. */
  readonly theme: LoomThemePreference
  /** Card and row density; compact tightens spacing without shrinking text. */
  readonly density: 'comfortable' | 'compact'
  /** Text size in pixels; headings never scale with it. */
  readonly fontSize: LoomFontSize
  /** Disable Loom transitions and animations. */
  readonly reducedMotion: boolean
  readonly contextOpen: boolean
  /** Left Workloom sidebar width in pixels. */
  readonly sidebarWidth: number
  /** Context-aside width in pixels. */
  readonly asideWidth: number
  /** File- and turn-preview aside width in pixels. */
  readonly previewWidth: number
  /** Expanded bottom-pane body height in pixels. */
  readonly bottomHeight: number
  /** Maximum Session rows shown in each sidebar group. */
  readonly sessionLimit: number
  /** Board WIP hint limit; advisory only and never blocks starting a task. */
  readonly wipLimit: number
  /** Whether comparisons wrap wide lines instead of scrolling sideways. */
  readonly previewWrap: boolean
  /** Whether the Workloom panel becomes the main panel after DSH loads. */
  readonly openOnLoad: boolean
  /** Whether the native left sidebar collapses when DSH loads. */
  readonly collapseSidebar: boolean
  /** Whether the native sidebar collapses while Workloom is the active panel. */
  readonly autoCollapseSidebar: boolean
}

/** Defaults used when storage is empty or malformed. */
export const DEFAULT_PREFERENCES: LoomPreferences = {
  view: 'workbench', kanbanMode: 'flat', boardView: 'kanban', theme: 'auto', density: 'comfortable',
  fontSize: 14, reducedMotion: false, contextOpen: true, sidebarWidth: 240, asideWidth: 344, previewWidth: 560, // design-allow: preference defaults, not CSS declarations
  bottomHeight: 220, sessionLimit: 5, previewWrap: true, wipLimit: 3, openOnLoad: false,
  collapseSidebar: false, autoCollapseSidebar: true,
}
const STORAGE_KEY = 'loom.preferences'

const THEMES: readonly LoomThemePreference[] = ['auto', 'paper', 'white', 'blue', 'dark']

/** Session-row limits offered by the settings page. */
export const SESSION_LIMITS: readonly number[] = Array.from({ length: 20 }, (_value, index) => index + 1)

/** WIP limits offered by the settings page. */
export const WIP_LIMITS: readonly number[] = Array.from({ length: 10 }, (_value, index) => index + 1)

/**
 * Read preferences from localStorage without letting malformed values break the workbench.
 * @returns admitted preferences or the defaults.
 */
export function readPreferences(): LoomPreferences {
  if (typeof localStorage === 'undefined') return DEFAULT_PREFERENCES
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return DEFAULT_PREFERENCES
    const record = value as Record<string, unknown>
    const view = record.view === 'kanban' ? 'kanban' : 'workbench'
    const kanbanMode = record.kanbanMode === 'grouped' ? 'grouped' : 'flat'
    const boardView = record.boardView === 'list' ? 'list' : 'kanban'
    const theme = THEMES.find(candidate => candidate === record.theme) ?? 'auto'
    const density = record.density === 'compact' ? 'compact' : 'comfortable'
    const reducedMotion = record.reducedMotion === true
    const contextOpen = record.contextOpen !== false
    const previewWrap = record.previewWrap !== false
    const openOnLoad = record.openOnLoad === true
    const collapseSidebar = record.collapseSidebar === true
    const autoCollapseSidebar = record.autoCollapseSidebar !== false
    const size = (key: 'sidebarWidth' | 'asideWidth' | 'previewWidth' | 'bottomHeight' | 'sessionLimit' | 'wipLimit', fallback: number, min: number, max: number): number => {
      const raw = record[key]
      return typeof raw === 'number' && Number.isFinite(raw) ? Math.min(Math.max(Math.round(raw), min), max) : fallback
    }
    const fontSize = FONT_SIZES.find(candidate => candidate === record.fontSize) ?? 14
    return {
      view, kanbanMode, boardView, theme, density, fontSize, reducedMotion, contextOpen, previewWrap,
      openOnLoad, collapseSidebar, autoCollapseSidebar,
      sidebarWidth: size('sidebarWidth', DEFAULT_PREFERENCES.sidebarWidth, 200, 420),
      asideWidth: size('asideWidth', DEFAULT_PREFERENCES.asideWidth, 320, 460),
      previewWidth: size('previewWidth', DEFAULT_PREFERENCES.previewWidth, 300, 720),
      bottomHeight: size('bottomHeight', DEFAULT_PREFERENCES.bottomHeight, 80, 320),
      sessionLimit: size('sessionLimit', DEFAULT_PREFERENCES.sessionLimit, 1, 20),
      wipLimit: size('wipLimit', DEFAULT_PREFERENCES.wipLimit, 1, 10),
    }
  } catch { return DEFAULT_PREFERENCES }
}

/** Persist preferences; a blocked storage write leaves the current session working. */
export function writePreferences(preferences: LoomPreferences): void {
  if (typeof localStorage === 'undefined') return
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences)) } catch { /* preferences stay session-local */ }
}

/**
 * Render one labeled preference row with its control.
 *
 * @param props - label, optional description, control and divider flag.
 * @returns the row.
 */
export function SettingRow({ label, description, control, divider = true }: { readonly label: string; readonly description?: string | undefined; readonly control: ReactNode; readonly divider?: boolean | undefined }): JSX.Element {
  return <div className={`${classes.row} ${divider ? classes.rowDivider : ''}`}>
    <div className={classes.rowText}>
      <span className={classes.rowLabel}>{label}</span>
      {description !== undefined && <span className={classes.rowDescription}>{description}</span>}
    </div>
    {control}
  </div>
}

/**
 * Render one native select styled as a settings control.
 *
 * @param props - accessible label, current value, change callback and options.
 * @returns the select control.
 */
export function SelectField({ label, value, options, onChange, disabled = false }: {
  readonly label: string
  readonly value: string
  readonly options: readonly LoomSelectOption[]
  readonly onChange: (value: string) => void
  readonly disabled?: boolean | undefined
}): JSX.Element {
  return <LoomSelect ariaLabel={label} value={value} options={options} onChange={onChange} disabled={disabled} align="end" />
}
