/**
 * Loom top bar: brand, project/version context, view switch and primary actions.
 *
 * The component is presentation-only; selection and creation intents are
 * lifted to the shell so routes can own navigation later.
 */
import type { CSSProperties, RefObject } from 'react'
import {
  IconBranchOutlineRegular, IconChecklistOutlineRegular, IconDownloadOutlineRegular,
  IconPanelLeftOutlineRegular, IconPlusOutlineRegular, IconProjectAddOutlineRegular,
  IconSettingsOutlineRegular, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { CatalogSnapshot, ProjectRecord, VersionRecord } from 'dsh-workloom/types'
import { LoomBrandMark } from '../LoomMark.tsx'
import { COLORS, metaLine } from '../shell.ts'
import type { LoomKey } from '../locales.ts'

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
  readonly view: 'workbench' | 'kanban'
  readonly overviewActive: boolean
  readonly asideOpen: boolean
  readonly createDisabledVersion: boolean
  readonly createDisabledTask: boolean
  readonly newMenuRef: RefObject<HTMLDivElement>
  readonly onToggleSidebar: () => void
  readonly onToggleSidebarCollapsed: () => void
  readonly onToggleMenu: () => void
  readonly onSelectProject: (id: ProjectRecord['id'] | undefined) => void
  readonly onSelectVersion: (id: VersionRecord['id'] | undefined) => void
  readonly onViewChange: (view: 'workbench' | 'kanban') => void
  readonly onOverview: () => void
  readonly onOpenCreate: (kind: 'project' | 'import' | 'version' | 'task') => void
  readonly onToggleAside: () => void
  readonly onOpenSettings: () => void
}

const topbar: CSSProperties = {
  display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 10, rowGap: 6, minHeight: 48, padding: '0 20px',
  background: COLORS.panel, borderBottom: `0.5px solid ${COLORS.border}`, flex: 'none', position: 'relative', zIndex: 20,
}
const topBrand: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 8, flex: 'none', fontWeight: 500, fontSize: 14, letterSpacing: '-.01em' }
const topDivider: CSSProperties = { width: 1, height: 18, background: COLORS.border, flex: 'none' }
const topContext: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 6px',
  border: '0.5px solid transparent', borderRadius: 6, background: 'transparent', color: COLORS.dim, whiteSpace: 'nowrap',
}
const topContextLabel: CSSProperties = { ...metaLine, fontSize: 10.5, flex: 'none' }
const topSelect: CSSProperties = { minWidth: 0, background: 'transparent', border: 'none', color: COLORS.text, font: 'inherit', fontSize: 12, cursor: 'pointer', padding: 0 }
const topActivity: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 9px', flex: 'none',
  border: '0.5px solid rgba(63, 185, 80, .22)', borderRadius: 999, background: 'rgba(63, 185, 80, .10)', color: COLORS.dim, fontSize: 11.5, whiteSpace: 'nowrap',
}
const topViewSwitch: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 2, height: 32, padding: 2, flex: 'none', border: `0.5px solid ${COLORS.border}`, borderRadius: 9, background: COLORS.panel3 }
const topViewButton: CSSProperties = { height: 26, padding: '0 12px', border: 'none', borderRadius: 6, background: 'transparent', color: COLORS.dim, cursor: 'pointer', font: 'inherit', fontSize: 11.5, fontWeight: 400 }
const topAction: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, padding: 0,
  border: `0.5px solid ${COLORS.border}`, borderColor: COLORS.border, borderRadius: 7, background: COLORS.panel, color: COLORS.dim, cursor: 'pointer',
}
const topActionActive: CSSProperties = { background: COLORS.panel3, borderColor: COLORS.borderStrong, color: COLORS.text }
const topNew: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, height: 30, padding: '0 10px',
  border: `0.5px solid ${COLORS.borderStrong}`, borderRadius: 7, background: COLORS.panel, color: COLORS.text, cursor: 'pointer', font: 'inherit', fontSize: 12, fontWeight: 500,
}
const topActions: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }
const topSpacer: CSSProperties = { flex: 1, minWidth: 8 }
const topMenu: CSSProperties = { position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 'min(268px, calc(100vw - 24px))', background: COLORS.panel, border: `0.5px solid ${COLORS.border}`, borderRadius: 10, padding: 6, display: 'flex', flexDirection: 'column', gap: 1, zIndex: 40, boxShadow: '0 14px 36px rgba(0, 0, 0, .24)' }
const menuItemNew: CSSProperties = { display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '7px 8px', border: 'none', borderRadius: 7, background: 'transparent', color: COLORS.text, cursor: 'pointer', font: 'inherit', textAlign: 'left' }
const menuItemIcon: CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, flex: 'none', color: COLORS.faint }
const menuItemText: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }
const menuItemTitle: CSSProperties = { fontSize: 12, lineHeight: 1.35, color: COLORS.text }
const menuItemDescription: CSSProperties = { fontSize: 10, lineHeight: 1.35, color: COLORS.faint }
const menuRule: CSSProperties = { height: 1, margin: '4px 3px', background: COLORS.border, flex: 'none' }

