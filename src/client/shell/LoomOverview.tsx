/**
 * Overview route: answer what is running, what needs review and what happened
 * recently using only committed catalog data.
 */
import { IconBranchOutlineRegular, IconCheckOutlineRegular, IconPlusOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
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
  const versionName = (task: TaskRecord): string => snapshot.versions.find(version => version.id === task.versionId)?.name ?? ''
  const timeAgo = (timestamp: number | undefined): string => {
    if (timestamp === undefined || !Number.isFinite(timestamp)) return ''
    const millis = timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp
    const minutes = Math.max(0, Math.round((Date.now() - millis) / 60000))
    if (minutes < 1) return 'now'
    if (minutes < 60) return `${String(minutes)}m`
    const hours = Math.round(minutes / 60)
    return hours < 24 ? `${String(hours)}h` : `${String(Math.round(hours / 24))}d`
  }
  const waiting = snapshot.tasks.filter(task => task.status === 'pending').length
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const timedCompleted = completed.filter(task => {
    const raw = Number(task.updatedAt)
    if (!Number.isFinite(raw)) return false
    const millis = raw < 1_000_000_000_000 ? raw * 1000 : raw
    return millis > weekAgo
  })
  const completedThisWeek = timedCompleted.length > 0 ? timedCompleted.length : completed.length
  const sourceName = (project: ProjectRecord): string => {
    const source = project.config.sources[0]
    if (source === undefined) return t('source.repo')
    return source.repo.split(/[\\/]/u).filter(Boolean).at(-1) ?? source.repo
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
        <button type="button" className={classes.stat} onClick={onBoard}><span className={classes.statTop}><span className={classes.statDot} style={{ background: 'var(--color-warning)' }} /><span className={classes.statLabel}>{t('kb.running')} {t('nav.tasks')}</span></span><span className={classes.statValue}>{running.length}</span><span className={classes.statHint}>{running.length} {t('kb.running')} · {waiting} {t('kb.queued')}</span><span className={classes.statBars}><span className={classes.statBar} style={{ height: '55%' }} /><span className={classes.statBar} style={{ height: '80%' }} /><span className={`${classes.statBar} ${classes.statBarMuted}`} style={{ height: '40%' }} /><span className={classes.statBar} style={{ height: '68%' }} /></span></button>
        <button type="button" className={classes.stat}><span className={classes.statTop}><span className={classes.statDot} style={{ background: 'var(--color-success)' }} /><span className={classes.statLabel}>{t('kb.activeSessions')}</span></span><span className={classes.statValue}>{sessionCount}</span><span className={classes.statHint}>{sessionCount} {t('sessions')}</span><span className={classes.statBars}><span className={classes.statBar} style={{ height: '40%' }} /><span className={classes.statBar} style={{ height: '70%' }} /><span className={`${classes.statBar} ${classes.statBarMuted}`} style={{ height: '55%' }} /><span className={classes.statBar} style={{ height: '90%' }} /></span></button>
        <button type="button" className={classes.stat} onClick={onBoard}><span className={classes.statTop}><span className={classes.statDot} style={{ background: 'var(--color-danger)' }} /><span className={classes.statLabel}>{t('kb.review')}</span></span><span className={classes.statValue}>{review.length}</span><span className={classes.statHint}>{t('kb.awaitingAcceptance')}</span><span className={classes.statBars}><span className={classes.statBar} style={{ height: '45%' }} /><span className={`${classes.statBar} ${classes.statBarMuted}`} style={{ height: '30%' }} /><span className={classes.statBar} style={{ height: '60%' }} /></span></button>
        <button type="button" className={classes.stat} onClick={onBoard}><span className={classes.statTop}><span className={classes.statDot} style={{ background: 'var(--color-accent)' }} /><span className={classes.statLabel}>{t('kb.completed')} {t('overview.thisWeek')}</span></span><span className={classes.statValue}>{completedThisWeek}</span><span className={classes.statHint}>{completed.length} {t('kb.completed')}</span><span className={classes.statBars}><span className={classes.statBar} style={{ height: '60%' }} /><span className={classes.statBar} style={{ height: '85%' }} /><span className={classes.statBar} style={{ height: '100%' }} /><span className={`${classes.statBar} ${classes.statBarMuted}`} style={{ height: '35%' }} /></span></button>
      </div>
      <div className={classes.columns}>
        <div className={classes.left}>
          <section className={classes.card}>
            <div className={classes.cardHead}><div><h2 className={classes.cardTitle}>{t('kb.running')} {t('nav.tasks')}</h2><p className={classes.cardSub}>{t('overview.recentActivity')}</p></div><button type="button" className={classes.cardLink} onClick={onBoard}>{t('view.kanban')} →</button></div>
            {active.length === 0 ? <p className={classes.empty}>{t('task.empty')}</p> : active.map(task => <button key={task.id} type="button" className={classes.row} onClick={() => onTask(task)}>
              <span className={classes.dot} style={{ background: task.status === 'running' ? 'var(--color-warning)' : 'var(--color-accent)' }} />
              <span className={classes.rowMain}><span className={classes.rowTitle}>{task.title}</span><span className={classes.rowSub}>{projectName(task)} · {versionName(task)} · {task.attempts.at(-1)?.sessionIds[0]?.slice(0, 12) ?? '—'}</span></span>
              <span className={classes.rowSide}><span className={classes.rowSideLabel}>{task.status === 'running' ? t('kb.running') : t('kb.review')}</span><span className={classes.rowSideTime}>{timeAgo(Number(task.updatedAt ?? 0))}</span></span>
            </button>)}
          </section>
          <section className={classes.card}>
            <div className={classes.cardHead}><div><h2 className={classes.cardTitle}>{t('project.title')}</h2><p className={classes.cardSub}>{t('overview.recentActivity')}</p></div><button type="button" className={classes.cardLink} onClick={onBoard}>{t('view.all')} →</button></div>
            {snapshot.projects.length === 0 ? <p className={classes.empty}>{t('project.empty')}</p> : <div className={classes.projects}>
              {snapshot.projects.slice(0, 3).map(project => {
                const projectTasks = snapshot.tasks.filter(task => task.versionId !== undefined && snapshot.versions.find(version => version.id === task.versionId)?.projectId === project.id)
                return <button key={project.id} type="button" className={classes.project} onClick={() => onProject(project)}>
                  <span className={classes.projectHead}><span className={classes.projectMark}>{project.config.name.slice(0, 1)}</span><span className={classes.projectName}>{project.config.name}</span></span>
                  <span className={classes.projectSub}>{sourceName(project)}</span>
                  <span className={classes.projectStats}><span>{projectTasks.length} {t('nav.tasks')} · {project.config.sources.length} {t('source.repo')}</span></span>
                  <span className={classes.progress}><span className={classes.progressFill} style={{ width: `${String(Math.min(100, projectTasks.length * 8 + 8))}%` }} /></span>
                </button>
              })}
            </div>}
          </section>
          <section className={classes.card}>
            <div className={classes.cardHead}><h2 className={classes.cardTitle}>{t('overview.recentCompleted')}</h2><button type="button" className={classes.cardLink} onClick={onBoard}>{t('view.kanban')} →</button></div>
            {recentCompleted.length === 0 ? <p className={classes.empty}>{t('task.empty')}</p> : <div className={classes.sectionGrid}>{recentCompleted.map(task => <button key={task.id} type="button" className={classes.sectionItem} onClick={() => onTask(task)}><span className={classes.sectionItemTitle}><IconCheckOutlineRegular size={12} className={classes.sectionCheck} />{task.title}</span><span className={classes.sectionItemMeta}>{projectName(task)} · {versionName(task)}</span></button>)}</div>}
          </section>
        </div>
        <div className={classes.right}>
          <section className={classes.card}>
            <div className={classes.cardHead}><h2 className={classes.cardTitle}>{t('sessions')}</h2><button type="button" className={classes.cardLink}>{t('view.all')} →</button></div>
            {recentSessions.length === 0 ? <p className={classes.empty}>{t('noSessions')}</p> : recentSessions.map(({ sessionId, task }) => <button key={`${sessionId}-${task.id}`} type="button" className={classes.row} onClick={() => onSession(sessionId)}>
              <IconBranchOutlineRegular size={12} />
              <span className={classes.rowMain}><span className={classes.rowTitle}>{task.title}</span><span className={classes.rowSub}>{projectName(task)} · {versionName(task)}</span></span>
              <span className={classes.rowSide}><span className={classes.rowSideTime}>{timeAgo(Number(task.updatedAt ?? 0))}</span></span>
            </button>)}
          </section>
          <section className={classes.card}>
            <div className={classes.cardHead}><h2 className={classes.cardTitle}>{t('audit')}</h2><span className={classes.rowMeta}>{date}</span></div>
            {recentAudit.length === 0 ? <p className={classes.empty}>{t('bottom.activityEmpty')}</p> : recentAudit.map(entry => <div key={entry.id} className={classes.activityRow}>
              <span className={classes.activityDot} />
              <span className={classes.activityBody}><span className={classes.activityText}>{t(AUDIT_LABEL[entry.event])}</span><span className={classes.activityMeta}>{new Date(entry.at).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' })}</span></span>
            </div>)}
          </section>
        </div>
      </div>
    </div>
  </main>
}
