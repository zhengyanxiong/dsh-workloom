/** Loom workbench shell: project tree, native conversation, context and kanban. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { IconCloseOutlineRegular, Button } from './ui/primitives.ts'
import type { ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRenderFactories, PropsRuntime, SessionProviderComponent } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { fileAddressFor } from '@deepseek-ai/dsh-util-workspace-path'
import type {
  ProjectRecord, TaskRecord, VersionRecord, WorkspaceChangesRequest,
} from 'dsh-workloom/types'
import type { LoomPreferences } from './features/settings/LoomSettings.tsx'
import type { ExecutionActions } from './features/task/LoomExecution.tsx'
import { LoomBottomPanel } from './shell/LoomBottomPanel.tsx'
import { LoomResizeHandle } from './shell/LoomResizeHandle.tsx'
import { LoomFilePreview } from './features/preview/LoomFilePreview.tsx'
import { LoomReviewPreview } from './features/preview/LoomReviewPreview.tsx'
import { LoomTopbar } from './shell/LoomTopbar.tsx'
import { LOOM_ROOT_CLASS, LoomThemeStyles } from './theme/LoomTheme.tsx'
import { resolveLoomTheme } from './theme/selection.ts'
import { useHostTheme } from './theme/useHostTheme.ts'
import { useLoomPreferences } from './shell/useLoomPreferences.ts'
import { useLoomCatalog } from './shell/useLoomCatalog.ts'
import { useLoomSessionExecution } from './shell/useLoomSessionExecution.ts'
import { useLoomDirectoryPicker } from './shell/useLoomDirectoryPicker.ts'
import { useLoomWorkspaceActions } from './features/workspace/useLoomWorkspaceActions.ts'
import { useLoomExecutionOwnership } from './features/task/useLoomExecutionOwnership.ts'
import { useLoomTreeDelete } from './shell/useLoomTreeDelete.ts'
import { useLoomTreeExpansion } from './shell/useLoomTreeExpansion.ts'
import { useLoomForkSession } from './features/session/useLoomForkSession.ts'
import { useLoomSelection } from './shell/useLoomSelection.ts'
import { useLoomWorkbenchLayout } from './shell/useLoomWorkbenchLayout.ts'
import { useLoomTaskSessions } from './shell/useLoomTaskSessions.ts'
import { useLoomChromeState } from './shell/useLoomChromeState.ts'
import { useLoomPinnedProjects } from './shell/useLoomPinnedProjects.ts'
import { useLoomMenu } from './shell/useLoomMenu.ts'
import { useLoomBoardFilters } from './shell/useLoomBoardFilters.ts'
import { useLoomDialogState } from './shell/useLoomDialogState.ts'
import { useLoomAgentPresets } from './shell/useLoomAgentPresets.ts'
import { useLoomDiffCount } from './shell/useLoomDiffCount.ts'
import { useLoomSessionHold } from './shell/useLoomSessionHold.ts'
import { useLoomPreviewSide } from './shell/useLoomPreviewSide.ts'
import { useLoomRoute } from './shell/useLoomRoute.ts'
import { useLoomViewport } from './shell/useLoomViewport.ts'
import shell from './shell/LoomShell.module.css'
import type { LoomRoute } from './shell/router.ts'
import { openFilePreview, workspacePreview, workspaceReviewPreview } from './features/preview/preview.ts'
import { LoomContextPanel } from './features/version/LoomContextPanel.tsx'
import { LoomSidebar } from './shell/LoomSidebar.tsx'
import { LoomFormDialogs, type CreateKind, type EditKind } from './features/dialogs/LoomFormDialogs.tsx'
import { LoomRouteContent } from './shell/LoomRouteContent.tsx'
import { LoomGlobalStyles } from './shell/LoomGlobalStyles.tsx'
import { LoomCommandPalette } from './features/palette/LoomCommandPalette.tsx'
import { LoomTemporaryDialog, type LoomTemporaryActions } from './features/dialogs/LoomTemporaryDialog.tsx'
import { LoomArchiveDialog } from './features/dialogs/LoomArchiveDialog.tsx'
import { useLoomSessionArchive } from './shell/useLoomSessionArchive.ts'
import { useLoomApprovalAttention } from './shell/useLoomApprovalAttention.ts'
import { LoomSessionActivity } from './features/session/LoomSessionActivity.tsx'
import { LoomVersionGraph } from './features/version/LoomVersionGraph.tsx'
import { LoomSessionGraph } from './features/session/LoomSessionGraph.tsx'
import { activeWorkspaceCount, aggregateTokenUsage, boundSessions, tokenUsageOf, currentWorkspace, taskAttemptRows, taskSessionRows, workspaceName, type ShellFilter } from './shared/projection.ts'
import { deriveVersionContext } from '../shared/version-context.ts'
import { COLORS } from './ui/tokens.ts'
import { metaLine } from './ui/styles.ts'
import { reportLoomFailure } from './shared/feedback.ts'
import { NS } from './shared/locales.ts'
import type { LoomHostPort as LoomInjected } from '../ports/loom-host.ts'

interface LoomSeat {
  SessionProvider: SessionProviderComponent
  renderSlot(key: 'loom.conversation', owner: object): ReactNode
}
/** Root kit plus the session-scoped child declared by Loom. */
export type LoomPanelProps = PropsRuntime<'main'> & InjectFace<LoomInjected> & PropsLocale<typeof NS> & LoomSeat & PropsRenderFactories

