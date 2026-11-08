/** Workbench context panel over the selected project, version, task and workspace. */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import {
  Button, DisclosureRow, IconContextInjectionOutlineRegular, IconEditOutlineRegular, IconEllipsisOutlineRegular, IconPlusOutlineRegular, IconTrashOutlineRegular, Menu,
  type MenuEntry,
} from '../../ui/primitives.ts'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { CatalogSnapshot, GenerateLockRequest, Lock, ProjectRecord, RepositoryBranches, RepositoryBranchesRequest, SourceConfig, TaskRecord, VersionRecord } from 'dsh-workloom/types'
import { currentWorkspace, versionOccupancy, type TokenUsageView, type VersionOccupancyRow } from '../../shared/projection.ts'
import { renderVersionContext, type VersionContext } from '../../../shared/version-context.ts'
import { LockButton } from './LockButton.tsx'
import { LoomDeleteDialog, type DeleteKind } from '../dialogs/LoomDeleteDialog.tsx'
import { COLORS } from '../../ui/tokens.ts'
import { failureReport, thrownFailureReport } from '../../ui/failure.ts'
import type { FailureReport } from '../../ui/failure.ts'
import { sectionTitle } from '../../ui/styles.ts'
import { shortCommit } from '../../shared/format.ts'
import { PRIORITY_META, STATUS_META } from '../../ui/status.ts'
import { TaskStatusDot } from '../../ui/LoomStatusDot.tsx'
import { LoomWorkspaceOpen } from '../workspace/LoomWorkspaceOpen.tsx'
import type { LoomKey } from '../../shared/locales.ts'

type Translate = (key: LoomKey, params?: Readonly<Record<string, string>>) => string

/** Inputs for the workbench context panel. */
export interface LoomContextPanelProps {
  readonly t: Translate
  readonly snapshot: CatalogSnapshot
  readonly project: ProjectRecord | undefined
  readonly version: VersionRecord | undefined
  readonly task: TaskRecord | undefined
  /** Shared version-context derivation; the same object the Agent receives. */
  readonly versionContext?: VersionContext | undefined
  readonly presetName?: string | undefined
  readonly usage: TokenUsageView | undefined
  readonly generateLock: (request: GenerateLockRequest) => Promise<RemoteResult<Lock>>
  readonly onLockChanged: () => void
  readonly onEditProject?: () => void
  readonly onNewVersion?: () => void
  readonly onEditVersion?: () => void
  readonly onEditTask?: () => void
  readonly onDeleteProject?: (() => Promise<RemoteResult<void>>) | undefined
  readonly onDeleteVersion?: (() => Promise<RemoteResult<void>>) | undefined
  readonly onDeleteTask?: (() => Promise<RemoteResult<void>>) | undefined
  /** Opens a mapped repository through the native desktop catalog. */
  readonly openPath?: ((path: string) => void) | undefined
  /** Native file-association readers used to bridge WSL/Windows IDE handlers into the directory menu. */
  readonly openPathApplications?: ((path: string, signal: AbortSignal) => Promise<RemoteResult<readonly { id: string; name: string; icon?: string | null }[]>>) | undefined
  readonly openPathWith?: ((path: string, application: string) => Promise<boolean>) | undefined
  /** Native repository branch read, used to show the workspace's actual checkout. */
  readonly loadBranches?: ((request: RepositoryBranchesRequest) => Promise<RemoteResult<RepositoryBranches>>) | undefined
  /** Tasks with a bound native Session that is actually running; only these animate. */
  readonly liveTaskIds?: ReadonlySet<string> | undefined
  /** Sessions whose runtime reports them as running; occupancy only animates for one. */
  readonly runningSessionIds?: ReadonlySet<string> | undefined
  /** Optional runtime section (agents, jobs, fork) rendered above the version context. */
  readonly sessionRuntime?: ReactNode | undefined
  /** Optional version dependency graph rendered above the version context. */
  readonly versionGraph?: ReactNode | undefined
}

