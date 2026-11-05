/** Settings route: appearance themes and the browser-local workbench defaults. */
import { useState } from 'react'
import { IconCheckOutlineRegular, IconChevronLeftOutlineRegular, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ProjectRecord } from 'dsh-workloom/types'
import { SESSION_LIMITS, SelectField, SettingRow, WIP_LIMITS, type LoomPreferences } from './LoomSettings.tsx'
import type { LoomKey } from './locales.ts'
import { resolveLoomTheme, type LoomThemeAttribute, type LoomThemePreference } from './theme/selection.ts'
import { LoomButton } from './ui/Button.tsx'
import { LoomSegmented } from './ui/Segmented.tsx'
import classes from './LoomSettingsPage.module.css'

type Translate = (key: LoomKey) => string

type SectionId = 'appearance' | 'interface' | 'workspace' | 'startup' | 'pinned'

const THEME_CARDS: readonly { readonly value: Exclude<LoomThemePreference, 'auto'>; readonly label: LoomKey; readonly hint: LoomKey }[] = [
  { value: 'paper', label: 'theme.paper', hint: 'theme.paperHint' },
  { value: 'white', label: 'theme.white', hint: 'theme.whiteHint' },
  { value: 'blue', label: 'theme.blue', hint: 'theme.blueHint' },
  { value: 'dark', label: 'theme.dark', hint: 'theme.darkHint' },
]

/** Inputs for the settings page. */
export interface LoomSettingsPageProps {
  readonly t: Translate
  readonly preferences: LoomPreferences
  readonly pinned: readonly ProjectRecord[]
  readonly onChange: (preferences: LoomPreferences) => void
  readonly onUnpin: (id: ProjectRecord['id']) => void
  readonly onBack: () => void
}

/** Map one theme card to the token sheet it previews. */
function previewTheme(value: Exclude<LoomThemePreference, 'auto'>): LoomThemeAttribute {
  return resolveLoomTheme(value, false)
}

/**
 * Render the settings route: theme cards, interface density and local defaults.
 *
 * @param props - current preferences and change callbacks.
 * @returns the settings page.
 */
