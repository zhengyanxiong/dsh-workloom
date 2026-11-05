/** Board page: status columns, a dense list and the task evidence behind each row. */
import { useEffect, useState } from 'react'
import { IconFolderCloseRegular, IconPlusOutlineRegular, IconSlidersTwoOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { CatalogSnapshot, ProjectRecord, TaskRecord } from 'dsh-workloom/types'
import type { BoardColumn } from './board.ts'
import type { LoomKey } from './locales.ts'
import { LoomBoardColumn } from './LoomBoardColumn.tsx'
import { LoomBoardFilters } from './LoomBoardFilters.tsx'
import { LoomBoardList } from './LoomBoardList.tsx'
import { boardBlockers, boardMetrics, boundSessions, flatBoard, projectLanes, type BoardBlockerGroups, type ShellFilter } from './projection.ts'
import { BOARD_STATUS_ORDER, canMoveTask, STATUS_META, STATUS_ORDER } from './shell.ts'
import { epochMillis, relativeTime } from './time.ts'
import { LoomButton } from './ui/Button.tsx'
import { LoomEmptyState } from './ui/EmptyState.tsx'
import { LoomSegmented } from './ui/Segmented.tsx'
import { LoomSelect, type LoomSelectOption } from './ui/Select.tsx'
import classes from './LoomKanban.module.css'

type Translate = (key: LoomKey) => string

/** Board presentation modes. */
export type LoomBoardView = 'kanban' | 'list'

/** Kanban toolbar, lane and list inputs. */
export interface LoomKanbanProps {
  readonly t: Translate
  readonly snapshot: CatalogSnapshot
  /** Tasks whose bound native Session is currently running; only these pulse. */
  readonly liveTaskIds?: ReadonlySet<string> | undefined
  readonly filter: ShellFilter
  readonly mode: 'flat' | 'grouped'
  readonly boardView: LoomBoardView
  readonly projectValue: string
  readonly versionValue: string
  readonly statusValue: string
  readonly priorityValue: string
  readonly moduleValue: string
  readonly searchValue: string
  /** Advisory work-in-progress limit; crossing it warns and never blocks a card. */
  readonly wipLimit: number
  readonly onMode: (mode: 'flat' | 'grouped') => void
  readonly onBoardView: (view: LoomBoardView) => void
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

/** Order columns for reading: active work first, empty failure column trailing. */
function orderedColumns(columns: readonly BoardColumn[]): BoardColumn[] {
  const ordered: BoardColumn[] = []
  for (const status of BOARD_STATUS_ORDER) {
    const column = columns.find(candidate => candidate.status === status)
    if (column === undefined) continue
    if (status === 'failed' && column.tasks.length === 0) continue
    ordered.push(column)
  }
  return ordered
}

/** Project blocked rows down to one chip per concrete reason. */
function blockerChips(groups: BoardBlockerGroups): readonly { readonly key: LoomKey; readonly count: number; readonly titles: readonly string[] }[] {
  const byReason = new Map<LoomKey, string[]>()
  for (const row of [...groups.approval, ...groups.workspace, ...groups.takeover, ...groups.other]) {
    const titles = byReason.get(row.reason) ?? []
    titles.push(row.task.title)
    byReason.set(row.reason, titles)
  }
  return [...byReason.entries()].map(([key, titles]) => ({ key, count: titles.length, titles }))
}

/**
 * Render the board page: toolbar, blocked band, kanban columns and list mode.
 *
 * @param props - catalog snapshot, filters, view mode and board callbacks.
 * @returns the board page.
 */
export function LoomKanban(props: LoomKanbanProps): JSX.Element {
  const {
    t, snapshot, liveTaskIds = new Set<string>(), filter, mode, boardView, projectValue, versionValue,
    statusValue, priorityValue, moduleValue, searchValue, wipLimit,
    onMode, onBoardView, onProject, onVersion, onStatus, onPriority, onModule, onSearch, onClearFilters,
    onSelect, onMove, onNewCard, onNewTask,
  } = props
  const [filtersOpen, setFiltersOpen] = useState(false)
  useEffect(() => {
    if (!filtersOpen) return
    const closeOnEscape = (event: KeyboardEvent): void => { if (event.key === 'Escape') setFiltersOpen(false) }
    window.addEventListener('keydown', closeOnEscape)
    return () => { window.removeEventListener('keydown', closeOnEscape) }
  }, [filtersOpen])
  const metrics = boardMetrics(snapshot, filter)
  const versionNames = new Map(snapshot.versions.map(version => [version.id, version.name]))
  const projectNames = new Map(snapshot.versions.map(version => [version.id, snapshot.projects.find(project => project.id === version.projectId)?.config.name ?? '']))
  const sessionByTask = new Map<string, string>()
  for (const row of boundSessions(snapshot)) sessionByTask.set(row.task.id, row.sessionId)
  const selectedProject = snapshot.projects.find(project => project.id === projectValue)
  const newTaskProject = selectedProject ?? snapshot.projects[0]
  const versions = snapshot.versions.filter(version => projectValue === '' || version.projectId === projectValue)
  const columns = orderedColumns(flatBoard(snapshot, filter))
  const lanes = projectLanes(snapshot, filter)
  const blockers = blockerChips(boardBlockers(snapshot, filter))
  const hiddenFilterCount = [versionValue, statusValue, moduleValue, searchValue.trim()].filter(value => value !== '').length
  const hasFilters = projectValue !== '' || versionValue !== '' || statusValue !== '' || priorityValue !== '' || moduleValue !== '' || searchValue.trim() !== ''
  const latest = snapshot.tasks.reduce((max, task) => {
    const millis = epochMillis(task.updatedAt)
    return millis !== undefined && millis > max ? millis : max
  }, 0)
  const syncLabel = latest > 0 ? relativeTime(latest) : undefined
  const priorityOptions: readonly LoomSelectOption[] = [
    { value: '', label: t('kb.allPriorities') },
    { value: 'high', label: t('task.priority.high') },
    { value: 'normal', label: t('task.priority.normal') },
    { value: 'low', label: t('task.priority.low') },
  ]
  const versionOptions: readonly LoomSelectOption[] = [
    { value: '', label: t('top.allVersions') },
    ...versions.map(version => ({ value: version.id, label: version.name })),
  ]
  const statusOptions: readonly LoomSelectOption[] = [
    { value: '', label: t('kb.allStatuses') },
    ...STATUS_ORDER.map(status => ({ value: status, label: t(STATUS_META[status].key) })),
  ]
  const moduleOptions: readonly LoomSelectOption[] = [
    { value: '', label: t('kb.module') },
    ...(selectedProject?.config.modules ?? []).map(module => ({ value: module.id, label: module.path })),
  ]
  const handleDrop = (taskId: TaskRecord['id'], target: TaskRecord['status']): void => {
    const record = snapshot.tasks.find(candidate => candidate.id === taskId)
    if (record !== undefined && canMoveTask(record.status, target)) onMove(record, target)
  }
  const createTask = (): void => {
    if (onNewTask !== undefined) onNewTask()
    else if (newTaskProject !== undefined) onNewCard(newTaskProject)
  }
  return <div className={classes.root}>
    <header className={classes.header}>
      <div className={classes.headText}>
        <p className={classes.eyebrow}>{t('project.title')} / {t('view.kanban')}</p>
        <h1 className={classes.title}>{t('board.title')}</h1>
        <p className={classes.summary}>{String(metrics.cards)} {t('nav.tasks')} · {String(metrics.running)} {t('kb.running')} · {String(metrics.review)} {t('kb.review')}</p>
      </div>
      <div className={classes.actions}>
        <LoomButton variant="primary" size="md" icon={<IconPlusOutlineRegular size={14} />} disabled={snapshot.projects.length === 0} onClick={createTask}>{t('top.newTask')}</LoomButton>
      </div>
    </header>
    <div className={classes.controls}>
      <div role="tablist" aria-label={t('top.project')} className={classes.projectTabs}>
        <button type="button" role="tab" aria-selected={projectValue === ''} className={`${classes.projectTab} ${projectValue === '' ? classes.projectTabActive : ''}`} onClick={() => onProject('')}>{t('top.allProjects')}</button>
        {snapshot.projects.map(project => <button
          key={project.id}
          type="button"
          role="tab"
          aria-selected={projectValue === project.id}
          className={`${classes.projectTab} ${projectValue === project.id ? classes.projectTabActive : ''}`}
          onClick={() => onProject(project.id)}
        >{project.config.name}</button>)}
      </div>
      <div className={classes.controlsRight}>
        <LoomSelect className={classes.prioritySelect} value={priorityValue} options={priorityOptions} onChange={onPriority} ariaLabel={t('kb.priority')} />
        <LoomButton
          variant="secondary"
          size="sm"
          icon={<IconSlidersTwoOutlineRegular size={13} />}
          aria-expanded={filtersOpen}
          aria-label={t('kb.filter')}
          onClick={() => setFiltersOpen(current => !current)}
        >{t('kb.filter')}{hiddenFilterCount > 0 && <span className={classes.filterCount}>{String(hiddenFilterCount)}</span>}</LoomButton>
        <LoomSegmented
          ariaLabel={t('kb.viewSwitch')}
          value={boardView}
          options={[{ value: 'kanban', label: t('view.kanban') }, { value: 'list', label: t('view.list') }]}
          onChange={value => onBoardView(value === 'list' ? 'list' : 'kanban')}
        />
      </div>
    </div>
    {filtersOpen && <LoomBoardFilters
      t={t}
      versionValue={versionValue}
      statusValue={statusValue}
      moduleValue={moduleValue}
      searchValue={searchValue}
      versionOptions={versionOptions}
      statusOptions={statusOptions}
      moduleOptions={moduleOptions}
      moduleDisabled={selectedProject === undefined}
      wipLimit={wipLimit}
      grouped={mode === 'grouped'}
      groupedAvailable={boardView === 'kanban'}
      hasFilters={hasFilters}
      onVersion={onVersion}
      onStatus={onStatus}
      onModule={onModule}
      onSearch={onSearch}
      onToggleGrouped={() => onMode(mode === 'grouped' ? 'flat' : 'grouped')}
      onClear={onClearFilters}
    />}
    {blockers.length > 0 && <div className={classes.blockers} role="status" aria-label={t('kb.blocked')}>
      <span className={classes.blockerTitle}>{t('kb.blocked')}</span>
      {blockers.map(group => <span key={group.key} className={classes.blockerChip} title={group.titles.join(' · ')}>{t(group.key)}<span className={classes.blockerCount}>{String(group.count)}</span></span>)}
    </div>}
    <div className={classes.scroll}>
      {boardView === 'list'
        ? <LoomBoardList
          t={t}
          snapshot={snapshot}
          columns={columns}
          versionNames={versionNames}
          projectNames={projectNames}
          sessionByTask={sessionByTask}
          newTaskProject={newTaskProject}
          onSelect={onSelect}
          onNewCard={onNewCard}
        />
        : mode === 'grouped'
          ? <div className={`${classes.boardFill} ${classes.lanes}`}>
            {lanes.length === 0 && <LoomEmptyState text={t('kb.empty')} />}
            {lanes.map(lane => <div key={lane.project.id} className={classes.lane}>
              <div className={classes.laneHead}>
                <span aria-hidden className={classes.laneIcon}><IconFolderCloseRegular size={12} /></span>
                <span className={classes.laneName}>{lane.project.config.name}</span>
                <span className={classes.laneMeta}>{String(lane.count)} {t('kb.cardsUnit')} · {String(lane.versions.length)} {t('kb.laneSub')}</span>
                <LoomButton className={classes.laneAdd} variant="ghost" size="sm" icon={<IconPlusOutlineRegular size={12} />} onClick={() => onNewCard(lane.project)}>{t('kb.newCard')}</LoomButton>
              </div>
              <div className={classes.columns}>
                {orderedColumns(lane.columns).map(column => <LoomBoardColumn
                  key={column.status}
                  t={t}
                  column={column}
                  wipLimit={wipLimit}
                  projectNames={projectNames}
                  versionNames={versionNames}
                  sessionByTask={sessionByTask}
                  liveTaskIds={liveTaskIds}
                  newTaskProject={lane.project}
                  onAddCard={onNewCard}
                  onSelect={onSelect}
                  onDropTask={handleDrop}
                />)}
              </div>
            </div>)}
          </div>
          : <div className={classes.boardFill}>
            <div className={classes.columns}>
              {columns.map(column => <LoomBoardColumn
                key={column.status}
                t={t}
                column={column}
                wipLimit={wipLimit}
                projectNames={projectNames}
                versionNames={versionNames}
                sessionByTask={sessionByTask}
                liveTaskIds={liveTaskIds}
                newTaskProject={newTaskProject}
                onAddCard={onNewCard}
                onSelect={onSelect}
                onDropTask={handleDrop}
              />)}
            </div>
          </div>}
    </div>
    <footer className={classes.footer}>
      <span>{boardView === 'list' ? t('kb.listHint') : t('kb.boardHint')}</span>
      {syncLabel !== undefined && <span className={classes.footerSync}>{t('kb.boardSynced').replace('{time}', syncLabel)}</span>}
    </footer>
  </div>
}

/** Status label used by the tree and context panel. */
export function statusLabel(status: TaskRecord['status'], t: Translate): string {
  return t(STATUS_META[status].key)
}
