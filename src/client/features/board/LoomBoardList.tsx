/** Dense status-grouped list view for the board. */
import { IconPlusOutlineRegular } from '../../ui/primitives.ts'
import type { CatalogSnapshot, ProjectRecord, TaskRecord } from 'dsh-workloom/types'
import type { BoardColumn } from './board.ts'
import { boardEvidence, evidenceLabel, type BoardEvidenceTone } from './board-evidence.ts'
import type { LoomKey } from '../../shared/locales.ts'
import { PRIORITY_META, STATUS_META } from '../../ui/status.ts'
import { relativeTime } from '../../shared/time.ts'
import { LoomEmptyState } from '../../ui/EmptyState.tsx'
import classes from './LoomBoardList.module.css'

type Translate = (key: LoomKey) => string

const EVIDENCE_TONE: Readonly<Record<BoardEvidenceTone, string>> = {
  muted: classes.muted ?? '',
  accent: classes.accent ?? '',
  success: classes.success ?? '',
  danger: classes.danger ?? '',
  warning: classes.warning ?? '',
}

/** Props for the status-grouped list view. */
export interface LoomBoardListProps {
  readonly t: Translate
  readonly snapshot: CatalogSnapshot
  readonly columns: readonly BoardColumn[]
  readonly versionNames: ReadonlyMap<string, string>
  readonly projectNames: ReadonlyMap<string, string>
  readonly sessionByTask: ReadonlyMap<string, string>
  readonly newTaskProject: ProjectRecord | undefined
  readonly onSelect: (task: TaskRecord) => void
  readonly onNewCard: (project: ProjectRecord) => void
}

/** One dense list row: title, description, status evidence and metadata. */
function Row({ t, snapshot, task, versionNames, projectNames, sessionByTask, onSelect }: {
  readonly t: Translate
  readonly snapshot: CatalogSnapshot
  readonly task: TaskRecord
  readonly versionNames: ReadonlyMap<string, string>
  readonly projectNames: ReadonlyMap<string, string>
  readonly sessionByTask: ReadonlyMap<string, string>
  readonly onSelect: (task: TaskRecord) => void
}): JSX.Element {
  const meta = STATUS_META[task.status]
  const priority = PRIORITY_META[task.priority ?? 'normal']
  const evidence = boardEvidence(snapshot, task)
  const session = sessionByTask.get(task.id)
  return <button type="button" data-loom-hover="row" className={classes.row} onClick={() => onSelect(task)}>
    <span className={classes.titleCell}>
      <span className={classes.taskTitle}>{task.title}</span>
      {task.description !== undefined && task.description !== '' && <span className={classes.taskDesc}>{task.description}</span>}
    </span>
    <span className={classes.statusCell}>
      <span className={classes.statusLine}>
        <span aria-hidden className={classes.statusDot} style={{ background: meta.color }} />
        <span className={classes.statusText}>{t(meta.key)}</span>
      </span>
      {evidence !== undefined && <span className={`${classes.evidence} ${EVIDENCE_TONE[evidence.tone]}`}>{evidenceLabel(evidence, t)}</span>}
    </span>
    <span className={classes.priorityCell} style={{ color: priority.color }}>{t(priority.key)}</span>
    <span className={classes.projectCell}>{projectNames.get(task.versionId) ?? versionNames.get(task.versionId) ?? '—'}</span>
    <span className={classes.sessionCell}>{session === undefined ? '—' : session.slice(0, 12)}</span>
    <span className={classes.updatedCell}>{relativeTime(task.updatedAt) || '—'}</span>
  </button>
}

/**
 * Render the board's dense list mode, grouped by business status.
 *
 * @param props - catalog, ordered columns and row callbacks.
 * @returns the list view.
 */
export function LoomBoardList(props: LoomBoardListProps): JSX.Element {
  const { t, snapshot, columns, versionNames, projectNames, sessionByTask, newTaskProject, onSelect, onNewCard } = props
  const total = columns.reduce((sum, column) => sum + column.tasks.length, 0)
  if (total === 0) return <LoomEmptyState text={t('kb.empty')} hint={t('kb.listHint')} />
  const groups = columns.filter(column => column.tasks.length > 0)
  return <div className={classes.list}>
    <div className={classes.meta}>
      <span className={classes.metaStrong}>{t('kb.listSummary').replace('{count}', String(total))}</span>
      <span className={classes.metaDivider}>·</span>
      <span>{t('kb.listGrouped')}</span>
      <span className={classes.sort}>{t('kb.listSort')} ↓</span>
    </div>
    <div className={classes.table}>
      <div className={classes.head} aria-hidden="true">
        <span>{t('kb.columnTask')}</span>
        <span>{t('kb.columnStatus')}</span>
        <span>{t('kb.columnPriority')}</span>
        <span className={classes.headProject}>{t('kb.columnProject')}</span>
        <span>{t('kb.columnSessions')}</span>
        <span>{t('kb.columnUpdated')}</span>
      </div>
      {groups.map((column) => {
        const meta = STATUS_META[column.status]
        return <section key={column.status} className={classes.group} aria-label={`${t(meta.key)} ${String(column.tasks.length)}`}>
          <div className={classes.groupHead}>
            <span aria-hidden className={classes.groupDot} style={{ background: meta.color }} />
            <span className={classes.groupName}>{t(meta.key)}</span>
            <span className={classes.groupCount}>{String(column.tasks.length)}</span>
            {column.status === 'pending' && newTaskProject !== undefined && <button
              type="button"
              className={classes.groupAdd}
              aria-label={t('kb.newTaskInColumn')}
              title={t('kb.newTaskInColumn')}
              onClick={() => onNewCard(newTaskProject)}
            ><IconPlusOutlineRegular size={12} /></button>}
          </div>
          {column.tasks.map(task => <Row
            key={task.id}
            t={t}
            snapshot={snapshot}
            task={task as TaskRecord}
            versionNames={versionNames}
            projectNames={projectNames}
            sessionByTask={sessionByTask}
            onSelect={onSelect}
          />)}
        </section>
      })}
    </div>
  </div>
}
