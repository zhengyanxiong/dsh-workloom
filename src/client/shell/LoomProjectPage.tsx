/** Project route: one project's versions, workspaces, tasks and structure. */
import { IconBranchOutlineRegular, IconFolderOpenRegular, IconNewChatOutlineRegular, IconPlusOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { CatalogSnapshot, ProjectRecord, TaskRecord, VersionRecord } from 'dsh-workloom/types'
import { ACTOR_LABEL, AUDIT_LABEL, STATUS_META } from '../shell.ts'
import { LoomButton } from '../ui/Button.tsx'
import { LoomSelect } from '../ui/Select.tsx'
import { absoluteTime, relativeTime } from '../time.ts'
import type { LoomKey } from '../locales.ts'
import classes from './LoomProjectPage.module.css'

type Translate = (key: LoomKey, params?: Readonly<Record<string, string>>) => string

/** Project page inputs. */
export interface LoomProjectPageProps {
  readonly t: Translate
  readonly snapshot: CatalogSnapshot
  readonly project: ProjectRecord | undefined
  readonly version: VersionRecord | undefined
  readonly onProject: (project: ProjectRecord) => void
  readonly onVersion: (version: VersionRecord) => void
  readonly onTask: (task: TaskRecord) => void
  readonly onBoard: () => void
  readonly onNewTask: () => void
  readonly onNewVersion: () => void
  readonly onEditProject: () => void
  readonly onEditVersion: () => void
  readonly onSession: (sessionId: string) => void
}

/** One project-level counter shown in the top row. */
interface ProjectStat {
  readonly id: string
  readonly label: LoomKey
  readonly value: number
}

/** One current-version status bucket in the distribution strip. */
interface StatusBucket {
  readonly id: string
  readonly label: LoomKey
  readonly count: number
  readonly color: string
}

/** Sort key for a task timestamp; missing or unparsable values sort first. */
function updatedStamp(task: TaskRecord): number {
  const parsed = task.updatedAt === undefined ? Number.NaN : Date.parse(task.updatedAt)
  return Number.isNaN(parsed) ? 0 : parsed
}

/**
 * Render the project route.
 * @param props - catalog, selected project/version and navigation intents.
 * @returns the project page.
 */
export function LoomProjectPage({ t, snapshot, project, version, onProject, onVersion, onTask, onBoard, onNewTask, onNewVersion, onEditProject, onEditVersion, onSession }: LoomProjectPageProps): JSX.Element {
  const pageProject = project ?? snapshot.projects[0]
  if (pageProject === undefined) return <main className={classes.page}><div className={classes.inner}><p className={classes.empty}>{t('project.empty')}</p></div></main>
  const versions = snapshot.versions.filter(candidate => candidate.projectId === pageProject.id)
  const activeVersion = (version !== undefined && versions.some(candidate => candidate.id === version.id) ? version : versions.at(-1))
  const tasks = activeVersion === undefined ? [] : snapshot.tasks.filter(task => task.versionId === activeVersion.id)
  const workspaces = activeVersion === undefined ? [] : snapshot.workspaces.filter(workspace => workspace.versionId === activeVersion.id)
  const projectTasks = snapshot.tasks.filter(task => versions.some(candidate => candidate.id === task.versionId))
  const projectSessions = projectTasks.reduce((total, task) => total + task.attempts.reduce((sum, attempt) => sum + attempt.sessionIds.length, 0), 0)
  const projectRunning = projectTasks.filter(task => task.status === 'running').length
  const stats: readonly ProjectStat[] = [
    { id: 'subProjects', label: 'project.subProjects', value: pageProject.config.subProjects?.length ?? 0 },
    { id: 'versions', label: 'project.versions', value: versions.length },
    { id: 'tasks', label: 'nav.tasks', value: projectTasks.length },
    { id: 'running', label: 'kb.running', value: projectRunning },
    { id: 'sessions', label: 'sessions', value: projectSessions },
  ]
  const buckets: readonly StatusBucket[] = [
    { id: 'running', label: STATUS_META.running.key, count: tasks.filter(task => task.status === 'running').length, color: STATUS_META.running.color },
    { id: 'review', label: STATUS_META.review.key, count: tasks.filter(task => task.status === 'review').length, color: STATUS_META.review.color },
    { id: 'completed', label: STATUS_META.completed.key, count: tasks.filter(task => task.status === 'completed').length, color: STATUS_META.completed.color },
    { id: 'pending', label: STATUS_META.pending.key, count: tasks.filter(task => task.status === 'pending').length, color: STATUS_META.pending.color },
    { id: 'failed', label: STATUS_META.failed.key, count: tasks.filter(task => task.status === 'failed').length, color: STATUS_META.failed.color },
  ]
  const visibleBuckets = buckets.filter(bucket => bucket.count > 0)
  const distributionAria = `${t('project.taskDistribution')} · ${visibleBuckets.map(bucket => `${t(bucket.label)} ${String(bucket.count)}`).join(' · ')}`
  const recent = snapshot.audit.filter(entry => tasks.some(task => task.id === entry.taskId)).slice(-3).reverse()
  const sessionRows = [...projectTasks].sort((left, right) => updatedStamp(right) - updatedStamp(left)).flatMap(task => task.attempts.flatMap(attempt => attempt.sessionIds.map(sessionId => ({ sessionId, task, versionName: versions.find(candidate => candidate.id === task.versionId)?.name ?? '—' })))).slice(0, 6)
  return <main className={classes.page}>
    <div className={classes.inner}>
      <header className={classes.head}>
        <div className={classes.headText}>
          <p className={classes.eyebrow}>{t('project.title')} / {pageProject.config.name}</p>
          <div className={classes.titleLine}>
            <LoomSelect className={classes.projectSelect} ariaLabel={t('project.title')} value={pageProject.id} options={snapshot.projects.map(candidate => ({ value: candidate.id, label: candidate.config.name, description: candidate.config.sources[0]?.repo ?? undefined }))} onChange={value => { const next = snapshot.projects.find(candidate => candidate.id === value); if (next !== undefined) onProject(next) }} />
            <span className={classes.active}>● {t('project.active')}</span>
          </div>
          <p className={classes.summary}>{pageProject.config.sources.length} {t('source.repo')} · {pageProject.config.subProjects?.length ?? 0} {t('project.subProjects')} · {versions.length} {t('project.versions')} · {t('project.recentActivity')}</p>
        </div>
        <div className={classes.actions}>
          <LoomButton variant="secondary" size="md" onClick={onEditProject}>{t('project.edit')}</LoomButton>
          <LoomButton variant="secondary" size="md" onClick={onNewVersion}>{t('project.newVersion')}</LoomButton>
          <LoomButton variant="primary" size="md" icon={<IconPlusOutlineRegular size={14} />} onClick={onNewTask} disabled={activeVersion === undefined}>{t('top.newTask')}</LoomButton>
        </div>
      </header>
      <div className={classes.stats}>
        {stats.map(stat => <div key={stat.id} className={classes.stat} data-loom-hover="stat">
          <span className={classes.statLabel}>{t(stat.label)}</span>
          <span className={classes.statValue}>{String(stat.value)}</span>
        </div>)}
      </div>
      <section>
        <div className={classes.sectionHead}><h2 className={classes.sectionTitle}>{t('project.versions')}</h2><span className={classes.sectionHint}>{t('project.versionHint')}</span><button type="button" className={classes.sectionLink} onClick={onBoard}>{t('view.kanban')} →</button></div>
        <div className={classes.versions}>{versions.map(candidate => <button key={candidate.id} type="button" data-loom-hover="card" className={`${classes.version} ${candidate.id === activeVersion?.id ? classes.versionActive : ''}`} onClick={() => onVersion(candidate)}>
          <span className={classes.versionTop}><span className={classes.versionName}>{candidate.name}</span>{candidate.id === activeVersion?.id && <span className={classes.versionCurrent}>{t('project.currentVersion')}</span>}</span>
          <span className={classes.versionMeta}>{candidate.description ?? t('project.noDescription')}</span>
          <span className={classes.versionMeta}>{snapshot.tasks.filter(task => task.versionId === candidate.id).length} {t('nav.tasks')} · {snapshot.workspaces.filter(workspace => workspace.versionId === candidate.id).length} {t('project.workspaces')}</span>
        </button>)}{versions.length === 0 && <p className={classes.empty}>{t('project.noVersions')}</p>}</div>
      </section>
      <div className={classes.grid}>
        <div className={classes.main}>
          <section className={classes.card}>
            <div className={classes.versionHead}><h2 className={classes.versionTitle}>{activeVersion?.name ?? t('project.noVersion')}</h2><span className={classes.sectionHint}>{t('project.currentVersion')}</span><span className={classes.versionActions}><LoomButton variant="ghost" size="sm" onClick={onEditVersion} disabled={activeVersion === undefined}>{t('version.edit')}</LoomButton><LoomButton variant="ghost" size="sm" icon={<IconPlusOutlineRegular size={12} />} onClick={onNewTask} disabled={activeVersion === undefined}>{t('top.newTask')}</LoomButton></span></div>
            <p className={classes.description}>{activeVersion?.description ?? t('project.noDescription')}</p>
            <div className={classes.workspaceList}>{workspaces.map(workspace => <div key={workspace.id} className={classes.workspace}><span className={classes.workspaceName}>{workspace.label ?? workspace.id.slice(0, 8)}</span><span className={classes.workspacePath}>{workspace.rootPath ?? workspace.path ?? '—'}</span><span className={`${classes.workspaceStatus} ${workspace.preparation?.status === 'failed' ? classes.workspaceStatusFailed : workspace.preparation?.status === 'ready' ? '' : classes.workspaceStatusPending}`}><span className={classes.statusDot} style={{ background: workspace.preparation?.status === 'failed' ? 'var(--color-danger)' : workspace.preparation?.status === 'ready' ? 'var(--color-success)' : 'var(--color-warning)' }} />{workspace.preparation?.status === 'failed' ? t('project.workspaceGap') : workspace.preparation?.status === 'ready' ? t('project.ready') : t('project.workspacePending')}</span></div>)}{workspaces.length === 0 && <p className={classes.hint}>{t('project.noWorkspaces')}</p>}</div>
          </section>
          <section className={classes.card}>
            <div className={classes.sectionHead}><h2 className={classes.sectionTitle}>{t('nav.tasks')}</h2><span className={classes.sectionHint}>{tasks.length}</span><button type="button" className={classes.sectionLink} onClick={onBoard}>{t('view.kanban')} →</button></div>
            {tasks.length > 0 && <div className={classes.statusStrip} role="img" aria-label={distributionAria}>
              <div className={classes.statusBar} aria-hidden>{visibleBuckets.map(bucket => <span key={bucket.id} className={classes.statusSegment} style={{ width: `${String((bucket.count / Math.max(1, tasks.length)) * 100)}%`, background: bucket.color }} />)}</div>
              <div className={classes.statusLegend}>{visibleBuckets.map(bucket => <span key={bucket.id} className={classes.statusLegendItem}><span className={classes.statusLegendDot} style={{ background: bucket.color }} /><span>{t(bucket.label)}</span><span className={classes.statusLegendCount}>{String(bucket.count)}</span></span>)}</div>
            </div>}
            <table className={classes.table}><thead><tr><th className={classes.colTask}>{t('nav.tasks')}</th><th className={classes.colWorkspace}>{t('project.workspaces')}</th><th className={classes.colStatus}>{t('ctx.status')}</th><th className={classes.colUpdate}>{t('project.updated')}</th></tr></thead><tbody>{tasks.slice(0, 8).map(task => <tr key={task.id} className={classes.tableRow} onClick={() => onTask(task)}><td className={classes.taskTitle}>{task.title}</td><td>{workspaces.find(workspace => workspace.id === task.attempts.at(-1)?.workspaceId)?.label ?? '—'}</td><td><span className={classes.statusTag}><span className={classes.statusDot} style={{ background: STATUS_META[task.status].color }} />{t(STATUS_META[task.status].key)}</span></td><td style={{ textAlign: 'right' }}><time data-loom-time dateTime={absoluteTime(task.updatedAt)}>{relativeTime(task.updatedAt)}</time></td></tr>)}</tbody></table>
            {tasks.length === 0 && <p className={classes.hint}>{t('task.empty')}</p>}
          </section>
          <section className={classes.card}>
            <div className={classes.sectionHead}><h2 className={classes.sectionTitle}>{t('sessions')}</h2><span className={classes.sectionHint}>{sessionRows.length}</span></div>
            {sessionRows.length === 0
              ? <p className={classes.hint}>{t('noSessions')}</p>
              : <div className={classes.sessionList}>{sessionRows.map(row => <button key={row.sessionId} type="button" className={classes.sessionRow} data-loom-hover="row" onClick={() => onSession(row.sessionId)}>
                <span className={classes.sessionIcon}><IconNewChatOutlineRegular size={13} /></span>
                <span className={classes.sessionMain}><span className={classes.sessionTitle}>{row.task.title}</span><span className={classes.sessionMeta}>{row.versionName}</span></span>
                <span className={classes.sessionTime}>{relativeTime(row.task.updatedAt)}</span>
              </button>)}</div>}
          </section>
        </div>
        <aside className={classes.side}>
          <section className={classes.card}><div className={classes.sectionHead}><h2 className={classes.sectionTitle}>{t('project.structure')}</h2></div><div className={classes.structureTree}>
            <div className={classes.structureRoot}>
              <span className={classes.structureIcon}><IconFolderOpenRegular size={15} /></span>
              <span className={classes.structureBody}><span className={classes.structureName}>{pageProject.config.name}</span><span className={classes.structurePath}>{pageProject.config.sources[0]?.repo ?? t('source.repo')}</span></span>
              <span className={classes.structureTag}>{t('project.mainRepository')}</span>
            </div>
            {pageProject.config.subProjects !== undefined && pageProject.config.subProjects.length > 0 && <div className={classes.structureChildren}>{pageProject.config.subProjects.map(sub => <div key={sub.id} className={classes.structureChild}>
              <span className={classes.structureRail} aria-hidden />
              <span className={classes.structureIconSub}><IconBranchOutlineRegular size={13} /></span>
              <span className={classes.structureBody}><span className={classes.structureNameSub}>{sub.name}</span><span className={classes.structurePath}>{sub.sources.length} {t('source.repo')} · {sub.modules.length} {t('project.modules')}</span></span>
            </div>)}</div>}
            <div className={classes.structureFooter}>{pageProject.config.sources.length} {t('source.repo')} · {pageProject.config.modules.length} {t('project.modules')}</div>
          </div></section>
          <section className={classes.card}><div className={classes.sectionHead}><h2 className={classes.sectionTitle}>{t('project.info')}</h2></div><div className={classes.info}><div className={classes.infoRow}><span className={classes.infoLabel}>{t('project.modules')}</span><span className={classes.infoValue}>{pageProject.config.modules.length}</span></div><div className={classes.infoRow}><span className={classes.infoLabel}>{t('project.currentVersion')}</span><span className={classes.infoValue}>{activeVersion?.name ?? '—'}</span></div><div className={classes.infoRow}><span className={classes.infoLabel}>{t('project.subProjects')}</span><span className={classes.infoValue}>{pageProject.config.subProjects?.length ?? 0}</span></div></div></section>
          <section className={classes.card}><div className={classes.sectionHead}><h2 className={classes.sectionTitle}>{t('project.recentActivity')}</h2></div><div className={classes.activity}>{recent.map(entry => <div key={entry.id} className={classes.activityRow}><span className={classes.activityDot} /><span className={classes.activityText}>{t(AUDIT_LABEL[entry.event])} · {t(ACTOR_LABEL[entry.actor])}</span></div>)}{recent.length === 0 && <p className={classes.hint}>{t('bottom.activityEmpty')}</p>}</div></section>
        </aside>
      </div>
    </div>
  </main>
}