/**
 * Render the Loom top bar.
 * @param props - presentation state and intent callbacks.
 * @returns the shell header.
 */
export function LoomTopbar(props: LoomTopbarProps): JSX.Element {
  const { t, narrow, sidebarOpen, sidebarCollapsed, menuOpen, project, version, snapshot, activeCount, view, overviewActive, asideOpen, createDisabledVersion, createDisabledTask, newMenuRef, onToggleSidebar, onToggleSidebarCollapsed, onToggleMenu, onSelectProject, onSelectVersion, onViewChange, onOverview, onOpenCreate, onToggleAside, onOpenSettings } = props
  return <header className="loom-topbar" style={topbar}>
    {narrow && <button type="button" aria-label={t('side.projects')} aria-expanded={sidebarOpen} title={t('side.projects')} onClick={onToggleSidebar} style={{ ...topAction, width: 28, height: 28 }} className="loom-top-action"><IconProjectAddOutlineRegular size={14} /></button>}
    <span style={topBrand}>
      <LoomBrandMark size={22} />
      <span className="loom-brand-name">{t('brand')}</span>
    </span>
    <button type="button" className="loom-top-action loom-sidebar-toggle" aria-label={sidebarCollapsed ? t('side.expand') : t('side.collapse')} title={sidebarCollapsed ? t('side.expand') : t('side.collapse')} aria-pressed={sidebarCollapsed} onClick={onToggleSidebarCollapsed} style={{ ...topAction, width: 26, height: 26, marginLeft: 2 }}><IconPanelLeftOutlineRegular size={14} /></button>
    <span aria-hidden className="loom-top-divider" style={topDivider} />
    <label className="loom-top-context" style={topContext}>
      <span className="loom-top-label" style={topContextLabel}>{t('top.project')}</span>
      <select className="loom-top-select" aria-label={t('top.project')} value={project ?? ''} onChange={(event) => onSelectProject(event.target.value === '' ? undefined : event.target.value as ProjectRecord['id'])} style={topSelect}>
        <option value="">{t('top.allProjects')}</option>
        {(snapshot?.projects ?? []).map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.config.name}</option>)}
      </select>
    </label>
    <label className="loom-top-context" style={topContext}>
      <span className="loom-top-label" style={topContextLabel}>{t('top.version')}</span>
      <select className="loom-top-select" aria-label={t('top.version')} value={version ?? ''} onChange={(event) => onSelectVersion(event.target.value === '' ? undefined : event.target.value as VersionRecord['id'])} style={topSelect}>
        <option value="">{t('top.allVersions')}</option>
        {(snapshot?.versions ?? []).filter(candidate => project === undefined || candidate.projectId === project).map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
      </select>
    </label>
    <span className="loom-top-activity" style={topActivity} title={`${String(activeCount)} ${t('top.activeWorkspaces')}`}>
      <span aria-hidden style={{ width: 7, height: 7, borderRadius: 999, background: COLORS.green, boxShadow: '0 0 0 3px rgba(63,185,80,.14)', flex: 'none' }} />
      <span>{activeCount}</span>
      <span className="loom-top-activity-label">{t('top.activeWorkspaces')}</span>
    </span>
    <div className="loom-view-switch" style={topViewSwitch}>
      <button type="button" aria-pressed={overviewActive} onClick={onOverview} style={{ ...topViewButton, ...overviewActive ? { background: COLORS.panel, color: COLORS.text, fontWeight: 500, boxShadow: '0 1px 2px rgba(15,17,21,.08)' } : {} }}>{t('nav.overview')}</button>
      <button type="button" aria-pressed={view === 'workbench' && !overviewActive} onClick={() => onViewChange('workbench')} style={{ ...topViewButton, ...view === 'workbench' ? { background: COLORS.panel, color: COLORS.text, fontWeight: 500, boxShadow: '0 1px 2px rgba(15,17,21,.08)' } : {} }}>{t('workbench')}</button>
      <button type="button" aria-pressed={view === 'kanban'} onClick={() => onViewChange('kanban')} style={{ ...topViewButton, ...view === 'kanban' ? { background: COLORS.panel, color: COLORS.text, fontWeight: 500, boxShadow: '0 1px 2px rgba(15,17,21,.08)' } : {} }}>{t('view.kanban')}</button>
    </div>
    <span className="loom-top-spacer" style={topSpacer} />
    <div style={topActions}>
      <div ref={newMenuRef} style={{ position: 'relative' }}>
        <button type="button" className="loom-top-new" aria-label={t('top.new')} aria-haspopup="menu" aria-expanded={menuOpen} title={t('top.new')} onClick={onToggleMenu} style={topNew}><IconPlusOutlineRegular size={14} /><span className="loom-top-action-label">{t('top.new')}</span></button>
        {menuOpen && <div role="menu" aria-label={t('top.new')} style={topMenu}>
          <button type="button" role="menuitem" className="loom-new-item" style={menuItemNew} onClick={() => onOpenCreate('project')}>
            <span aria-hidden style={{ ...menuItemIcon, color: COLORS.accent }}><IconProjectAddOutlineRegular size={15} /></span>
            <span style={menuItemText}><span style={menuItemTitle}>{t('top.newProject')}</span><span style={menuItemDescription}>{t('top.newProjectHint')}</span></span>
          </button>
          <button type="button" role="menuitem" className="loom-new-item" style={menuItemNew} onClick={() => onOpenCreate('import')}>
            <span aria-hidden style={menuItemIcon}><IconDownloadOutlineRegular size={14} /></span>
            <span style={menuItemText}><span style={menuItemTitle}>{t('project.import')}</span><span style={menuItemDescription}>{t('top.newImportHint')}</span></span>
          </button>
          <span aria-hidden style={menuRule} />
          <button type="button" role="menuitem" className="loom-new-item" style={{ ...menuItemNew, opacity: createDisabledVersion ? .45 : 1 }} disabled={createDisabledVersion} onClick={() => onOpenCreate('version')}>
            <span aria-hidden style={menuItemIcon}><IconBranchOutlineRegular size={14} /></span>
            <span style={menuItemText}><span style={menuItemTitle}>{t('top.newVersion')}</span><span style={menuItemDescription}>{t('top.newVersionHint')}</span></span>
          </button>
          <button type="button" role="menuitem" className="loom-new-item" style={{ ...menuItemNew, opacity: createDisabledTask ? .45 : 1 }} disabled={createDisabledTask} onClick={() => onOpenCreate('task')}>
            <span aria-hidden style={menuItemIcon}><IconChecklistOutlineRegular size={14} /></span>
            <span style={menuItemText}><span style={menuItemTitle}>{t('top.newTask')}</span><span style={menuItemDescription}>{t('top.newTaskHint')}</span></span>
          </button>
        </div>}
      </div>
      <Tooltip label={t('ctx.project')} side="bottom" delayMs={300}>
        <button type="button" aria-label={t('ctx.project')} aria-pressed={asideOpen} onClick={onToggleAside} className={`loom-top-action loom-aside-toggle${view === 'kanban' ? ' loom-aside-toggle-kb' : ''}`} style={{ ...topAction, ...asideOpen ? topActionActive : {} }}><span aria-hidden style={{ display: 'inline-flex', transform: 'scaleX(-1)' }}><IconPanelLeftOutlineRegular size={14} /></span></button>
      </Tooltip>
      <Tooltip label={t('top.settings')} side="bottom" delayMs={300}>
        <button type="button" aria-label={t('top.settings')} onClick={onOpenSettings} className="loom-top-action" style={topAction}><IconSettingsOutlineRegular size={14} /></button>
      </Tooltip>
    </div>
  </header>
}
