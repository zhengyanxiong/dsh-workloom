/** Loom-local preferences; no Host business state is stored here. */
import { useEffect, type CSSProperties, type ReactNode } from 'react'
import type { ProjectRecord } from 'dsh-workloom/types'
import { IconChevronDownOutlineRegular, IconCloseOutlineRegular, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import { COLORS, metaLine } from './shell.ts'
import type { LoomKey } from './locales.ts'

type Translate = (key: LoomKey) => string

/** Browser-persisted workbench defaults. */
export interface LoomPreferences {
  readonly view: 'workbench' | 'kanban'
  readonly kanbanMode: 'flat' | 'grouped'
  readonly contextOpen: boolean
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
}

/** Defaults used when storage is empty or malformed. */
export const DEFAULT_PREFERENCES: LoomPreferences = { view: 'workbench', kanbanMode: 'grouped', contextOpen: true, asideWidth: 344, previewWidth: 560, bottomHeight: 220, sessionLimit: 5, previewWrap: true, wipLimit: 3, openOnLoad: false, collapseSidebar: false }
const STORAGE_KEY = 'loom.preferences'

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
    const kanbanMode = record.kanbanMode === 'flat' ? 'flat' : 'grouped'
    const contextOpen = record.contextOpen !== false
    const previewWrap = record.previewWrap !== false
    const openOnLoad = record.openOnLoad === true
    const collapseSidebar = record.collapseSidebar === true
    const size = (key: 'asideWidth' | 'previewWidth' | 'bottomHeight' | 'sessionLimit' | 'wipLimit', fallback: number, min: number, max: number): number => {
      const raw = record[key]
      return typeof raw === 'number' && Number.isFinite(raw) ? Math.min(Math.max(Math.round(raw), min), max) : fallback
    }
    return {
      view, kanbanMode, contextOpen, previewWrap, openOnLoad, collapseSidebar,
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

const backdrop: CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(8, 10, 14, .46)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 80 }
const panel: CSSProperties = { display: 'flex', flexDirection: 'column', width: 'min(560px, calc(100vw - 32px))', maxHeight: 'calc(100vh - 64px)', overflow: 'hidden', background: COLORS.panel, border: `0.5px solid ${COLORS.border}`, borderRadius: 12, boxShadow: '0 24px 64px rgba(0, 0, 0, .38)' }
const header: CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 12, padding: '18px 20px 14px', flex: 'none' }
const titleBlock: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flex: 1 }
const title: CSSProperties = { margin: 0, color: COLORS.text, fontSize: 15, fontWeight: 500, lineHeight: 1.3 }
const closeButton: CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, flex: 'none', padding: 0, color: COLORS.faint, background: 'transparent', border: '0.5px solid transparent', borderRadius: 6, cursor: 'pointer' }
const body: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 16, padding: '0 20px 16px', overflowY: 'auto', minHeight: 0 }
const section: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 7 }
const sectionHead: CSSProperties = { display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }
const sectionTitle: CSSProperties = { margin: 0, color: COLORS.text, fontSize: 12.5, fontWeight: 500 }
const sectionHint: CSSProperties = { margin: 0, color: COLORS.faint, fontSize: 10.5, lineHeight: 1.5 }
const card: CSSProperties = { border: `0.5px solid ${COLORS.border}`, borderRadius: 9, background: COLORS.panel2, overflow: 'hidden' }
const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '11px 12px' }
const rowDivider: CSSProperties = { borderTop: `0.5px solid ${COLORS.border}` }
const rowText: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: '1 1 190px' }
const rowLabel: CSSProperties = { color: COLORS.text, fontSize: 12, lineHeight: 1.4 }
const rowDescription: CSSProperties = { color: COLORS.faint, fontSize: 10.5, lineHeight: 1.5 }
const selectWrap: CSSProperties = { position: 'relative', display: 'inline-flex', alignItems: 'center', flex: '0 0 auto' }
const select: CSSProperties = { appearance: 'none', minWidth: 140, height: 30, padding: '0 28px 0 10px', color: COLORS.text, background: COLORS.panel, border: `0.5px solid ${COLORS.borderStrong}`, borderRadius: 7, font: 'inherit', fontSize: 11.5, lineHeight: '28px', cursor: 'pointer' }
const selectChevron: CSSProperties = { position: 'absolute', right: 8, color: COLORS.faint, pointerEvents: 'none', display: 'flex' }
const pinnedRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', fontSize: 12, color: COLORS.text }
const unpin: CSSProperties = { marginLeft: 'auto', padding: '3px 8px', color: COLORS.dim, background: 'transparent', border: `0.5px solid ${COLORS.border}`, borderRadius: 6, font: 'inherit', fontSize: 10.5, cursor: 'pointer' }
const footerNote: CSSProperties = { ...metaLine, margin: '0 20px 18px', paddingTop: 12, borderTop: `0.5px solid ${COLORS.border}`, flex: 'none' }
const sessionLimits = Array.from({ length: 20 }, (_value, index) => index + 1)
const wipLimits = Array.from({ length: 10 }, (_value, index) => index + 1)

/** Inputs for the Loom settings overlay. */
export interface LoomSettingsProps {
  readonly t: Translate
  readonly open: boolean
  readonly preferences: LoomPreferences
  readonly pinned: readonly ProjectRecord[]
  readonly onChange: (preferences: LoomPreferences) => void
  readonly onUnpin: (id: ProjectRecord['id']) => void
  readonly onClose: () => void
}

