/** Kanban view with metrics, project swimlanes and the overview panel. */
import { useRef } from 'react'
import { IconCloseOutlineRegular, IconFolderCloseRegular, IconPlusOutlineRegular, IconSearchOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { LoomButton } from './ui/Button.tsx'
import type { CatalogSnapshot, ProjectRecord, TaskRecord } from 'dsh-workloom/types'
import type { BoardColumn } from './board.ts'
import { boardBlockers, boardMetrics, boundSessions, flatBoard, projectLanes, type ShellFilter } from './projection.ts'
import { AUDIT_LABEL, canMoveTask, COLORS, metaLine, sectionTitle, PRIORITY_META, STATUS_META, STATUS_ORDER } from './shell.ts'
import { relativeTime } from './time.ts'
import type { LoomKey } from './locales.ts'
import classes from './LoomKanban.module.css'

type Translate = (key: LoomKey) => string

/** Kanban toolbar and lane inputs. */
export interface LoomKanbanProps {
  readonly t: Translate
  readonly snapshot: CatalogSnapshot
  /** Tasks whose bound native Session is currently running; only these pulse. */
  readonly liveTaskIds?: ReadonlySet<string> | undefined
  readonly filter: ShellFilter
  readonly mode: 'flat' | 'grouped'
  readonly projectValue: string
  readonly versionValue: string
  readonly statusValue: string
  readonly priorityValue: string
  readonly moduleValue: string
  readonly searchValue: string
  /** Advisory work-in-progress limit; crossing it warns and never blocks a card. */
  readonly wipLimit: number
  readonly onMode: (mode: 'flat' | 'grouped') => void
  readonly onProject: (value: string) => void
  readonly onVersion: (value: string) => void
  readonly onStatus: (value: string) => void
  readonly onPriority: (value: string) => void
  readonly onModule: (value: string) => void
  readonly onSearch: (value: string) => void
  readonly onClearFilters: () => void
  readonly onSelect: (task: TaskRecord) => void
  readonly onMove: (task: TaskRecord, target: TaskRecord['status']) => void
  readonly onNewCard: (project: ProjectRecord) => void
  readonly onNewTask?: (() => void) | undefined
}

function Metric({ value, label, color, first }: { value: number; label: string; color?: string; first?: boolean }) {
  return <div className={`${classes.metric} ${first === true ? classes.metricFirst : ''}`}><b className={classes.metricValue} style={color === undefined ? undefined : { color }}>{String(value)}</b><span>{label}</span></div>
}

function Card({ task, versionName, projectName, sessions, live, t, onSelect }: { task: TaskRecord; versionName: string; projectName: string; sessions: number; live: boolean; t: Translate; onSelect: (task: TaskRecord) => void }) {
  const meta = STATUS_META[task.status]
  const priority = task.priority ?? 'normal'
  const priorityMeta = PRIORITY_META[priority]
  const lastDragAt = useRef(0)
  const executing = live
  return <button type="button" data-loom-hover="card" className={`${classes.card} ${executing ? 'loom-kb-card-running' : ''}`} draggable onDragStart={event => { lastDragAt.current = Date.now(); event.dataTransfer?.setData('text/plain', task.id); if (event.dataTransfer !== null) event.dataTransfer.effectAllowed = 'move' }} onDragEnd={() => { lastDragAt.current = Date.now() }} style={{ borderLeftColor: meta.color }} onClick={() => { if (Date.now() - lastDragAt.current > 500) onSelect(task) }}>
    <div className={classes.cardTop}><span className={classes.cardProject}>{projectName || versionName || '—'}</span><span className={classes.priority} style={{ color: priorityMeta.color, borderColor: 'var(--color-line)' }}>{t(priorityMeta.key)}</span></div>
    <span className={classes.cardTitle}>{task.title}</span>
    {task.description !== undefined && task.description !== '' && <span className={classes.cardDescription}>{task.description}</span>}
    <div className={classes.cardState}><span className={classes.statusChip} style={{ color: meta.color }}><span className={classes.statusDot} style={{ background: meta.color }} />{t(meta.key)}</span>{task.attempts.at(-1)?.sessionIds[0] !== undefined && <span className={classes.sessionChip}>{task.attempts.at(-1)?.sessionIds[0]?.slice(0, 12)}</span>}</div>
    <div className={classes.cardFooter}><time data-loom-time>{relativeTime(task.updatedAt)}</time><span className={classes.cardMeta}>{versionName !== '' && <span>{versionName}</span>}{sessions > 0 && <span>{sessions} {t('kb.sessions')}</span>}</span></div>
  </button>
}

function Column({ column, t, wipLimit, versionNames, projectNames, sessionCounts, liveTaskIds, onSelect, onDropTask }: {
  column: BoardColumn
  t: Translate
  wipLimit: number
  versionNames: ReadonlyMap<string, string>
  projectNames: ReadonlyMap<string, string>
  sessionCounts: ReadonlyMap<string, number>
  liveTaskIds: ReadonlySet<string>
  onSelect: (task: TaskRecord) => void
  onDropTask: (taskId: TaskRecord['id'], target: TaskRecord['status']) => void
}) {
  const meta = STATUS_META[column.status]
  const overLimit = column.status === 'running' && column.tasks.length > wipLimit
  return <div
    role="group"
    aria-label={t(meta.key)}
    onDragOver={event => { event.preventDefault(); if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'move' }}
    onDrop={event => { event.preventDefault(); const id = event.dataTransfer?.getData('text/plain'); if (id !== undefined && id !== '') onDropTask(id as TaskRecord['id'], column.status) }}
    className={classes.column}>
    <div className={classes.columnHead}>
      <span style={{ width: 5, height: 5, borderRadius: 999, background: meta.color, flex: 'none' }} />
      <span className={classes.columnName}>{t(meta.key)}</span>
      <span className={classes.columnCount}>{String(column.tasks.length)}</span>
      {column.status === 'running' && <span title={t('kb.wipHint')} style={{ fontSize: 8.5, color: overLimit ? COLORS.error : COLORS.warn, background: overLimit ? 'color-mix(in srgb, var(--dsw-alias-state-error-primary) 14%, transparent)' : 'color-mix(in srgb, var(--dsw-alias-state-warn-primary) 12%, transparent)', borderRadius: 3, padding: '1px 4px' }}>{t('kb.wipCount').replace('{count}', String(column.tasks.length)).replace('{limit}', String(wipLimit))}</span>}
    </div>
    <div className={classes.columnBody}>
      {column.tasks.length === 0 && <span className={classes.empty}>{t('kb.empty')}</span>}
      {column.tasks.map(task => <Card key={task.id} task={task} versionName={versionNames.get(task.versionId) ?? ''} projectName={projectNames.get(task.versionId) ?? ''} sessions={sessionCounts.get(task.id) ?? 0} live={liveTaskIds.has(task.id)} t={t} onSelect={onSelect} />)}
    </div>
  </div>
}

/**
 * Render the kanban toolbar, project swimlanes and flat board.
 * @param props - Catalog snapshot, filters and board callbacks.
 * @returns the board view.
 */
export function LoomKanban(props: LoomKanbanProps) {
  const { t, snapshot, liveTaskIds = new Set(), filter, mode, projectValue, versionValue, statusValue, priorityValue, moduleValue, searchValue, wipLimit, onMode, onProject, onVersion, onStatus, onPriority, onModule, onSearch, onClearFilters, onSelect, onMove, onNewCard, onNewTask } = props
  const metrics = boardMetrics(snapshot, filter)
  const overWip = metrics.running > wipLimit
  const hasFilters = projectValue !== '' || versionValue !== '' || statusValue !== '' || priorityValue !== '' || moduleValue !== '' || searchValue.trim() !== ''
  const versionNames = new Map(snapshot.versions.map(version => [version.id, version.name]))
  const projectNames = new Map(snapshot.versions.map(version => [version.id, snapshot.projects.find(project => project.id === version.projectId)?.config.name ?? '']))
  const sessionCounts = new Map<string, number>()
  const handleDrop = (taskId: TaskRecord['id'], target: TaskRecord['status']): void => {
    const record = snapshot.tasks.find(candidate => candidate.id === taskId)
    if (record !== undefined && canMoveTask(record.status, target)) onMove(record, target)
  }
  for (const row of boundSessions(snapshot)) sessionCounts.set(row.task.id, (sessionCounts.get(row.task.id) ?? 0) + 1)
  const versions = snapshot.versions.filter(version => projectValue === '' || version.projectId === projectValue)
  const lanes = projectLanes(snapshot, filter)
  const flat = flatBoard(snapshot, filter)
  const moduleProjectId = projectValue === '' ? '' : projectValue
  return <div className={classes.root}>
    <header className={classes.boardHeader}>
      <div className={classes.boardHeadText}><p className={classes.eyebrow}>{t('project.title')} / {t('view.kanban')}</p><h1 className={classes.boardTitle}>{t('board.title')}</h1><p className={classes.boardSummary}>{metrics.cards} {t('nav.tasks')} · {metrics.running} {t('kb.running')} · {metrics.review} {t('kb.review')}</p></div>
      <div className={classes.boardActions}><LoomButton variant="secondary" size="md" onClick={onNewTask ?? (() => { const first = snapshot.projects[0]; if (first !== undefined) onNewCard(first) })} disabled={snapshot.projects.length === 0} icon={<IconPlusOutlineRegular size={14} />}>{t('top.newTask')}</LoomButton></div>
    </header>
    <div className={classes.projectTabs}><button type="button" className={`${classes.projectTab} ${projectValue === '' ? classes.projectTabActive : ''}`} onClick={() => onProject('')}>{t('top.allProjects')}</button>{snapshot.projects.map(project => <button key={project.id} type="button" className={`${classes.projectTab} ${projectValue === project.id ? classes.projectTabActive : ''}`} onClick={() => onProject(project.id)}>{project.config.name}</button>)}</div>
    <div className={classes.toolbar}>
      <div className={classes.metricsRow}>
        <Metric first value={metrics.cards} label={t('kb.cards')} />
        <Metric value={metrics.running} label={t('kb.running')} color={COLORS.accent} />
        <Metric value={metrics.activeSessions} label={t('kb.activeSessions')} />
        <Metric value={metrics.review} label={t('kb.review')} color={COLORS.purple} />
        <Metric value={metrics.completed} label={t('kb.completed')} color={COLORS.green} />
        <span role="status" title={t('kb.wipHint')} className={classes.wip} style={{ color: overWip ? 'var(--color-danger)' : 'var(--color-muted)' }}>
          {overWip
            ? t('kb.wipExceeded').replace('{count}', String(metrics.running)).replace('{limit}', String(wipLimit))
            : t('kb.wipWithin').replace('{count}', String(metrics.running)).replace('{limit}', String(wipLimit))}
        </span>
      </div>
      <div className={classes.filterBar}>
        <select aria-label={t('top.project')} value={projectValue} onChange={event => { onProject(event.target.value) }} className={classes.filterChip}>
          <option value="">{t('top.allProjects')}</option>
          {snapshot.projects.map(project => <option key={project.id} value={project.id}>{project.config.name}</option>)}
        </select>
        <select aria-label={t('top.version')} value={versionValue} onChange={event => { onVersion(event.target.value) }} className={classes.filterChip}>
          <option value="">{t('top.allVersions')}</option>
          {versions.map(version => <option key={version.id} value={version.id}>{version.name}</option>)}
        </select>
        <select aria-label={t('kb.status')} value={statusValue} onChange={event => onStatus(event.target.value)} className={classes.filterChip}>
          <option value="">{t('kb.allStatuses')}</option>
          {STATUS_ORDER.map(status => <option key={status} value={status}>{t(STATUS_META[status].key)}</option>)}
        </select>
        <select aria-label={t('kb.priority')} value={priorityValue} onChange={event => onPriority(event.target.value)} className={classes.filterChip}>
          <option value="">{t('kb.priority')}</option>
          <option value="low">{t('task.priority.low')}</option>
          <option value="normal">{t('task.priority.normal')}</option>
          <option value="high">{t('task.priority.high')}</option>
        </select>
        <select aria-label={t('kb.module')} value={moduleValue} onChange={event => onModule(event.target.value)} className={classes.filterChip} disabled={moduleProjectId === ''}>
          <option value="">{t('kb.module')}</option>
          {snapshot.projects.filter(project => project.id === moduleProjectId).flatMap(project => project.config.modules).map(module => <option key={module.id} value={module.id}>{module.path}</option>)}
        </select>
        <label className={classes.searchBox}>
          <IconSearchOutlineRegular size={11} />
          <input aria-label={t('kb.search')} placeholder={t('kb.search')} value={searchValue} onChange={event => onSearch(event.target.value)} className={classes.searchInput} />
        </label>
        <div className={classes.modeTrack}>
          <button type="button" aria-pressed={mode === 'grouped'} onClick={() => onMode('grouped')} className={`${classes.modeButton} ${mode === 'grouped' ? classes.modeButtonActive : ''}`}>{t('kb.grouped')}</button>
          <button type="button" aria-pressed={mode === 'flat'} onClick={() => onMode('flat')} className={`${classes.modeButton} ${mode === 'flat' ? classes.modeButtonActive : ''}`}>{t('kb.flat')}</button>
        </div>
        {hasFilters && <button type="button" aria-label={t('kb.clearFilters')} title={t('kb.clearFilters')} onClick={onClearFilters} className={classes.filterChip}>
          <IconCloseOutlineRegular size={10} />{t('kb.clearFilters')}
        </button>}
      </div>
    </div>
    <div className={classes.boardArea}>
      {mode === 'grouped'
        ? <div className={classes.lanes}>
            {lanes.map(({ project, versions: projectVersions, columns, count }, index) => <div key={project.id} className={classes.lane} style={{ flex: `${index === 0 ? '1.25' : '0.82'} 1 0` }}>
              <div className={classes.laneHead}>
                <span style={{ display: 'flex', color: COLORS.faint }}><IconFolderCloseRegular size={11} /></span>
                <span className={classes.laneName}>{project.config.name}</span>
                <span className={classes.laneMeta}>{String(count)}</span>
                <span className={classes.laneMeta}>{String(projectVersions.length)} {t('kb.laneSub')}</span>
                <button type="button" className={classes.laneAction} onClick={() => onNewCard(project)}>＋ {t('kb.newCard')}</button>
              </div>
              <div className={`loom-kb-columns ${classes.columns}`}>
                {columns.filter(column => column.status !== 'failed' || column.tasks.length > 0).map(column => <Column key={column.status} column={column} t={t} wipLimit={wipLimit} versionNames={versionNames} projectNames={projectNames} sessionCounts={sessionCounts} liveTaskIds={liveTaskIds} onSelect={onSelect} onDropTask={handleDrop} />)}
              </div>
            </div>)}
            {lanes.length === 0 && <p style={metaLine}>{t('kb.empty')}</p>}
          </div>
        : <div className={`loom-kb-columns ${classes.columns} ${classes.flat}`}>
            {flat.filter(column => column.status !== 'failed' || column.tasks.length > 0).map(column => <Column key={column.status} column={column} t={t} wipLimit={wipLimit} versionNames={versionNames} projectNames={projectNames} sessionCounts={sessionCounts} liveTaskIds={liveTaskIds} onSelect={onSelect} onDropTask={handleDrop} />)}
          </div>}
    </div>
  </div>
}

/** Right-side overview for the kanban view; every statistic comes from the catalog. */
export function LoomKanbanAside({ t, snapshot, filter, onSelectSession }: { t: Translate; snapshot: CatalogSnapshot; filter: ShellFilter; onSelectSession: (sessionId: string) => void }) {
  const metrics = boardMetrics(snapshot, filter)
  const versions = new Map(snapshot.versions.map(version => [version.id, version]))
  const sessions = boundSessions(snapshot).filter(row => row.task.status === 'running')
  const reviews = snapshot.tasks.filter(task => task.status === 'review')
  const projectTasks = new Map<string, number>()
  for (const project of snapshot.projects) {
    const versionIds = new Set(snapshot.versions.filter(version => version.projectId === project.id).map(version => version.id))
    projectTasks.set(project.id, snapshot.tasks.filter(task => versionIds.has(task.versionId)).length)
  }
  const recent = [...snapshot.audit].reverse().slice(0, 4)
  const blockers = boardBlockers(snapshot, filter)
  const blockedGroups = ([
    { key: 'approval', title: 'kb.blockedApproval', rows: blockers.approval },
    { key: 'workspace', title: 'kb.blockedWorkspace', rows: blockers.workspace },
    { key: 'takeover', title: 'kb.blockedTakeover', rows: blockers.takeover },
    { key: 'other', title: 'kb.blockedOther', rows: blockers.other },
  ] as const).filter(group => group.rows.length > 0)
  const stat = (value: number, label: string, color?: string) => <div style={{ background: COLORS.panel, border: `0.5px solid ${COLORS.border}`, borderRadius: 7, padding: '8px 9px' }}><div style={{ fontWeight: 400, fontFamily: 'ui-monospace, monospace', fontSize: 16, lineHeight: 1, color: color ?? COLORS.text }}>{String(value)}</div><div style={{ ...metaLine, marginTop: 4, fontSize: 9.5 }}>{label}</div></div>
  return <div style={{ overflow: 'auto', flex: 1 }}>
    <div style={{ padding: '12px 14px 9px', borderBottom: `0.5px solid ${COLORS.border}` }}>
      <div style={{ ...metaLine, fontSize: 9, letterSpacing: '.08em', textTransform: 'uppercase' }}>{t('kb.panel')}</div>
      <div style={{ marginTop: 4, fontSize: 14, fontWeight: 500, color: COLORS.text }}>{t('board')}</div>
    </div>
    <section style={{ padding: '10px 14px', borderBottom: `0.5px solid ${COLORS.border}` }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {stat(metrics.cards, t('kb.cards'))}
        {stat(metrics.running, t('kb.running'), COLORS.accent)}
        {stat(metrics.activeSessions, t('kb.activeSessions'), COLORS.green)}
        {stat(metrics.review, t('kb.review'), COLORS.purple)}
      </div>
    </section>
    <section style={{ borderBottom: `0.5px solid ${COLORS.border}`, padding: '10px 14px' }}>
      <h4 style={sectionTitle}>{t('kb.panelActive')}</h4>
      {sessions.length === 0 && <p style={metaLine}>{t('kb.panelNone')}</p>}
      {sessions.map(row => <button key={row.sessionId} type="button" onClick={() => onSelectSession(row.sessionId)} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderRadius: 6, padding: '5px 4px', color: 'inherit', font: 'inherit', cursor: 'pointer' }}>
        <span style={{ width: 6, height: 6, marginTop: 4, borderRadius: 999, background: COLORS.accent, flex: 'none' }} />
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 10.5, fontWeight: 500, overflowWrap: 'anywhere' }}>{row.task.title}</span>
          <span style={{ ...metaLine, display: 'block', marginTop: 2 }}>{versions.get(row.versionId)?.name ?? ''}</span>
        </span>
      </button>)}
    </section>
    <section style={{ borderBottom: `0.5px solid ${COLORS.border}`, padding: '10px 14px' }}>
      <h4 style={sectionTitle}>{t('kb.panelReview')}</h4>
      {reviews.length === 0 && <p style={metaLine}>{t('kb.panelNone')}</p>}
      {reviews.map(task => <p key={task.id} style={{ margin: '5px 0 0', fontSize: 10.5, lineHeight: 1.45, color: COLORS.dim, overflowWrap: 'anywhere' }}>{task.title}</p>)}
    </section>
    <section style={{ borderBottom: `0.5px solid ${COLORS.border}`, padding: '10px 14px' }}>
      <h4 style={sectionTitle}>{t('kb.blocked')}</h4>
      {blockedGroups.length === 0 && <p style={metaLine}>{t('kb.blockedNone')}</p>}
      {blockedGroups.map(group => <div key={group.key} style={{ marginTop: 7 }}>
        <div style={{ ...metaLine, fontSize: 9, color: COLORS.dim }}>{t(group.title)} · {String(group.rows.length)}</div>
        {group.rows.slice(0, 5).map(row => <div key={`${group.key}:${row.task.id}`} style={{ display: 'flex', flexDirection: 'column', gap: 1, marginTop: 4, paddingLeft: 7, borderLeft: `1.5px solid ${COLORS.borderStrong}` }}>
          <span style={{ fontSize: 10.5, color: COLORS.text, lineHeight: 1.4, overflowWrap: 'anywhere' }}>{row.task.title}</span>
          <span style={{ ...metaLine, fontSize: 9 }}>{t(row.reason)}</span>
        </div>)}
        {group.rows.length > 5 && <div style={{ ...metaLine, fontSize: 9, marginTop: 3 }}>+{String(group.rows.length - 5)}</div>}
      </div>)}
    </section>
    <section style={{ borderBottom: `0.5px solid ${COLORS.border}`, padding: '10px 14px' }}>
      <h4 style={sectionTitle}>{t('kb.projects')}</h4>
      {snapshot.projects.length === 0 && <p style={metaLine}>{t('kb.panelNone')}</p>}
      {snapshot.projects.map(project => <div key={project.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '5px 0', borderTop: `0.5px solid ${COLORS.border}`, fontSize: 10, color: COLORS.dim }}>
        <span className={classes.cardModules}>{project.config.name}</span>
        <b style={{ color: COLORS.faint, font: '9px/1 ui-monospace, monospace', fontWeight: 400 }}>{String(projectTasks.get(project.id) ?? 0)}</b>
      </div>)}
    </section>
    <section style={{ padding: '10px 14px' }}>
      <h4 style={sectionTitle}>{t('kb.recent')}</h4>
      {recent.length === 0 && <p style={metaLine}>{t('kb.panelNone')}</p>}
      {recent.map(entry => <div key={entry.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '5px 0', borderTop: `0.5px solid ${COLORS.border}`, fontSize: 9.5, lineHeight: 1.4 }}>
        <span style={{ flex: 'none', color: COLORS.faint, fontFamily: 'ui-monospace, monospace', fontSize: 8.5 }}>{new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
        <span style={{ minWidth: 0, color: COLORS.dim, overflowWrap: 'anywhere' }}>{t(AUDIT_LABEL[entry.event])}{entry.detail === undefined ? '' : ` · ${entry.detail}`}</span>
      </div>)}
    </section>
  </div>
}

/** Status labels used by the tree and context panel. */
export function statusLabel(status: TaskRecord['status'], t: Translate): string {
  return t(STATUS_META[status].key)
}

/** Ordered statuses shared with the board. */
export { STATUS_ORDER }
