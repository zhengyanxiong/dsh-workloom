/** Loom workbench shell: project tree, native conversation, context and kanban. */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  IconCloseOutlineRegular, IconEditOutlineRegular, IconFolderCloseRegular, IconFolderOpenRegular, IconPinFillRegular,
  IconPlusOutlineRegular, IconTrashOutlineRegular, Button,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { CSSProperties, ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRenderFactories, PropsRuntime, SessionProviderComponent } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { fileAddressFor } from '@deepseek-ai/dsh-util-workspace-path'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {
  CatalogSnapshot, GenerateLockRequest, Lock, ProjectRecord, TaskPriority, TaskRecord, VersionRecord,
  WorkspaceChangesRequest, WorkspaceRecord, VersionWorkspaceInput,
} from 'dsh-workloom/types'
import { ImportProjectForm, LockButton, ProjectForm, TaskForm, VersionForm, type AgentPresetOption, type VersionStep } from './LoomForms.tsx'
import { LoomSettings, readPreferences, writePreferences, type LoomPreferences } from './LoomSettings.tsx'
import type { ExecutionActions } from './LoomExecution.tsx'
import { LoomBottomPanel, type LoomBottomPane } from './LoomBottomPanel.tsx'
import { LoomResizeHandle } from './LoomResizeHandle.tsx'
import { LoomFilePreview } from './LoomFilePreview.tsx'
import { LoomDirectoryBrowser } from './LoomDirectoryBrowser.tsx'
import { LoomReviewPreview } from './LoomReviewPreview.tsx'
import { LoomTopbar } from './shell/LoomTopbar.tsx'
import { LoomOverview } from './shell/LoomOverview.tsx'
import { LOOM_ROOT_CLASS, LoomThemeStyles } from './theme/LoomTheme.tsx'
import { parseLoomHash, type LoomRoute } from './shell/router.ts'
import { PinButton, ProjectTaskRow, SidebarSectionToggle, SidebarSessionRow, TreeIconAction, TreeRow, versionChip } from './shell/LoomSidebarParts.tsx'
import { openFilePreview, workspacePreview, workspaceReviewPreview } from './preview.ts'
import { LoomContextPanel } from './LoomContextPanel.tsx'
import { LoomDeleteDialog } from './LoomDeleteDialog.tsx'
import { LoomKanban, LoomKanbanAside } from './LoomKanban.tsx'
import { LoomTemporaryDialog, type LoomTemporaryActions } from './LoomTemporaryDialog.tsx'
import { LoomTaskWorkbench } from './LoomTaskWorkbench.tsx'
import { LoomVersionDetail } from './LoomVersionDetail.tsx'
import { LoomSessionActivity, type LoomSubagentRow } from './LoomSessionActivity.tsx'
import { LoomVersionGraph } from './LoomVersionGraph.tsx'
import { LoomSessionGraph, type LoomTaskSessionRow } from './LoomSessionGraph.tsx'
import { autoWorkspaceRepositoryPath } from '../domain/workspace.ts'
import { activeWorkspaceCount, aggregateTokenUsage, boundSessions, tokenUsageOf, currentWorkspace, taskAttemptRows, taskSessionRows, workspaceName, type ShellFilter } from './projection.ts'
import { deriveVersionContext } from '../shared/version-context.ts'
import { COLORS, failureReport, metaLine, pill, select, shortCommit, thrownFailureReport, PRIORITY_META, STATUS_META, type FailureReport } from './shell.ts'
import { reportLoomFailure } from './feedback.ts'
import { NS, type LoomKey } from './locales.ts'
import { presetDisplayText, type BuiltInPresetCopyKey } from '@deepseek-ai/dsh-agent-preset-registry/display'
import type { LoomHostPort as LoomInjected } from '../ports/loom-host.ts'

const PRESET_COPY: Readonly<Record<BuiltInPresetCopyKey, LoomKey>> = {
  presetStandardName: 'preset.standardName', presetStandardDescription: 'preset.standardDescription',
  presetPtcName: 'preset.ptcName', presetPtcDescription: 'preset.ptcDescription',
  presetMinimalName: 'preset.minimalName', presetMinimalDescription: 'preset.minimalDescription',
  presetCordisName: 'preset.cordisName', presetCordisDescription: 'preset.cordisDescription',
}

interface LoomSeat {
  SessionProvider: SessionProviderComponent
  renderSlot(key: 'loom.conversation', owner: object): ReactNode
}
/** Root kit plus the session-scoped child declared by Loom. */
export type LoomPanelProps = PropsRuntime<'main'> & InjectFace<LoomInjected> & PropsLocale<typeof NS> & LoomSeat & PropsRenderFactories

type CatalogState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly snapshot: CatalogSnapshot }
type View = 'workbench' | 'kanban'
type CreateKind = 'project' | 'import' | 'version' | 'task'
type EditKind = 'project' | 'version' | 'task'

const frame: CSSProperties = { position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, color: COLORS.text, background: COLORS.bg, fontSize: 13, overflow: 'hidden' }
const sidebar: CSSProperties = { width: 256, flex: 'none', background: COLORS.panel2, borderRight: `0.5px solid ${COLORS.border}`, overflowY: 'auto', padding: '8px 0' }
const center: CSSProperties = { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: COLORS.panel }
const aside: CSSProperties = { width: 344, flex: 'none', display: 'flex', flexDirection: 'column', borderLeft: `0.5px solid ${COLORS.border}`, background: COLORS.panel }
const modalOverlay: CSSProperties = { position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, overflow: 'auto', background: 'rgba(0,0,0,.42)' }
const modalCard: CSSProperties = { display: 'flex', flexDirection: 'column', width: '100%', maxHeight: 'calc(100% - 48px)', boxSizing: 'border-box', overflowY: 'auto', padding: '20px 22px 0', background: COLORS.panel, border: `0.5px solid ${COLORS.border}`, borderRadius: 'var(--dsw-radius-lg)', boxShadow: '0 24px 64px rgba(0,0,0,.32)' }
const modalHeader: CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 8, minHeight: 30, marginBottom: 6 }
const modalTitle: CSSProperties = { fontSize: 18, fontWeight: 500, lineHeight: 1.3, letterSpacing: '-.015em' }
const modalHint: CSSProperties = { margin: '0 0 12px', color: COLORS.dim, fontSize: 12, lineHeight: 1.55 }
const modalSub: CSSProperties = { marginTop: 7, color: COLORS.dim, fontSize: 12, lineHeight: 1.5 }
const MODAL_WIDTH: Readonly<Record<CreateKind | EditKind, number>> = { project: 760, import: 640, version: 660, task: 660 }
const convHeader: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '9px 16px', borderBottom: `0.5px solid ${COLORS.border}`, minHeight: 40, flex: 'none' }
const note: CSSProperties = { padding: 12, borderRadius: 8, color: COLORS.dim, background: COLORS.panel2, lineHeight: 1.6, margin: 0 }