function SelectField({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return <div style={selectWrap}>
    <select aria-label={label} value={value} onChange={event => onChange(event.target.value)} style={select}>{children}</select>
    <span aria-hidden style={selectChevron}><IconChevronDownOutlineRegular size={11} /></span>
  </div>
}

function SettingRow({ label, description, control, divider = true }: { label: string; description?: string | undefined; control: ReactNode; divider?: boolean | undefined }) {
  return <div style={{ ...row, ...(divider ? rowDivider : {}) }}>
    <div style={rowText}>
      <span style={rowLabel}>{label}</span>
      {description !== undefined && <span style={rowDescription}>{description}</span>}
    </div>
    {control}
  </div>
}

/**
 * Render workbench defaults and pinned-project management.
 * @param props - current preferences and close/unpin actions.
 * @returns a settings overlay, or null when closed.
 */
export function LoomSettings({ t, open, preferences, pinned, onChange, onUnpin, onClose }: LoomSettingsProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [open, onClose])
  if (!open) return null
  return <div style={backdrop} onClick={onClose}>
    <div role="dialog" aria-modal="true" aria-label={t('settings.title')} style={panel} onClick={event => event.stopPropagation()}>
      <header style={header}>
        <div style={titleBlock}>
          <h2 style={title}>{t('settings.title')}</h2>
        </div>
        <button type="button" aria-label={t('form.close')} title={t('form.close')} style={closeButton} onClick={onClose}><IconCloseOutlineRegular size={13} /></button>
      </header>

      <div style={body}>
        <section style={section}>
          <div style={sectionHead}><h3 style={sectionTitle}>{t('settings.sidebar')}</h3></div>
          <div style={card}>
            <SettingRow divider={false} label={t('settings.sessionLimit')} description={t('settings.sessionLimitHint')} control={
              <SelectField label={t('settings.sessionLimit')} value={String(preferences.sessionLimit)} onChange={value => { onChange({ ...preferences, sessionLimit: Number(value) }) }}>
                {sessionLimits.map(limit => <option key={limit} value={String(limit)}>{t('side.sessionLimit').replace('{limit}', String(limit))}</option>)}
              </SelectField>
            } />
          </div>
        </section>

        <section style={section}>
          <div style={sectionHead}><h3 style={sectionTitle}>{t('settings.startup')}</h3><span style={sectionHint}>{t('settings.startupHint')}</span></div>
          <div style={card}>
            <SettingRow divider={false} label={t('settings.openOnLoad')} control={<Switch checked={preferences.openOnLoad} onChange={next => { onChange({ ...preferences, openOnLoad: next }) }} label={t('settings.openOnLoad')} />} />
            <SettingRow label={t('settings.collapseSidebar')} control={<Switch checked={preferences.collapseSidebar} onChange={next => { onChange({ ...preferences, collapseSidebar: next }) }} label={t('settings.collapseSidebar')} />} />
          </div>
        </section>

        <section style={section}>
          <div style={sectionHead}><h3 style={sectionTitle}>{t('settings.workspace')}</h3></div>
          <div style={card}>
            <SettingRow divider={false} label={t('settings.defaultView')} control={
              <SelectField label={t('settings.defaultView')} value={preferences.view} onChange={value => { onChange({ ...preferences, view: value === 'kanban' ? 'kanban' : 'workbench' }) }}>
                <option value="workbench">{t('workbench')}</option>
                <option value="kanban">{t('view.kanban')}</option>
              </SelectField>
            } />
            <SettingRow label={t('settings.kanbanMode')} control={
              <SelectField label={t('settings.kanbanMode')} value={preferences.kanbanMode} onChange={value => { onChange({ ...preferences, kanbanMode: value === 'flat' ? 'flat' : 'grouped' }) }}>
                <option value="grouped">{t('kb.grouped')}</option>
                <option value="flat">{t('kb.flat')}</option>
              </SelectField>
            } />
            <SettingRow label={t('settings.wipLimit')} description={t('settings.wipLimitHint')} control={
              <SelectField label={t('settings.wipLimit')} value={String(preferences.wipLimit)} onChange={value => { onChange({ ...preferences, wipLimit: Number(value) }) }}>
                {wipLimits.map(limit => <option key={limit} value={String(limit)}>{String(limit)}</option>)}
              </SelectField>
            } />
            <SettingRow label={t('settings.contextOpen')} control={<Switch checked={preferences.contextOpen} onChange={next => { onChange({ ...preferences, contextOpen: next }) }} label={t('settings.contextOpen')} />} />
          </div>
        </section>

        <section style={section}>
          <div style={sectionHead}><h3 style={sectionTitle}>{t('settings.pinned')}</h3></div>
          <div style={card}>
            {pinned.length === 0
              ? <p style={{ ...sectionHint, padding: '10px 12px' }}>{t('settings.noPins')}</p>
              : pinned.map((project, index) => <div key={project.id} style={{ ...pinnedRow, ...(index === 0 ? {} : { borderTop: `0.5px solid ${COLORS.border}` }) }}>
                  <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{project.config.name}</span>
                  <button type="button" style={unpin} onClick={() => onUnpin(project.id)}>{t('settings.unpin')}</button>
                </div>)}
          </div>
        </section>
      </div>

      <p style={footerNote}>{t('settings.localOnly')}</p>
    </div>
  </div>
}