const panel: CSSProperties = { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'auto', background: COLORS.panel2, borderLeft: `0.5px solid ${COLORS.border}` }
const header: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5, padding: '12px 14px 11px', borderBottom: `0.5px solid ${COLORS.border}` }
const eyebrow: CSSProperties = { margin: 0, color: COLORS.faint, fontSize: 'var(--text-micro-size)', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase' }
const titleRow: CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 0 }
const title: CSSProperties = { margin: 0, color: COLORS.text, fontSize: 'var(--text-h2-size)', fontWeight: 500, lineHeight: 1.3, overflowWrap: 'anywhere', flex: 1, minWidth: 0 }
const subtitle: CSSProperties = { margin: 0, color: COLORS.faint, fontSize: 'var(--text-label-size)', lineHeight: 1.4, overflowWrap: 'anywhere' }
const actions: CSSProperties = { display: 'flex', alignItems: 'center', gap: 2, flex: 'none' }
const section: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, padding: '11px 14px', borderBottom: `0.5px solid ${COLORS.border}` }
const iconOnly: CSSProperties = { color: COLORS.faint }
const muted: CSSProperties = { margin: 0, color: COLORS.dim, fontSize: 'var(--text-label-size)', lineHeight: 1.5 }
const hint: CSSProperties = { margin: 0, color: COLORS.faint, fontSize: 'var(--text-micro-size)', lineHeight: 1.5 }
const mono: CSSProperties = { fontFamily: 'ui-monospace, monospace', fontSize: 'var(--text-label-size)', color: COLORS.text, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const gitRepo: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3, padding: '7px 8px', border: `0.5px solid ${COLORS.border}`, borderRadius: 6, background: COLORS.panel }
const repoHead: CSSProperties = { display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }
const repoName: CSSProperties = { color: COLORS.text, fontSize: 'var(--text-label-size)', fontFamily: 'ui-monospace, monospace', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }
const repoPath: CSSProperties = { color: COLORS.faint, fontSize: 'var(--text-micro-size)', fontFamily: 'ui-monospace, monospace', flex: 'none', maxWidth: '45%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const graphRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, paddingLeft: 2 }
const dot: CSSProperties = { width: 5, height: 5, borderRadius: '50%', flex: 'none' }
const graphLabel: CSSProperties = { color: COLORS.dim, fontSize: 'var(--text-micro-size)', flex: 'none' }
const sourceRow: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, padding: '5px 7px', borderRadius: 5, background: COLORS.panel, border: `0.5px solid ${COLORS.border}` }
const sourceTitle: CSSProperties = { color: COLORS.text, fontSize: 'var(--text-label-size)', fontFamily: 'ui-monospace, monospace', overflowWrap: 'anywhere' }
const moduleRow: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 1, padding: '5px 7px', borderRadius: 5, background: COLORS.panel, border: `0.5px solid ${COLORS.border}` }
const sourceMeta: CSSProperties = { color: COLORS.faint, fontSize: 'var(--text-micro-size)', lineHeight: 1.45, overflowWrap: 'anywhere' }
const ctxBlock: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }
const ctxLabel: CSSProperties = { color: COLORS.faint, fontSize: 'var(--text-micro-size)', lineHeight: 1.45 }
const ctxDescription: CSSProperties = { margin: 0, color: COLORS.text, fontSize: 'var(--text-label-size)', lineHeight: 1.55, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }
const ctxTaskRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, fontSize: 'var(--text-label-size)' }
const ctxTaskTitle: CSSProperties = { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: COLORS.dim }
const ctxTaskStatus: CSSProperties = { marginLeft: 'auto', flex: 'none', color: COLORS.faint, fontSize: 'var(--text-micro-size)' }
const ctxText: CSSProperties = { margin: '4px 0 0', maxHeight: 200, overflow: 'auto', padding: '7px 8px', borderRadius: 5, border: `0.5px solid ${COLORS.border}`, background: COLORS.panel2, color: COLORS.dim, fontFamily: 'ui-monospace, monospace', fontSize: 'var(--text-micro-size)', lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }

function SectionHeading({ title: heading, action }: { title: string; action?: ReactNode }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 20 }}>
    <h4 style={{ ...sectionTitle, marginBottom: 0, fontSize: 'var(--text-micro-size)', letterSpacing: '.06em', textTransform: 'uppercase' }}>{heading}</h4>
    {action !== undefined && <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 2 }}>{action}</span>}
  </div>
}

