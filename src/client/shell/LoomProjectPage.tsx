/** Project route: one project's versions, workspaces, tasks and structure. */
import { IconBranchOutlineRegular, IconFolderOpenRegular, IconPlusOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { CatalogSnapshot, ProjectRecord, TaskRecord, VersionRecord } from 'dsh-workloom/types'
import { ACTOR_LABEL, AUDIT_LABEL, STATUS_META } from '../shell.ts'
import { LoomButton } from '../ui/Button.tsx'
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
}

/**
 * Render the project route.
 * @param props - catalog, selected project/version and navigation intents.
 * @returns the project page.
 */
export function LoomProjectPage({ t, snapshot, project, version, onProject, onVersion, onTask, onBoard, onNewTask, onNewVersion, onEditProject }: LoomProjectPageProps): JSX.Element {
  const pageProject = project ?? snapshot.projects[0]
  if (pageProject === undefined) return <main className={classes.page}><div className={classes.inner}><p className={classes.empty}>{t('project.empty')}</p></div></main>
  const versions = snapshot.versions.filter(candidate => candidate.projectId === pageProject.id)
  const activeVersion = (version !== undefined && versions.some(candidate => candidate.id === version.id) ? version : versions.at(-1))
  const tasks = activeVersion === undefined ? [] : snapshot.tasks.filter(task => task.versionId === activeVersion.id)
  const workspaces = activeVersion === undefined ? [] : snapshot.workspaces.filter(workspace => workspace.versionId === activeVersion.id)
  const sessions = tasks.reduce((total, task) => total + task.attempts.reduce((sum, attempt) => sum + attempt.sessionIds.length, 0), 0)
  const running = tasks.filter(task => task.status === 'running').length
  const review = tasks.filter(task => task.status === 'review').length
  const completed = tasks.filter(task => task.status === 'completed').length
  const pending = tasks.filter(task => task.status === 'pending').length
  const totalStatus = Math.max(1, running + review + completed + pending + tasks.filter(task => task.status === 'failed').length)
  const statusRows = [
    { label: t('kb.running'), count: running, color: 'var(--color-warning)' },
    { label: t('kb.review'), count: review, color: 'var(--color-danger)' },
    { label: t('kb.completed'), count: completed, color: 'var(--color-success)' },
    { label: t('kb.queued'), count: pending, color: 'var(--color-muted)' },
  ]
  const recent = snapshot.audit.filter(entry => tasks.some(task => task.id === entry.taskId)).slice(-3).reverse()
  const projectTaskIds = new Set(snapshot.tasks.filter(task => versions.some(candidate => candidate.id === task.versionId)).map(task => task.id))
  return <main className={classes.page}>
    <div className={classes.inner}>
      <header className={classes.head}>
        <div className={classes.headText}>
          <p className={classes.eyebrow}>{t('project.title')} / {pageProject.config.name}</p>
          <div className={classes.titleLine}>
            <select className={classes.projectSelect} aria-label={t('project.title')} value={pageProject.id} onChange={event => { const next = snapshot.projects.find(candidate => candidate.id === event.target.value); if (next !== undefined) onProject(next) }}>
              {snapshot.projects.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.config.name}</option>)}
            </select>
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
        <div className={classes.metricCard} data-loom-hover="stat"><div className={classes.metricTop}><span className={classes.metricDot} style={{ background: 'var(--color-accent)' }} /><span>{t('project.versions')}</span></div><span className={classes.metricValue}>{versions.length}</span><span className={classes.metricHint}>{t('project.versionHint')}</span><div className={classes.metricTrack}><div className={classes.metricFill} style={{ width: `${String(Math.min(100, versions.length * 24 + 8))}%` }} /></div></div>
        <div className={classes.metricCard} data-loom-hover="stat"><div className={classes.metricTop}><span className={classes.metricDot} style={{ background: 'var(--color-ink-3)' }} /><span>{t('nav.tasks')}</span></div><span className={classes.metricValue}>{[...projectTaskIds].length}</span><span className={classes.metricHint}>{tasks.length} {t('project.currentVersion')}</span><div className={classes.metricTrack}><div className={classes.metricFill} style={{ width: `${String(Math.min(100, [...projectTaskIds].length * 14 + 8))}%` }} /></div></div>
        <div className={classes.metricCard} data-loom-hover="stat"><div className={classes.metricTop}><span className={classes.metricDot} style={{ background: 'var(--color-warning)' }} /><span>{t('kb.running')}</span></div><span className={classes.metricValue}>{running}</span><span className={classes.metricHint}>{t('project.activeWork')}</span><div className={classes.metricTrack}><div className={classes.metricFill} style={{ width: `${String(Math.round((running / totalStatus) * 100))}%` }} /></div></div>
        <div className={classes.metricCard} data-loom-hover="stat"><div className={classes.metricTop}><span className={classes.metricDot} style={{ background: 'var(--color-danger)' }} /><span>{t('kb.review')}</span></div><span className={classes.metricValue}>{review}</span><span className={classes.metricHint}>{t('project.awaitingAcceptance')}</span><div className={classes.metricTrack}><div className={classes.metricFill} style={{ width: `${String(Math.round((review / totalStatus) * 100))}%` }} /></div></div>
        <div className={classes.metricCard} data-loom-hover="stat"><div className={classes.metricTop}><span className={classes.metricDot} style={{ background: 'var(--color-success)' }} /><span>{t('sessions')}</span></div><span className={classes.metricValue}>{sessions}</span><span className={classes.metricHint}>{t('project.attachedSessions')}</span><div className={classes.metricTrack}><div className={classes.metricFill} style={{ width: `${String(Math.min(100, sessions * 12 + 5))}%` }} /></div></div>
      </div>
      <section>
        <div className={classes.sectionHead}><h2 className={classes.sectionTitle}>{t('project.versions')}</h2><span className={classes.sectionHint}>{t('project.versionHint')}</span><button type="button" className={classes.sectionLink} onClick={onBoard}>{t('view.kanban')} →</button></div>
        <div className={classes.versions}>{versions.map(candidate => <button key={candidate.id} type="button" className={`${classes.version} ${candidate.id === activeVersion?.id ? classes.versionActive : ''}`} onClick={() => onVersion(candidate)}>
          <span className={classes.versionName}>{candidate.name}</span>
          <span className={classes.versionMeta}>{candidate.description ?? t('project.noDescription')}</span>
          <span className={classes.versionMeta}>{snapshot.tasks.filter(task => task.versionId === candidate.id).length} {t('nav.tasks')} · {snapshot.workspaces.filter(workspace => workspace.versionId === candidate.id).length} {t('project.workspaces')}</span>
        </button>)}{versions.length === 0 && <p className={classes.empty}>{t('project.noVersions')}</p>}</div>
      </section>
      <section className={classes.card}>
        <div className={classes.sectionHead}><h2 className={classes.sectionTitle}>{t('project.taskDistribution')}</h2><span className={classes.sectionHint}>{tasks.length} {t('nav.tasks')}</span></div>
        <div className={classes.distribution}>
          <div className={classes.distributionBar}>{statusRows.map(row => row.count === 0 ? null : <span key={row.label} className={classes.distributionSegment} style={{ width: `${String((row.count / totalStatus) * 100)}%`, background: row.color }} title={`${row.label} ${String(row.count)}`} />)}</div>
          <div className={classes.distributionLegend}>{statusRows.map(row => <span key={row.label} className={classes.legendItem}><span className={classes.legendDot} style={{ background: row.color }} />{row.label} <b>{String(row.count)}</b></span>)}</div>
        </div>
      </section>
      <div className={classes.grid}>
        <div className={classes.main}>
          <section className={classes.card}>
            <div className={classes.versionHead}><h2 className={classes.versionTitle}>{activeVersion?.name ?? t('project.noVersion')}</h2><span className={classes.sectionHint}>{t('project.currentVersion')}</span><span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}><LoomButton variant="ghost" size="sm" onClick={onEditProject}>{t('project.edit')}</LoomButton><LoomButton variant="ghost" size="sm" icon={<IconPlusOutlineRegular size={12} />} onClick={onNewTask} disabled={activeVersion === undefined}>{t('top.newTask')}</LoomButton></span></div>
            <p className={classes.description}>{activeVersion?.description ?? t('project.noDescription')}</p>
            <div className={classes.workspaceList}>{workspaces.map(workspace => <div key={workspace.id} className={classes.workspace}><span className={classes.workspaceName}>{workspace.label ?? workspace.id.slice(0, 8)}</span><span className={classes.workspacePath}>{workspace.rootPath ?? workspace.path ?? '—'}</span><span className={`${classes.workspaceStatus} ${workspace.preparation?.status === 'failed' ? classes.workspaceStatusFailed : workspace.preparation?.status === 'ready' ? '' : classes.workspaceStatusPending}`}><span className={classes.statusDot} style={{ background: workspace.preparation?.status === 'failed' ? 'var(--color-danger)' : workspace.preparation?.status === 'ready' ? 'var(--color-success)' : 'var(--color-warning)' }} />{workspace.preparation?.status === 'failed' ? t('project.workspaceGap') : workspace.preparation?.status === 'ready' ? t('project.ready') : t('project.workspacePending')}</span></div>)}{workspaces.length === 0 && <p className={classes.hint}>{t('project.noWorkspaces')}</p>}</div>
          </section>
          <section className={classes.card}>
            <div className={classes.sectionHead}><h2 className={classes.sectionTitle}>{t('nav.tasks')}</h2><span className={classes.sectionHint}>{tasks.length}</span><button type="button" className={classes.sectionLink} onClick={onBoard}>{t('view.kanban')} →</button></div>
            <table className={classes.table}><thead><tr><th className={classes.colTask}>{t('nav.tasks')}</th><th className={classes.colWorkspace}>{t('project.workspaces')}</th><th className={classes.colStatus}>{t('ctx.status')}</th><th className={classes.colUpdate}>{t('project.updated')}</th></tr></thead><tbody>{tasks.slice(0, 8).map(task => <tr key={task.id} className={classes.tableRow} onClick={() => onTask(task)}><td className={classes.taskTitle}>{task.title}</td><td>{workspaces.find(workspace => workspace.id === task.attempts.at(-1)?.workspaceId)?.label ?? '—'}</td><td><span className={classes.statusTag}><span className={classes.statusDot} style={{ background: STATUS_META[task.status].color }} />{t(STATUS_META[task.status].key)}</span></td><td style={{ textAlign: 'right' }}><time data-loom-time dateTime={absoluteTime(task.updatedAt)}>{relativeTime(task.updatedAt)}</time></td></tr>)}</tbody></table>
            {tasks.length === 0 && <p className={classes.hint}>{t('task.empty')}</p>}
          </section>
        </div>
        <aside className={classes.side}>
          <section className={classes.card}><div className={classes.sectionHead}><h2 className={classes.sectionTitle}>{t('project.structure')}</h2></div><div className={classes.structure}><div className={classes.structureNode}><IconFolderOpenRegular size={12} />{pageProject.config.name}</div>{pageProject.config.subProjects?.map(sub => <div key={sub.id} className={`${classes.structureNode} ${classes.structureNodeSub}`}><IconBranchOutlineRegular size={11} />{sub.name}</div>)}</div></section>
          <section className={classes.card}><div className={classes.sectionHead}><h2 className={classes.sectionTitle}>{t('project.info')}</h2></div><div className={classes.info}><div className={classes.infoRow}><span className={classes.infoLabel}>{t('project.modules')}</span><span className={classes.infoValue}>{pageProject.config.modules.length}</span></div><div className={classes.infoRow}><span className={classes.infoLabel}>{t('project.currentVersion')}</span><span className={classes.infoValue}>{activeVersion?.name ?? '—'}</span></div><div className={classes.infoRow}><span className={classes.infoLabel}>{t('project.subProjects')}</span><span className={classes.infoValue}>{pageProject.config.subProjects?.length ?? 0}</span></div></div></section>
          <section className={classes.card}><div className={classes.sectionHead}><h2 className={classes.sectionTitle}>{t('project.recentActivity')}</h2></div><div className={classes.activity}>{recent.map(entry => <div key={entry.id} className={classes.activityRow}><span className={classes.activityDot} /><span className={classes.activityText}>{t(AUDIT_LABEL[entry.event])} · {t(ACTOR_LABEL[entry.actor])}</span></div>)}{recent.length === 0 && <p className={classes.hint}>{t('bottom.activityEmpty')}</p>}</div></section>
        </aside>
      </div>
    </div>
  </main>
}