/**
 * Render the Loom shell. Every card and counter comes from the Host catalog; unwired
 * integrations stay labeled instead of showing mock data.
 * @param props - locale, native catalog, session acquisition, catalog actions, and renderer seats.
 * @returns the whole Loom page.
 */
export function LoomPanel({ t, useSessions, useSessionStatus, retainSession, openResource, loadSnapshot, createProject, updateProject, deleteProject, createVersion, updateVersion, deleteVersion, createTask, updateTask, deleteTask, generateLock, prepareWorkspace, prepareWorkspaceSilent, registerWorkspace, repositoryBranches, inspectWorkspace, pickDirectory, listDirectory, requestDraftInitialization, startAttempt, attachSession, registerTemporarySession, listAgentPresets, transitionTask, createSessionInWorkspace, openPath, openPathApplications, openPathWith, workspaceChanges, workspaceChangeCount, workspaceStatus, readFile, readBytes, commitWorkspace, updateWorkspace, deleteWorkspace, cleanupWorkspace, cleanupWorkspaceSilent, acquireExecution, cancelExecution, reorderExecutionQueue, releaseExecution, takeoverExecution, forkSession, archivedSessionIds: readArchivedSessionIds, archiveSession, unarchiveSession, jobs, SessionProvider, renderSlot }: LoomPanelProps) {
  const sessions = useSessions(state => state)
  const [preferences, setPreferences] = useLoomPreferences()
  const { route, setRoute, view, setView } = useLoomRoute(preferences.view)
  const darkTheme = useHostTheme(preferences.theme)
  const { rootRef, loomWidth, viewport } = useLoomViewport()
  const navigate = useCallback((next: LoomRoute): void => {
    setRoute(next)
    if (next === 'board') setView('kanban')
    else if (next === 'task' || next === 'session' || next === 'project') setView('workbench')
    if (typeof window !== 'undefined') {
      const hash = `#${next}`
      if (window.location.hash !== hash) window.location.hash = hash
    }
  }, [])
  // Ctrl/Cmd+K opens the jump palette from anywhere inside Loom.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onKey = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen(current => !current)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [])

  const [project, setProject] = useState<ProjectRecord['id']>()
  const [version, setVersion] = useState<VersionRecord['id']>()
  const [task, setTask] = useState<TaskRecord>()
  const [selected, setSelected] = useState<SessionId>()
  const chrome = useLoomChromeState({ project, version, task })
  const { sidebarOpen, setSidebarOpen, sidebarCollapsed, setSidebarCollapsed, paletteOpen, setPaletteOpen, search, setSearch, temporaryOpen, setTemporaryOpen } = chrome
  const { held, failure, available, setPendingDraft, retry: retrySession } = useLoomSessionHold(selected, retainSession, requestDraftInitialization)
  const [executionSession, setExecutionSession] = useState<SessionId>()
  const [pinnedProjects, setPinnedProjects] = useLoomPinnedProjects()
  const { directoryRequest, finishDirectory, chooseDirectory } = useLoomDirectoryPicker(pickDirectory)
  const agentPresets = useLoomAgentPresets(t, listAgentPresets)
  const { catalog, snapshot, attempt, setAttempt, setCatalog } = useLoomCatalog(loadSnapshot)
  const { preview, review, asideOpen, setAsideOpen, previewFullscreen, setPreviewFullscreen, bottomCollapsed, setBottomCollapsed, pane, setPane } = useLoomPreviewSide(preferences.contextOpen, task?.id)
  const [kbMode, setKbMode] = useState<'flat' | 'grouped'>(preferences.kanbanMode)
  const { filterProject, filterVersion, filterStatus, filterPriority, filterModule, kbSearch, setFilterProject, setFilterVersion, setFilterStatus, setFilterPriority, setFilterModule, setKbSearch } = useLoomBoardFilters()
  const tree = useLoomTreeExpansion(project, version)
  const { create, setCreate, edit, setEdit, versionStep, setVersionStep, setModalBusy } = useLoomDialogState()
  const { menuOpen, setMenuOpen, newMenuRef } = useLoomMenu()
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
  // The native archive set is registry-global and durable; Loom filters its
  // own Session lists from it instead of keeping a second catalog flag.
  const archivedSessionIds = new Set<SessionId>(readArchivedSessionIds())
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
    .filter(row => !archivedSessionIds.has(row.id))
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
    .filter(row => !archivedSessionIds.has(row.id))
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
  const {
    narrow, asideMin, asideMax, asideWidth, setAsideWidth, bottomMax, bottomHeight,
  } = useLoomWorkbenchLayout({
    loomWidth, viewportHeight: viewport.height, preferences,
    previewOpen: preview !== undefined || review !== undefined,
    setPreferences,
  })
  const previewSessionId: SessionId | undefined = preview?.sessionId === undefined
    ? selected ?? boundRows.find(row => row.task?.id === detailTask?.id)?.sessionId as SessionId | undefined
    : preview.sessionId as SessionId
  const {
    taskSessions, activeSessionRows, sessionStates, archiveBlockedIds,
    liveSnapshot, runtimeSessionId, subagentRows,
  } = useLoomTaskSessions({
    snapshot, task: detailTask, selected, archivedSessionIds,
    sessionById: sessions.byId, projections: sessions.projectionsBySession,
  })
  // Poll faster while a bound Session is running: the Host catalog carries the
  // execution owner, and a 5s poll would show that owner well after the turn
  // starts. Native session status is immediate, so it drives the cadence.
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
  const sessionArchive = useLoomSessionArchive({
    archiveSession,
    unarchiveSession,
    isSessionRunning: (id: string) => sessions.byId[id as SessionId]?.running === true,
    sessionLabel,
    t,
    onArchived: (id: string) => { if (selected === id) setSelected(undefined) },
    refresh: () => setAttempt(current => current + 1),
  })
  const workspaceAccess = runtimeWorkspace === undefined ? undefined : {
    workspaceLabel: workspaceName(runtimeWorkspace.rootPath ?? runtimeWorkspace.path) ?? runtimeWorkspace.path,
    ...(runtimeExecution?.owner === null || runtimeExecution?.owner === undefined ? {} : { owner: { id: runtimeExecution.owner.sessionId, label: sessionLabel(runtimeExecution.owner.sessionId), running: sessions.byId[runtimeExecution.owner.sessionId]?.running === true } }),
    waiting: (runtimeExecution?.waiting ?? []).map(id => ({ id, label: sessionLabel(id) })),
  }
  const ownership = useLoomExecutionOwnership({
    t, snapshot, workspace: runtimeWorkspace, sessionId: runtimeSessionId, execution: runtimeExecution,
    runningSessionIds, releaseExecution, acquireExecution,
    onChanged: () => { setAttempt(current => current + 1) },
  })
  const sessionExecution = useLoomSessionExecution({
    t, task: detailTask, snapshot, releaseExecution, acquireExecution, cancelExecution,
    onChanged: () => { setAttempt(current => current + 1) },
  })
  const fork = useLoomForkSession({
    t, sessionId: runtimeSessionId, task: detailTask, workspace: detailWorkspace,
    commitWorkspace, forkSession, attachSession,
    onForked: child => { selectSession(child) },
    onChanged: () => { setAttempt(current => current + 1) },
  })
  const nativeSession = (selected ?? taskSessions.at(-1)?.sessionId) as SessionId | undefined
  const openNativeFile = (path: string, sessionId: SessionId | undefined = nativeSession): void => {
    if (sessionId !== undefined && openResource(fileAddressFor(sessionId, detailWorkspace?.path, path))) return
    openFilePreview({ path })
    setAsideOpen(true)
  }
  const tokenUsage = aggregateTokenUsage(taskSessions.map(row => sessions.projectionsBySession[row.sessionId as SessionId]?.values))
  const usageBySession = Object.fromEntries(boundRows.map(row => [row.sessionId, tokenUsageOf(sessions.projectionsBySession[row.sessionId as SessionId]?.values)]))
  const selectedUsage = selected === undefined
    ? tokenUsage
    : aggregateTokenUsage([sessions.projectionsBySession[selected]?.values])
  const [diffCount, setDiffCount] = useLoomDiffCount(detailWorkspace?.id, detailWorkspace?.cleaned, detailAttemptId, attempt, workspaceChangeCount)
  const activeCount = snapshot === undefined ? 0 : activeWorkspaceCount(snapshot)
  const auditWorkspaceIds = new Set<string>((detailTask?.attempts ?? []).map(candidate => candidate.workspaceId))
  const auditRows = snapshot === undefined ? [] : snapshot.audit.filter(entry => detailTask === undefined
    || entry.taskId === detailTask.id
    || (entry.workspaceId !== undefined && auditWorkspaceIds.has(entry.workspaceId))).slice(-40).reverse()
  const workspaceActions = useLoomWorkspaceActions({
    t, snapshot, displayVersion, displayVersionProject, currentVersion, currentVersionProject,
    prepareWorkspace, prepareWorkspaceSilent, cleanupWorkspace, cleanupWorkspaceSilent,
    registerWorkspace, workspaceStatus, inspectWorkspace, repositoryBranches,
    updateWorkspace, deleteWorkspace, createVersion, generateLock, deleteVersion,
    onChanged: () => { setAttempt(current => current + 1) },
  })
  const execution: ExecutionActions = {
    prepareWorkspace, registerWorkspace, repositoryBranches, inspectWorkspace, pickDirectory: chooseDirectory, startAttempt, commitWorkspace, attachSession, transitionTask, createSessionInWorkspace, cleanupWorkspace, acquireExecution, cancelExecution, reorderExecutionQueue, releaseExecution, takeoverExecution, loadSnapshot,
    onSession: (id, draft) => {
      if (draft !== undefined) setPendingDraft({ sessionId: id, prompt: draft })
      setSelected(id); setView('workbench'); navigate('session')
    },
    onChanged: () => setAttempt(current => current + 1),
  }
  const temporary: LoomTemporaryActions = {
    pickDirectory: chooseDirectory,
    createSessionInWorkspace,
    registerTemporarySession,
    onSession: (id) => { setTask(undefined); setSelected(id); setView('workbench'); navigate('session') },
    onChanged: () => setAttempt(current => current + 1),
  }
  const {
    selectTask, selectSession, activatePaletteItem, openAttemptSession, createTaskForVersion,
  } = useLoomSelection({
    snapshot, boundRows, selected, displayVersion, displayVersionProject,
    setProject, setVersion, setTask, setSelected, setExecutionSession,
    setView, setPaletteOpen, navigate, retrySession, openCreate,
  })
  // An approval blocks its round until a human answers, so a Loom Session that
  // is waiting needs a signal outside the tab showing the conversation.
  const loomSessionIds = new Set<SessionId>([...boundIds, ...temporaryIds] as SessionId[])
  const approvalSignature = useSessionStatus(state => {
    const parts: string[] = []
    for (const [id, status] of state) {
      const interaction = status.pendingInteraction
      if (interaction === undefined || interaction.kind !== 'approval') continue
      if (!loomSessionIds.has(id)) continue
      parts.push(`${id}\u0000${interaction.key}`)
    }
    return parts.sort().join('|')
  })
  useLoomApprovalAttention({ t, signature: approvalSignature, labelOf: sessionLabel, selectedSessionId: selected, onOpenSession: selectSession })

  async function moveTask(record: TaskRecord, target: TaskRecord['status']): Promise<void> {
    try {
      const result = await transitionTask({ taskId: record.id, target, actor: 'human' })
      if (result.ok) setAttempt(current => current + 1)
      else reportLoomFailure(t, result.error, t('op.moveTask'))
    } catch (error) {
      reportLoomFailure(t, { code: 'unknown', message: error instanceof Error ? error.message : String(error) }, t('op.moveTask'))
    }
  }
  const treeDeleteActions = useLoomTreeDelete({
    deleteProject, deleteVersion, deleteTask,
    filterProject, filterVersion, setFilterProject, setFilterVersion,
    setPinnedProjects, setProject, setVersion, setTask, setSelected,
    onChanged: () => { setAttempt(current => current + 1) },
  })
  function openCreate(kind: CreateKind): void { if (kind === 'version') setVersionStep('name'); setCreate(kind); setEdit(undefined); setMenuOpen(false) }

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
  return <div ref={rootRef} data-theme={resolveLoomTheme(preferences.theme, darkTheme)} data-density={preferences.density} data-loom-reduced-motion={preferences.reducedMotion ? 'true' : undefined} className={`${LOOM_ROOT_CLASS} loom-root ${shell.root}`}>
    <LoomThemeStyles />
    <LoomGlobalStyles fontSize={preferences.fontSize} />
    <LoomCommandPalette open={paletteOpen} t={t} snapshot={snapshot} onClose={() => setPaletteOpen(false)} onActivate={activatePaletteItem} />
    <LoomTopbar
      t={t}
      narrow={narrow}
      sidebarOpen={sidebarOpen}
      sidebarCollapsed={sidebarCollapsed}
      menuOpen={menuOpen}
      project={project}
      version={version}
      snapshot={snapshot}
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
        navigate(next)
      }}
      onOpenCreate={openCreate}
      onToggleAside={() => setAsideOpen(value => { const next = !value; setPreferences(current => ({ ...current, contextOpen: next })); return next })}
      onOpenSettings={() => navigate('settings')}
      onOpenPalette={() => setPaletteOpen(true)}
    />
    <div className={shell.body}>
      {narrow && sidebarOpen && <div aria-hidden className={shell.sidebarBackdrop} onClick={() => setSidebarOpen(false)} />}
      {!sidebarCollapsed && <LoomSidebar
        className={`${shell.sidebar} ${sidebarOpen && narrow ? 'loom-sidebar-open' : ''}`}
        t={t}
        snapshot={snapshot}
        project={project}
        version={version}
        task={task}
        pinnedProjects={pinnedProjects}
        collapsedSections={tree.collapsedSections}
        expandedProjects={tree.expandedProjects}
        expandedVersions={tree.expandedVersions}
        search={search}
        taskSessionList={taskSessionList}
        temporarySessionList={temporarySessionList}
        taskProjectBySession={taskProjectBySession}
        taskTitleBySession={taskTitleBySession}
        temporaryProjectBySession={temporaryProjectBySession}
        boundRows={boundRows}
        selected={selected}
        sessionLimit={preferences.sessionLimit}
        createDisabledTask={createDisabledTask}
        onToggleSection={tree.toggleSection}
        onSearch={setSearch}
        onProject={record => { setProject(record.id); setVersion(undefined); setTask(undefined); setSelected(undefined); tree.toggleProject(record.id) }}
        onVersion={(record, item) => { setProject(record.id); setVersion(item.id); setTask(undefined); setSelected(undefined); tree.toggleVersion(item.id) }}
        onTask={selectTask}
        onPin={record => setPinnedProjects(current => current.includes(record.id) ? current.filter(id => id !== record.id) : [...current, record.id])}
        onNewVersion={record => { setProject(record.id); setVersion(undefined); setTask(undefined); openCreate('version') }}
        onEditProject={record => { setProject(record.id); setTask(undefined); openEdit('project') }}
        onDeleteProject={record => { treeDeleteActions.requestDelete(record) }}
        onEditVersion={(record, item) => { setProject(record.id); setVersion(item.id); setTask(undefined); openEdit('version') }}
        onDeleteVersion={(record, item) => { setProject(record.id); setVersion(item.id); setTask(undefined); void treeDeleteActions.removeVersion(item) }}
        onNewTask={(record, item) => { setProject(record.id); setVersion(item.id); setTask(undefined); openCreate('task') }}
        onEditTask={(record, item) => { setProject(record.id); setVersion(item.versionId); setTask(item); openEdit('task') }}
        onDeleteTask={(record, item) => { setProject(record.id); setVersion(item.versionId); setTask(item); void treeDeleteActions.removeTask(item) }}
        onSelectSession={(id, owner) => { setSelected(id as SessionId); setTask(owner); setView('workbench'); navigate('session') }}
        onCreateProject={() => openCreate('project')}
        onCreateTask={() => openCreate('task')}
        onOpenTemporary={() => setTemporaryOpen(true)}
      />}
      <LoomRouteContent
        t={t}
        agentPresets={agentPresets}
        route={route}
        view={view}
        snapshot={snapshot}
        preferences={preferences}
        setPreferences={setPreferences}
        activeCount={activeCount}
        pinnedProjects={pinnedProjects}
        updatePreferences={updatePreferences}
        displayProject={displayProject}
        displayVersion={displayVersion}
        displayVersionProject={displayVersionProject}
        detailTask={detailTask}
        detailAttemptRows={detailAttemptRows}
        showArchivedSessions={sessionArchive.showArchived}
        archivedSessionIds={archivedSessionIds}
        archiveBlockedIds={archiveBlockedIds}
        archiveBusySessionId={sessionArchive.busySessionId}
        onToggleArchivedSessions={sessionArchive.toggleArchived}
        onArchiveSession={sessionArchive.archive}
        onUnarchiveSession={sessionArchive.restore}
        detailModules={detailModules}
        headerTitle={headerTitle}
        detailPriority={detailPriority}
        selected={selected}
        available={available}
        failure={failure}
        held={held}
        executionSession={executionSession}
        liveTaskIds={liveTaskIds}
        filter={filter}
        filterProject={filterProject}
        filterVersion={filterVersion}
        filterStatus={filterStatus}
        filterPriority={filterPriority}
        filterModule={filterModule}
        kbSearch={kbSearch}
        kbMode={kbMode}
        currentProject={currentProject}
        currentVersion={currentVersion}
        auditRows={auditRows}
        execution={execution}
        loadTaskChanges={loadTaskChanges}
        generateLock={generateLock}
        workspaceStatus={workspaceStatus}
        versionContext={versionContext}
        SessionProvider={SessionProvider}
        renderSlot={renderSlot}
        setProject={setProject}
        setVersion={setVersion}
        setTask={setTask}
        setSelected={setSelected}
        setExecutionSession={setExecutionSession}
        setPinnedProjects={setPinnedProjects}
        setFilterProject={setFilterProject}
        setFilterVersion={setFilterVersion}
        setFilterStatus={setFilterStatus}
        setFilterPriority={setFilterPriority}
        setFilterModule={setFilterModule}
        setKbSearch={setKbSearch}
        setKbMode={setKbMode}
        setAttempt={setAttempt}
        setCreate={setCreate}
        selectTask={selectTask}
        selectSession={selectSession}
        openAttemptSession={openAttemptSession}
        openCreate={openCreate}
        openEdit={openEdit}
        navigate={navigate}
        moveTask={moveTask}
        createVersionFor={createVersionFor}
        createTaskForVersion={createTaskForVersion}
        togglePreviewWrap={togglePreviewWrap}
      />
      {asideOpen && !previewFullscreen && <LoomResizeHandle label={t('layout.resizeAside')} orientation="vertical" value={asideWidth} min={asideMin} max={asideMax} invert onChange={setAsideWidth} className={view === 'kanban' ? 'loom-aside-handle loom-aside-handle-kanban' : 'loom-aside-handle'} />}
      {asideOpen && route !== 'home' && route !== 'project' && route !== 'board' && route !== 'settings' && <aside className={`${shell.aside} ${preview === undefined && review === undefined ? 'loom-aside' : 'loom-aside loom-aside-preview'}${view === 'kanban' ? ' loom-aside-kanban' : ''}`} data-loom-preview-fullscreen={previewFullscreen ? 'true' : undefined} style={previewFullscreen && (preview !== undefined || review !== undefined) ? { position: 'fixed', inset: 0, width: '100vw', maxWidth: 'none', zIndex: 90, borderLeft: 'none' } : { width: asideWidth }}>
        {review !== undefined
          ? <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderBottom: `0.5px solid ${COLORS.border}`, flex: 'none' }}>
                <strong style={{ fontSize: 'var(--text-compact-size)' }}>{t('diff.preview')}</strong>
                <span style={{ ...metaLine, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t('review.title', { turn: String(review.turn) })}</span>
                <Button size="sm" variant="ghost" icon={<IconCloseOutlineRegular />} aria-label={t('form.close')} title={t('form.close')} onClick={() => { workspacePreview.close(); workspaceReviewPreview.close(); setPreviewFullscreen(false) }} style={{ marginLeft: 'auto', width: 26, height: 26, padding: 0, justifyContent: 'center' }} />
              </div>
              <LoomReviewPreview t={t} sessionId={review.sessionId} seq={review.seq} initialIndex={review.index} wrap={preferences.previewWrap} onToggleWrap={togglePreviewWrap} onOpenFile={(path) => { openNativeFile(path, review.sessionId as SessionId) }} fullscreen={previewFullscreen} onToggleFullscreen={() => setPreviewFullscreen(current => !current)} />
            </div>
          : preview !== undefined
            ? <LoomFilePreview t={t} workspaceId={detailWorkspace?.id} workspaceRoot={(previewSessionId === undefined ? undefined : sessions.byId[previewSessionId]?.cwd) ?? detailWorkspace?.rootPath ?? detailWorkspace?.path} {...(detailAttemptId === undefined ? {} : { attemptId: detailAttemptId })} sessionId={previewSessionId} filePath={preview.path} initialMode={preview.mode ?? 'diff'} loadChanges={workspaceChanges} readFile={readFile} readBytes={readBytes} openPath={openPath} applications={openPathApplications} openWith={openPathWith} onClose={() => { workspacePreview.close(); setPreviewFullscreen(false) }} fullscreen={previewFullscreen} onToggleFullscreen={() => setPreviewFullscreen(current => !current)} wrap={preferences.previewWrap} onToggleWrap={togglePreviewWrap} />
            : <LoomContextPanel t={t} snapshot={snapshot ?? { projects: [], versions: [], locks: [], tasks: [], workspaces: [], temporarySessions: [], audit: [], executions: [] }} project={displayProject} version={displayVersion} task={detailTask} versionContext={versionContext} presetName={displayPresetName} usage={tokenUsage} generateLock={generateLock} onLockChanged={() => setAttempt(current => current + 1)} onEditProject={() => openEdit('project')} onNewVersion={() => { if (displayProject !== undefined) setProject(displayProject.id); openCreate('version') }} onEditVersion={() => openEdit('version')} onEditTask={() => openEdit('task')} onDeleteProject={displayProject === undefined ? undefined : () => treeDeleteActions.removeProject(displayProject)} onDeleteVersion={displayVersion === undefined ? undefined : () => treeDeleteActions.removeVersion(displayVersion)} onDeleteTask={detailTask === undefined ? undefined : () => treeDeleteActions.removeTask(detailTask)} openPath={openPath} openPathApplications={openPathApplications} openPathWith={openPathWith} loadBranches={repositoryBranches} liveTaskIds={liveTaskIds} runningSessionIds={runningSessionIds} />}
      </aside>}
    </div>
    {!bottomCollapsed && <LoomResizeHandle label={t('layout.resizeBottom')} orientation="horizontal" value={bottomHeight} min={80} max={bottomMax} invert onChange={(height) => setPreferences(current => ({ ...current, bottomHeight: height }))} />}
    <LoomBottomPanel
      t={t}
      height={bottomHeight}
      collapsed={bottomCollapsed}
      pane={pane}
      audit={auditRows}
      sessionsContent={<LoomSessionGraph t={t} taskTitle={detailTask?.title} workspaceLabel={workspaceDisplay} rows={activeSessionRows} execution={runtimeExecution} usageBySession={usageBySession} currentSessionId={runtimeSessionId} sessionStates={sessionStates} busySessionId={sessionArchive.busySessionId ?? sessionExecution.busySessionId} showArchived={sessionArchive.showArchived} archivedSessionIds={archivedSessionIds} onToggleArchived={sessionArchive.toggleArchived} onArchiveSession={sessionArchive.archive} onUnarchiveSession={sessionArchive.restore} onReleaseSession={id => { void sessionExecution.releaseSession(id) }} onQueueSession={id => { void sessionExecution.queueSession(id) }} onLeaveQueue={id => { void sessionExecution.leaveQueue(id) }} onOpenSession={id => { selectSession(id) }} />}
      runtimeContent={<LoomSessionActivity t={t} sessionId={runtimeSessionId} subagents={subagentRows} jobs={jobs} workspaceAccess={workspaceAccess} openSession={id => { selectSession(id) }} forkSession={() => { void fork.forkSessionAction() }} forking={fork.forking} forkError={fork.forkError} canFork={runtimeSessionId !== undefined && detailTask !== undefined && detailWorkspace !== undefined} onClaim={() => { void ownership.claimWorkspace() }} claiming={ownership.claiming} claimError={ownership.claimError} />}
      graphContent={snapshot !== undefined && taskVersion !== undefined ? <LoomVersionGraph t={t} snapshot={snapshot} version={taskVersion} sessionLabel={sessionLabel} runningSessionIds={runningSessionIds} onSelectTask={selectTask} onRelease={(workspaceId, owner) => { void ownership.releaseOwner(workspaceId, owner) }} releasingWorkspaceId={ownership.releasingWorkspace} releaseError={ownership.releaseError} onReleaseAll={() => { void ownership.releaseAllStale() }} releasingAll={ownership.releasingAll} /> : undefined}
      sessionCount={activeSessionRows.filter(row => row.archived !== true).length}
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
    <LoomTemporaryDialog
      t={t}
      open={temporaryOpen}
      snapshot={snapshot}
      actions={temporary}
      onClose={() => setTemporaryOpen(false)}
    />
    <LoomArchiveDialog
      t={t}
      subject={sessionArchive.confirm?.title}
      busy={sessionArchive.confirmBusy}
      failure={sessionArchive.confirmFailure}
      onCancel={sessionArchive.cancelConfirm}
      onConfirm={sessionArchive.confirmArchive}
    />
    <LoomFormDialogs createTaskWorkspace={workspaceActions.createTaskWorkspace} registerTaskDirectory={workspaceActions.registerTaskDirectory} t={t} create={create} edit={edit} versionStep={versionStep} currentProject={currentProject} currentVersion={currentVersion} currentVersionProject={currentVersionProject} displayProject={displayProject} displayVersion={displayVersion} displayVersionProject={displayVersionProject} detailTask={detailTask} snapshot={snapshot} agentPresets={agentPresets} createProject={createProject} createVersion={workspaceActions.createVersionWithAdoption} createTask={createTask} updateProject={updateProject} updateVersion={updateVersion} updateTask={updateTask} repositoryBranches={repositoryBranches} chooseDirectory={chooseDirectory} addVersionWorkspace={workspaceActions.addVersionWorkspace} reuseVersionWorkspace={workspaceActions.reuseVersionWorkspace} createVersionReusingWorkspace={workspaceActions.createVersionReusingWorkspace} renameVersionWorkspace={workspaceActions.renameVersionWorkspace} removeVersionWorkspace={workspaceActions.removeVersionWorkspace} directoryRequest={directoryRequest} finishDirectory={finishDirectory} listDirectory={listDirectory} treeDelete={treeDeleteActions.treeDelete} treeDeleting={treeDeleteActions.treeDeleting} treeDeleteFailure={treeDeleteActions.treeDeleteFailure} confirmTreeDelete={treeDeleteActions.confirmDelete} setCreate={setCreate} setEdit={setEdit} setModalBusy={setModalBusy} setVersionStep={setVersionStep} setProject={setProject} setVersion={setVersion} setTask={setTask} setSelected={setSelected} setAttempt={setAttempt} setView={setView} setTreeDelete={treeDeleteActions.clearDelete} setTreeDeleteFailure={treeDeleteActions.clearDeleteFailure} navigate={navigate} />
  </div>
}
