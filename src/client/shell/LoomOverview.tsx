/**
 * Overview route: answer what is running, what needs review and what happened
 * recently using only committed catalog data.
 */
import { IconBranchOutlineRegular, IconFolderOpenRegular, IconPlusOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { CatalogSnapshot, ProjectRecord, TaskRecord } from 'dsh-workloom/types'
import { AUDIT_LABEL } from '../shell.ts'
import { LoomButton } from '../ui/Button.tsx'
import type { LoomKey } from '../locales.ts'
import classes from './LoomOverview.module.css'

type Translate = (key: LoomKey, params?: Readonly<Record<string, string>>) => string

/** Overview inputs and navigation intents. */
export interface LoomOverviewProps {
  readonly t: Translate
  readonly snapshot: CatalogSnapshot
  readonly activeWorkspaceCount: number
  readonly onTask: (task: TaskRecord) => void
  readonly onProject: (project: ProjectRecord) => void
  readonly onSession: (sessionId: string) => void
  readonly onBoard: () => void
  readonly onNewTask: () => void
}

/**
 * Render the overview route.
 * @param props - catalog snapshot and navigation intents.
 * @returns the overview page.
 */
export function LoomOverview({ t, snapshot, activeWorkspaceCount, onTask, onProject, onSession, onBoard, onNewTask }: LoomOverviewProps): JSX.Element {
  const running = snapshot.tasks.filter(task => task.status === 'running')
  const review = snapshot.tasks.filter(task => task.status === 'review')
  const completed = snapshot.tasks.filter(task => task.status === 'completed')
  const active = [...running, ...review].sort((left, right) => Number(right.updatedAt ?? 0) - Number(left.updatedAt ?? 0)).slice(0, 3)
  const projectById = new Map(snapshot.projects.map(project => [project.id, project]))
  const recentSessions = snapshot.tasks
    .flatMap(task => (task.attempts.at(-1)?.sessionIds ?? []).map(sessionId => ({ sessionId, task })))
    .slice(-4)
    .reverse()
  const recentAudit = snapshot.audit.slice(-4).reverse()
  const recentCompleted = completed.slice(-3).reverse()
  const date = new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', weekday: 'short' })
  const sessionCount = snapshot.tasks.reduce((total, task) => total + task.attempts.reduce((sum, attempt) => sum + attempt.sessionIds.length, 0), 0)
  const projectName = (task: TaskRecord): string => {
    const projectId = snapshot.versions.find(version => version.id === task.versionId)?.projectId
    return projectId === undefined ? '' : projectById.get(projectId)?.config.name ?? ''
  }
  return <main className={classes.page}>
    <div className={classes.inner}>
      <div className={classes.head}>
        <div className={classes.headText}>
          <p className={classes.eyebrow}>{t('nav.overview')}</p>
          <h1 className={classes.title}>{t('overview.title')}</h1>
          <p className={classes.summary}>{activeWorkspaceCount} {t('top.activeWorkspaces')} · {snapshot.projects.length} {t('project.title')} · {sessionCount} {t('sessions')}</p>
        </div>
        <div className={classes.headMeta}>
          <span className={classes.date}>{date}</span>
          <LoomButton variant="primary" size="md" icon={<IconPlusOutlineRegular size={14} />} onClick={onNewTask}>{t('top.newTask')}</LoomButton>
        </div>
      </div>
      <div className={classes.stats}>
        <button type="button" className={classes.stat} onClick={onBoard}><span className={classes.statValue}>{running.length}</span><span className={classes.statLabel}>{t('kb.running')} {t('nav.tasks')}</span></button>
        <button type="button" className={classes.stat}><span className={classes.statValue}>{sessionCount}</span><span className={classes.statLabel}>{t('kb.activeSessions')}</span></button>
        <button type="button" className={classes.stat} onClick={onBoard}><span className={classes.statValue}>{review.length}</span><span className={classes.statLabel}>{t('kb.review')}</span></button>
        <button type="button" className={classes.stat} onClick={onBoard}><span className={classes.statValue}>{completed.length}</span><span className={classes.statLabel}>{t('kb.completed')}</span></button>
      </div>
      <div className={classes.columns}>
        <div className={classes.left}>
          <section className={classes.card}>
            <div className={classes.cardHead}><h2 className={classes.cardTitle}>{t('kb.running')} {t('nav.tasks')}</h2><button type="button" className={classes.cardLink} onClick={onBoard}>{t('view.kanban')} →</button></div>
            {active.length === 0 ? <p className={classes.empty}>{t('task.empty')}</p> : active.map(task => <button key={task.id} type="button" className={classes.row} onClick={() => onTask(task)}>
              <span className={classes.dot} style={{ background: task.status === 'running' ? 'var(--color-warning)' : 'var(--color-accent)' }} />
              <span className={classes.rowTitle}>{task.title}</span>
              <span className={classes.rowMeta}>{task.status === 'running' ? t('kb.running') : t('kb.review')}</span>
            </button>)}
          </section>
          <section className={classes.card}>
            <div className={classes.cardHead}><h2 className={classes.cardTitle}>{t('project.title')}</h2><button type="button" className={classes.cardLink} onClick={onBoard}>{t('view.all')} →</button></div>
            {snapshot.projects.length === 0 ? <p className={classes.empty}>{t('project.empty')}</p> : <div className={classes.projects}>
              {snapshot.projects.slice(0, 3).map(project => {
                const projectTasks = snapshot.tasks.filter(task => task.versionId !== undefined && snapshot.versions.find(version => version.id === task.versionId)?.projectId === project.id)
                return <button key={project.id} type="button" className={classes.project} onClick={() => onProject(project)}>
                  <span className={classes.projectHead}><span className={classes.projectMark}>{project.config.name.slice(0, 1)}</span><span className={classes.projectName}>{project.config.name}</span></span>
                  <span className={classes.projectMeta}>{projectTasks.length} {t('nav.tasks')} · {project.config.sources.length} {t('source.repo')}</span>
                </button>
              })}
            </div>}
          </section>
          <section className={classes.card}>
            <div className={classes.cardHead}><h2 className={classes.cardTitle}>{t('overview.recentCompleted')}</h2><button type="button" className={classes.cardLink} onClick={onBoard}>{t('view.kanban')} →</button></div>
            {recentCompleted.length === 0 ? <p className={classes.empty}>{t('task.empty')}</p> : <div className={classes.sectionGrid}>{recentCompleted.map(task => <button key={task.id} type="button" className={classes.sectionItem} onClick={() => onTask(task)}><span className={classes.sectionItemTitle}>{task.title}</span><span className={classes.sectionItemMeta}>{t('kb.completed')}</span></button>)}</div>}
          </section>
        </div>
        <div className={classes.right}>
          <section className={classes.card}>
            <div className={classes.cardHead}><h2 className={classes.cardTitle}>{t('sessions')}</h2></div>
            {recentSessions.length === 0 ? <p className={classes.empty}>{t('noSessions')}</p> : recentSessions.map(({ sessionId, task }) => <button key={`${sessionId}-${task.id}`} type="button" className={classes.row} onClick={() => onSession(sessionId)}>
              <IconBranchOutlineRegular size={12} />
              <span className={classes.rowTitle}>{task.title}</span>
              <span className={classes.rowMeta}>{projectName(task)}</span>
            </button>)}
          </section>
          <section className={classes.card}>
            <div className={classes.cardHead}><h2 className={classes.cardTitle}>{t('audit')}</h2><span className={classes.rowMeta}>{date}</span></div>
            {recentAudit.length === 0 ? <p className={classes.empty}>{t('bottom.activityEmpty')}</p> : recentAudit.map(entry => <div key={entry.id} className={classes.row}>
              <span className={classes.rowMeta}>{new Date(entry.at).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' })}</span>
              <span className={classes.rowTitle}>{t(AUDIT_LABEL[entry.event])}</span>
            </div>)}
          </section>
          <section className={classes.card}>
            <div className={classes.cardHead}><h2 className={classes.cardTitle}>{t('project.title')}</h2><IconFolderOpenRegular size={12} /></div>
            {snapshot.projects.length === 0 ? <p className={classes.empty}>{t('project.empty')}</p> : snapshot.projects.slice(0, 3).map(project => <button key={project.id} type="button" className={classes.row} onClick={() => onProject(project)}><span className={classes.rowTitle}>{project.config.name}</span><span className={classes.rowMeta}>{project.config.sources.length} {t('source.repo')}</span></button>)}
          </section>
        </div>
      </div>
    </div>
  </main>
}
