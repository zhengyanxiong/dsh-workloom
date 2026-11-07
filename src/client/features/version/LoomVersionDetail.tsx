/** Version detail page: configuration, immutable Lock history, tasks and version context. */
import { useState, type CSSProperties } from 'react'
import {
  Button, DisclosureRow, IconClockOutlineRegular, IconContextInjectionOutlineRegular,
  IconEditOutlineRegular, IconPlusOutlineRegular, Tag,
} from '../../ui/primitives.ts'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { CatalogSnapshot, GenerateLockRequest, Lock, ProjectRecord, TaskRecord, VersionRecord } from 'dsh-workloom/types'
import { renderVersionContext, type VersionContext } from '../../../shared/version-context.ts'
import { COLORS, formatTimestamp, metaLine, PRIORITY_META, shortCommit, STATUS_META } from '../../shell.ts'
import { TaskStatusDot } from '../../LoomStatusDot.tsx'
import type { LoomKey } from '../../locales.ts'
import { LockButton } from '../../LoomForms.tsx'
import { LoomWorkspaceList, type LoadWorkspaceStatus } from '../workspace/LoomWorkspaceList.tsx'
import { workspaceName } from '../../projection.ts'
import { lockTasks, lockWorkspaces, versionLocks, versionOccupancy, versionRepositoryRows, versionWorkspaceRows } from '../../projection.ts'

type Translate = (key: LoomKey, params?: Readonly<Record<string, string>>) => string

/** Inputs for the version detail page. */
export interface LoomVersionDetailProps {
  readonly t: Translate
  readonly snapshot: CatalogSnapshot
  readonly project: ProjectRecord | undefined
  readonly version: VersionRecord | undefined
  /** Shared derivation consumed by both this page and the Agent context. */
  readonly context: VersionContext | undefined
  readonly generateLock: (request: GenerateLockRequest) => Promise<RemoteResult<Lock>>
  readonly onLockChanged: () => void
  readonly onCreateTask: () => void
  readonly onEditVersion: () => void
  readonly onSelectTask: (task: TaskRecord) => void
  readonly loadWorkspaceStatus?: LoadWorkspaceStatus | undefined
  /** Tasks with a bound native Session that is actually running; only these animate. */
  readonly liveTaskIds?: ReadonlySet<string> | undefined
}

