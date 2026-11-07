/** Draggable board column and task card used by the kanban surface. */
import { useRef, useState } from 'react'
import { IconBranchOutlineRegular, IconClockOutlineRegular, IconPlusOutlineRegular } from '../../ui/primitives.ts'
import type { ProjectRecord, TaskRecord } from 'dsh-workloom/types'
import type { BoardColumn } from './board.ts'
import type { LoomKey } from '../../locales.ts'
import { TaskStatusDot } from '../../ui/LoomStatusDot.tsx'
import { PRIORITY_META, STATUS_META } from '../../shell.ts'
import { relativeTime } from '../../time.ts'
import { LoomEmptyState } from '../../ui/EmptyState.tsx'
import classes from './LoomKanban.module.css'

type Translate = (key: LoomKey) => string

/** One draggable task card with its project, priority and evidence line. */
function Card({ t, task, projectName, versionName, sessionId, live, onSelect }: {
  readonly t: Translate
  readonly task: TaskRecord
  readonly projectName: string
  readonly versionName: string
  readonly sessionId: string | undefined
  readonly live: boolean
  readonly onSelect: (task: TaskRecord) => void
}): JSX.Element {
  const priority = PRIORITY_META[task.priority ?? 'normal']
  const [dragging, setDragging] = useState(false)
  const lastDragAt = useRef(0)
  return <button
    type="button"
    data-loom-hover="card"
    data-loom-running={live ? 'true' : undefined}
    className={`${classes.card} ${live ? classes.cardRunning : ''} ${dragging ? classes.cardDragging : ''}`}
    draggable
    onDragStart={event => {
      lastDragAt.current = Date.now()
      setDragging(true)
      event.dataTransfer?.setData('text/plain', task.id)
      if (event.dataTransfer !== null) event.dataTransfer.effectAllowed = 'move'
    }}
    onDragEnd={() => { lastDragAt.current = Date.now(); setDragging(false) }}
    onClick={() => { if (Date.now() - lastDragAt.current > 500) onSelect(task) }}
  >
    <span className={classes.cardTop}>
      <span className={classes.cardProject}>{projectName || versionName || '—'}</span>
      <span className={classes.priority} style={{ color: priority.color }}>{t(priority.key)}</span>
    </span>
    <span className={classes.cardTitle}>{task.title}</span>
    {task.description !== undefined && task.description !== '' && <span className={classes.cardDescription}>{task.description}</span>}
    <span className={classes.cardState}>
      <TaskStatusDot status={task.status} live={live} />
      <span className={classes.stateLabel}>{t(STATUS_META[task.status].key)}</span>
      {sessionId !== undefined && <span className={classes.sessionChip}>{sessionId.slice(0, 12)}</span>}
    </span>
    <span className={classes.cardFooter}>
      <span className={classes.footerTime}><IconClockOutlineRegular size={11} />{relativeTime(task.updatedAt)}</span>
      {versionName !== '' && <span className={classes.footerVersion}><span aria-hidden className={classes.footerIcon}><IconBranchOutlineRegular size={11} /></span><span className={classes.footerVersionText}>{versionName}</span></span>}
    </span>
  </button>
}

/** Inputs for one status column. */
export interface LoomBoardColumnProps {
  readonly t: Translate
  readonly column: BoardColumn
  readonly wipLimit: number
  readonly projectNames: ReadonlyMap<string, string>
  readonly versionNames: ReadonlyMap<string, string>
  readonly sessionByTask: ReadonlyMap<string, string>
  readonly liveTaskIds: ReadonlySet<string>
  readonly newTaskProject: ProjectRecord | undefined
  readonly onAddCard: (project: ProjectRecord) => void
  readonly onSelect: (task: TaskRecord) => void
  readonly onDropTask: (taskId: TaskRecord['id'], target: TaskRecord['status']) => void
}

/**
 * Render one status column that accepts dragged cards.
 *
 * @param props - column projection, metadata maps and board callbacks.
 * @returns the column with its card stack.
 */
export function LoomBoardColumn(props: LoomBoardColumnProps): JSX.Element {
  const { t, column, wipLimit, projectNames, versionNames, sessionByTask, liveTaskIds, newTaskProject, onAddCard, onSelect, onDropTask } = props
  const meta = STATUS_META[column.status]
  const overLimit = column.status === 'running' && column.tasks.length > wipLimit
  const [over, setOver] = useState(false)
  return <div
    role="group"
    aria-label={t(meta.key)}
    className={`${classes.column} ${over ? classes.columnOver : ''}`}
    onDragOver={event => {
      event.preventDefault()
      if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'move'
      setOver(true)
    }}
    onDragLeave={() => setOver(false)}
    onDrop={event => {
      event.preventDefault()
      setOver(false)
      const id = event.dataTransfer?.getData('text/plain')
      if (id !== undefined && id !== '') onDropTask(id as TaskRecord['id'], column.status)
    }}
  >
    <div className={classes.columnHead}>
      <span aria-hidden className={classes.columnDot} style={{ background: meta.color }} />
      <span className={classes.columnName}>{t(meta.key)}</span>
      <span className={classes.columnCount}>{String(column.tasks.length)}</span>
      <span className={classes.columnSpacer} />
      {column.status === 'running' && <span
        className={`${classes.wipChip} ${overLimit ? classes.wipOver : ''}`}
        title={overLimit
          ? t('kb.wipExceeded').replace('{count}', String(column.tasks.length)).replace('{limit}', String(wipLimit))
          : t('kb.wipWithin').replace('{count}', String(column.tasks.length)).replace('{limit}', String(wipLimit))}
      >{t('kb.wipCount').replace('{count}', String(column.tasks.length)).replace('{limit}', String(wipLimit))}</span>}
      {column.status === 'pending' && newTaskProject !== undefined && <button
        type="button"
        className={classes.columnAdd}
        aria-label={t('kb.newTaskInColumn')}
        title={t('kb.newTaskInColumn')}
        onClick={() => onAddCard(newTaskProject)}
      ><IconPlusOutlineRegular size={13} /></button>}
    </div>
    <div className={`${classes.columnBody} ${over ? classes.columnBodyOver : ''}`}>
      {column.tasks.length === 0
        ? <LoomEmptyState text={t('kb.empty')} />
        : column.tasks.map(task => <Card
          key={task.id}
          t={t}
          task={task as TaskRecord}
          projectName={projectNames.get(task.versionId) ?? ''}
          versionName={versionNames.get(task.versionId) ?? ''}
          sessionId={sessionByTask.get(task.id)}
          live={liveTaskIds.has(task.id)}
          onSelect={onSelect}
        />)}
    </div>
  </div>
}
