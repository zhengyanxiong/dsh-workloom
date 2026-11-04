/**
 * Overview route: a compact read-only summary of the current catalog.
 *
 * Counts and lists come from the catalog snapshot; no demo values are inserted
 * when a projection is unavailable.
 */
import type { CSSProperties } from 'react'
import { IconBranchOutlineRegular, IconProjectAddOutlineRegular, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { CatalogSnapshot, ProjectRecord, TaskRecord } from 'dsh-workloom/types'
import { COLORS, metaLine, STATUS_META } from '../shell.ts'
import type { LoomKey } from '../locales.ts'

type Translate = (key: LoomKey) => string

/** Overview inputs and navigation intents. */
export interface LoomOverviewProps {
  readonly t: Translate
  readonly snapshot: CatalogSnapshot
  readonly activeWorkspaceCount: number
  readonly onTask: (task: TaskRecord) => void
  readonly onProject: (project: ProjectRecord) => void
  readonly onSession: (sessionId: string) => void
  readonly onBoard: () => void
}

const page: CSSProperties = { flex: 1, minWidth: 0, overflow: 'auto', background: COLORS.bg, padding: '28px 32px 40px' }
const eyebrow: CSSProperties = { ...metaLine, fontSize: 10.5, marginBottom: 10 }
const title: CSSProperties = { margin: 0, fontSize: 26, lineHeight: 1.25, letterSpacing: '-.02em', fontWeight: 600, color: COLORS.text }
const summary: CSSProperties = { margin: '8px 0 0', color: COLORS.dim, fontSize: 12.5, lineHeight: 1.55 }
const stats: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10, marginTop: 22 }
const stat: CSSProperties = { border: `0.5px solid ${COLORS.border}`, borderRadius: 10, background: COLORS.panel, padding: '12px 14px', minWidth: 0 }
const statValue: CSSProperties = { fontSize: 22, lineHeight: 1.15, fontWeight: 600, letterSpacing: '-.02em', color: COLORS.text }
const statLabel: CSSProperties = { ...metaLine, marginTop: 4 }
const grid: CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(0, 1fr)', gap: 12, marginTop: 14, alignItems: 'start' }
const card: CSSProperties = { border: `0.5px solid ${COLORS.border}`, borderRadius: 10, background: COLORS.panel, padding: '12px 14px', minWidth: 0 }
const cardHead: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }
const cardTitle: CSSProperties = { margin: 0, color: COLORS.text, fontSize: 13, fontWeight: 600 }
const cardLink: CSSProperties = { marginLeft: 'auto', border: 'none', background: 'transparent', color: COLORS.accent, cursor: 'pointer', font: 'inherit', fontSize: 11 }
const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 0', border: 'none', borderTop: `0.5px solid ${COLORS.border}`, background: 'transparent', color: 'inherit', textAlign: 'left', cursor: 'pointer', font: 'inherit', minWidth: 0 }
const rowTitle: CSSProperties = { minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }
const rowMeta: CSSProperties = { ...metaLine, flex: 'none', maxWidth: '45%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const empty: CSSProperties = { margin: 0, padding: '9px 0 2px', color: COLORS.faint, fontSize: 11.5 }

/**
 * Render the overview route.
 * @param props - catalog snapshot and navigation intents.
 * @returns the overview page.
 */
export function LoomOverview({ t, snapshot, activeWorkspaceCount, onTask, onProject, onSession, onBoard }: LoomOverviewProps): JSX.Element {
  const running = snapshot.tasks.filter(task => task.status === 'running')
  const review = snapshot.tasks.filter(task => task.status === 'review')
  const completed = snapshot.tasks.filter(task => task.status === 'completed')
  const active = [...running, ...review].sort((left, right) => Number(right.updatedAt ?? 0) - Number(left.updatedAt ?? 0)).slice(0, 5)
  const projects = [...snapshot.projects].sort((left, right) => left.config.name.localeCompare(right.config.name)).slice(0, 6)
  const recentSessions = snapshot.tasks
    .flatMap(task => (task.attempts.at(-1)?.sessionIds ?? []).map(sessionId => ({ sessionId, task })))
    .slice(-4)
    .reverse()
  const recentAudit = snapshot.audit.slice(-5).reverse()
  const runningCount = running.length
  return <main style={page}>
    <div style={eyebrow}>{t('nav.overview')}</div>
    <h1 style={title}>{t('nav.overview')}</h1>
    <p style={summary}>
      {activeWorkspaceCount} {t('top.activeWorkspaces')} · {snapshot.projects.length} {t('project.title')} · {snapshot.tasks.length} {t('task.title')}
    </p>
    <div style={stats}>
      <div style={stat}><div style={statValue}>{runningCount}</div><div style={statLabel}>{t('kb.running')} {t('task.title')}</div></div>
      <div style={stat}><div style={statValue}>{review.length}</div><div style={statLabel}>{t('kb.review')} {t('task.title')}</div></div>
      <div style={stat}><div style={statValue}>{snapshot.workspaces.filter(workspace => workspace.cleaned !== true).length}</div><div style={statLabel}>{t('nav.workspaces')}</div></div>
      <div style={stat}><div style={statValue}>{completed.length}</div><div style={statLabel}>{t('kb.completed')}</div></div>
    </div>
    <div style={grid}>
      <section style={card}>
        <div style={cardHead}><h2 style={cardTitle}>{t('kb.running')} / {t('kb.review')}</h2><button type="button" style={cardLink} onClick={onBoard}>{t('view.kanban')} →</button></div>
        {active.length === 0 ? <p style={empty}>{t('task.empty')}</p> : active.map(task => <button key={task.id} type="button" style={row} onClick={() => onTask(task)}>
          <span aria-hidden style={{ width: 6, height: 6, borderRadius: 999, background: STATUS_META[task.status].color, flex: 'none' }} />
          <span style={rowTitle}>{task.title}</span>
          <Tag tone="info">{t(STATUS_META[task.status].key)}</Tag>
          <span style={rowMeta}>{task.priority ?? 'normal'}</span>
        </button>)}
      </section>
      <section style={card}>
        <div style={cardHead}><h2 style={cardTitle}>{t('sessions')}</h2></div>
        {recentSessions.length === 0 ? <p style={empty}>{t('noSessions')}</p> : recentSessions.map(({ sessionId, task }) => <button key={`${sessionId}-${task.id}`} type="button" style={row} onClick={() => onSession(sessionId)}>
          <IconBranchOutlineRegular size={12} />
          <span style={rowTitle}>{task.title}</span>
          <span style={rowMeta}>{t(STATUS_META[task.status].key)}</span>
        </button>)}
      </section>
      <section style={card}>
        <div style={cardHead}><h2 style={cardTitle}>{t('project.title')}</h2></div>
        {projects.length === 0 ? <p style={empty}>{t('project.empty')}</p> : projects.map(project => <button key={project.id} type="button" style={row} onClick={() => onProject(project)}>
          <IconProjectAddOutlineRegular size={12} />
          <span style={rowTitle}>{project.config.name}</span>
          <span style={rowMeta}>{project.config.sources.length} {t('source.repo')}</span>
        </button>)}
      </section>
      <section style={card}>
        <div style={cardHead}><h2 style={cardTitle}>{t('audit')}</h2></div>
        {recentAudit.length === 0 ? <p style={empty}>{t('bottom.activityEmpty')}</p> : recentAudit.map(entry => <div key={entry.id} style={{ ...row, cursor: 'default' }}>
          <span style={rowMeta}>{new Date(entry.at).toLocaleTimeString([], { hour12: false })}</span>
          <span style={rowTitle}>{entry.event}</span>
        </div>)}
      </section>
    </div>
  </main>
}
