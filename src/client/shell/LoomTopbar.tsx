/**
 * Loom top bar: brand, project/version context, fixed route navigation and actions.
 *
 * This is the S0 shell surface. Pages own their content; the top bar only
 * reports navigation and context intents.
 */
import type { RefObject } from 'react'
import {
  IconBranchOutlineRegular, IconChecklistOutlineRegular, IconDownloadOutlineRegular,
  IconFolderOpenRegular, IconInfoOutlineRegular, IconPanelLeftOutlineRegular, IconPlusOutlineRegular,
  IconProjectAddOutlineRegular, IconSettingsOutlineRegular, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { CatalogSnapshot, ProjectRecord, VersionRecord } from 'dsh-workloom/types'
import { LoomBrandMark } from '../LoomMark.tsx'
import { LoomButton } from '../ui/Button.tsx'
import { LoomSelect } from '../ui/Select.tsx'
import type { LoomKey } from '../locales.ts'
import { LOOM_ROUTES, type LoomRoute } from './router.ts'
import classes from './LoomTopbar.module.css'

type Translate = (key: LoomKey) => string

/** Shell-owned top bar state and callbacks. */
export interface LoomTopbarProps {
  readonly t: Translate
  readonly narrow: boolean
  readonly sidebarOpen: boolean
  readonly sidebarCollapsed: boolean
  readonly menuOpen: boolean
  readonly project: ProjectRecord['id'] | undefined
  readonly version: VersionRecord['id'] | undefined
  readonly snapshot: CatalogSnapshot | undefined
  readonly activeCount: number
  readonly route: LoomRoute
  readonly asideOpen: boolean
  readonly createDisabledVersion: boolean
  readonly createDisabledTask: boolean
  readonly newMenuRef: RefObject<HTMLDivElement>
  readonly onToggleSidebar: () => void
  readonly onToggleSidebarCollapsed: () => void
  readonly onToggleMenu: () => void
  readonly onSelectProject: (id: ProjectRecord['id'] | undefined) => void
  readonly onSelectVersion: (id: VersionRecord['id'] | undefined) => void
  readonly onNavigate: (route: LoomRoute) => void
  readonly onOpenCreate: (kind: 'project' | 'import' | 'version' | 'task') => void
  readonly onToggleAside: () => void
  readonly onOpenSettings: () => void
}

const ROUTE_LABEL: Readonly<Record<LoomRoute, LoomKey>> = {
  home: 'nav.overview',
  board: 'view.kanban',
  task: 'nav.tasks',
  session: 'sessions',
  project: 'nav.projects',
  settings: 'nav.settings',
}

/**
 * Render the Loom top bar.
 * @param props - presentation state and intent callbacks.
 * @returns the shell header.
 */
export function LoomTopbar(props: LoomTopbarProps): JSX.Element {
  const { t, narrow, sidebarOpen, sidebarCollapsed, menuOpen, project, version, snapshot, activeCount, route, asideOpen, createDisabledVersion, createDisabledTask, newMenuRef, onToggleSidebar, onToggleSidebarCollapsed, onToggleMenu, onSelectProject, onSelectVersion, onNavigate, onOpenCreate, onToggleAside, onOpenSettings } = props
  return <header className={`${classes.topbar} loom-topbar`}>
    {narrow && <LoomButton variant="ghost" size="sm" iconOnly icon={<IconFolderOpenRegular size={14} />} aria-label={t('side.projects')} aria-expanded={sidebarOpen} onClick={onToggleSidebar} />}
    <span className={classes.brand}>
      <LoomBrandMark size={22} />
      <span className={classes.brandName}>{t('brand')}</span>
    </span>
    <LoomButton className="loom-sidebar-toggle" variant="ghost" size="sm" iconOnly icon={<IconPanelLeftOutlineRegular size={14} />} aria-label={sidebarCollapsed ? t('side.expand') : t('side.collapse')} aria-pressed={sidebarCollapsed} title={sidebarCollapsed ? t('side.expand') : t('side.collapse')} onClick={onToggleSidebarCollapsed} />
    <span aria-hidden className={classes.divider} />
    <label className={classes.context}>
      <span className={classes.contextLabel}>{t('top.project')}</span>
      <LoomSelect
        className={`${classes.contextSelect} loom-top-select`}
        size="sm"
        variant="ghost"
        ariaLabel={t('top.project')}
        value={project ?? ''}
        options={[{ value: '', label: t('top.allProjects') }, ...(snapshot?.projects ?? []).map(candidate => ({ value: candidate.id, label: candidate.config.name }))]}
        onChange={value => onSelectProject(value === '' ? undefined : value as ProjectRecord['id'])}
      />
    </label>
    <label className={classes.context}>
      <span className={classes.contextLabel}>{t('top.version')}</span>
      <LoomSelect
        className={`${classes.contextSelect} loom-top-select`}
        size="sm"
        variant="ghost"
        ariaLabel={t('top.version')}
        value={version ?? ''}
        options={[{ value: '', label: t('top.allVersions') }, ...(snapshot?.versions ?? []).filter(candidate => project === undefined || candidate.projectId === project).map(candidate => ({ value: candidate.id, label: candidate.name }))]}
        onChange={value => onSelectVersion(value === '' ? undefined : value as VersionRecord['id'])}
      />
    </label>
    <span className={classes.nav} role="tablist" aria-label={t('nav.label')}>
      {LOOM_ROUTES.map(item => <button key={item} type="button" role="tab" aria-selected={route === item} className={`${classes.navItem} ${route === item ? classes.navItemActive : ''}`} onClick={() => onNavigate(item)}>{t(ROUTE_LABEL[item])}</button>)}
    </span>
    <span className={classes.spacer} />
    <span className={classes.activity} title={`${String(activeCount)} ${t('top.activeWorkspaces')}`}>
      <span className={classes.dot} />
      <span className={classes.activityCount}>{activeCount}</span>
      <span className={classes.activityLabel}>{t('top.activeWorkspaces')}</span>
    </span>
    <span aria-hidden className={classes.divider} />
    <div className={classes.actions}>
      <div className={classes.newWrap} ref={newMenuRef}>
        <LoomButton className="loom-top-new" variant="secondary" size="md" icon={<IconPlusOutlineRegular size={14} />} aria-haspopup="menu" aria-expanded={menuOpen} onClick={onToggleMenu}>{t('top.new')}</LoomButton>
        {menuOpen && <div role="menu" aria-label={t('top.new')} className={classes.menu}>
          <button type="button" role="menuitem" className={classes.menuItem} onClick={() => onOpenCreate('project')}>
            <span className={classes.menuIcon}><IconProjectAddOutlineRegular size={15} /></span>
            <span className={classes.menuText}><span className={classes.menuTitle}>{t('top.newProject')}</span><span className={classes.menuHint}>{t('top.newProjectHint')}</span></span>
          </button>
          <button type="button" role="menuitem" className={classes.menuItem} onClick={() => onOpenCreate('import')}>
            <span className={classes.menuIcon}><IconDownloadOutlineRegular size={14} /></span>
            <span className={classes.menuText}><span className={classes.menuTitle}>{t('project.import')}</span><span className={classes.menuHint}>{t('top.newImportHint')}</span></span>
          </button>
          <span className={classes.menuRule} />
          <button type="button" role="menuitem" className={classes.menuItem} disabled={createDisabledVersion} onClick={() => onOpenCreate('version')}>
            <span className={classes.menuIcon}><IconBranchOutlineRegular size={14} /></span>
            <span className={classes.menuText}><span className={classes.menuTitle}>{t('top.newVersion')}</span><span className={classes.menuHint}>{t('top.newVersionHint')}</span></span>
          </button>
          <button type="button" role="menuitem" className={classes.menuItem} disabled={createDisabledTask} onClick={() => onOpenCreate('task')}>
            <span className={classes.menuIcon}><IconChecklistOutlineRegular size={14} /></span>
            <span className={classes.menuText}><span className={classes.menuTitle}>{t('top.newTask')}</span><span className={classes.menuHint}>{t('top.newTaskHint')}</span></span>
          </button>
        </div>}
      </div>
      {(route === 'task' || route === 'session') && <Tooltip label={t('top.contextPanel')} side="bottom" delayMs={300}>
        <LoomButton variant="ghost" size="sm" iconOnly icon={<IconInfoOutlineRegular size={14} />} aria-label={t('top.contextPanel')} aria-pressed={asideOpen} onClick={onToggleAside} />
      </Tooltip>}
      <Tooltip label={t('top.settings')} side="bottom" delayMs={300}>
        <LoomButton variant="ghost" size="sm" iconOnly icon={<IconSettingsOutlineRegular size={14} />} aria-label={t('top.settings')} onClick={onOpenSettings} />
      </Tooltip>
    </div>
  </header>
}
