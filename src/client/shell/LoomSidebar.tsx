/** Loom left sidebar: pinned projects, project tree and the session lists. */
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { CatalogSnapshot, ProjectRecord, TaskRecord, VersionRecord } from 'dsh-workloom/types'
import type { CSSProperties } from 'react'
import { Button, IconPinFillRegular, IconPlusOutlineRegular } from '../ui/primitives.ts'
import { COLORS } from '../ui/tokens.ts'
import { metaLine, select } from '../ui/styles.ts'
import type { LoomKey } from '../shared/locales.ts'
import type { ActiveSession, RecentSession } from '../shared/projection.ts'
import { ProjectItem } from './ProjectTree.tsx'
import { SidebarSectionToggle, SidebarSessionRow } from './LoomSidebarParts.tsx'

type Translate = (key: LoomKey, params?: Readonly<Record<string, string>>) => string
type SectionId = 'pinned' | 'projects' | 'sessions'

/** Inputs for the Loom sidebar. */
export interface LoomSidebarProps {
  readonly className: string
  /** Inline width from the sidebar splitter; the CSS width is the fallback. */
  readonly style?: CSSProperties | undefined
  readonly t: Translate
  readonly snapshot: CatalogSnapshot | undefined
  readonly project: ProjectRecord['id'] | undefined
  readonly version: VersionRecord['id'] | undefined
  readonly task: TaskRecord | undefined
  readonly pinnedProjects: readonly ProjectRecord['id'][]
  readonly collapsedSections: ReadonlySet<SectionId>
  readonly expandedProjects: ReadonlySet<string>
  readonly expandedVersions: ReadonlySet<string>
  readonly search: string
  readonly taskSessionList: readonly RecentSession[]
  readonly temporarySessionList: readonly RecentSession[]
  readonly taskProjectBySession: ReadonlyMap<string, string>
  readonly taskTitleBySession: ReadonlyMap<string, string>
  readonly temporaryProjectBySession: ReadonlyMap<string, string>
  readonly boundRows: readonly ActiveSession[]
  readonly selected: SessionId | undefined
  readonly sessionLimit: number
  readonly createDisabledTask: boolean
  readonly onToggleSection: (id: SectionId) => void
  readonly onSearch: (value: string) => void
  readonly onProject: (project: ProjectRecord) => void
  readonly onVersion: (project: ProjectRecord, version: VersionRecord) => void
  readonly onTask: (task: TaskRecord) => void
  readonly onPin: (project: ProjectRecord) => void
  readonly onNewVersion: (project: ProjectRecord) => void
  readonly onEditProject: (project: ProjectRecord) => void
  readonly onDeleteProject: (project: ProjectRecord) => void
  readonly onEditVersion: (project: ProjectRecord, version: VersionRecord) => void
  readonly onDeleteVersion: (project: ProjectRecord, version: VersionRecord) => void
  readonly onNewTask: (project: ProjectRecord, version: VersionRecord) => void
  readonly onEditTask: (project: ProjectRecord, task: TaskRecord) => void
  readonly onDeleteTask: (project: ProjectRecord, task: TaskRecord) => void
  readonly onSelectSession: (sessionId: string, owner?: TaskRecord) => void
  readonly onCreateProject: () => void
  readonly onCreateTask: () => void
  readonly onOpenTemporary: () => void
}

/**
 * Render the Loom left sidebar.
 * @param props - catalog, selection, session rows and navigation intents.
 * @returns the sidebar aside.
 */