const page: CSSProperties = { flex: 1, minWidth: 0, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: '18px 22px 24px', background: COLORS.panel }
const stack: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 14, width: '100%', maxWidth: 880, margin: '0 auto' }
const header: CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', minWidth: 0 }
const headerBody: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5, flex: 1, minWidth: 200 }
const eyebrow: CSSProperties = { margin: 0, ...metaLine, fontFamily: 'ui-monospace, monospace', fontSize: 'var(--text-nano-size)', letterSpacing: '.12em', textTransform: 'uppercase' }
const headerTitle: CSSProperties = { margin: 0, fontSize: 'var(--text-stat-size)', fontWeight: 500, lineHeight: 1.25, letterSpacing: '-.01em', overflowWrap: 'anywhere' }
const headerMeta: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0 }
const headerActions: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 'none' }
const description: CSSProperties = { margin: 0, color: COLORS.dim, fontSize: 'var(--text-compact-size)', lineHeight: 1.65, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }
const card: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0, padding: '14px 15px', background: COLORS.panel, border: `0.5px solid ${COLORS.border}`, borderRadius: 10 }
const cardHead: CSSProperties = { display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', minWidth: 0 }
const cardTitle: CSSProperties = { margin: 0, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-small-size)', fontWeight: 500, color: COLORS.text }
const cardHint: CSSProperties = { margin: 0, color: COLORS.faint, fontSize: 'var(--text-label-size)', lineHeight: 1.5 }
const grid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px 16px', minWidth: 0 }
const field: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }
const fieldLabel: CSSProperties = { ...metaLine, fontFamily: 'ui-monospace, monospace', fontSize: 'var(--text-nano-size)', letterSpacing: '.08em', textTransform: 'uppercase' }
const fieldValue: CSSProperties = { minWidth: 0, overflowWrap: 'anywhere', color: COLORS.text, fontSize: 'var(--text-small-size)', lineHeight: 1.5 }
const monoValue: CSSProperties = { fontFamily: 'ui-monospace, monospace', fontSize: 'var(--text-label-size)' }
const muted: CSSProperties = { margin: 0, color: COLORS.faint, fontSize: 'var(--text-small-size)', lineHeight: 1.55 }
const emptyState: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start', padding: '13px 14px', border: `0.5px dashed ${COLORS.border}`, borderRadius: 8 }
const rowList: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 0, margin: 0, padding: 0, listStyle: 'none' }
const row: CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 9, minWidth: 0, padding: '8px 0', borderTop: `0.5px solid ${COLORS.border}` }
const rowBody: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }
const rowTitle: CSSProperties = { margin: 0, fontSize: 'var(--text-compact-size)', fontWeight: 400, color: COLORS.text, overflowWrap: 'anywhere' }
const rowMeta: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0, fontSize: 'var(--text-label-size)', color: COLORS.faint }
const rowAction: CSSProperties = { marginLeft: 'auto', flex: 'none' }
const lockList: CSSProperties = { display: 'flex', flexDirection: 'column', minWidth: 0 }
const lockRow: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, padding: '10px 0', borderTop: `0.5px solid ${COLORS.border}` }
const lockRowFirst: CSSProperties = { ...lockRow, borderTop: 'none', paddingTop: 2 }
const lockHead: CSSProperties = { display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', minWidth: 0 }
const lockId: CSSProperties = { minWidth: 0, maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'ui-monospace, monospace', fontSize: 'var(--text-label-size)', color: COLORS.dim }
const lockMeta: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0, fontSize: 'var(--text-label-size)', color: COLORS.faint }
const lockRepos: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 6, minWidth: 0 }
const lockRepo: CSSProperties = { display: 'inline-flex', alignItems: 'baseline', gap: 6, minWidth: 0, padding: '2px 7px', border: `0.5px solid ${COLORS.border}`, borderRadius: 5, background: COLORS.panel2, fontSize: 'var(--text-label-size)' }
const commit: CSSProperties = { fontFamily: 'ui-monospace, monospace', fontSize: 'var(--text-label-size)', color: COLORS.text }
const lockRef: CSSProperties = { color: COLORS.faint, fontSize: 'var(--text-micro-size)' }
const lockFacts: CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '5px 16px', minWidth: 0, fontSize: 'var(--text-label-size)', color: COLORS.faint }
const lockFact: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', minWidth: 0 }
const lockFactLabel: CSSProperties = { color: COLORS.faint }
const contextPre: CSSProperties = { margin: 0, maxHeight: 240, overflow: 'auto', padding: '8px 10px', borderRadius: 6, border: `0.5px solid ${COLORS.border}`, background: COLORS.panel2, color: COLORS.dim, fontFamily: 'ui-monospace, monospace', fontSize: 'var(--text-label-size)', lineHeight: 1.55, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }
const contextGrid: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }
const taskChip: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0, padding: '3px 7px', border: `0.5px solid ${COLORS.border}`, borderRadius: 6, color: COLORS.dim, fontSize: 'var(--text-label-size)' }

function taskStatusLabel(t: Translate, task: TaskRecord): string {
  return t(STATUS_META[task.status].key)
}

/**
 * Render one version's configuration, Lock history, tasks, workspaces and shared context.
 * @param props - resolved version, its shared derivation and page actions.
 * @returns the version detail page, or a stable empty state without a version.
 */
