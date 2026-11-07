/** Route content for the Loom workbench shell. */
import type { CSSProperties, Dispatch, SetStateAction } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type { AuditEntry, CatalogSnapshot, ProjectRecord, TaskPriority, TaskRecord, VersionRecord } from 'dsh-workloom/types'
import type { AgentPresetOption } from '../../api/agent.ts'
import type { LoomPanelProps } from '../LoomPanel.tsx'
import type { LoomRoute } from './router.ts'
import type { ShellFilter, TaskAttemptRow } from '../shared/projection.ts'
import type { ExecutionActions } from '../features/task/LoomExecution.tsx'
import type { LoomPreferences } from '../features/settings/LoomSettings.tsx'
import { shortCommit } from '../shared/format.ts'
import type { deriveVersionContext } from '../../shared/version-context.ts'
import { LoomOverview } from '../features/overview/LoomOverview.tsx'
import { LoomProjectPage } from '../features/project/LoomProjectPage.tsx'
import { LoomSettingsPage } from '../features/settings/LoomSettingsPage.tsx'
import { LoomSessionList } from '../features/session/LoomSessionList.tsx'
import { LoomKanban } from '../features/board/LoomKanban.tsx'
import { LoomSessionHeader } from '../features/session/LoomSessionHeader.tsx'
import { LoomTaskWorkbench } from '../features/task/LoomTaskWorkbench.tsx'
import { LoomVersionDetail } from '../features/version/LoomVersionDetail.tsx'
import { NextStepCard } from '../features/workbench/NextStepCard.tsx'
import shell from './LoomShell.module.css'

type Setter<T> = Dispatch<SetStateAction<T>>

/** Inputs for the route content. */
export interface LoomRouteContentProps {
  readonly t: LoomPanelProps['t']
  readonly agentPresets: readonly AgentPresetOption[]
  readonly route: LoomRoute
  readonly view: 'workbench' | 'kanban'
  readonly snapshot: CatalogSnapshot | undefined
  readonly preferences: LoomPreferences
  readonly setPreferences: Setter<LoomPreferences>
  readonly activeCount: number
  readonly pinnedProjects: readonly ProjectRecord['id'][]
  readonly updatePreferences: (preferences: LoomPreferences) => void
  readonly displayProject: ProjectRecord | undefined
  readonly displayVersion: VersionRecord | undefined
  readonly displayVersionProject: ProjectRecord | undefined
  readonly detailTask: TaskRecord | undefined
  readonly detailAttemptRows: readonly TaskAttemptRow[]
  readonly detailModules: readonly string[]
  readonly headerTitle: string
  readonly detailPriority: TaskPriority
  readonly selected: SessionId | undefined
  readonly available: boolean
  readonly failure: SessionId | undefined
  readonly held: { readonly id: SessionId; readonly reference: SessionReference } | undefined
  readonly executionSession: SessionId | undefined
  readonly liveTaskIds: ReadonlySet<string>
  readonly filter: ShellFilter
  readonly filterProject: string
  readonly filterVersion: string
  readonly filterStatus: TaskRecord['status'] | ''
  readonly filterPriority: TaskPriority | ''
  readonly filterModule: string
  readonly kbSearch: string
  readonly kbMode: 'flat' | 'grouped'
  readonly currentProject: ProjectRecord | undefined
  readonly currentVersion: VersionRecord | undefined
  readonly auditRows: readonly AuditEntry[]
  readonly execution: ExecutionActions
  readonly loadTaskChanges: LoomPanelProps['workspaceChanges']
  readonly generateLock: LoomPanelProps['generateLock']
  readonly workspaceStatus: LoomPanelProps['workspaceStatus']
  readonly versionContext: ReturnType<typeof deriveVersionContext>
  readonly SessionProvider: LoomPanelProps['SessionProvider']
  readonly renderSlot: LoomPanelProps['renderSlot']
  readonly setProject: Setter<ProjectRecord['id'] | undefined>
  readonly setVersion: Setter<VersionRecord['id'] | undefined>
  readonly setTask: Setter<TaskRecord | undefined>
  readonly setSelected: Setter<SessionId | undefined>
  readonly setExecutionSession: Setter<SessionId | undefined>
  readonly setPinnedProjects: Setter<ProjectRecord['id'][]>
  readonly setFilterProject: Setter<string>
  readonly setFilterVersion: Setter<string>
  readonly setFilterStatus: Setter<TaskRecord['status'] | ''>
  readonly setFilterPriority: Setter<TaskPriority | ''>
  readonly setFilterModule: Setter<string>
  readonly setKbSearch: Setter<string>
  readonly setKbMode: Setter<'flat' | 'grouped'>
  readonly setAttempt: Setter<number>
  readonly setCreate: (kind: 'task') => void
  readonly selectTask: (record: TaskRecord) => void
  readonly selectSession: (id: SessionId, owner?: TaskRecord) => void
  readonly openAttemptSession: (id: string) => void
  readonly openCreate: (kind: 'project' | 'import' | 'version' | 'task') => void
  readonly openEdit: (kind: 'project' | 'version' | 'task') => void
  readonly navigate: (route: LoomRoute) => void
  readonly moveTask: (record: TaskRecord, target: TaskRecord['status']) => Promise<void>
  readonly createVersionFor: (project: ProjectRecord) => VersionRecord | undefined
  readonly createTaskForVersion: () => void
  readonly togglePreviewWrap: () => void
}

/**
 * Render the active Loom route.
 * @param props - route state, selection and navigation intents.
 * @returns the route content.
 */