export function LoomSidebar({ className, t, snapshot, project, version, task, pinnedProjects, collapsedSections, expandedProjects, expandedVersions, search, taskSessionList, temporarySessionList, taskProjectBySession, taskTitleBySession, temporaryProjectBySession, boundRows, selected, sessionLimit, createDisabledTask, onToggleSection, onSearch, onProject, onVersion, onTask, onPin, onNewVersion, onEditProject, onDeleteProject, onEditVersion, onDeleteVersion, onNewTask, onEditTask, onDeleteTask, onSelectSession, onCreateProject, onCreateTask, onOpenTemporary , style}: LoomSidebarProps): JSX.Element {
  const projects = snapshot?.projects ?? []
  const pinned = projects.filter(candidate => pinnedProjects.includes(candidate.id))
  const versionsOf = (candidate: ProjectRecord): readonly VersionRecord[] => (snapshot?.versions ?? []).filter(item => item.projectId === candidate.id)
  const projectItem = (candidate: ProjectRecord, isPinned: boolean): JSX.Element => <ProjectItem
    key={candidate.id}
    candidate={candidate}
    versions={versionsOf(candidate)}
    tasks={snapshot?.tasks ?? []}
    activeProject={project === candidate.id}
    activeVersionId={task === undefined ? version : undefined}
    activeTaskId={task?.id}
    open={expandedProjects.has(candidate.id)}
    openVersions={expandedVersions}
    pinned={isPinned}
    t={t}
    onProject={() => onProject(candidate)}
    onVersion={item => onVersion(candidate, item)}
    onTask={onTask}
    onPin={() => onPin(candidate)}
    onNewVersion={() => onNewVersion(candidate)}
    onEditProject={() => onEditProject(candidate)}
    onDeleteProject={() => onDeleteProject(candidate)}
    onEditVersion={item => onEditVersion(candidate, item)}
    onDeleteVersion={item => onDeleteVersion(candidate, item)}
    onNewTask={item => onNewTask(candidate, item)}
    onEditTask={item => onEditTask(candidate, item)}
    onDeleteTask={item => onDeleteTask(candidate, item)}
  />
  return <aside className={`loom-sidebar ${className}`} style={style}>
    <section style={{ marginBottom: 4 }}>
      <SidebarSectionToggle label={t('side.pinned')} icon={<IconPinFillRegular size={12} />} open={!collapsedSections.has('pinned')} onToggle={() => onToggleSection('pinned')} />
      {!collapsedSections.has('pinned') && <>
        {pinned.length === 0 && <p style={{ ...metaLine, padding: '2px 14px 6px' }}>{t('side.pinHint')}</p>}
        {pinned.map(candidate => projectItem(candidate, true))}
      </>}
    </section>
    <section style={{ marginBottom: 4 }}>
      <SidebarSectionToggle label={t('side.projects')} count={String(projects.length)} open={!collapsedSections.has('projects')} onToggle={() => onToggleSection('projects')} />
      {!collapsedSections.has('projects') && <>
        {projects.map(candidate => projectItem(candidate, pinnedProjects.includes(candidate.id)))}
        <Button variant="outline" icon={<IconPlusOutlineRegular />} onClick={onCreateProject} style={{ margin: '6px 12px', width: 'calc(100% - 24px)', justifyContent: 'center' }}>{t('side.newProject')}</Button>
      </>}
    </section>
    <section style={{ marginBottom: 4 }} aria-label={t('side.sessions')}>
      <SidebarSectionToggle label={t('side.sessions')} count={t('side.sessionLimit').replace('{limit}', String(sessionLimit))} open={!collapsedSections.has('sessions')} onToggle={() => onToggleSection('sessions')} />
      {!collapsedSections.has('sessions') && <>
        <input aria-label={t('searchSessions')} placeholder={t('searchSessions')} value={search} onChange={event => onSearch(event.target.value)} style={{ ...select, cursor: 'text', width: 'calc(100% - 24px)', margin: '4px 12px 6px', boxSizing: 'border-box' }} />
        {taskSessionList.length === 0 && temporarySessionList.length === 0 && <p style={{ ...metaLine, padding: '2px 14px 6px' }}>{t('side.empty')}</p>}
        {taskSessionList.length > 0 && <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, padding: '2px 12px 3px', ...metaLine }}>
          <span>{t('side.tasks')}</span><span style={{ marginLeft: 'auto' }}>{taskSessionList.length}</span>
        </div>}
        {taskSessionList.map(row => {
          const owner = boundRows.find(candidate => candidate.sessionId === row.id)?.task
          return <SidebarSessionRow key={row.id} t={t} row={row} projectName={taskProjectBySession.get(row.id)} taskTitle={taskTitleBySession.get(row.id)} temporary={false} active={selected === row.id} onSelect={() => onSelectSession(row.id, owner)} />
        })}
        {temporarySessionList.length > 0 && <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4, padding: '4px 12px 3px', borderTop: `0.5px solid ${COLORS.border}`, ...metaLine }}>
          <span>{t('side.temporarySessions')}</span><span style={{ marginLeft: 'auto' }}>{temporarySessionList.length}</span>
        </div>}
        {temporarySessionList.map(row => <SidebarSessionRow key={row.id} t={t} row={row} projectName={temporaryProjectBySession.get(row.id)} temporary active={selected === row.id} onSelect={() => onSelectSession(row.id)} />)}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '6px 12px 8px' }}>
          <Button variant="outline" icon={<IconPlusOutlineRegular />} disabled={createDisabledTask} onClick={onCreateTask} style={{ width: '100%', justifyContent: 'center' }}>{t('side.newTask')}</Button>
          <Button variant="ghost" icon={<IconPlusOutlineRegular />} title={t('temporary.title')} onClick={onOpenTemporary} style={{ width: '100%', justifyContent: 'center' }}>{t('side.newTemporary')}</Button>
        </div>
      </>}
    </section>
  </aside>
}