export function LoomVersionDetail({ t, snapshot, project, version, context, generateLock, onLockChanged, onCreateTask, onEditVersion, onSelectTask, loadWorkspaceStatus, liveTaskIds }: LoomVersionDetailProps) {
  const [contextOpen, setContextOpen] = useState(false)
  if (version === undefined) {
    return <div style={page}><div style={stack}><p style={emptyState}>{t('version.detailEmpty')}</p></div></div>
  }
  const locks = versionLocks(snapshot, version.id)
  const latestLock = locks.at(-1)
  const tasks = snapshot.tasks.filter(task => task.versionId === version.id)
  const repositories = versionRepositoryRows(project, version, latestLock)
  const modules = project?.config.modules ?? []
  const workspaces = versionWorkspaceRows(snapshot, version.id)
  const occupancy = versionOccupancy(snapshot, version.id)
  // The shared derivation lists same-version tasks in Host order; the page falls back
  // to the raw catalog rows only to keep the section readable before a context exists.
  const sameVersionTasks: readonly { readonly id: string; readonly title: string; readonly status: TaskRecord['status'] }[] =
    context?.sameVersionTasks ?? tasks.map(task => ({ id: task.id, title: task.title, status: task.status }))
  const contextText = context === undefined ? undefined : renderVersionContext(context)
  return <div style={page}>
    <div style={stack}>
      <header style={header}>
        <div style={headerBody}>
          <p style={eyebrow}>{t('version.detail')}</p>
          <h2 style={headerTitle}>{version.name}</h2>
          <div style={headerMeta}>
            {project !== undefined && <Tag tone="info">{project.config.name}</Tag>}
            <span style={cardHint}>{t('ctx.lockRepos', { count: String(repositories.length) })}</span>
            <span aria-hidden style={{ color: COLORS.border }}>·</span>
            <span style={cardHint}>{t('version.tasks')} · {String(tasks.length)}</span>
          </div>
          {context?.description !== undefined && context.description !== ''
            ? <p style={description}>{context.description}</p>
            : <p style={muted}>{t('version.descriptionEmpty')}</p>}
        </div>
        <div style={headerActions}>
          <LockButton t={t} version={version} generate={generateLock} onCreated={onLockChanged} existing={locks.length > 0} hint={false} size="md" />
          <Button variant="outline" icon={<IconEditOutlineRegular />} onClick={onEditVersion}>{t('version.edit')}</Button>
          <Button variant="primary" className="loom-primary" icon={<IconPlusOutlineRegular />} disabled={locks.length === 0}
            title={locks.length === 0 ? t('lock.generateFirst') : t('task.new')} onClick={onCreateTask}>{t('task.new')}</Button>
        </div>
      </header>

      <section style={card} aria-label={t('version.sourcePaths')}>
        <div style={cardHead}><h3 style={cardTitle}>{t('version.sourcePaths')}</h3><span style={cardHint}>{t('version.lockRefNote')}</span></div>
        {repositories.length === 0
          ? <p style={muted}>{t('version.empty')}</p>
          : <div style={grid}>
              {repositories.map(repository => <div key={repository.sourceId} style={field}>
                <span style={fieldLabel}>{repository.sourceId} · {repository.path}</span>
                <span style={fieldValue}><span style={monoValue}>{repository.ref === '' ? '—' : repository.ref}</span> → {repository.commit === undefined ? t('ctx.noLock') : <span style={monoValue} title={repository.commit}>{repository.commit.slice(0, 12)}</span>}</span>
              </div>)}
            </div>}
      </section>

      <section style={card} aria-label={t('version.moduleScope')}>
        <div style={cardHead}><h3 style={cardTitle}>{t('version.moduleScope')}</h3></div>
        {modules.length === 0
          ? <p style={muted}>{t('version.noModules')}</p>
          : <div style={grid}>{modules.map(module => <div key={module.id} style={field}>
              <span style={fieldLabel}>{module.id}</span>
              <span style={fieldValue}>{module.sourceId} / <span style={monoValue}>{module.path}</span></span>
            </div>)}</div>}
      </section>

      <section style={card} aria-label={t('version.lockHistory')}>
        <div style={cardHead}>
          <h3 style={cardTitle}><IconClockOutlineRegular size={13} />{t('version.lockHistory')}</h3>
          <span style={cardHint}>{t('version.lockHistoryHint')}</span>
        </div>
        {locks.length === 0
          ? <div style={emptyState}>
              <p style={muted}>{t('lock.empty')}</p>
            </div>
          : <div style={lockList}>
              {[...locks].reverse().map((lock, index) => {
                const latest = index === 0
                const sourceTasks = lockTasks(snapshot, lock.id)
                const referencing = lockWorkspaces(snapshot, lock.id)
                return <div key={lock.id} style={index === 0 ? lockRowFirst : lockRow}>
                  <div style={lockHead}>
                    <span style={lockId} title={lock.id}>{lock.id}</span>
                    {latest && <Tag tone="solid">{t('version.lockLatest')}</Tag>}
                    <span style={lockMeta}><IconClockOutlineRegular size={11} />{formatTimestamp(lock.createdAt) ?? t('version.lockNoTimestamp')}</span>
                    {referencing.length > 0 && <span style={lockMeta}>{t('version.lockReferenced', { count: String(referencing.length) })}</span>}
                  </div>
                  <div style={lockRepos}>
                    {lock.repositories.map(repository => {
                      const current = version.sources.find(entry => entry.sourceId === repository.sourceId)?.ref
                      return <span key={repository.sourceId} style={lockRepo}>
                        <span>{repository.sourceId}</span>
                        <span style={commit} title={repository.commit}>{repository.commit.slice(0, 10)}</span>
                        {current !== undefined && <span style={lockRef}>← {current}</span>}
                      </span>
                    })}
                  </div>
                  {(sourceTasks.length > 0 || referencing.length > 0) && <div style={lockFacts}>
                    {sourceTasks.length > 0 && <span style={lockFact}>
                      <span style={lockFactLabel}>{t('version.lockSourceTask')}</span>
                      {sourceTasks.map(task => <Tag key={task.id} tone="outline">{task.title}</Tag>)}
                    </span>}
                    {referencing.length > 0 && <span style={lockFact}>
                      <span style={lockFactLabel}>{t('version.lockReferencedBy')}</span>
                      {referencing.map(entry => <span key={entry.id} title={entry.rootPath ?? entry.path}><Tag tone="quiet">{workspaceName(entry.rootPath ?? entry.path) ?? entry.path}</Tag></span>)}
                    </span>}
                  </div>}
                </div>
              })}
            </div>}
      </section>

      <section style={card} aria-label={t('version.tasks')}>
        <div style={cardHead}><h3 style={cardTitle}>{t('version.tasks')}</h3><span style={cardHint}>{t('version.tasksHint')}</span></div>
        {tasks.length === 0
          ? <div style={emptyState}>
              <p style={muted}>{t('version.noTasks')}</p>
              <Button variant="outline" icon={<IconPlusOutlineRegular />} disabled={locks.length === 0} title={locks.length === 0 ? t('lock.generateFirst') : t('task.new')} onClick={onCreateTask}>{t('task.new')}</Button>
            </div>
          : <ul style={rowList}>
              {tasks.map(task => {
                const priority = task.priority ?? 'normal'
                const round = task.attempts.length
                const lock = task.attempts.at(-1)?.lock
                return <li key={task.id} style={{ ...row, paddingTop: 8 }}>
                  <TaskStatusDot status={task.status} live={liveTaskIds?.has(task.id) === true} />
                  <span style={rowBody}>
                    <span style={rowTitle}>{task.title}</span>
                    <span style={rowMeta}>
                      <span>{taskStatusLabel(t, task)}</span>
                      {priority !== 'normal' && <><span aria-hidden>·</span><span style={{ color: PRIORITY_META[priority].color }}>{t(PRIORITY_META[priority].key)}</span></>}
                      <span aria-hidden>·</span>
                      <span>{t('sessionList.round', { round: String(round) })}</span>
                      {lock !== undefined && <><span aria-hidden>·</span><span style={{ fontFamily: 'ui-monospace, monospace' }}>🔒 {shortCommit(lock) ?? '—'}</span></>}
                      {(task.moduleIds ?? []).length > 0 && <><span aria-hidden>·</span><span>{String((task.moduleIds ?? []).length)} {t('module.title')}</span></>}
                    </span>
                  </span>
                  <span style={rowAction}><Button size="sm" variant="ghost" onClick={() => onSelectTask(task)}>{t('workbench')}</Button></span>
                </li>
              })}
            </ul>}
      </section>

      <section style={card} aria-label={t('ctx.version')}>
        <div style={cardHead}>
          <h3 style={cardTitle}><IconContextInjectionOutlineRegular size={13} />{t('ctx.version')}</h3>
          <span style={cardHint}>{t('ctx.versionContextHint')}</span>
        </div>
        <div style={contextGrid}>
          <div style={field}>
            <span style={fieldLabel}>{t('ctx.versionDescription')}</span>
            <span style={context?.description === undefined || context.description === '' ? { ...fieldValue, color: COLORS.faint } : fieldValue}>
              {context?.description === undefined || context.description === '' ? t('version.descriptionEmpty') : context.description}
            </span>
          </div>
          <div style={field}>
            <span style={fieldLabel}>{t('ctx.sameVersionTasks')}</span>
            {sameVersionTasks.length === 0
              ? <span style={{ ...fieldValue, color: COLORS.faint }}>{t('ctx.noSameVersionTasks')}</span>
              : <span style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {sameVersionTasks.map(task => <span key={task.id} style={taskChip}>
                    <TaskStatusDot status={task.status} live={liveTaskIds?.has(task.id) === true} />
                    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</span>
                    <span style={{ color: COLORS.faint }}>{t(STATUS_META[task.status].key)}</span>
                  </span>)}
                </span>}
          </div>
          <div style={field}>
            <span style={fieldLabel}>{t('ctx.occupancy')}</span>
            {occupancy.length === 0
              ? <span style={{ ...fieldValue, color: COLORS.faint }}>{t('ctx.noOccupancy')}</span>
              : <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {occupancy.map(entry => <span key={entry.workspaceId} style={{ ...fieldValue, ...monoValue }}>
                    {entry.workspaceLabel} · {entry.occupied ? t('workspace.busy') : t('ctx.ready')}{entry.waiting > 0 ? ` · ${t('ctx.occupancyWaiting', { count: String(entry.waiting) })}` : ''}{entry.takeover ? ` · ${t('execution.stopping')}` : ''}
                  </span>)}
                </span>}
          </div>
        </div>
        {contextText === undefined
          ? <p style={muted}>{t('ctx.notInjected')}</p>
          : <DisclosureRow icon={<IconContextInjectionOutlineRegular />} title={t('version.contextPreview')} open={contextOpen} expandable expandOnRowClick previewChevron onToggle={() => setContextOpen(value => !value)}>
              <span style={cardHint}>{t('version.contextPreviewHint')}</span>
              <pre style={contextPre}>{contextText}</pre>
            </DisclosureRow>}
      </section>

      <LoomWorkspaceList t={t} rows={workspaces} loadStatus={loadWorkspaceStatus} />
    </div>
  </div>
}