export function LoomSettingsPage({ t, preferences, pinned, onChange, onUnpin, onBack }: LoomSettingsPageProps): JSX.Element {
  const [active, setActive] = useState<SectionId>('appearance')
  const sections: readonly { readonly id: SectionId; readonly label: LoomKey }[] = [
    { id: 'appearance', label: 'settings.appearance' },
    { id: 'interface', label: 'settings.interfaceSection' },
    { id: 'workspace', label: 'settings.workspace' },
    { id: 'startup', label: 'settings.startup' },
    { id: 'pinned', label: 'settings.pinned' },
  ]
  const jump = (id: SectionId): void => {
    setActive(id)
    if (typeof document !== 'undefined') document.getElementById(`loom-settings-${id}`)?.scrollIntoView({ block: 'start' })
  }
  return <main className={classes.root}>
    <header className={classes.header}>
      <div className={classes.headText}>
        <p className={classes.eyebrow}>{t('settings.eyebrow')}</p>
        <h1 className={classes.title}>{t('settings.pageTitle')}</h1>
        <p className={classes.hint}>{t('settings.localOnly')}</p>
      </div>
      <LoomButton variant="ghost" size="sm" icon={<IconChevronLeftOutlineRegular size={12} />} onClick={onBack}>{t('workbench.back')}</LoomButton>
    </header>
    <div className={classes.body}>
      <nav className={classes.nav} aria-label={t('settings.navLabel')}>
        {sections.map(section => <button
          key={section.id}
          type="button"
          aria-current={active === section.id ? 'page' : undefined}
          className={`${classes.navItem} ${active === section.id ? classes.navActive : ''}`}
          onClick={() => jump(section.id)}
        >{t(section.label)}</button>)}
      </nav>
      <div className={classes.content}>
        <section id="loom-settings-appearance" className={classes.section} aria-label={t('settings.appearance')}>
          <div className={classes.sectionHead}><h2 className={classes.sectionTitle}>{t('settings.appearance')}</h2><span className={classes.sectionHint}>{t('settings.appearanceHint')}</span></div>
          <div className={classes.themeGrid}>
            <button
              type="button"
              aria-pressed={preferences.theme === 'auto'}
              className={`${classes.themeCard} ${preferences.theme === 'auto' ? classes.themeActive : ''}`}
              onClick={() => onChange({ ...preferences, theme: 'auto' })}
            >
              <span aria-hidden className={`${classes.swatch} ${classes.swatchAuto}`} />
              <span className={classes.cardText}><span className={classes.cardName}>{t('theme.auto')}</span><span className={classes.cardHint}>{t('theme.autoHint')}</span></span>
              {preferences.theme === 'auto' && <span aria-hidden className={classes.check}><IconCheckOutlineRegular size={13} /></span>}
            </button>
            {THEME_CARDS.map(theme => {
              const selected = preferences.theme === theme.value
              return <button
                key={theme.value}
                type="button"
                aria-pressed={selected}
                className={`${classes.themeCard} ${selected ? classes.themeActive : ''}`}
                onClick={() => onChange({ ...preferences, theme: theme.value })}
              >
                <span aria-hidden className={classes.swatch} data-theme={previewTheme(theme.value)}>
                  <span className={classes.swatchSurface} />
                  <span className={classes.swatchAccent} />
                </span>
                <span className={classes.cardText}><span className={classes.cardName}>{t(theme.label)}</span><span className={classes.cardHint}>{t(theme.hint)}</span></span>
                {selected && <span aria-hidden className={classes.check}><IconCheckOutlineRegular size={13} /></span>}
              </button>
            })}
          </div>
        </section>
        <section id="loom-settings-interface" className={classes.section} aria-label={t('settings.interfaceSection')}>
          <div className={classes.sectionHead}><h2 className={classes.sectionTitle}>{t('settings.interfaceSection')}</h2><span className={classes.sectionHint}>{t('settings.interfaceHint')}</span></div>
          <div className={classes.panel}>
            <SettingRow divider={false} label={t('settings.density')} description={t('settings.densityHint')} control={
              <LoomSegmented
                ariaLabel={t('settings.density')}
                value={preferences.density}
                options={[{ value: 'comfortable', label: t('settings.densityComfortable') }, { value: 'compact', label: t('settings.densityCompact') }]}
                onChange={value => onChange({ ...preferences, density: value === 'compact' ? 'compact' : 'comfortable' })}
              />
            } />
            <SettingRow label={t('settings.fontSize')} description={t('settings.fontSizeHint')} control={
              <LoomSegmented
                ariaLabel={t('settings.fontSize')}
                value={String(preferences.fontSize)}
                options={[13, 14, 15].map(size => ({ value: String(size), label: String(size) }))}
                onChange={value => onChange({ ...preferences, fontSize: value === '13' ? 13 : value === '15' ? 15 : 14 })}
              />
            } />
            <SettingRow label={t('settings.reducedMotion')} description={t('settings.reducedMotionHint')} control={
              <Switch checked={preferences.reducedMotion} onChange={next => onChange({ ...preferences, reducedMotion: next })} label={t('settings.reducedMotion')} />
            } />
          </div>
        </section>
        <section id="loom-settings-workspace" className={classes.section} aria-label={t('settings.workspace')}>
          <div className={classes.sectionHead}><h2 className={classes.sectionTitle}>{t('settings.workspace')}</h2><span className={classes.sectionHint}>{t('settings.workspaceHint')}</span></div>
          <div className={classes.panel}>
            <SettingRow divider={false} label={t('settings.sessionLimit')} description={t('settings.sessionLimitHint')} control={
              <SelectField label={t('settings.sessionLimit')} value={String(preferences.sessionLimit)} onChange={value => { onChange({ ...preferences, sessionLimit: Number(value) }) }}>
                {SESSION_LIMITS.map(limit => <option key={limit} value={String(limit)}>{t('side.sessionLimit').replace('{limit}', String(limit))}</option>)}
              </SelectField>
            } />
            <SettingRow label={t('settings.defaultView')} control={
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
            <SettingRow label={t('settings.boardView')} description={t('settings.boardViewHint')} control={
              <SelectField label={t('settings.boardView')} value={preferences.boardView} onChange={value => { onChange({ ...preferences, boardView: value === 'list' ? 'list' : 'kanban' }) }}>
                <option value="kanban">{t('view.kanban')}</option>
                <option value="list">{t('view.list')}</option>
              </SelectField>
            } />
            <SettingRow label={t('settings.wipLimit')} description={t('settings.wipLimitHint')} control={
              <SelectField label={t('settings.wipLimit')} value={String(preferences.wipLimit)} onChange={value => { onChange({ ...preferences, wipLimit: Number(value) }) }}>
                {WIP_LIMITS.map(limit => <option key={limit} value={String(limit)}>{String(limit)}</option>)}
              </SelectField>
            } />
            <SettingRow label={t('settings.contextOpen')} control={<Switch checked={preferences.contextOpen} onChange={next => onChange({ ...preferences, contextOpen: next })} label={t('settings.contextOpen')} />} />
          </div>
        </section>
        <section id="loom-settings-startup" className={classes.section} aria-label={t('settings.startup')}>
          <div className={classes.sectionHead}><h2 className={classes.sectionTitle}>{t('settings.startup')}</h2><span className={classes.sectionHint}>{t('settings.startupHint')}</span></div>
          <div className={classes.panel}>
            <SettingRow divider={false} label={t('settings.openOnLoad')} control={<Switch checked={preferences.openOnLoad} onChange={next => onChange({ ...preferences, openOnLoad: next })} label={t('settings.openOnLoad')} />} />
            <SettingRow label={t('settings.collapseSidebar')} control={<Switch checked={preferences.collapseSidebar} onChange={next => onChange({ ...preferences, collapseSidebar: next })} label={t('settings.collapseSidebar')} />} />
            <SettingRow label={t('settings.autoCollapseSidebar')} description={t('settings.autoCollapseSidebarHint')} control={<Switch checked={preferences.autoCollapseSidebar} onChange={next => onChange({ ...preferences, autoCollapseSidebar: next })} label={t('settings.autoCollapseSidebar')} />} />
          </div>
        </section>
        <section id="loom-settings-pinned" className={classes.section} aria-label={t('settings.pinned')}>
          <div className={classes.sectionHead}><h2 className={classes.sectionTitle}>{t('settings.pinned')}</h2></div>
          <div className={classes.panel}>
            {pinned.length === 0
              ? <p className={classes.empty}>{t('settings.noPins')}</p>
              : pinned.map(project => <div key={project.id} className={classes.pinnedRow}>
                <span className={classes.pinnedName}>{project.config.name}</span>
                <LoomButton variant="ghost" size="sm" onClick={() => onUnpin(project.id)}>{t('settings.unpin')}</LoomButton>
              </div>)}
          </div>
        </section>
      </div>
    </div>
  </main>
}