function Row({ k, v, mono: useMono = true, wrap = true }: { k: string; v: string; mono?: boolean; wrap?: boolean }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, minWidth: 0, fontSize: 'var(--text-small-size)' }}>
    <span style={{ color: COLORS.dim, flex: 'none' }}>{k}</span>
    <span title={wrap ? undefined : v} style={{ color: COLORS.text, fontFamily: useMono ? 'ui-monospace, monospace' : 'inherit', fontSize: useMono ? 10.5 : 11, textAlign: 'right', minWidth: 0, ...(wrap ? { overflowWrap: 'anywhere' } : { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }) }}>{v}</span>
  </div>
}

function IconAction({ label, icon, onClick }: { label: string; icon: ReactNode; onClick: () => void }) {
  return <Button size="sm" variant="ghost" aria-label={label} title={label} icon={icon} onClick={onClick} style={iconOnly} />
}

/** Compact a token count for glanceable right-rail rows while preserving the full value in a title. */
function compactCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  return String(value)
}

/** Last path segment of a repository path, used as the compact repo name. */
function repoNameOf(path: string): string {
  return path.split(/[\\/]/u).filter(Boolean).at(-1) ?? path
}

/** One repository's Lock and version ref; the current branch stays in DSH's native Git panel. */
function RepositoryGraph({ t, source, versionRef, lock }: {
  t: Translate
  source: SourceConfig
  versionRef: string | undefined
  lock: string | undefined
}) {
  return <div style={gitRepo}>
    <div style={repoHead}>
      <span style={repoName} title={source.repo}>{repoNameOf(source.repo)}</span>
      <span style={repoPath} title={source.repo}>{source.path === '.' ? t('ctx.repoRoot') : source.path}</span>
    </div>
    <div style={graphRow}>
      <span style={{ ...dot, background: lock === undefined ? COLORS.borderStrong : COLORS.text }} />
      <span style={graphLabel}>{t('lock.title')}</span>
      <span style={{ ...mono, color: lock === undefined ? COLORS.faint : COLORS.text }} title={lock}>{lock ?? t('ctx.noLock')}</span>
    </div>
    <div style={{ ...graphRow, paddingLeft: 10 }}>
      <span style={{ ...dot, background: COLORS.accent }} />
      <span style={graphLabel}>{t('ctx.versionRef')}</span>
      <span style={{ ...mono, color: COLORS.dim }} title={versionRef}>{versionRef ?? t('ctx.noBranch')}</span>
    </div>
  </div>
}

/** Version-level shared context: description, same-version tasks, real occupancy and the injected text. */
function VersionContextSection({ t, context, occupancy, liveTaskIds, runningSessionIds }: {
  t: Translate
  context: VersionContext | undefined
  occupancy: readonly VersionOccupancyRow[]
  liveTaskIds?: ReadonlySet<string> | undefined
  runningSessionIds?: ReadonlySet<string> | undefined
}) {
  const [open, setOpen] = useState(false)
  const text = context === undefined ? undefined : renderVersionContext(context)
  return <section style={section} aria-label={t('ctx.version')}>
    <SectionHeading title={t('ctx.version')} action={<span style={hint}>{t('ctx.readOnly')}</span>} />
    {context === undefined
      ? <p style={muted}>{t('ctx.notInjected')}</p>
      : <>
          <div style={ctxBlock}>
            <span style={ctxLabel}>{t('ctx.versionDescription')}</span>
            <p style={context.description === '' ? { ...ctxDescription, color: COLORS.faint } : ctxDescription}>{context.description === '' ? t('ctx.noVersionDescription') : context.description}</p>
          </div>
          <div style={ctxBlock}>
            <span style={ctxLabel}>{t('ctx.sameVersionTasks')} · {String(context.sameVersionTasks.length)}</span>
            {context.sameVersionTasks.length === 0
              ? <span style={{ ...ctxLabel, color: COLORS.dim }}>{t('ctx.noSameVersionTasks')}</span>
              : context.sameVersionTasks.map(task => <div key={task.id} style={ctxTaskRow}>
                  <TaskStatusDot status={task.status} live={liveTaskIds?.has(task.id) === true} />
                  <span style={ctxTaskTitle} title={task.title}>{task.title}</span>
                  <span style={ctxTaskStatus}>{t(STATUS_META[task.status].key)}</span>
                </div>)}
          </div>
          <div style={ctxBlock}>
            <span style={ctxLabel}>{t('ctx.occupancy')}</span>
            {occupancy.length === 0
              ? <span style={{ ...ctxLabel, color: COLORS.dim }}>{t('ctx.noOccupancy')}</span>
              : occupancy.map(entry => <div key={entry.workspaceId} style={ctxTaskRow}>
                  <TaskStatusDot status={entry.occupied ? 'running' : 'pending'} live={entry.occupied && entry.ownerSessionId !== undefined && runningSessionIds?.has(entry.ownerSessionId) === true} />
                  <span style={ctxTaskTitle} title={entry.workspaceLabel}>{entry.workspaceLabel}</span>
                  <span style={ctxTaskStatus}>{entry.occupied ? t('workspace.busy') : t('ctx.ready')}{entry.waiting > 0 ? ` · ${t('ctx.occupancyWaiting', { count: String(entry.waiting) })}` : ''}{entry.takeover ? ` · ${t('execution.stopping')}` : ''}</span>
                </div>)}
          </div>
          {text !== undefined && text !== '' && <DisclosureRow icon={<IconContextInjectionOutlineRegular />} title={t('ctx.modelVisible')} open={open} expandable expandOnRowClick previewChevron onToggle={() => setOpen(value => !value)}>
            <pre style={ctxText}>{text}</pre>
          </DisclosureRow>}
          <p style={hint}>{t('ctx.versionContextHint')}</p>
        </>}
  </section>
}