function ProjectItem({ candidate, versions, tasks, activeProject, activeVersionId, activeTaskId, open, openVersions, pinned, t, onProject, onVersion, onTask, onPin, onNewVersion, onEditProject, onDeleteProject, onEditVersion, onDeleteVersion, onNewTask, onEditTask, onDeleteTask }: {
  candidate: ProjectRecord
  versions: VersionRecord[]
  tasks: TaskRecord[]
  activeProject: boolean
  activeVersionId: VersionRecord['id'] | undefined
  activeTaskId: TaskRecord['id'] | undefined
  open: boolean
  openVersions: ReadonlySet<string>
  pinned: boolean
  t: LoomPanelProps['t']
  onProject: () => void
  onVersion: (version: VersionRecord) => void
  onTask: (task: TaskRecord) => void
  onPin: () => void
  onNewVersion: () => void
  onEditProject: () => void
  onDeleteProject: () => void
  onEditVersion: (version: VersionRecord) => void
  onDeleteVersion: (version: VersionRecord) => void
  onNewTask: (version: VersionRecord) => void
  onEditTask: (task: TaskRecord) => void
  onDeleteTask: (task: TaskRecord) => void
}) {
  return <div>
    <div className={activeProject ? 'loom-tree-row loom-tree-row-active' : 'loom-tree-row'} style={{ display: 'flex', alignItems: 'center', background: activeProject ? COLORS.panel3 : 'transparent' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <TreeRow depth={0} expanded={open} icon={open ? <IconFolderOpenRegular /> : <IconFolderCloseRegular />} label={candidate.config.name} active={activeProject} count={String(versions.length)} onClick={onProject} />
      </div>
      <span className="loom-row-actions" style={{ display: 'flex', alignItems: 'center', gap: 0, flex: 'none', alignSelf: 'stretch' }}>
        <TreeIconAction label={t('version.new')} icon={<IconPlusOutlineRegular size={13} />} onClick={onNewVersion} />
        <TreeIconAction label={t('project.edit')} icon={<IconEditOutlineRegular size={13} />} onClick={onEditProject} />
        <TreeIconAction label={t('project.delete')} icon={<IconTrashOutlineRegular size={13} />} onClick={onDeleteProject} danger />
        <PinButton pinned={pinned} label={pinned ? t('side.unpin') : t('side.pin')} onToggle={onPin} />
      </span>
    </div>
    {open && versions.map(item => {
      const versionTasks = tasks.filter(candidateTask => candidateTask.versionId === item.id)
      const openVersion = openVersions.has(item.id)
      return <div key={item.id}>
        <div className={activeVersionId === item.id ? 'loom-tree-row loom-tree-row-active' : 'loom-tree-row'} style={{ display: 'flex', alignItems: 'center', background: activeVersionId === item.id ? COLORS.panel3 : 'transparent' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <TreeRow depth={1} expanded={openVersion} label={<span style={versionChip}>{item.name}</span>} count={String(versionTasks.length)} active={activeVersionId === item.id} onClick={() => onVersion(item)} />
          </div>
          <span className="loom-row-actions" style={{ display: 'flex', alignItems: 'center', gap: 0, flex: 'none', alignSelf: 'stretch' }}>
            <TreeIconAction label={t('version.edit')} icon={<IconEditOutlineRegular size={13} />} onClick={() => onEditVersion(item)} />
            <TreeIconAction label={t('task.new')} icon={<IconPlusOutlineRegular size={13} />} onClick={() => onNewTask(item)} />
            <TreeIconAction label={t('version.delete')} icon={<IconTrashOutlineRegular size={13} />} onClick={() => onDeleteVersion(item)} danger />
          </span>
        </div>
        {openVersion && versionTasks.map(itemTask => <div key={itemTask.id} className={activeTaskId === itemTask.id ? 'loom-tree-row loom-tree-row-active' : 'loom-tree-row'} style={{ display: 'flex', alignItems: 'center', background: activeTaskId === itemTask.id ? COLORS.panel3 : 'transparent' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <ProjectTaskRow task={itemTask} active={activeTaskId === itemTask.id} t={t} onClick={() => onTask(itemTask)} />
          </div>
          <span className="loom-row-actions" style={{ display: 'flex', alignItems: 'center', gap: 0, flex: 'none', alignSelf: 'stretch' }}>
            <TreeIconAction label={t('task.edit')} icon={<IconEditOutlineRegular size={13} />} onClick={() => onEditTask(itemTask)} />
            <TreeIconAction label={t('task.delete')} icon={<IconTrashOutlineRegular size={13} />} onClick={() => onDeleteTask(itemTask)} danger />
          </span>
        </div>)}
        {openVersion && versionTasks.length === 0 && <p style={{ ...metaLine, padding: '2px 14px 2px 40px' }}>{t('task.empty')}</p>}
      </div>
    })}
  </div>
}

function NextStepCard({ t, projects, project, versions, version, locks, tasks, onCreateProject, onCreateVersion, onCreateTask, onSelectProject, onSelectVersion, onSelectTask, generateLock, onLockChanged }: {
  t: LoomPanelProps['t']
  projects: readonly ProjectRecord[]
  project: ProjectRecord | undefined
  versions: readonly VersionRecord[]
  version: VersionRecord | undefined
  locks: readonly Lock[]
  tasks: readonly TaskRecord[]
  onCreateProject: () => void
  onCreateVersion: () => void
  onCreateTask: () => void
  onSelectProject: (record: ProjectRecord) => void
  onSelectVersion: (record: VersionRecord) => void
  onSelectTask: (record: TaskRecord) => void
  generateLock: (request: GenerateLockRequest) => Promise<RemoteResult<Lock>>
  onLockChanged: () => void
}) {
  const stage = project === undefined ? 0 : versions.length === 0 ? 1 : version === undefined ? 1 : locks.length === 0 ? 2 : tasks.length === 0 ? 3 : 4
  const steps: readonly { readonly key: LoomKey; readonly done: boolean }[] = [
    { key: 'project.title', done: project !== undefined },
    { key: 'version.title', done: versions.length > 0 },
    { key: 'lock.title', done: locks.length > 0 },
    { key: 'task.title', done: tasks.length > 0 },
  ]
  return <div style={{ width: '100%', maxWidth: 560, background: COLORS.panel2, border: `0.5px solid ${COLORS.border}`, borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ color: COLORS.accent, fontSize: 18 }}>🧶</span>
        <strong style={{ fontSize: 15, fontWeight: 500, color: COLORS.text }}>{t('onboard.title')}</strong>
      </div>
      <p style={{ margin: 0, color: COLORS.dim, fontSize: 12, lineHeight: 1.6 }}>{t(stage === 0 ? 'onboard.projectHint' : stage === 1 ? 'onboard.versionHint' : stage === 2 ? 'onboard.lockHint' : stage === 3 ? 'onboard.taskHint' : 'onboard.done')}</p>
    </div>
    <ol aria-label={t('onboard.steps')} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', listStyle: 'none', gap: 0, padding: 0, margin: 0 }}>
      {steps.map((step, index) => {
        const current = index === stage
        return <li key={step.key} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 0 }}>
          {index > 0 && <span aria-hidden style={{ position: 'absolute', top: 10, right: '50%', width: '100%', height: 1, background: step.done || current ? COLORS.accent : COLORS.border }} />}
          <span style={{ position: 'relative', zIndex: 1, width: 22, height: 22, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 500, background: step.done || current ? COLORS.accent : COLORS.panel3, color: step.done || current ? 'var(--dsw-alias-label-primary-foreground)' : COLORS.dim, border: `1px solid ${step.done || current ? COLORS.accent : COLORS.border}` }}>{step.done ? '✓' : String(index + 1)}</span>
          <span style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: current ? COLORS.text : COLORS.dim, fontSize: 11, fontWeight: current ? 600 : 400 }}>{t(step.key)}</span>
        </li>
      })}
    </ol>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      {project === undefined && projects.length > 0 && <>
        <span style={{ color: COLORS.dim, fontSize: 12 }}>{t('onboard.selectProject')}</span>
        {projects.slice(0, 4).map(record => <Button key={record.id} size="sm" variant="outline" onClick={() => onSelectProject(record)}>{record.config.name}</Button>)}
        <Button size="sm" variant="ghost" icon={<IconPlusOutlineRegular />} onClick={onCreateProject}>{t('project.new')}</Button>
      </>}
      {project === undefined && projects.length === 0 && <Button variant="primary" className="loom-primary" icon={<IconPlusOutlineRegular />} onClick={onCreateProject}>{t('project.new')}</Button>}
      {project !== undefined && versions.length === 0 && <Button variant="primary" className="loom-primary" icon={<IconPlusOutlineRegular />} onClick={onCreateVersion}>{t('version.new')}</Button>}
      {project !== undefined && versions.length > 0 && version === undefined && <>
        <span style={{ color: COLORS.dim, fontSize: 12 }}>{t('onboard.selectVersion')}</span>
        {versions.map(record => <Button key={record.id} size="sm" variant="outline" onClick={() => onSelectVersion(record)}>{record.name}</Button>)}
        <Button size="sm" variant="ghost" icon={<IconPlusOutlineRegular />} onClick={onCreateVersion}>{t('version.new')}</Button>
      </>}
      {version !== undefined && locks.length === 0 && <LockButton t={t} version={version} generate={generateLock} onCreated={onLockChanged} />}
      {version !== undefined && locks.length > 0 && tasks.length === 0 && <Button variant="primary" className="loom-primary" icon={<IconPlusOutlineRegular />} onClick={onCreateTask}>{t('task.new')}</Button>}
      {version !== undefined && locks.length > 0 && tasks.length > 0 && <>
        <span style={{ color: COLORS.dim, fontSize: 12 }}>{t('onboard.chooseTask')}</span>
        {tasks.slice(-3).reverse().map(record => <Button key={record.id} size="sm" variant="outline" onClick={() => onSelectTask(record)}>{record.title}</Button>)}
        <Button size="sm" variant="ghost" icon={<IconPlusOutlineRegular />} onClick={onCreateTask}>{t('task.new')}</Button>
      </>}
    </div>
  </div>
}

function readPinnedProjects(): ProjectRecord['id'][] {
  if (typeof localStorage === 'undefined') return []
  try {
    const value: unknown = JSON.parse(localStorage.getItem('loom.pinnedProjects') ?? '[]')
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') as ProjectRecord['id'][] : []
  } catch { return [] }
}

/**
 * Render the Loom shell. Every card and counter comes from the Host catalog; unwired
 * integrations stay labeled instead of showing mock data.
 * @param props - locale, native catalog, session acquisition, catalog actions, and renderer seats.
 * @returns the whole Loom page.
 */
export function LoomPanel({ t, useSessions, retainSession, openResource, loadSnapshot, createProject, updateProject, deleteProject, createVersion, updateVersion, deleteVersion, createTask, updateTask, deleteTask, generateLock, prepareWorkspace, prepareWorkspaceSilent, registerWorkspace, repositoryBranches, inspectWorkspace, pickDirectory, listDirectory, requestDraftInitialization, startAttempt, attachSession, registerTemporarySession, listAgentPresets, transitionTask, createSessionInWorkspace, openPath, openPathApplications, openPathWith, workspaceChanges, workspaceChangeCount, workspaceStatus, readFile, readBytes, commitWorkspace, updateWorkspace, deleteWorkspace, cleanupWorkspace, cleanupWorkspaceSilent, acquireExecution, cancelExecution, reorderExecutionQueue, releaseExecution, takeoverExecution, forkSession, jobs, SessionProvider, renderSlot }: LoomPanelProps) {
  const sessions = useSessions(state => state)
  const [preferences, setPreferences] = useState<LoomPreferences>(readPreferences)
  const [view, setView] = useState<View>(preferences.view)
  const [route, setRoute] = useState<LoomRoute>(() => typeof window === 'undefined' ? 'task' : parseLoomHash(window.location.hash).route)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 940)
  const [viewport, setViewport] = useState(() => ({ width: typeof window === 'undefined' ? 1440 : window.innerWidth, height: typeof window === 'undefined' ? 900 : window.innerHeight }))
  const navigate = useCallback((next: LoomRoute): void => {
    setRoute(next)
    if (next === 'board') setView('kanban')
    else if (next === 'task' || next === 'session' || next === 'project') setView('workbench')
    else if (next === 'settings') setSettingsOpen(true)
    if (typeof window !== 'undefined') {
      const hash = `#${next}`
      if (window.location.hash !== hash) window.location.hash = hash
    }
  }, [])
  useEffect(() => {
    if (typeof window === 'undefined') return
    const apply = (): void => {
      const next = parseLoomHash(window.location.hash).route
      setRoute(next)
      if (next === 'board') setView('kanban')
      else if (next === 'task' || next === 'session' || next === 'project') setView('workbench')
      else if (next === 'settings') setSettingsOpen(true)
    }
    apply()
    window.addEventListener('hashchange', apply)
    return () => window.removeEventListener('hashchange', apply)
  }, [])

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [project, setProject] = useState<ProjectRecord['id']>()
  const [version, setVersion] = useState<VersionRecord['id']>()
  const [task, setTask] = useState<TaskRecord>()
  const [selected, setSelected] = useState<SessionId>()
  const [executionSession, setExecutionSession] = useState<SessionId>()
  const [forking, setForking] = useState(false)
  const [forkError, setForkError] = useState<string>()
  const [releasingWorkspace, setReleasingWorkspace] = useState<string>()
  const [releaseError, setReleaseError] = useState<string>()
  const [releasingAll, setReleasingAll] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [claimError, setClaimError] = useState<string>()
  const [pinnedProjects, setPinnedProjects] = useState<ProjectRecord['id'][]>(readPinnedProjects)
  const [held, setHeld] = useState<{ id: SessionId; reference: SessionReference }>()
  const [pendingDraft, setPendingDraft] = useState<{ sessionId: SessionId; prompt: string }>()
  const [directoryRequest, setDirectoryRequest] = useState<{ startPath?: string }>()
  const directoryResolve = useRef<((value: string | null) => void) | undefined>(undefined)
  const [draftAttempt, setDraftAttempt] = useState(0)
  const heldRef = useRef<{ id: SessionId; reference: SessionReference } | undefined>(undefined)
  const [failure, setFailure] = useState<SessionId>()
  const [sessionRetry, setSessionRetry] = useState(0)
  const [search, setSearch] = useState('')
  const [temporaryOpen, setTemporaryOpen] = useState(false)
  const [agentPresets, setAgentPresets] = useState<readonly AgentPresetOption[]>([])
  const presetsLoaded = useRef(false)
  const [catalog, setCatalog] = useState<CatalogState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [asideOpen, setAsideOpen] = useState(preferences.contextOpen)
  const [previewFullscreen, setPreviewFullscreen] = useState(false)
  const [bottomCollapsed, setBottomCollapsed] = useState(true)
  const [pane, setPane] = useState<LoomBottomPane>('diff')
  const [diffCount, setDiffCount] = useState(0)
  const preview = useSyncExternalStore(workspacePreview.subscribe, workspacePreview.getSnapshot, workspacePreview.getSnapshot)
  const review = useSyncExternalStore(workspaceReviewPreview.subscribe, workspaceReviewPreview.getSnapshot, workspaceReviewPreview.getSnapshot)
  const [kbMode, setKbMode] = useState<'flat' | 'grouped'>(preferences.kanbanMode)
  const [filterProject, setFilterProject] = useState('')
  const [filterVersion, setFilterVersion] = useState('')
  const [filterStatus, setFilterStatus] = useState<TaskRecord['status'] | ''>('')
  const [filterPriority, setFilterPriority] = useState<TaskPriority | ''>('')
  const [filterModule, setFilterModule] = useState('')
  const [kbSearch, setKbSearch] = useState('')
  const [expandedProjects, setExpandedProjects] = useState<ReadonlySet<string>>(new Set())
  const [expandedVersions, setExpandedVersions] = useState<ReadonlySet<string>>(new Set())
  const [collapsedSections, setCollapsedSections] = useState<ReadonlySet<'pinned' | 'projects' | 'sessions'>>(new Set())
  const [create, setCreate] = useState<CreateKind>()
  const [edit, setEdit] = useState<EditKind>()
  const [versionStep, setVersionStep] = useState<VersionStep>('name')
  const [modalBusy, setModalBusy] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const newMenuRef = useRef<HTMLDivElement>(null)
  const [treeDelete, setTreeDelete] = useState<ProjectRecord>()
  const [treeDeleting, setTreeDeleting] = useState(false)
  const [treeDeleteFailure, setTreeDeleteFailure] = useState<FailureReport>()
  useEffect(() => {
    if (!menuOpen) return
    const closeOnOutside = (event: PointerEvent): void => {
      if (event.target instanceof Node && newMenuRef.current?.contains(event.target) === true) return
      setMenuOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent): void => { if (event.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('pointerdown', closeOnOutside, true)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside, true)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [menuOpen])
  useEffect(() => {
    const timeout = setTimeout(() => writePreferences(preferences), 120)
    return () => clearTimeout(timeout)
  }, [preferences])
  useEffect(() => {
    if (presetsLoaded.current) return
    presetsLoaded.current = true
    let active = true
    listAgentPresets().then((result) => {
      if (!active || !result.ok) return
      setAgentPresets(result.value.presets.map((preset) => {
        const copy = presetDisplayText(preset, key => t(PRESET_COPY[key]))
        return { ...preset, name: copy.name, ...(copy.description === undefined ? {} : { description: copy.description }) }
      }))
    }, () => { /* the project picker keeps the deployment default */ })
    return () => { active = false }
  }, [listAgentPresets, t])
  useEffect(() => {
    if (!settingsOpen) return
    const close = (event: KeyboardEvent): void => { if (event.key === 'Escape') setSettingsOpen(false) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [settingsOpen])
  useEffect(() => { setModalBusy(false) }, [create, edit])
  useEffect(() => {
    if (create === undefined && edit === undefined) return
    const close = (event: KeyboardEvent): void => { if (event.key === 'Escape' && !modalBusy) { setCreate(undefined); setEdit(undefined) } }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [create, edit, modalBusy])
  useEffect(() => {
    const resize = (): void => {
      setNarrow(window.innerWidth <= 940)
      setViewport({ width: window.innerWidth, height: window.innerHeight })
    }
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])
  useEffect(() => { setSidebarOpen(false) }, [project, version, task])
  useEffect(() => {
    if (project !== undefined) setExpandedProjects(current => current.has(project) ? current : new Set(current).add(project))
    if (version !== undefined) setExpandedVersions(current => current.has(version) ? current : new Set(current).add(version))
  }, [project, version])
  useEffect(() => { if (preview !== undefined || review !== undefined) setAsideOpen(true) }, [preview, review])
  useEffect(() => { if (preview === undefined) setPreviewFullscreen(false) }, [preview])
  useEffect(() => {
    if (!previewFullscreen) return
    const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') setPreviewFullscreen(false) }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [previewFullscreen])
  useEffect(() => { workspacePreview.close(); workspaceReviewPreview.close() }, [task?.id])
  useEffect(() => {
    if (typeof localStorage === 'undefined') return
    try { localStorage.setItem('loom.pinnedProjects', JSON.stringify(pinnedProjects)) } catch { /* Storage can be unavailable in private browsing; pins remain in memory. */ }
  }, [pinnedProjects])
  useEffect(() => {
    let active = true
    setCatalog({ status: 'loading' })
    loadSnapshot().then((result) => {
      if (!active) return
      setCatalog(result.ok ? { status: 'ready', snapshot: result.value } : { status: 'error' })
    }, () => { if (active) setCatalog({ status: 'error' }) })
    return () => { active = false }
  }, [loadSnapshot, attempt])
  const initialSelection = useRef(false)
  // The project tree starts collapsed; the selection effect below expands only
  // the project and version it navigates to.
  useEffect(() => {
    if (initialSelection.current || catalog.status !== 'ready') return
    if (project !== undefined || version !== undefined || task !== undefined) { initialSelection.current = true; return }
    const running = catalog.snapshot.tasks.find(candidate => candidate.status === 'running')
    const runningVersion = running === undefined ? undefined : catalog.snapshot.versions.find(candidate => candidate.id === running.versionId)
    if (running !== undefined && runningVersion !== undefined) {
      initialSelection.current = true
      setProject(runningVersion.projectId); setVersion(runningVersion.id); setTask(running)
      return
    }
    const first = catalog.snapshot.projects[0]
    if (first === undefined) return
    initialSelection.current = true
    setProject(first.id)
    const latest = catalog.snapshot.versions.filter(candidate => candidate.projectId === first.id).at(-1)
    if (latest !== undefined) setVersion(latest.id)
  }, [catalog, project, version, task])
  useEffect(() => {
    if (selected === undefined) return
    let reference: SessionReference
    try { reference = retainSession(selected) }
    catch { setFailure(selected); return }
    let active = true
    setFailure(undefined)
    heldRef.current = { id: selected, reference }
    setHeld({ id: selected, reference })
    void reference.ready.catch(() => { if (active) setFailure(selected) })
    return () => {
      active = false
      if (heldRef.current?.reference === reference) heldRef.current = undefined
      reference.release()
    }
  }, [selected, retainSession, sessionRetry])
  const snapshot = catalog.status === 'ready' ? catalog.snapshot : undefined
  const currentProject = snapshot?.projects.find(candidate => candidate.id === project)
  const currentVersion = snapshot?.versions.find(candidate => candidate.id === version)
  const currentVersionProject = snapshot?.projects.find(candidate => candidate.id === currentVersion?.projectId)
  const boundRows = snapshot === undefined ? [] : boundSessions(snapshot)
  const liveTaskIds = new Set(boundRows.filter(row => sessions.byId[row.sessionId as SessionId]?.running === true).map(row => row.task.id))
  const runningSessionIds = new Set(Object.entries(sessions.byId).filter(([, row]) => row?.running === true).map(([id]) => id))
  const boundIds = new Set(boundRows.map(row => row.sessionId))
  const taskSessionCandidates = [...boundIds]
    .map(id => sessions.byId[id as SessionId])
    .filter(row => row !== undefined)
  const taskSessionList = snapshot === undefined ? [] : taskSessionRows(taskSessionCandidates, boundIds, search, preferences.sessionLimit)
  const taskTitleBySession = new Map(boundRows.map(row => [row.sessionId, row.task.title]))
  const projectNameById = new Map((snapshot?.projects ?? []).map(candidate => [candidate.id, candidate.config.name] as const))
  const taskProjectBySession = new Map<string, string>()
  for (const row of boundRows) {
    const name = projectNameById.get(row.projectId)
    if (name !== undefined) taskProjectBySession.set(row.sessionId, name)
  }
  const temporaryIds = new Set((snapshot?.temporarySessions ?? []).map(row => row.sessionId))
  const temporaryProjectBySession = new Map<string, string>()
  for (const record of snapshot?.temporarySessions ?? []) {
    const workspace = snapshot?.workspaces.find(candidate => candidate.path === record.workspacePath)
    const temporaryVersion = snapshot?.versions.find(candidate => candidate.id === workspace?.versionId)
    const name = temporaryVersion === undefined ? undefined : projectNameById.get(temporaryVersion.projectId)
    if (name !== undefined) temporaryProjectBySession.set(record.sessionId, name)
  }
  const temporarySessionCandidates = [...temporaryIds]
    .map(id => sessions.byId[id as SessionId])
    .filter(row => row !== undefined)
  const temporarySessionList = snapshot === undefined ? [] : taskSessionRows(temporarySessionCandidates, temporaryIds, search, preferences.sessionLimit)
  const detailTask = task === undefined ? undefined : snapshot?.tasks.find(candidate => candidate.id === task.id) ?? task
  const taskVersion = detailTask === undefined || snapshot === undefined ? undefined : snapshot.versions.find(candidate => candidate.id === detailTask.versionId)
  const displayProject = currentProject ?? (taskVersion === undefined ? undefined : snapshot?.projects.find(candidate => candidate.id === taskVersion.projectId))
  const displayPresetName = displayProject?.config.agentPreset === undefined ? undefined : agentPresets.find(candidate => candidate.id === displayProject.config.agentPreset)?.name ?? displayProject.config.agentPreset
  const displayVersion = currentVersion ?? taskVersion
  const displayVersionProject = snapshot?.projects.find(candidate => candidate.id === displayVersion?.projectId)
  const versionContext = snapshot === undefined || displayVersion === undefined
    ? undefined
    : deriveVersionContext(snapshot, displayVersion.id, detailTask === undefined ? undefined : { currentTaskId: detailTask.id })
  const failedSessions = new Set<string>(failure === undefined ? [] : [failure])
  const detailAttemptRows = taskAttemptRows(detailTask, id => sessions.byId[id as SessionId], failedSessions)
  const detailPriority = detailTask?.priority ?? 'normal'
  const detailModules = (detailTask?.moduleIds ?? []).map(moduleId => displayProject?.config.modules.find(module => module.id === moduleId)?.path ?? moduleId)
  const detailWorkspace = snapshot === undefined ? undefined : currentWorkspace(snapshot, detailTask)
  const detailAttemptId = detailTask?.attempts.at(-1)?.id

  const loadTaskChanges = useCallback((request: WorkspaceChangesRequest) => workspaceChanges(detailAttemptId === undefined ? request : { ...request, attemptId: detailAttemptId }), [detailAttemptId, workspaceChanges])
  const anyPreviewOpen = preview !== undefined || review !== undefined
  const asideMin = anyPreviewOpen ? 300 : 320
  const asideCssMax = viewport.width <= 940 ? (anyPreviewOpen ? 380 : 300)
    : viewport.width <= 1180 ? (anyPreviewOpen ? 460 : 380)
      : anyPreviewOpen ? 720 : 460
  const asideMax = Math.min(asideCssMax, Math.max(asideMin, viewport.width - (narrow ? 180 : 460)))
  const asideWidth = Math.min(Math.max(anyPreviewOpen ? preferences.previewWidth : preferences.asideWidth, asideMin), asideMax)
  const setAsideWidth = (width: number): void => setPreferences(current => ({ ...current, [anyPreviewOpen ? 'previewWidth' : 'asideWidth']: width }))
  const bottomMax = Math.max(120, Math.min(320, viewport.height - 220))
  const bottomHeight = Math.min(Math.max(preferences.bottomHeight, 80), bottomMax)
  const previewSessionId: SessionId | undefined = preview?.sessionId === undefined
    ? selected ?? boundRows.find(row => row.task?.id === detailTask?.id)?.sessionId as SessionId | undefined
    : preview.sessionId as SessionId
  const taskSessions = snapshot === undefined || detailTask === undefined ? [] : boundSessions(snapshot).filter(row => row.task.id === detailTask.id)
  const activeSessionRows: readonly LoomTaskSessionRow[] = taskSessions.map(row => {
    const summary = sessions.byId[row.sessionId as SessionId]
    return {
      id: row.sessionId,
      ...(summary?.parentId === undefined ? {} : { parentId: String(summary.parentId) }),
      label: summary?.displayTitle ?? row.task.title,
      running: summary?.running === true,
      updatedAt: summary?.updatedAt ?? 0,
    }
  })
  // Poll faster while a bound Session is running: the Host catalog carries the
  // execution owner, and a 5s poll would show that owner well after the turn
  // starts. Native session status is immediate, so it drives the cadence.
  const liveSnapshot = activeSessionRows.some(row => row.running)
  useEffect(() => {
    let cancelled = false
    let timer = 0
    const tick = (): void => {
      if (!cancelled && document.visibilityState === 'visible') {
        void loadSnapshot().then((result) => {
          if (!cancelled && result.ok) setCatalog({ status: 'ready', snapshot: result.value })
        }, () => undefined)
      }
      if (!cancelled) timer = window.setTimeout(tick, liveSnapshot ? 1200 : 5000)
    }
    timer = window.setTimeout(tick, liveSnapshot ? 1200 : 5000)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [loadSnapshot, liveSnapshot])
  const runtimeSessionId = (selected ?? taskSessions.at(-1)?.sessionId) as SessionId | undefined
  const runtimeCatalog = runtimeSessionId === undefined ? [] : sessions.projectionsBySession[runtimeSessionId]?.values.subagentCatalog ?? []
  const subagentRows: readonly LoomSubagentRow[] = runtimeCatalog.map(entry => ({
    id: entry.id,
    label: entry.label ?? entry.id,
    mode: entry.mode,
    running: sessions.byId[entry.id]?.running === true,
  }))
  const runtimeTask = detailTask ?? boundRows.find(row => row.sessionId === runtimeSessionId)?.task
  const runtimeWorkspace = snapshot === undefined ? undefined : currentWorkspace(snapshot, runtimeTask)
  const workspaceDisplay = (() => {
    const path = runtimeWorkspace?.rootPath ?? runtimeWorkspace?.path
    if (path === undefined) return runtimeWorkspace?.id
    const segments = path.split('/').filter(Boolean)
    return segments.at(-1) ?? path
  })()
  const runtimeExecution = runtimeWorkspace === undefined ? undefined : snapshot?.executions.find(candidate => candidate.workspaceId === runtimeWorkspace.id)
  const sessionLabel = (id: string): string => boundRows.find(row => row.sessionId === id)?.task.title ?? sessions.byId[id as SessionId]?.displayTitle ?? id.slice(0, 12)
  const workspaceAccess = runtimeWorkspace === undefined ? undefined : {
    workspaceLabel: workspaceName(runtimeWorkspace.rootPath ?? runtimeWorkspace.path) ?? runtimeWorkspace.path,
    ...(runtimeExecution?.owner === null || runtimeExecution?.owner === undefined ? {} : { owner: { id: runtimeExecution.owner.sessionId, label: sessionLabel(runtimeExecution.owner.sessionId), running: sessions.byId[runtimeExecution.owner.sessionId]?.running === true } }),
    waiting: (runtimeExecution?.waiting ?? []).map(id => ({ id, label: sessionLabel(id) })),
  }
  async function releaseOwner(workspaceId: string, owner: { readonly sessionId: string; readonly generation: number }): Promise<void> {
    setReleasingWorkspace(workspaceId); setReleaseError(undefined)
    try {
      const result = await releaseExecution({ workspaceId, sessionId: owner.sessionId, generation: owner.generation })
      if (!result.ok) { setReleaseError(`${t('graph.releaseFailed')}${result.error.message}`); return }
      setAttempt(current => current + 1)
    } catch (error) {
      setReleaseError(`${t('graph.releaseFailed')}${error instanceof Error ? error.message : String(error)}`)
    } finally { setReleasingWorkspace(undefined) }
  }
  async function releaseAllStale(): Promise<void> {
    if (snapshot === undefined) return
    const stale = snapshot.executions.filter(execution => execution.owner !== null && execution.owner !== undefined && runningSessionIds.has(execution.owner.sessionId) !== true)
    if (stale.length === 0) return
    setReleasingAll(true); setReleaseError(undefined)
    const failures: string[] = []
    try {
      for (const execution of stale) {
        const owner = execution.owner
        if (owner === null || owner === undefined) continue
        const result = await releaseExecution({ workspaceId: execution.workspaceId, sessionId: owner.sessionId, generation: Number(owner.generation) })
        if (!result.ok) failures.push(`${owner.sessionId.slice(0, 8)}: ${result.error.message}`)
      }
      if (failures.length > 0) setReleaseError(`${t('graph.releaseFailed')}${failures.join('; ')}`)
      setAttempt(current => current + 1)
    } catch (error) {
      setReleaseError(`${t('graph.releaseFailed')}${error instanceof Error ? error.message : String(error)}`)
    } finally { setReleasingAll(false) }
  }
  async function claimWorkspace(): Promise<void> {
    if (runtimeWorkspace === undefined || runtimeSessionId === undefined || runtimeExecution?.owner === null || runtimeExecution?.owner === undefined) return
    setClaiming(true); setClaimError(undefined)
    try {
      const owner = runtimeExecution.owner
      const waiting = runtimeExecution.waiting.includes(runtimeSessionId)
      const released = await releaseExecution({ workspaceId: runtimeWorkspace.id, sessionId: owner.sessionId, generation: Number(owner.generation) })
      if (!released.ok) { setClaimError(`${t('runtime.claimFailed')}${released.error.message}`); return }
      if (!waiting) {
        const acquired = await acquireExecution({ workspaceId: runtimeWorkspace.id, sessionId: runtimeSessionId })
        if (!acquired.ok) { setClaimError(`${t('runtime.claimFailed')}${acquired.error.message}`); return }
      }
      setAttempt(current => current + 1)
    } catch (error) {
      setClaimError(`${t('runtime.claimFailed')}${error instanceof Error ? error.message : String(error)}`)
    } finally { setClaiming(false) }
  }
  async function forkSessionAction(): Promise<void> {
    if (runtimeSessionId === undefined || detailTask === undefined || detailWorkspace === undefined) return
    setForking(true); setForkError(undefined)
    try {
      const committed = await commitWorkspace({ workspaceId: detailWorkspace.id, message: 'Loom: checkpoint before fork' })
      if (!committed.ok) { setForkError(`${t('runtime.forkFailed')}${committed.error.message}`); return }
      const failed = committed.value.repositories.find(repository => repository.error !== undefined)
      if (failed !== undefined) { setForkError(`${t('runtime.forkFailed')}${failed.sourceId}: ${failed.error ?? ''}`); return }
      const child = await forkSession({ sessionId: runtimeSessionId, increaseTitle: true })
      const attached = await attachSession({ taskId: detailTask.id, sessionId: child })
      if (!attached.ok) { setForkError(`${t('runtime.forkFailed')}${attached.error.message}`); return }
      selectSession(child)
      setAttempt(current => current + 1)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setForkError(/no completed turn/iu.test(message) ? t('runtime.forkNoTurn') : `${t('runtime.forkFailed')}${message}`)
    } finally { setForking(false) }
  }

  const nativeSession = (selected ?? taskSessions.at(-1)?.sessionId) as SessionId | undefined
  const openNativeFile = (path: string, sessionId: SessionId | undefined = nativeSession): void => {
    if (sessionId !== undefined && openResource(fileAddressFor(sessionId, detailWorkspace?.path, path))) return
    openFilePreview({ path })
    setAsideOpen(true)
  }
  const tokenUsage = aggregateTokenUsage(taskSessions.map(row => sessions.projectionsBySession[row.sessionId as SessionId]?.values))
  const usageBySession = Object.fromEntries(boundRows.map(row => [row.sessionId, tokenUsageOf(sessions.projectionsBySession[row.sessionId as SessionId]?.values)]))
  const sessionGroups = snapshot === undefined || detailTask === undefined || detailWorkspace === undefined
    ? []
    : snapshot.tasks
        .filter(candidate => candidate.versionId === detailTask.versionId && currentWorkspace(snapshot, candidate)?.id === detailWorkspace.id)
        .map(candidate => ({
          taskId: candidate.id,
          taskTitle: candidate.title,
          rows: boundRows.filter(row => row.task.id === candidate.id).map(row => {
            const summary = sessions.byId[row.sessionId as SessionId]
            return {
              id: row.sessionId,
              ...(summary?.parentId === undefined ? {} : { parentId: String(summary.parentId) }),
              label: summary?.displayTitle ?? candidate.title,
              running: summary?.running === true,
              updatedAt: summary?.updatedAt ?? 0,
            }
          }),
        }))
        .filter(group => group.rows.length > 0)
        .sort((a, b) => a.taskId === detailTask.id ? -1 : b.taskId === detailTask.id ? 1 : 0)
  const selectedUsage = selected === undefined
    ? tokenUsage
    : aggregateTokenUsage([sessions.projectionsBySession[selected]?.values])
  useEffect(() => {
    if (detailWorkspace?.id === undefined || detailWorkspace.cleaned === true) { setDiffCount(0); return }
    let active = true
    workspaceChangeCount({ workspaceId: detailWorkspace.id, ...(detailAttemptId === undefined ? {} : { attemptId: detailAttemptId }) }).then((result) => {
      if (active) setDiffCount(result.ok ? result.value : 0)
    }, () => { if (active) setDiffCount(0) })
    return () => { active = false }
  }, [detailWorkspace?.id, detailWorkspace?.cleaned, detailAttemptId, attempt, workspaceChangeCount])
  const activeCount = snapshot === undefined ? 0 : activeWorkspaceCount(snapshot)
  const auditWorkspaceIds = new Set<string>((detailTask?.attempts ?? []).map(candidate => candidate.workspaceId))
  const auditRows = snapshot === undefined ? [] : snapshot.audit.filter(entry => detailTask === undefined
    || entry.taskId === detailTask.id
    || (entry.workspaceId !== undefined && auditWorkspaceIds.has(entry.workspaceId))).slice(-40).reverse()
  const available = held !== undefined && held.id === selected && failure !== selected && heldRef.current?.reference === held.reference
  useEffect(() => {
    if (pendingDraft === undefined || pendingDraft.sessionId !== selected || !available || held === undefined) return
    let retry: ReturnType<typeof setTimeout> | undefined
    try {
      const result = requestDraftInitialization(held.reference.binding, { prompt: pendingDraft.prompt, clearPreviousDraft: true })
      if (result === 'blocked' && draftAttempt < 20) retry = setTimeout(() => setDraftAttempt(value => value + 1), 150)
      else setPendingDraft(undefined)
    } catch { /* the native composer may have been replaced by a newer navigation */ setPendingDraft(undefined) }
    return () => { if (retry !== undefined) clearTimeout(retry) }
  }, [pendingDraft, selected, available, held, requestDraftInitialization, draftAttempt])
  function finishDirectory(value: string | null): void {
    const resolve = directoryResolve.current
    directoryResolve.current = undefined
    setDirectoryRequest(undefined)
    resolve?.(value)
  }
  function openDirectoryBrowser(startPath?: string): Promise<string | null> {
    directoryResolve.current?.(null)
    return new Promise(resolve => {
      directoryResolve.current = resolve
      setDirectoryRequest(startPath === undefined ? {} : { startPath })
    })
  }
  async function chooseDirectory(startPath?: string): Promise<string | null> {
    try {
      const picked = await pickDirectory()
      if (picked !== null) return picked
      return null
    } catch {
      return openDirectoryBrowser(startPath)
    }
  }
  async function addVersionWorkspace(input: VersionWorkspaceInput): Promise<RemoteResult<WorkspaceRecord>> {
    if (displayVersion === undefined || displayVersionProject === undefined || snapshot === undefined) {
      throw new Error(t('state.error'))
    }
    if (input.mode !== 'auto') {
      throw new Error(t('workspace.auto'))
    }
    const lock = snapshot.locks.filter(candidate => candidate.versionId === displayVersion.id).at(-1)
    if (lock === undefined) throw new Error(t('lock.generateFirst'))
    const parent = input.parentPath.replace(/\/+$/u, '')
    const root = `${parent}/${input.name}`
    const prefix = (input.branchPrefix === undefined || input.branchPrefix === '' ? 'loom' : input.branchPrefix).replace(/\/+$/u, '')
    const branch = `${prefix}/${input.name}`
    const branches: Record<string, string> = {}
    const repositories = lock.repositories.map(entry => {
      const source = displayVersionProject.config.sources.find(candidate => candidate.id === entry.sourceId)
      if (source === undefined) throw new Error(t('error.workspaceMismatch'))
      const subProjectId = entry.subProjectId === undefined ? 'default' : String(entry.subProjectId)
      const path = autoWorkspaceRepositoryPath(subProjectId, source)
      branches[String(source.id)] = branch
      return { sourceId: String(source.id), path, targetPath: `${root}/${path}` }
    })
    const result = await (prepareWorkspaceSilent ?? prepareWorkspace)({ path: root, versionId: displayVersion.id, lockId: lock.id, mode: 'managed', repositories, branches, requireBranches: true })
    if (!result.ok) return result
    if (result.value.preparation?.status === 'failed') {
      const failed = result.value.preparation.repositories.filter(repository => repository.status === 'failed')
      const reason = failed.length > 0
        ? failed.map(repository => `${repository.path ?? String(repository.sourceId)}: ${repository.error ?? 'failed'}`).join('; ')
        : result.value.preparation.error ?? t('error.workspaceNotPrepared')
      const cleanup = await (cleanupWorkspaceSilent ?? cleanupWorkspace)({ workspaceId: result.value.id, discardChanges: true })
      setAttempt(current => current + 1)
      throw new Error(cleanup.ok ? reason : `${reason}; cleanup failed: ${cleanup.error.message}`)
    }
    setAttempt(current => current + 1)
    return result
  }
  async function renameVersionWorkspace(workspaceId: string, label: string): Promise<RemoteResult<WorkspaceRecord>> {
    const result = await updateWorkspace({ workspaceId, label })
    if (result.ok) setAttempt(current => current + 1)
    return result
  }
  async function removeVersionWorkspace(workspaceId: string, deleteFiles = false, confirmPath?: string): Promise<RemoteResult<void>> {
    const result = deleteFiles
      ? await deleteWorkspace({ workspaceId, deleteFiles: true, ...(confirmPath === undefined ? {} : { confirmPath }) })
      : await cleanupWorkspace({ workspaceId, discardChanges: true })
    if (result.ok) setAttempt(current => current + 1)
    return result
  }
  const execution: ExecutionActions = {
    prepareWorkspace, registerWorkspace, repositoryBranches, inspectWorkspace, pickDirectory: chooseDirectory, startAttempt, commitWorkspace, attachSession, transitionTask, createSessionInWorkspace, cleanupWorkspace, acquireExecution, cancelExecution, reorderExecutionQueue, releaseExecution, takeoverExecution, loadSnapshot,
    onSession: (id, draft) => {
      if (draft !== undefined) { setDraftAttempt(0); setPendingDraft({ sessionId: id, prompt: draft }) }
      setSelected(id); setView('workbench')
    },
    onChanged: () => setAttempt(current => current + 1),
  }
  const temporary: LoomTemporaryActions = {
    pickDirectory: chooseDirectory,
    createSessionInWorkspace,
    registerTemporarySession,
    onSession: (id) => { setTask(undefined); setSelected(id); setView('workbench') },
    onChanged: () => setAttempt(current => current + 1),
  }
  const selectTask = (record: TaskRecord): void => {
    if (snapshot !== undefined) {
      const owner = snapshot.versions.find(candidate => candidate.id === record.versionId)
      if (owner !== undefined) { setProject(owner.projectId); setVersion(owner.id) }
    }
    setTask(record)
    setSelected(undefined)
    setExecutionSession(undefined)
    setView('workbench')
    navigate('task')
  }
  const selectSession = (id: SessionId, owner?: TaskRecord): void => {
    const bound = boundRows.find(row => row.sessionId === id)
    const nextTask = owner ?? bound?.task
    if (nextTask !== undefined) {
      setTask(nextTask)
      const nextVersion = snapshot?.versions.find(candidate => candidate.id === nextTask.versionId)
      if (nextVersion !== undefined) { setProject(nextVersion.projectId); setVersion(nextVersion.id) }
    }
    setSelected(id); setView('workbench')
    navigate('session')
  }
  /** Open one attached Session from the round list; retrying the open one re-runs retention. */
  const openAttemptSession = (id: string): void => {
    if (id === selected) setSessionRetry(value => value + 1)
    else setSelected(id as SessionId)
    setView('workbench')
  }
  /** Create a task for the version currently open in the detail page. */
  const createTaskForVersion = (): void => {
    if (displayVersionProject !== undefined) setProject(displayVersionProject.id)
    if (displayVersion !== undefined) setVersion(displayVersion.id)
    openCreate('task')
  }
  const toggle = (set: ReadonlySet<string>, apply: (next: ReadonlySet<string>) => void, id: string): void => {
    const next = new Set(set)
    if (next.has(id)) next.delete(id); else next.add(id)
    apply(next)
  }
  async function moveTask(record: TaskRecord, target: TaskRecord['status']): Promise<void> {
    try {
      const result = await transitionTask({ taskId: record.id, target, actor: 'human' })
      if (result.ok) setAttempt(current => current + 1)
      else reportLoomFailure(t, result.error, t('op.moveTask'))
    } catch (error) {
      reportLoomFailure(t, { code: 'unknown', message: error instanceof Error ? error.message : String(error) }, t('op.moveTask'))
    }
  }
  async function removeProject(target: ProjectRecord): Promise<RemoteResult<void>> {
    const result = await deleteProject({ projectId: target.id })
    if (result.ok) {
      setPinnedProjects(current => current.filter(id => id !== target.id))
      if (filterProject === target.id) setFilterProject('')
      setFilterVersion('')
      setProject(undefined); setVersion(undefined); setTask(undefined); setSelected(undefined)
      setAttempt(current => current + 1)
    }
    return result
  }
  async function removeVersion(target: VersionRecord): Promise<RemoteResult<void>> {
    const result = await deleteVersion({ versionId: target.id })
    if (result.ok) {
      if (filterVersion === target.id) setFilterVersion('')
      setVersion(undefined); setTask(undefined); setSelected(undefined)
      setAttempt(current => current + 1)
    }
    return result
  }
  async function removeTask(target: TaskRecord): Promise<RemoteResult<void>> {
    const result = await deleteTask({ taskId: target.id })
    if (result.ok) {
      setTask(undefined); setSelected(undefined)
      setAttempt(current => current + 1)
    }
    return result
  }
  async function confirmTreeDelete(): Promise<void> {
    if (treeDelete === undefined) return
    setTreeDeleting(true); setTreeDeleteFailure(undefined)
    try {
      const result = await removeProject(treeDelete)
      if (result.ok) setTreeDelete(undefined)
      else setTreeDeleteFailure(failureReport(result.error.code, result.error.message))
    } catch (error) {
      setTreeDeleteFailure(thrownFailureReport(error))
    } finally { setTreeDeleting(false) }
  }
  function openCreate(kind: CreateKind): void { if (kind === 'version') setVersionStep('name'); setCreate(kind); setEdit(undefined); setMenuOpen(false) }

  function toggleSidebarSection(key: 'pinned' | 'projects' | 'sessions'): void {
    setCollapsedSections(current => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  function openEdit(kind: EditKind): void { setEdit(kind); setCreate(undefined); setMenuOpen(false) }
  function updatePreferences(next: LoomPreferences): void {
    setPreferences(next)
    setView(next.view)
    setKbMode(next.kanbanMode)
    setAsideOpen(next.contextOpen)
  }
  function togglePreviewWrap(): void { updatePreferences({ ...preferences, previewWrap: !preferences.previewWrap }) }
  const selectedSessionTitle = selected === undefined ? undefined : sessions.byId[selected]?.displayTitle
  const headerTitle = detailTask?.title ?? selectedSessionTitle ?? t('conv.titleFallback')
  const filter: ShellFilter = {
    ...(filterProject === '' ? {} : { projectId: filterProject as ProjectRecord['id'] }),
    ...(filterVersion === '' ? {} : { versionId: filterVersion as VersionRecord['id'] }),
    ...(filterStatus === '' ? {} : { status: filterStatus }),
    ...(filterPriority === '' ? {} : { priority: filterPriority }),
    ...(filterModule === '' ? {} : { moduleId: filterModule }),
    ...(kbSearch.trim() === '' ? {} : { search: kbSearch }),
  }
  const createVersionFor = (projectRecord: ProjectRecord): VersionRecord | undefined => snapshot?.versions.filter(candidate => candidate.projectId === projectRecord.id).at(-1)
  const createDisabledVersion = currentProject === undefined
  const createDisabledTask = currentVersion === undefined
  return <div style={frame} data-theme="blue" className={LOOM_ROOT_CLASS}>
    <LoomThemeStyles />
    <style>{`
      :root {
        --loom-canvas: var(--color-bg);
        --loom-surface: var(--color-surface);
        --loom-surface-2: var(--color-panel);
        --loom-surface-3: var(--color-line-soft);
        --loom-selected: var(--color-accent-soft);
        --loom-accent: var(--color-accent);
        --loom-accent-hover: var(--color-accent-ink);
        --loom-accent-active: var(--color-accent-ink);
        --loom-on-accent: var(--color-bg);
        --loom-border: var(--color-line);
        --loom-border-strong: var(--color-line-strong);
        --loom-text: var(--color-ink);
        --loom-dim: var(--color-ink-3);
        --loom-faint: var(--color-muted);
      }
      .loom-branch-menu { --dsw-menu-surface-fill: var(--loom-surface); --dsw-menu-backdrop-filter: none; width: var(--loom-branch-menu-width, 320px) !important; max-width: none !important; background: var(--loom-surface) !important; border: 0.5px solid var(--loom-border) !important; box-shadow: 0 12px 32px rgba(15, 17, 21, .16) !important; }
      .loom-workspace-switch { align-self: flex-start; }
      .loom-primary { background: var(--loom-accent) !important; color: var(--loom-on-accent) !important; border: 0.5px solid transparent !important; border-radius: 8px !important; font-size: 12.5px !important; font-weight: 500 !important; box-shadow: 0 1px 2px rgba(15, 17, 21, .12); transition: background-color .12s ease, box-shadow .12s ease; }
      .loom-primary:hover:not(:disabled) { background: var(--loom-accent-hover) !important; }
      .loom-primary:active:not(:disabled) { background: var(--loom-accent-active) !important; box-shadow: none; }
      .loom-primary:focus-visible { outline: 2px solid color-mix(in srgb, var(--loom-accent) 55%, transparent); outline-offset: 2px; }
      .loom-primary:disabled { opacity: .55; }
      .loom-top-context { max-width: 190px; }
      .loom-top-select { max-width: 132px; }
      .loom-top-context:hover { background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-label-primary); }
      .loom-top-action:hover { border-color: var(--loom-border-strong); color: var(--dsw-alias-label-primary); }
      .loom-top-new:hover { filter: brightness(1.08); }
      .loom-view-switch button:hover:not([aria-pressed='true']) { background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-label-primary); }
      .loom-menu-item:hover { background: var(--dsw-alias-bg-layer-3); }
      .loom-new-item:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-3); }
      .loom-sidebar-section-head:hover { color: var(--dsw-alias-label-secondary) !important; }
      .loom-new-item:disabled { cursor: default; }
      div.loom-modal-delete { width: min(480px, calc(100vw - 32px)); }
      div.loom-modal-takeover { width: min(440px, calc(100vw - 32px)); }
      .loom-row-action:hover { background: color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent); color: var(--dsw-alias-label-primary) !important; }
      .loom-session-row { border-radius: 5px; }
      .loom-session-row:hover { background: color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent); }
      .loom-session-row:focus-within { background: color-mix(in srgb, var(--loom-selected) 65%, transparent); }
      .loom-session-button:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -1px; }
      @media (hover: none) { .loom-session-row:hover { background: transparent; } }
      .loom-tree-row .loom-row-actions { opacity: 0; visibility: hidden; pointer-events: none; transition: opacity .12s ease; }
      .loom-tree-row:hover .loom-row-actions, .loom-tree-row:focus-within .loom-row-actions, .loom-tree-row-active .loom-row-actions { opacity: 1; visibility: visible; pointer-events: auto; }
      .loom-top-action:focus-visible, .loom-top-new:focus-visible, .loom-view-switch button:focus-visible, .loom-menu-item:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
      .loom-top-select:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; border-radius: 3px; }
      @media (hover: none) { .loom-tree-row .loom-row-actions { opacity: 1; visibility: visible; pointer-events: auto; } }
      @keyframes loom-kb-running { 0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--loom-accent) 0%, transparent); } 50% { box-shadow: 0 0 0 2px color-mix(in srgb, var(--loom-accent) 28%, transparent); } }
      .loom-kb-card-running { animation: loom-kb-running 1.8s ease-in-out infinite; }
      @media (prefers-reduced-motion: reduce) { .loom-kb-card-running { animation: none; } }
      @media (max-width: 1180px) { .loom-sidebar { width: 280px !important; } .loom-aside { max-width: 380px !important; } .loom-aside.loom-aside-preview { max-width: 460px !important; } .loom-top-label, .loom-top-divider, .loom-top-activity-label, .loom-top-action-label { display: none; } .loom-top-context { max-width: 140px; } .loom-top-select { max-width: 100px; } .loom-top-activity { padding: 0 7px; } .loom-top-new { width: 30px; padding: 0 !important; } .loom-view-switch button { padding: 0 9px; } .loom-aside.loom-aside-kanban, .loom-aside-handle.loom-aside-handle-kanban, .loom-aside-toggle-kb { display: none !important; } .loom-kb-columns { grid-template-columns: repeat(5, minmax(0, 1fr)) !important; } }
      @media (max-width: 940px) { .loom-sidebar { display: none !important; } .loom-sidebar.loom-sidebar-open { display: block !important; position: absolute; top: 48px; bottom: 0; left: 0; z-index: 70; width: 240px !important; box-shadow: 12px 0 28px rgba(0,0,0,.35); } .loom-aside { max-width: 300px !important; } .loom-aside.loom-aside-preview { max-width: 380px !important; } .loom-aside.loom-aside-kanban, .loom-aside-handle.loom-aside-handle-kanban, .loom-aside-toggle-kb { display: none !important; } }
      @media (max-width: 760px) { .loom-kb-columns { grid-template-columns: repeat(5, minmax(140px, 1fr)) !important; } .loom-aside, .loom-aside-handle, .loom-aside-toggle { display: none !important; } .loom-brand-name { display: none; } .loom-top-context { max-width: 128px; } .loom-top-select { max-width: 76px; } }
      @media (max-width: 560px) { .loom-topbar { flex-wrap: wrap !important; height: auto !important; min-height: 48px; padding: 6px 8px !important; column-gap: 4px !important; row-gap: 4px; } .loom-top-spacer { display: none !important; } .loom-top-context { flex: 1 1 140px; max-width: none; padding: 0 6px; order: 5; } .loom-top-select { flex: 1; max-width: none; width: 100%; } .loom-view-switch { margin-left: auto; } .loom-view-switch button { padding: 0 7px; } .loom-top-activity { display: none !important; } .loom-sidebar.loom-sidebar-open { top: 85px !important; } .loom-sidebar-backdrop { top: 85px !important; } .loom-wizard-steps li > span[aria-hidden='true'] { display: none !important; } .loom-wizard-steps button { flex-direction: column; align-items: center; gap: 5px; } .loom-wizard-steps button > span:last-child { justify-content: center; text-align: center; } .loom-wizard-steps button > span:last-child > span:first-child { overflow: visible; white-space: normal; font-size: 11px; line-height: 1.25; } }
    `}</style>
    <LoomTopbar
      t={t}
      narrow={narrow}
      sidebarOpen={sidebarOpen}
      sidebarCollapsed={sidebarCollapsed}
      menuOpen={menuOpen}
      project={project}
      version={version}
      snapshot={snapshot}
      activeCount={activeCount}
      route={route}
      asideOpen={asideOpen}
      createDisabledVersion={createDisabledVersion}
      createDisabledTask={createDisabledTask}
      newMenuRef={newMenuRef}
      onToggleSidebar={() => setSidebarOpen(value => !value)}
      onToggleSidebarCollapsed={() => setSidebarCollapsed(value => !value)}
      onToggleMenu={() => setMenuOpen(value => !value)}
      onSelectProject={(id) => { setProject(id); setVersion(undefined); setTask(undefined); setSelected(undefined) }}
      onSelectVersion={(id) => { setVersion(id); setTask(undefined); setSelected(undefined); if (id !== undefined) { const owner = snapshot?.versions.find(candidate => candidate.id === id); if (owner !== undefined) setProject(owner.projectId) } }}
      onNavigate={(next) => {
        if (next === 'task') setSelected(undefined)
        else if (next === 'session') {
          const candidate = selected ?? activeSessionRows.at(-1)?.id ?? taskSessions.at(-1)?.sessionId
          if (candidate !== undefined) setSelected(candidate as SessionId)
        }
        navigate(next)
      }}
      onOpenCreate={openCreate}
      onToggleAside={() => setAsideOpen(value => { const next = !value; setPreferences(current => ({ ...current, contextOpen: next })); return next })}
      onOpenSettings={() => setSettingsOpen(true)}
    />
    <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      {narrow && sidebarOpen && <div aria-hidden className="loom-sidebar-backdrop" style={{ position: 'absolute', inset: 0, top: 48, background: 'rgba(0,0,0,.35)', zIndex: 65 }} onClick={() => setSidebarOpen(false)} />}
      {!sidebarCollapsed && <aside className={sidebarOpen && narrow ? 'loom-sidebar loom-sidebar-open' : 'loom-sidebar'} style={sidebar}>
        <section style={{ marginBottom: 4 }}>
          <SidebarSectionToggle label={t('side.pinned')} icon={<IconPinFillRegular size={12} />} open={!collapsedSections.has('pinned')} onToggle={() => { toggleSidebarSection('pinned') }} />
          {!collapsedSections.has('pinned') && <>
          {(snapshot?.projects ?? []).filter(candidate => pinnedProjects.includes(candidate.id)).length === 0 && <p style={{ ...metaLine, padding: '2px 14px 6px' }}>{t('side.pinHint')}</p>}
          {(snapshot?.projects ?? []).filter(candidate => pinnedProjects.includes(candidate.id)).map(candidate => <ProjectItem
            key={candidate.id}
            candidate={candidate}
            versions={(snapshot?.versions ?? []).filter(item => item.projectId === candidate.id)}
            tasks={snapshot?.tasks ?? []}
            activeProject={project === candidate.id}
            activeVersionId={task === undefined ? version : undefined}
            activeTaskId={task?.id}
            open={expandedProjects.has(candidate.id)}
            openVersions={expandedVersions}
            pinned
            t={t}
            onProject={() => { setProject(candidate.id); setVersion(undefined); setTask(undefined); setSelected(undefined); toggle(expandedProjects, setExpandedProjects, candidate.id) }}
            onVersion={item => { setProject(candidate.id); setVersion(item.id); setTask(undefined); setSelected(undefined); toggle(expandedVersions, setExpandedVersions, item.id) }}
            onTask={selectTask}
            onPin={() => setPinnedProjects(current => current.filter(id => id !== candidate.id))}
            onNewVersion={() => { setProject(candidate.id); setVersion(undefined); setTask(undefined); openCreate('version') }}
            onEditProject={() => { setProject(candidate.id); setTask(undefined); openEdit('project') }}
            onDeleteProject={() => { setTreeDelete(candidate); setTreeDeleteFailure(undefined) }}
            onEditVersion={item => { setProject(candidate.id); setVersion(item.id); setTask(undefined); openEdit('version') }}
            onDeleteVersion={item => { setProject(candidate.id); setVersion(item.id); setTask(undefined); void removeVersion(item) }}
            onNewTask={item => { setProject(candidate.id); setVersion(item.id); setTask(undefined); openCreate('task') }}
            onEditTask={item => { setProject(candidate.id); setVersion(item.versionId); setTask(item); openEdit('task') }}
            onDeleteTask={item => { setProject(candidate.id); setVersion(item.versionId); setTask(item); void removeTask(item) }}
          />)}
          </>}
        </section>
        <section style={{ marginBottom: 4 }}>
          <SidebarSectionToggle label={t('side.projects')} count={String(snapshot?.projects.length ?? 0)} open={!collapsedSections.has('projects')} onToggle={() => { toggleSidebarSection('projects') }} />
          {!collapsedSections.has('projects') && <>
          {(snapshot?.projects ?? []).map(candidate => <ProjectItem
            key={candidate.id}
            candidate={candidate}
            versions={(snapshot?.versions ?? []).filter(item => item.projectId === candidate.id)}
            tasks={snapshot?.tasks ?? []}
            activeProject={project === candidate.id}
            activeVersionId={task === undefined ? version : undefined}
            activeTaskId={task?.id}
            open={expandedProjects.has(candidate.id)}
            openVersions={expandedVersions}
            pinned={pinnedProjects.includes(candidate.id)}
            t={t}
            onProject={() => { setProject(candidate.id); setVersion(undefined); setTask(undefined); setSelected(undefined); toggle(expandedProjects, setExpandedProjects, candidate.id) }}
            onVersion={item => { setProject(candidate.id); setVersion(item.id); setTask(undefined); setSelected(undefined); toggle(expandedVersions, setExpandedVersions, item.id) }}
            onTask={selectTask}
            onPin={() => setPinnedProjects(current => current.includes(candidate.id) ? current.filter(id => id !== candidate.id) : [...current, candidate.id])}
            onNewVersion={() => { setProject(candidate.id); setVersion(undefined); setTask(undefined); openCreate('version') }}
            onEditProject={() => { setProject(candidate.id); setTask(undefined); openEdit('project') }}
            onDeleteProject={() => { setTreeDelete(candidate); setTreeDeleteFailure(undefined) }}
            onEditVersion={item => { setProject(candidate.id); setVersion(item.id); setTask(undefined); openEdit('version') }}
            onDeleteVersion={item => { setProject(candidate.id); setVersion(item.id); setTask(undefined); void removeVersion(item) }}
            onNewTask={item => { setProject(candidate.id); setVersion(item.id); setTask(undefined); openCreate('task') }}
            onEditTask={item => { setProject(candidate.id); setVersion(item.versionId); setTask(item); openEdit('task') }}
            onDeleteTask={item => { setProject(candidate.id); setVersion(item.versionId); setTask(item); void removeTask(item) }}
          />)}
          <Button variant="outline" icon={<IconPlusOutlineRegular />} onClick={() => openCreate('project')} style={{ margin: '6px 12px', width: 'calc(100% - 24px)', justifyContent: 'center' }}>{t('side.newProject')}</Button>
          </>}
        </section>
        <section style={{ marginBottom: 4 }} aria-label={t('side.sessions')}>
          <SidebarSectionToggle label={t('side.sessions')} count={t('side.sessionLimit').replace('{limit}', String(preferences.sessionLimit))} open={!collapsedSections.has('sessions')} onToggle={() => { toggleSidebarSection('sessions') }} />
          {!collapsedSections.has('sessions') && <>
          <input aria-label={t('searchSessions')} placeholder={t('searchSessions')} value={search} onChange={event => setSearch(event.target.value)} style={{ ...select, cursor: 'text', width: 'calc(100% - 24px)', margin: '4px 12px 6px', boxSizing: 'border-box' }} />
          {taskSessionList.length === 0 && temporarySessionList.length === 0 && <p style={{ ...metaLine, padding: '2px 14px 6px' }}>{t('side.empty')}</p>}
          {taskSessionList.length > 0 && <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, padding: '2px 12px 3px', ...metaLine }}>
            <span>{t('side.tasks')}</span><span style={{ marginLeft: 'auto' }}>{taskSessionList.length}</span>
          </div>}
          {taskSessionList.map(row => {
            const owner = boundRows.find(candidate => candidate.sessionId === row.id)?.task
            return <SidebarSessionRow key={row.id} t={t} row={row} projectName={taskProjectBySession.get(row.id)} taskTitle={taskTitleBySession.get(row.id)} temporary={false} active={selected === row.id}
              onSelect={() => { setSelected(row.id as SessionId); setTask(owner); setView('workbench') }} />
          })}
          {temporarySessionList.length > 0 && <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4, padding: '4px 12px 3px', borderTop: `0.5px solid ${COLORS.border}`, ...metaLine }}>
            <span>{t('side.temporarySessions')}</span><span style={{ marginLeft: 'auto' }}>{temporarySessionList.length}</span>
          </div>}
          {temporarySessionList.map(row => <SidebarSessionRow key={row.id} t={t} row={row} projectName={temporaryProjectBySession.get(row.id)} temporary active={selected === row.id}
            onSelect={() => { setSelected(row.id as SessionId); setTask(undefined); setView('workbench') }} />)}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '6px 12px 8px' }}>
            <Button variant="outline" icon={<IconPlusOutlineRegular />} disabled={createDisabledTask} onClick={() => openCreate('task')} style={{ width: '100%', justifyContent: 'center' }}>{t('side.newTask')}</Button>
            <Button variant="ghost" icon={<IconPlusOutlineRegular />} title={t('temporary.title')} onClick={() => setTemporaryOpen(true)} style={{ width: '100%', justifyContent: 'center' }}>{t('side.newTemporary')}</Button>
          </div>
          </>}
        </section>
      </aside>}
      {route === 'home'
        ? <LoomOverview
            t={t}
            snapshot={snapshot ?? { projects: [], versions: [], locks: [], tasks: [], workspaces: [], temporarySessions: [], audit: [], executions: [] }}
            activeWorkspaceCount={activeCount}
            onTask={(record) => { selectTask(record); navigate('task') }}
            onProject={(record) => { setProject(record.id); setVersion(undefined); setTask(undefined); setSelected(undefined); navigate('task') }}
            onSession={(id) => { selectSession(id as SessionId); navigate('session') }}
            onBoard={() => navigate('board')}
          />
        : route === 'session' && selected === undefined
        ? <main style={center}><p style={{ ...note, margin: 20 }}>{t('chooseSession')}</p></main>
        : view === 'kanban'
        ? <LoomKanban
            t={t}
            snapshot={snapshot ?? { projects: [], versions: [], locks: [], tasks: [], workspaces: [], temporarySessions: [], audit: [], executions: [] }}
            liveTaskIds={liveTaskIds}
            filter={filter}
            mode={kbMode}
            projectValue={filterProject}
            versionValue={filterVersion}
            statusValue={filterStatus}
            priorityValue={filterPriority}
            moduleValue={filterModule}
            searchValue={kbSearch}
            wipLimit={preferences.wipLimit}
            onMode={mode => { setKbMode(mode); setPreferences(current => ({ ...current, kanbanMode: mode })) }}
            onProject={(value) => { setFilterProject(value); setFilterVersion(''); setFilterModule('') }}
            onVersion={(value) => { setFilterVersion(value); setFilterModule('') }}
            onStatus={(value) => setFilterStatus(value === '' ? '' : value as TaskRecord['status'])}
            onPriority={(value) => setFilterPriority(value === '' ? '' : value as TaskPriority)}
            onModule={setFilterModule}
            onSearch={setKbSearch}
            onClearFilters={() => { setFilterProject(''); setFilterVersion(''); setFilterStatus(''); setFilterPriority(''); setFilterModule(''); setKbSearch('') }}
            onSelect={selectTask}
            onMove={(record, target) => { void moveTask(record, target) }}
            onNewCard={(projectRecord) => {
              const latest = createVersionFor(projectRecord)
              setProject(projectRecord.id)
              if (latest !== undefined) { setVersion(latest.id); setCreate('task') }
            }}
          />
        : <main style={center}>
            {selected !== undefined && <div style={convHeader}>
              <span style={{ fontWeight: 700, fontSize: 13, overflowWrap: 'anywhere' }}>{headerTitle}</span>
              {displayProject !== undefined && <span style={{ ...pill, color: '#7db3ff', borderColor: 'rgba(47,129,247,.45)' }}>{displayProject.config.name}</span>}
              {displayVersion !== undefined && <span style={{ ...pill, color: COLORS.cyan, borderColor: 'rgba(57,197,207,.4)' }}>{displayVersion.name}</span>}
              {detailTask !== undefined && <span style={{ ...pill, color: PRIORITY_META[detailPriority].color }}>{t(PRIORITY_META[detailPriority].key)}</span>}
              {detailModules.slice(0, 2).map((module, index) => <span key={`${module}-${String(index)}`} style={pill}>{module}</span>)}
              {shortCommit(detailTask?.attempts.at(-1)?.lock) !== undefined && <span style={pill}>🔒 {shortCommit(detailTask?.attempts.at(-1)?.lock)}</span>}
              {detailTask !== undefined && <span style={pill}>{t('task.status')}: {t(STATUS_META[detailTask.status].key)}</span>}
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {selected !== undefined && detailTask !== undefined && <Button size="sm" variant="ghost" onClick={() => setSelected(undefined)}>{t('task.details')}</Button>}
                {selected !== undefined && <Button size="sm" variant="ghost" icon={<IconCloseOutlineRegular />} onClick={() => setSelected(undefined)}>{t('session.close')}</Button>}
              </span>
            </div>}
            {selected !== undefined
              ? (available
                  ? <SessionProvider key={held.id} session={held.reference}>{renderSlot('loom.conversation', {})}</SessionProvider>
                  : failure === selected
                    ? <p role="alert" style={{ ...note, margin: 20 }}>{t('session.unavailable')}</p>
                    : <p style={{ ...note, margin: 20 }}>{t('session.loading')}</p>)
              : detailTask !== undefined && snapshot !== undefined
                ? <LoomTaskWorkbench
                    t={t}
                    task={detailTask}
                    project={displayProject}
                    version={displayVersion}
                    snapshot={snapshot}
                    audit={auditRows}
                    actions={execution}
                    loadChanges={loadTaskChanges}
                    wrap={preferences.previewWrap}
                    onToggleWrap={togglePreviewWrap}
                    attemptRows={detailAttemptRows}
                    selectedSessionId={executionSession}
                    onSelectSession={id => setExecutionSession(id as SessionId)}
                    onOpenSession={openAttemptSession}
                  />
                : displayVersion !== undefined && snapshot !== undefined
                  ? <LoomVersionDetail
                      t={t}
                      snapshot={snapshot}
                      project={displayVersionProject}
                      version={displayVersion}
                      context={versionContext}
                      generateLock={generateLock}
                      onLockChanged={() => setAttempt(current => current + 1)}
                      onCreateTask={createTaskForVersion}
                      onEditVersion={() => openEdit('version')}
                      onSelectTask={selectTask}
                      loadWorkspaceStatus={workspaceStatus}
                      liveTaskIds={liveTaskIds}
                    />
                : <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
                    <NextStepCard
                      t={t}
                      projects={snapshot?.projects ?? []}
                      project={displayProject}
                      versions={displayProject === undefined ? [] : (snapshot?.versions ?? []).filter(candidate => candidate.projectId === displayProject.id)}
                      version={displayVersion}
                      locks={displayVersion === undefined ? [] : (snapshot?.locks ?? []).filter(lock => lock.versionId === displayVersion.id)}
                      tasks={displayVersion === undefined ? [] : (snapshot?.tasks ?? []).filter(candidate => candidate.versionId === displayVersion.id)}
                      onCreateProject={() => openCreate('project')}
                      onCreateVersion={() => { if (displayProject !== undefined) setProject(displayProject.id); openCreate('version') }}
                      onCreateTask={() => { if (displayVersionProject !== undefined) setProject(displayVersionProject.id); if (displayVersion !== undefined) setVersion(displayVersion.id); openCreate('task') }}
                      onSelectProject={record => { setProject(record.id); setVersion(undefined); setTask(undefined) }}
                      onSelectVersion={record => { setVersion(record.id); setTask(undefined); setSelected(undefined) }}
                      onSelectTask={selectTask}
                      generateLock={generateLock}
                      onLockChanged={() => setAttempt(current => current + 1)}
                    />
                  </div>}
          </main>}
      {asideOpen && !previewFullscreen && <LoomResizeHandle label={t('layout.resizeAside')} orientation="vertical" value={asideWidth} min={asideMin} max={asideMax} invert onChange={setAsideWidth} className={view === 'kanban' ? 'loom-aside-handle loom-aside-handle-kanban' : 'loom-aside-handle'} />}
      {asideOpen && <aside className={`${preview === undefined && review === undefined ? 'loom-aside' : 'loom-aside loom-aside-preview'}${view === 'kanban' ? ' loom-aside-kanban' : ''}`} data-loom-preview-fullscreen={previewFullscreen ? 'true' : undefined} style={previewFullscreen && preview !== undefined ? { ...aside, position: 'fixed', inset: 0, width: '100vw', maxWidth: 'none', zIndex: 90, borderLeft: 'none' } : { ...aside, width: asideWidth }}>
        {review !== undefined
          ? <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderBottom: `0.5px solid ${COLORS.border}`, flex: 'none' }}>
                <strong style={{ fontSize: 12.5 }}>{t('diff.preview')}</strong>
                <span style={{ ...metaLine, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t('review.title', { turn: String(review.turn) })}</span>
                <Button size="sm" variant="ghost" icon={<IconCloseOutlineRegular />} aria-label={t('form.close')} title={t('form.close')} onClick={() => { workspacePreview.close(); workspaceReviewPreview.close() }} style={{ marginLeft: 'auto', width: 26, height: 26, padding: 0, justifyContent: 'center' }} />
              </div>
              <LoomReviewPreview t={t} sessionId={review.sessionId} seq={review.seq} initialIndex={review.index} wrap={preferences.previewWrap} onToggleWrap={togglePreviewWrap} onOpenFile={(path) => { openNativeFile(path, review.sessionId as SessionId) }} />
            </div>
          : preview !== undefined
            ? <LoomFilePreview t={t} workspaceId={detailWorkspace?.id} workspaceRoot={(previewSessionId === undefined ? undefined : sessions.byId[previewSessionId]?.cwd) ?? detailWorkspace?.rootPath ?? detailWorkspace?.path} {...(detailAttemptId === undefined ? {} : { attemptId: detailAttemptId })} sessionId={previewSessionId} filePath={preview.path} initialMode={preview.mode ?? 'diff'} loadChanges={workspaceChanges} readFile={readFile} readBytes={readBytes} openPath={openPath} applications={openPathApplications} openWith={openPathWith} onClose={() => { workspacePreview.close(); setPreviewFullscreen(false) }} fullscreen={previewFullscreen} onToggleFullscreen={() => setPreviewFullscreen(current => !current)} wrap={preferences.previewWrap} onToggleWrap={togglePreviewWrap} />
            : view === 'kanban'
            ? snapshot !== undefined && <LoomKanbanAside t={t} snapshot={snapshot} filter={filter} onSelectSession={(id) => { const row = boundRows.find(candidate => candidate.sessionId === id); selectSession(id as SessionId, row?.task) }} />
            : <LoomContextPanel t={t} snapshot={snapshot ?? { projects: [], versions: [], locks: [], tasks: [], workspaces: [], temporarySessions: [], audit: [], executions: [] }} project={displayProject} version={displayVersion} task={detailTask} versionContext={versionContext} presetName={displayPresetName} usage={tokenUsage} generateLock={generateLock} onLockChanged={() => setAttempt(current => current + 1)} onEditProject={() => openEdit('project')} onNewVersion={() => { if (displayProject !== undefined) setProject(displayProject.id); openCreate('version') }} onEditVersion={() => openEdit('version')} onEditTask={() => openEdit('task')} onDeleteProject={displayProject === undefined ? undefined : () => removeProject(displayProject)} onDeleteVersion={displayVersion === undefined ? undefined : () => removeVersion(displayVersion)} onDeleteTask={detailTask === undefined ? undefined : () => removeTask(detailTask)} openPath={openPath} openPathApplications={openPathApplications} openPathWith={openPathWith} loadBranches={repositoryBranches} liveTaskIds={liveTaskIds} runningSessionIds={runningSessionIds} />}
      </aside>}
    </div>
    {!bottomCollapsed && <LoomResizeHandle label={t('layout.resizeBottom')} orientation="horizontal" value={bottomHeight} min={80} max={bottomMax} invert onChange={(height) => setPreferences(current => ({ ...current, bottomHeight: height }))} />}
    <LoomBottomPanel
      t={t}
      height={bottomHeight}
      collapsed={bottomCollapsed}
      pane={pane}
      audit={auditRows}
      sessionsContent={<LoomSessionGraph t={t} taskTitle={detailTask?.title} workspaceLabel={workspaceDisplay} rows={activeSessionRows} groups={sessionGroups} execution={runtimeExecution} usageBySession={usageBySession} currentSessionId={runtimeSessionId} onOpenSession={id => { selectSession(id) }} />}
      runtimeContent={<LoomSessionActivity t={t} sessionId={runtimeSessionId} subagents={subagentRows} jobs={jobs} workspaceAccess={workspaceAccess} openSession={id => { selectSession(id) }} forkSession={() => { void forkSessionAction() }} forking={forking} forkError={forkError} canFork={runtimeSessionId !== undefined && detailTask !== undefined && detailWorkspace !== undefined} onClaim={() => { void claimWorkspace() }} claiming={claiming} claimError={claimError} />}
      graphContent={snapshot !== undefined && taskVersion !== undefined ? <LoomVersionGraph t={t} snapshot={snapshot} version={taskVersion} sessionLabel={sessionLabel} runningSessionIds={runningSessionIds} onSelectTask={selectTask} onRelease={(workspaceId, owner) => { void releaseOwner(workspaceId, owner) }} releasingWorkspaceId={releasingWorkspace} releaseError={releaseError} onReleaseAll={() => { void releaseAllStale() }} releasingAll={releasingAll} /> : undefined}
      sessionCount={activeSessionRows.length}
      runningCount={activeSessionRows.filter(row => row.running).length}
      diffCount={diffCount}
      usage={selectedUsage}
      workspaceId={detailWorkspace?.id}
      {...(detailAttemptId === undefined ? {} : { attemptId: detailAttemptId })}
      loadChanges={workspaceChanges}
      onChangesCount={setDiffCount}
      wrap={preferences.previewWrap}
      onToggleWrap={togglePreviewWrap}
      onOpenInRight={(path) => { openFilePreview({ path, ...(previewSessionId === undefined ? {} : { sessionId: previewSessionId }), mode: 'diff' }); setAsideOpen(true) }}
      onToggle={() => setBottomCollapsed(value => !value)}
      onPane={setPane}
    />
    <LoomSettings
      t={t}
      open={settingsOpen}
      preferences={preferences}
      pinned={(snapshot?.projects ?? []).filter(candidate => pinnedProjects.includes(candidate.id))}
      onChange={updatePreferences}
      onUnpin={id => setPinnedProjects(current => current.filter(candidate => candidate !== id))}
      onClose={() => setSettingsOpen(false)}
    />
    <LoomTemporaryDialog
      t={t}
      open={temporaryOpen}
      snapshot={snapshot}
      actions={temporary}
      onClose={() => setTemporaryOpen(false)}
    />
    {create !== undefined && <div style={modalOverlay}>
      <div role="dialog" aria-modal="true" aria-label={create === 'project' ? t('top.newProject') : create === 'import' ? t('project.import') : create === 'version' ? t('top.newVersion') : t('top.newTask')} style={{ ...modalCard, maxWidth: MODAL_WIDTH[create] }} onClick={event => event.stopPropagation()}>
        <div style={modalHeader}>
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <strong style={modalTitle}>{create === 'project' ? t('top.newProject') : create === 'import' ? t('project.import') : create === 'version' ? t('top.newVersion') : t('top.newTask')}</strong>
            {create === 'version' && <span style={modalSub}>{t(versionStep === 'name' ? 'version.sub.name' : versionStep === 'refs' ? 'version.sub.refs' : versionStep === 'workspace' ? 'version.sub.workspace' : 'version.sub.preview')}</span>}
          </div>
          <Button size="sm" variant="ghost" icon={<IconCloseOutlineRegular />} aria-label={t('form.close')} title={t('form.close')} onClick={() => setCreate(undefined)} style={{ marginLeft: 'auto', width: 28, height: 28, padding: 0, justifyContent: 'center' }} />
        </div>
        {create !== 'version' && <p style={modalHint}>{create === 'project' ? t('flow.project') : create === 'task' ? t('flow.task') : t('flow.import')}</p>}
        {create === 'project' && <ProjectForm t={t} open onBusyChange={setModalBusy} agentPresets={agentPresets} pickDirectory={chooseDirectory} onOpenChange={value => { if (!value) setCreate(undefined) }} create={createProject} onCreated={created => { setProject(created.id); setVersion(undefined); setTask(undefined); setSelected(undefined); setCreate(undefined); setAttempt(current => current + 1) }} />}
        {create === 'import' && <ImportProjectForm t={t} open onBusyChange={setModalBusy} onOpenChange={value => { if (!value) setCreate(undefined) }} create={createProject} onCreated={created => { setProject(created.id); setVersion(undefined); setTask(undefined); setSelected(undefined); setCreate(undefined); setAttempt(current => current + 1) }} />}
        {create === 'version' && currentProject !== undefined && <VersionForm t={t} open onBusyChange={setModalBusy} onStepChange={setVersionStep} listBranches={repositoryBranches} onOpenChange={value => { if (!value) setCreate(undefined) }} project={currentProject} pickDirectory={chooseDirectory} create={createVersion} onCreated={created => { setVersion(created.id); setTask(undefined); setSelected(undefined); setCreate(undefined); setAttempt(current => current + 1) }} />}
        {create === 'task' && currentVersion !== undefined && currentVersionProject !== undefined && <TaskForm t={t} open onBusyChange={setModalBusy} onOpenChange={value => { if (!value) setCreate(undefined) }} version={currentVersion} project={currentVersionProject} workspaces={(snapshot?.workspaces ?? []).filter(workspace => workspace.versionId === currentVersion.id && workspace.cleaned !== true && (workspace.preparation === undefined || workspace.preparation.status === 'ready'))} create={createTask} onCreated={created => { setTask(created); setSelected(undefined); setView('workbench'); setCreate(undefined); setAttempt(current => current + 1) }} />}
        {create === 'version' && currentProject === undefined && <p style={note}>{t('project.select')}</p>}
        {create === 'task' && currentVersion === undefined && <p style={note}>{t('version.select')}</p>}
      </div>
    </div>}
    {edit !== undefined && <div style={modalOverlay}>
      <div role="dialog" aria-modal="true" aria-label={edit === 'project' ? t('project.edit') : edit === 'version' ? t('version.edit') : t('task.edit')} style={{ ...modalCard, maxWidth: MODAL_WIDTH[edit] }} onClick={event => event.stopPropagation()}>
        <div style={modalHeader}>
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <strong style={modalTitle}>{edit === 'project' ? t('project.edit') : edit === 'version' ? t('version.edit') : t('task.edit')}</strong>
          </div>
          <Button size="sm" variant="ghost" icon={<IconCloseOutlineRegular />} aria-label={t('form.close')} title={t('form.close')} onClick={() => setEdit(undefined)} style={{ marginLeft: 'auto', width: 28, height: 28, padding: 0, justifyContent: 'center' }} />
        </div>
        {edit === 'project' && displayProject !== undefined && <ProjectForm t={t} open onBusyChange={setModalBusy} project={displayProject} agentPresets={agentPresets} pickDirectory={chooseDirectory} create={createProject} update={updateProject} onOpenChange={value => { if (!value) setEdit(undefined) }} onCreated={updated => { setProject(updated.id); setEdit(undefined); setAttempt(current => current + 1) }} />}
        {edit === 'version' && displayVersion !== undefined && displayVersionProject !== undefined && <VersionForm t={t} open onBusyChange={setModalBusy} version={displayVersion} project={displayVersionProject} listBranches={repositoryBranches} pickDirectory={chooseDirectory} boundWorkspaces={(snapshot?.workspaces ?? []).filter(workspace => workspace.versionId === displayVersion.id).map(workspace => ({ ...workspace, taskCount: (snapshot?.tasks ?? []).filter(task => task.workspaceId === workspace.id || task.attempts.some(attempt => attempt.workspaceId === workspace.id)).length, ...(snapshot?.executions.find(execution => execution.workspaceId === workspace.id)?.owner === undefined ? {} : { ownerSessionId: snapshot?.executions.find(execution => execution.workspaceId === workspace.id)?.owner?.sessionId }) }))} otherWorkspaces={(snapshot?.workspaces ?? []).filter(workspace => workspace.versionId !== displayVersion.id && workspace.cleaned !== true).map(workspace => ({ id: workspace.id, label: workspace.label, rootPath: workspace.rootPath, path: workspace.path, mode: workspace.mode, versionId: workspace.versionId, versionName: snapshot?.versions.find(version => version.id === workspace.versionId)?.name ?? '' }))} renameWorkspace={renameVersionWorkspace} deleteWorkspace={removeVersionWorkspace} cleanupWorkspace={removeVersionWorkspace} addWorkspace={addVersionWorkspace} onWorkspaceAdded={() => setAttempt(current => current + 1)} create={createVersion} update={updateVersion} onOpenChange={value => { if (!value) setEdit(undefined) }} onCreated={updated => { setVersion(updated.id); setEdit(undefined); setAttempt(current => current + 1) }} />}
        {edit === 'task' && detailTask !== undefined && displayVersion !== undefined && displayVersionProject !== undefined && <TaskForm t={t} open onBusyChange={setModalBusy} task={detailTask} version={displayVersion} project={displayVersionProject} create={createTask} update={updateTask} onOpenChange={value => { if (!value) setEdit(undefined) }} onCreated={updated => { setTask(updated); setView('workbench'); setEdit(undefined); setAttempt(current => current + 1) }} />}
      </div>
    </div>}
    {directoryRequest !== undefined && <LoomDirectoryBrowser t={t}
      {...(directoryRequest.startPath === undefined ? {} : { startPath: directoryRequest.startPath })}
      loadListing={listDirectory}
      onCancel={() => finishDirectory(null)} onPick={path => finishDirectory(path)} />}
    {treeDelete !== undefined && <LoomDeleteDialog t={t} kind="project" subject={treeDelete.config.name} busy={treeDeleting} failure={treeDeleteFailure}
      onCancel={() => { setTreeDelete(undefined); setTreeDeleteFailure(undefined) }} onConfirm={() => { void confirmTreeDelete() }} />}
  </div>
}
