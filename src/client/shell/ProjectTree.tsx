/** Project/version/task tree rows used by the Loom sidebar. */
import {
  IconEditOutlineRegular, IconFolderCloseRegular, IconFolderOpenRegular, IconPlusOutlineRegular,
  IconTrashOutlineRegular,
} from '../ui/primitives.ts'
import type { ProjectRecord, TaskRecord, VersionRecord } from 'dsh-workloom/types'
import { COLORS } from '../ui/tokens.ts'
import { metaLine } from '../ui/styles.ts'
import type { LoomKey } from '../shared/locales.ts'
import { PinButton, ProjectTaskRow, TreeIconAction, TreeRow, versionChip } from './LoomSidebarParts.tsx'

/** One project subtree with its versions and version tasks. */
export interface ProjectItemProps {
  readonly candidate: ProjectRecord
  readonly versions: readonly VersionRecord[]
  readonly tasks: readonly TaskRecord[]
  readonly activeProject: boolean
  readonly activeVersionId: VersionRecord['id'] | undefined
  readonly activeTaskId: TaskRecord['id'] | undefined
  readonly open: boolean
  readonly openVersions: ReadonlySet<string>
  readonly pinned: boolean
  readonly t: (key: LoomKey) => string
  readonly onProject: () => void
  readonly onVersion: (version: VersionRecord) => void
  readonly onTask: (task: TaskRecord) => void
  readonly onPin: () => void
  readonly onNewVersion: () => void
  readonly onEditProject: () => void
  readonly onDeleteProject: () => void
  readonly onEditVersion: (version: VersionRecord) => void
  readonly onDeleteVersion: (version: VersionRecord) => void
  readonly onNewTask: (version: VersionRecord) => void
  readonly onEditTask: (task: TaskRecord) => void
  readonly onDeleteTask: (task: TaskRecord) => void
}

/**
 * Render one project row with nested versions and tasks.
 * @param props - project records, active selection and row intents.
 * @returns the project subtree.
 */
export function ProjectItem({ candidate, versions, tasks, activeProject, activeVersionId, activeTaskId, open, openVersions, pinned, t, onProject, onVersion, onTask, onPin, onNewVersion, onEditProject, onDeleteProject, onEditVersion, onDeleteVersion, onNewTask, onEditTask, onDeleteTask }: ProjectItemProps): JSX.Element {
  return <div>
    <div className={activeProject ? 'loom-tree-row loom-tree-row-active' : 'loom-tree-row'} style={{ display: 'flex', alignItems: 'center', background: activeProject ? COLORS.panel3 : 'transparent' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <TreeRow depth={0} expanded={open} icon={open ? <IconFolderOpenRegular /> : <IconFolderCloseRegular />} label={candidate.config.name} title={candidate.config.name} active={activeProject} count={String(versions.length)} onClick={onProject} />
      </div>
      <span className="loom-row-actions" style={{ display: 'flex', alignItems: 'center', gap: 0, flex: 'none', alignSelf: 'stretch' }}>
        <TreeIconAction label={t('version.new')} icon={<IconPlusOutlineRegular size={13} />} onClick={onNewVersion} />
        <TreeIconAction label={t('project.edit')} icon={<IconEditOutlineRegular size={13} />} onClick={onEditProject} />
        <TreeIconAction label={t('project.delete')} icon={<IconTrashOutlineRegular size={13} />} onClick={onDeleteProject} danger />
        <PinButton pinned={pinned} label={pinned ? t('side.unpin') : t('side.pin')} onToggle={onPin} />
      </span>
    </div>
    {open && versions.map(item => {
      const versionTasks = tasks.filter(candidateTask => candidateTask.versionId === item.id)
      const openVersion = openVersions.has(item.id)
      return <div key={item.id}>
        <div className={activeVersionId === item.id ? 'loom-tree-row loom-tree-row-active' : 'loom-tree-row'} style={{ display: 'flex', alignItems: 'center', background: activeVersionId === item.id ? COLORS.panel3 : 'transparent' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <TreeRow depth={1} expanded={openVersion} label={<span style={versionChip}>{item.name}</span>} title={item.name} count={String(versionTasks.length)} active={activeVersionId === item.id} onClick={() => onVersion(item)} />
          </div>
          <span className="loom-row-actions" style={{ display: 'flex', alignItems: 'center', gap: 0, flex: 'none', alignSelf: 'stretch' }}>
            <TreeIconAction label={t('version.edit')} icon={<IconEditOutlineRegular size={13} />} onClick={() => onEditVersion(item)} />
            <TreeIconAction label={t('task.new')} icon={<IconPlusOutlineRegular size={13} />} onClick={() => onNewTask(item)} />
            <TreeIconAction label={t('version.delete')} icon={<IconTrashOutlineRegular size={13} />} onClick={() => onDeleteVersion(item)} danger />
          </span>
        </div>
        {openVersion && versionTasks.map(itemTask => <div key={itemTask.id} className={activeTaskId === itemTask.id ? 'loom-tree-row loom-tree-row-active' : 'loom-tree-row'} style={{ display: 'flex', alignItems: 'center', background: activeTaskId === itemTask.id ? COLORS.panel3 : 'transparent' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <ProjectTaskRow task={itemTask} active={activeTaskId === itemTask.id} t={t} onClick={() => onTask(itemTask)} />
          </div>
          <span className="loom-row-actions" style={{ display: 'flex', alignItems: 'center', gap: 0, flex: 'none', alignSelf: 'stretch' }}>
            <TreeIconAction label={t('task.edit')} icon={<IconEditOutlineRegular size={13} />} onClick={() => onEditTask(itemTask)} />
            <TreeIconAction label={t('task.delete')} icon={<IconTrashOutlineRegular size={13} />} onClick={() => onDeleteTask(itemTask)} danger />
          </span>
        </div>)}
        {openVersion && versionTasks.length === 0 && <p style={{ ...metaLine, padding: '2px 14px 2px 40px' }}>{t('task.empty')}</p>}
      </div>
    })}
  </div>
}