export function LoomRouteContent(props: LoomRouteContentProps): JSX.Element {
  const { t, agentPresets, route, view, snapshot, preferences, setPreferences, activeCount, pinnedProjects, updatePreferences, displayProject, displayVersion, displayVersionProject, detailTask, detailAttemptRows, detailModules, headerTitle, detailPriority, selected, available, failure, held, executionSession, liveTaskIds, filter, filterProject, filterVersion, filterStatus, filterPriority, filterModule, kbSearch, kbMode, currentProject, currentVersion, auditRows, execution, loadTaskChanges, generateLock, workspaceStatus, versionContext, SessionProvider, renderSlot, setProject, setVersion, setTask, setSelected, setExecutionSession, setPinnedProjects, setFilterProject, setFilterVersion, setFilterStatus, setFilterPriority, setFilterModule, setKbSearch, setKbMode, setAttempt, setCreate, selectTask, selectSession, openAttemptSession, openCreate, openEdit, navigate, moveTask, createVersionFor, createTaskForVersion, togglePreviewWrap } = props
  const note: CSSProperties = { padding: 12, borderRadius: 8, color: 'var(--loom-text)', background: 'var(--loom-surface-2)', lineHeight: 1.6, margin: 0 }
  return <>
      {route === 'home'
        ? <LoomOverview
            t={t}
            snapshot={snapshot ?? { projects: [], versions: [], locks: [], tasks: [], workspaces: [], temporarySessions: [], audit: [], executions: [] }}
            activeWorkspaceCount={activeCount}
            onTask={(record) => { selectTask(record); navigate('task') }}
            onProject={(record) => { setProject(record.id); setVersion(undefined); setTask(undefined); setSelected(undefined); navigate('project') }}
            onSession={(id) => { selectSession(id as SessionId); navigate('session') }}
            onBoard={() => navigate('board')}
            onNewTask={() => openCreate('task')}
          />
        : route === 'project'
        ? <LoomProjectPage t={t} snapshot={snapshot ?? { projects: [], versions: [], locks: [], tasks: [], workspaces: [], temporarySessions: [], audit: [], executions: [] }} project={displayProject} version={displayVersion} onProject={(record) => { setProject(record.id); setVersion(undefined); setTask(undefined); setSelected(undefined); navigate('project') }} onVersion={(record) => { setVersion(record.id); setTask(undefined); setSelected(undefined) }} onTask={(record) => { selectTask(record); navigate('task') }} onBoard={() => navigate('board')} onNewTask={() => { if (displayProject !== undefined) setProject(displayProject.id); if (displayVersion !== undefined) setVersion(displayVersion.id); openCreate('task') }} onNewVersion={() => { if (displayProject !== undefined) setProject(displayProject.id); openCreate('version') }} onEditProject={() => openEdit('project')} onEditVersion={() => openEdit('version')} onSession={(id) => { selectSession(id as SessionId); navigate('session') }} />
        : route === 'settings'
        ? <LoomSettingsPage
            t={t}
            preferences={preferences}
            pinned={(snapshot?.projects ?? []).filter(candidate => pinnedProjects.includes(candidate.id))}
            onChange={updatePreferences}
            onUnpin={id => setPinnedProjects(current => current.filter(candidate => candidate !== id))}
            onBack={() => navigate('board')}
          />
        : route === 'session' && selected === undefined
        ? <main className={shell.center}><div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {detailTask === undefined
              ? <p style={{ ...note, margin: 0 }}>{t('chooseSession')}</p>
              : <LoomSessionList t={t} rows={detailAttemptRows} selectedSessionId={selected} onOpenSession={openAttemptSession} />}
          </div></main>
        : view === 'kanban'
        ? <LoomKanban
            t={t}
            snapshot={snapshot ?? { projects: [], versions: [], locks: [], tasks: [], workspaces: [], temporarySessions: [], audit: [], executions: [] }}
            liveTaskIds={liveTaskIds}
            filter={filter}
            mode={kbMode}
            boardView={preferences.boardView}
            onBoardView={view => setPreferences(current => ({ ...current, boardView: view }))}
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
            onNewTask={() => { if (currentProject !== undefined) setProject(currentProject.id); if (currentVersion !== undefined) setVersion(currentVersion.id); openCreate('task') }}
            onNewCard={(projectRecord) => {
              const latest = createVersionFor(projectRecord)
              setProject(projectRecord.id)
              if (latest !== undefined) { setVersion(latest.id); setCreate('task') }
            }}
          />
        : <main className={shell.center}>
            {selected !== undefined && <LoomSessionHeader
              t={t}
              title={headerTitle}
              projectName={displayProject?.config.name}
              versionName={displayVersion?.name}
              priority={detailPriority}
              modules={detailModules}
              lock={shortCommit(detailTask?.attempts.at(-1)?.lock)}
              taskStatus={detailTask?.status}
              onDetails={detailTask === undefined ? undefined : () => setSelected(undefined)}
              onClose={() => setSelected(undefined)}
            />}
            {selected !== undefined
              ? (available && held !== undefined
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
                    agentPresets={agentPresets}
                    actions={execution}
                    loadChanges={loadTaskChanges}
                    wrap={preferences.previewWrap}
                    onToggleWrap={togglePreviewWrap}
                    attemptRows={detailAttemptRows}
                    selectedSessionId={executionSession}
                    onSelectSession={id => setExecutionSession(id as SessionId)}
                    onOpenSession={openAttemptSession}
                    onBack={() => navigate('board')}
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
  </>
}