/**
 * Render the version baseline, task, workspace and cost context without inventing measurements.
 * @param props - catalog records, current selection and owner actions.
 * @returns the aside content for the workbench view.
 */
export function LoomContextPanel({ t, snapshot, project, version, task, versionContext, usage, generateLock, onLockChanged, onEditProject, onNewVersion, onEditVersion, onEditTask, onDeleteProject, onDeleteVersion, onDeleteTask, openPath, openPathApplications, openPathWith, loadBranches, liveTaskIds, runningSessionIds, sessionRuntime, versionGraph }: LoomContextPanelProps) {
  const [pendingDelete, setPendingDelete] = useState<DeleteKind>()
  const [deleting, setDeleting] = useState(false)
  const [deleteFailure, setDeleteFailure] = useState<FailureReport>()
  const [menuOpen, setMenuOpen] = useState(false)
  const [workspaceBranches, setWorkspaceBranches] = useState<ReadonlyMap<string, string | null>>(new Map())
  useEffect(() => { setPendingDelete(undefined); setDeleteFailure(undefined); setMenuOpen(false) }, [project?.id, version?.id, task?.id])
  function beginDelete(kind: DeleteKind): void { setPendingDelete(kind); setDeleteFailure(undefined); setMenuOpen(false) }
  async function confirmDelete(): Promise<void> {
    const callback = pendingDelete === 'project' ? onDeleteProject : pendingDelete === 'version' ? onDeleteVersion : pendingDelete === 'task' ? onDeleteTask : undefined
    if (callback === undefined) return
    setDeleting(true); setDeleteFailure(undefined)
    try {
      const result = await callback()
      if (result.ok) setPendingDelete(undefined)
      else setDeleteFailure(failureReport(result.error.code, result.error.message))
    } catch (error) {
      setDeleteFailure(thrownFailureReport(error))
    } finally { setDeleting(false) }
  }
  const pendingSubject = pendingDelete === 'project' ? project?.config.name : pendingDelete === 'version' ? version?.name : task?.title
  const latestLock = version === undefined ? undefined : snapshot.locks.filter(lock => lock.versionId === version.id).at(-1)
  const workspace = currentWorkspace(snapshot, task)
  useEffect(() => {
    setWorkspaceBranches(new Map())
    if (workspace === undefined || loadBranches === undefined) return
    let active = true
    for (const binding of workspace.repositories ?? []) {
      void loadBranches({ repo: binding.targetPath }).then((result) => {
        if (!active) return
        setWorkspaceBranches(current => new Map(current).set(binding.sourceId, result.ok ? result.value.current ?? null : null))
      }, () => undefined)
    }
    return () => { active = false }
  }, [workspace?.id, loadBranches])
  const projectSource = (sourceId: string) => project?.config.sources.find(source => source.id === sourceId)
  const versionRef = (source: SourceConfig): string | undefined => version?.sources.find(entry => entry.sourceId === source.id)?.ref
  const lockCommit = (source: SourceConfig): string | undefined => latestLock?.repositories.find(entry => entry.sourceId === source.id)?.commit.slice(0, 7)
  const moreItems: MenuEntry[] = []
  if (onEditProject !== undefined) moreItems.push({ id: 'edit-project', label: t('project.edit'), icon: <IconEditOutlineRegular /> })
  if (onNewVersion !== undefined) moreItems.push({ id: 'new-version', label: t('version.new'), icon: <IconPlusOutlineRegular /> })
  if (version !== undefined && onDeleteVersion !== undefined) moreItems.push({ type: 'separator', id: 'sep-version' }, { id: 'delete-version', label: t('version.delete'), icon: <IconTrashOutlineRegular />, danger: true })
  if (project !== undefined && onDeleteProject !== undefined) moreItems.push({ id: 'delete-project', label: t('project.delete'), icon: <IconTrashOutlineRegular />, danger: true })
  if (task !== undefined && onDeleteTask !== undefined) moreItems.push({ type: 'separator', id: 'sep-task' }, { id: 'delete-task', label: t('task.delete'), icon: <IconTrashOutlineRegular />, danger: true })
  function selectMenu(id: string): void {
    setMenuOpen(false)
    if (id === 'edit-project') onEditProject?.()
    else if (id === 'new-version') onNewVersion?.()
    else if (id === 'delete-version') beginDelete('version')
    else if (id === 'delete-project') beginDelete('project')
    else if (id === 'delete-task') beginDelete('task')
  }
  const editAction = version !== undefined ? onEditVersion : onEditProject
  const editLabel = version !== undefined ? t('version.edit') : t('project.edit')
  const count = project?.config.sources.length ?? 0
  function branchLabel(sourceId: string): string {
    const actual = workspaceBranches.get(sourceId)
    if (actual === null) return t('ctx.detached')
    if (actual !== undefined) return actual
    const recorded = workspace?.branches?.[sourceId]
    return recorded ?? t('ctx.branchLoading')
  }
  return <div style={panel}>
    <header style={header}>
      <p style={eyebrow}>{t('ctx.version')}</p>
      <div style={titleRow}>
        <h3 style={title}>{version?.name ?? project?.config.name ?? t('ctx.none')}</h3>
        <div style={actions}>
          {editAction !== undefined && <IconAction label={editLabel} icon={<IconEditOutlineRegular />} onClick={editAction} />}
          {moreItems.length > 0 && <Menu open={menuOpen} onClose={() => setMenuOpen(false)} items={moreItems} align="end" portal
            onSelect={selectMenu}
            anchor={<Button size="sm" variant="ghost" aria-label={t('ctx.more')} title={t('ctx.more')} icon={<IconEllipsisOutlineRegular />} onClick={() => setMenuOpen(value => !value)} style={iconOnly} />} />}
        </div>
      </div>
      {project !== undefined && <p style={subtitle}>{project.config.name}</p>}
    </header>
    {sessionRuntime}
    {versionGraph}
    {project === undefined ? <section style={section}><p style={muted}>{snapshot.projects.length === 0 ? t('project.empty') : t('ctx.selectProject')}</p></section> : <>
      <section style={section}>
        <SectionHeading title={t('ctx.baseline')} action={<span style={{ ...hint, fontFamily: 'ui-monospace, monospace' }}>{t('ctx.lockRepos').replace('{count}', String(count))}</span>} />
        {project.config.sources.map(source => <RepositoryGraph key={source.id} t={t} source={source}
          versionRef={versionRef(source)} lock={lockCommit(source)} />)}
        {version !== undefined && <div style={{ marginTop: 2 }}>
          <LockButton t={t} version={version} generate={generateLock} onCreated={onLockChanged} existing={latestLock !== undefined} hint />
          <p style={hint}>{t('ctx.baselineHint')}</p>
        </div>}
      </section>
      {version !== undefined && <VersionContextSection t={t} context={versionContext} occupancy={versionOccupancy(snapshot, version.id)} liveTaskIds={liveTaskIds} runningSessionIds={runningSessionIds} />}
      {task !== undefined && <section style={section}>
        <SectionHeading title={t('task.details')} action={onEditTask === undefined ? undefined : <IconAction label={t('task.edit')} icon={<IconEditOutlineRegular />} onClick={onEditTask} />} />
        <Row k={t('task.name')} v={task.title} mono={false} />
        <Row k={t('ctx.status')} v={t(STATUS_META[task.status].key)} mono={false} />
        <Row k={t('task.priority')} v={t(PRIORITY_META[task.priority ?? 'normal'].key)} mono={false} />
      </section>}
      {task !== undefined && <section style={section}>
        <SectionHeading title={t('ctx.workspace')} />
        {workspace === undefined ? <p style={muted}>{t('workspace.empty')}</p> : <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <div style={{ flex: 1, minWidth: 0 }}><Row k={t('ctx.workspaceRoot')} v={workspace.rootPath ?? workspace.path} wrap={false} /></div>
            <LoomWorkspaceOpen t={t} path={workspace.rootPath ?? workspace.path} openPath={openPath} applications={openPathApplications} openWith={openPathWith} probePaths={[`${workspace.rootPath ?? workspace.path}/README.md`, `${workspace.rootPath ?? workspace.path}/package.json`]} />
          </div>
          <Row k={t('workspace.mode')} v={t(`workspace.mode.${workspace.mode ?? 'managed'}`)} mono={false} />
          <Row k={t('ctx.lock')} v={shortCommit(snapshot.locks.find(lock => lock.id === workspace.lockId)) ?? workspace.lockId} />
          {(workspace.repositories ?? []).map(binding => <div key={binding.sourceId} style={sourceRow}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
              <span style={sourceTitle}>{binding.path === '.' ? t('ctx.repoRoot') : binding.path}</span>
              <div style={{ marginLeft: 'auto', flex: 'none' }}><LoomWorkspaceOpen t={t} path={binding.targetPath} openPath={openPath} applications={openPathApplications} openWith={openPathWith} probePaths={[`${binding.targetPath}/README.md`, `${binding.targetPath}/package.json`, `${binding.targetPath}/.gitignore`]} /></div>
            </div>
            <span style={mono} title={binding.targetPath}>{binding.targetPath}</span>
            <span style={sourceMeta}>{t('ctx.workspaceBranch')}: {branchLabel(binding.sourceId)}</span>
          </div>)}
        </>}
      </section>}
      <section style={section}>
        <SectionHeading title={t('ctx.modules')} action={<span style={hint}>{String(project.config.modules.length)}</span>} />
        {project.config.modules.length === 0 ? <p style={muted}>{t('task.noModules')}</p> : project.config.modules.map(module => {
          const source = projectSource(module.sourceId)
          return <div key={module.id} style={moduleRow}>
            <span style={{ color: COLORS.text, fontSize: 'var(--text-label-size)', overflowWrap: 'anywhere' }}>{module.path}</span>
            <span style={{ color: COLORS.faint, fontSize: 'var(--text-micro-size)', overflowWrap: 'anywhere' }}>{source?.path ?? module.sourceId}</span>
          </div>
        })}
      </section>
      <section style={section}>
        <SectionHeading title={t('ctx.tests')} />
        <p style={muted}>{t('ctx.notRun')}</p>
      </section>
      <section style={{ ...section, borderBottom: 'none' }}>
        <SectionHeading title={t('ctx.costs')} />
        {usage === undefined ? <p style={muted}>{t('ctx.notTracked')}</p> : <>
          <Row k={t('ctx.usageInput')} v={compactCount(usage.uncachedInputTokens)} />
          <Row k={t('ctx.usageOutput')} v={compactCount(usage.outputTokens)} />
          <Row k={t('ctx.usageCached')} v={compactCount(usage.cacheReadTokens + usage.cacheWriteTokens)} />
          <Row k={t('ctx.usageTotal')} v={compactCount(usage.uncachedInputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens)} />
          <p style={hint}>{t('ctx.usageNote')}</p>
        </>}
      </section>
    </>}
    {pendingDelete !== undefined && <LoomDeleteDialog t={t} kind={pendingDelete} subject={pendingSubject} busy={deleting} failure={deleteFailure} onCancel={() => { setPendingDelete(undefined); setDeleteFailure(undefined) }} onConfirm={() => { void confirmDelete() }} />}
  </div>
}
