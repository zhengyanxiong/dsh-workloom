/** Loom create/edit forms, directory picker and project delete dialogs. */
import type { CSSProperties, Dispatch, SetStateAction } from 'react'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { AgentPresetOption } from '../../../api/agent.ts'
import type {
  CatalogSnapshot, CreateTaskRequest, CreateVersionRequest, ProjectConfig, ProjectRecord, RepositoryBranches,
  RepositoryBranchesRequest, TaskRecord, UpdateProjectRequest, UpdateTaskRequest, UpdateVersionRequest, VersionRecord,
  VersionWorkspaceInput, WorkspaceRecord,
} from 'dsh-workloom/types'
import { Button, IconCloseOutlineRegular } from '../../ui/primitives.ts'
import { ImportProjectForm } from '../project/ImportProjectForm.tsx'
import { ProjectForm } from '../project/ProjectForm.tsx'
import { TaskForm } from '../task/TaskForm.tsx'
import { VersionForm } from '../version/VersionForm.tsx'
import type { VersionStep } from '../version/VersionForm.tsx'
import { LoomDirectoryBrowser } from '../workspace/LoomDirectoryBrowser.tsx'
import { LoomDeleteDialog } from './LoomDeleteDialog.tsx'
import { COLORS } from '../../ui/tokens.ts'
import type { FailureReport } from '../../ui/failure.ts'
import type { LoomPanelProps } from '../../LoomPanel.tsx'
import type { LoomKey } from '../../shared/locales.ts'
import type { LoomRoute } from '../../shell/router.ts'
import type { WorkspaceCreateOutcome, WorkspaceCreationInput } from '../workspace/WorkspaceChoice.tsx'

export type CreateKind = 'project' | 'import' | 'version' | 'task'
export type EditKind = 'project' | 'version' | 'task'
type Setter<T> = Dispatch<SetStateAction<T>>

/** Inputs for the Loom form and dialog layer. */
export interface LoomFormDialogsProps {
  readonly t: LoomPanelProps['t']
  readonly create: CreateKind | undefined
  readonly edit: EditKind | undefined
  readonly versionStep: VersionStep
  readonly currentProject: ProjectRecord | undefined
  readonly currentVersion: VersionRecord | undefined
  readonly currentVersionProject: ProjectRecord | undefined
  readonly displayProject: ProjectRecord | undefined
  readonly displayVersion: VersionRecord | undefined
  readonly displayVersionProject: ProjectRecord | undefined
  readonly detailTask: TaskRecord | undefined
  readonly snapshot: CatalogSnapshot | undefined
  readonly agentPresets: readonly AgentPresetOption[]
  readonly createTaskWorkspace?: ((input: WorkspaceCreationInput) => Promise<WorkspaceCreateOutcome>) | undefined
  readonly registerTaskDirectory?: ((path: string) => Promise<WorkspaceCreateOutcome>) | undefined
  readonly createProject: (request: ProjectConfig) => Promise<RemoteResult<ProjectRecord>>
  readonly createVersion: (request: CreateVersionRequest) => Promise<RemoteResult<VersionRecord>>
  readonly createTask: (request: CreateTaskRequest) => Promise<RemoteResult<TaskRecord>>
  readonly updateProject: (request: UpdateProjectRequest) => Promise<RemoteResult<ProjectRecord>>
  readonly updateVersion: (request: UpdateVersionRequest) => Promise<RemoteResult<VersionRecord>>
  readonly updateTask: (request: UpdateTaskRequest) => Promise<RemoteResult<TaskRecord>>
  readonly repositoryBranches: (request: RepositoryBranchesRequest) => Promise<RemoteResult<RepositoryBranches>>
  readonly chooseDirectory: (startPath?: string) => Promise<string | null>
  readonly addVersionWorkspace: (input: VersionWorkspaceInput) => Promise<RemoteResult<WorkspaceRecord>>
  readonly reuseVersionWorkspace: (workspaceId: string) => Promise<RemoteResult<WorkspaceRecord>>
  readonly createVersionReusingWorkspace: (request: CreateVersionRequest, workspaceId: string) => Promise<RemoteResult<VersionRecord>>
  readonly renameVersionWorkspace: (workspaceId: string, label: string) => Promise<RemoteResult<WorkspaceRecord>>
  readonly removeVersionWorkspace: (workspaceId: string, deleteFiles?: boolean, confirmPath?: string) => Promise<RemoteResult<void>>
  readonly directoryRequest: { readonly startPath?: string } | undefined
  readonly finishDirectory: (value: string | null) => void
  readonly listDirectory: LoomPanelProps['listDirectory']
  readonly treeDelete: ProjectRecord | undefined
  readonly treeDeleting: boolean
  readonly treeDeleteFailure: FailureReport | undefined
  readonly confirmTreeDelete: () => Promise<void>
  readonly setCreate: Setter<CreateKind | undefined>
  readonly setEdit: Setter<EditKind | undefined>
  readonly setModalBusy: Setter<boolean>
  readonly setVersionStep: Setter<VersionStep>
  readonly setProject: Setter<ProjectRecord['id'] | undefined>
  readonly setVersion: Setter<VersionRecord['id'] | undefined>
  readonly setTask: Setter<TaskRecord | undefined>
  readonly setSelected: Setter<SessionId | undefined>
  readonly setAttempt: Setter<number>
  readonly setView: Setter<'workbench' | 'kanban'>
  readonly setTreeDelete: Setter<ProjectRecord | undefined>
  readonly setTreeDeleteFailure: Setter<FailureReport | undefined>
  readonly navigate: (route: LoomRoute) => void
}

/**
 * Render the modal form and project dialog layer.
 * @param props - dialog state, form actions and selection setters.
 * @returns the dialog layer.
 */
const modalOverlay: CSSProperties = { position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, overflow: 'auto', background: 'color-mix(in srgb, var(--color-ink) 42%, transparent)' }
const modalCard: CSSProperties = { display: 'flex', flexDirection: 'column', width: '100%', maxHeight: 'calc(100% - 48px)', boxSizing: 'border-box', overflowY: 'auto', padding: '20px 22px 0', background: COLORS.panel, border: `0.5px solid ${COLORS.border}`, borderRadius: 'var(--dsw-radius-lg)', boxShadow: '0 24px 64px color-mix(in srgb, var(--color-ink) 32%, transparent)' }
const modalHeader: CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 8, minHeight: 30, marginBottom: 6 }
const modalTitle: CSSProperties = { fontSize: 'var(--text-stat-size)', fontWeight: 500, lineHeight: 1.3, letterSpacing: '-.015em' }
const modalHint: CSSProperties = { margin: '0 0 12px', color: COLORS.dim, fontSize: 'var(--text-compact-size)', lineHeight: 1.55 }
const modalSub: CSSProperties = { marginTop: 7, color: COLORS.dim, fontSize: 'var(--text-compact-size)', lineHeight: 1.5 }
const MODAL_WIDTH: Readonly<Record<CreateKind | EditKind, number>> = { project: 760, import: 640, version: 660, task: 660 }

export function LoomFormDialogs(props: LoomFormDialogsProps): JSX.Element {
  const { t, create, edit, versionStep, currentProject, currentVersion, currentVersionProject, displayProject, displayVersion, displayVersionProject, detailTask, snapshot, agentPresets, createTaskWorkspace, registerTaskDirectory, createProject, createVersion, createTask, updateProject, updateVersion, updateTask, repositoryBranches, chooseDirectory, addVersionWorkspace, reuseVersionWorkspace, createVersionReusingWorkspace, renameVersionWorkspace, removeVersionWorkspace, directoryRequest, finishDirectory, listDirectory, treeDelete, treeDeleting, treeDeleteFailure, confirmTreeDelete, setCreate, setEdit, setModalBusy, setVersionStep, setProject, setVersion, setTask, setSelected, setAttempt, setView, setTreeDelete, setTreeDeleteFailure, navigate } = props

  // Explain an empty ready list instead of only saying the version has no
  // workspace: the bound records and their lifecycle are what the user checks.
  const taskVersionWorkspaces = currentVersion === undefined ? [] : (snapshot?.workspaces ?? [])
    .filter(workspace => workspace.versionId === currentVersion.id)
    .map((workspace): { id: string; label: string; status: LoomKey } => {
      const status: LoomKey = workspace.cleaned === true ? 'workspace.stateCleaned'
        : workspace.preparation?.status === 'failed' ? 'workspace.stateFailed'
          : workspace.preparation !== undefined && workspace.preparation.status !== 'ready' ? 'workspace.statePending'
            : 'workspace.stateReady'
      return { id: workspace.id, label: workspace.label ?? workspace.rootPath ?? workspace.path, status }
    })

  // Reusable targets are finished direct workspaces of a project owned by
  // another version, with no live execution and no unfinished round.
  const reuseOptionsFor = (projectId: string | undefined, excludeVersionId: string | undefined, requiredSourceIds: readonly string[] | undefined): { id: string; label: string; detail: string; sourceIds?: readonly string[] }[] => {
    if (projectId === undefined) return []
    return (snapshot?.workspaces ?? [])
      // A cleaned direct record keeps its directory, so its paths stay reusable;
      // a cleaned managed record has no worktrees left.
      .filter(workspace => workspace.mode === 'direct' && workspace.versionId !== excludeVersionId
        && (workspace.cleaned !== true || workspace.repositories !== undefined))
      .map(workspace => ({ workspace, projectId: workspace.projectId ?? snapshot?.versions.find(candidate => candidate.id === workspace.versionId)?.projectId }))
      .filter(entry => entry.projectId === projectId)
      // A workspace that predates a project repository cannot be reused for a
      // version that needs it; the round would refuse later anyway.
      .filter(entry => requiredSourceIds === undefined || (entry.workspace.repositories !== undefined && requiredSourceIds.every(sourceId => entry.workspace.repositories!.some(binding => binding.sourceId === sourceId))))
      .filter(entry => snapshot?.executions.find(execution => execution.workspaceId === entry.workspace.id)?.owner === undefined)
      .filter(entry => (snapshot?.tasks ?? []).every(task => (task.status !== 'running' && task.status !== 'review') || task.attempts.every(attempt => attempt.workspaceId !== entry.workspace.id)))
      .map(entry => ({
        id: entry.workspace.id,
        label: `${snapshot?.versions.find(candidate => candidate.id === entry.workspace.versionId)?.name ?? ''} · ${entry.workspace.label ?? entry.workspace.rootPath ?? entry.workspace.path}${entry.workspace.cleaned === true ? ` · ${t('workspace.stateCleaned')}` : ''}`,
        detail: entry.workspace.rootPath ?? entry.workspace.path,
        ...(entry.workspace.repositories === undefined ? {} : { sourceIds: entry.workspace.repositories.map(binding => String(binding.sourceId)) }),
      }))
  }
  // Existing direct workspaces that exist but are blocked right now; naming the
  // reason keeps a disabled reuse button actionable.
  const reuseUnavailableFor = (projectId: string | undefined, excludeVersionId: string | undefined): { label: string; reason: LoomKey }[] => {
    if (projectId === undefined) return []
    return (snapshot?.workspaces ?? [])
      .filter(workspace => workspace.mode === 'direct' && workspace.versionId !== excludeVersionId)
      .map(workspace => ({ workspace, projectId: workspace.projectId ?? snapshot?.versions.find(candidate => candidate.id === workspace.versionId)?.projectId }))
      .filter(entry => entry.projectId === projectId)
      .flatMap(entry => {
        const label = `${snapshot?.versions.find(candidate => candidate.id === entry.workspace.versionId)?.name ?? ''} · ${entry.workspace.label ?? entry.workspace.rootPath ?? entry.workspace.path}`
        if (snapshot?.executions.find(execution => execution.workspaceId === entry.workspace.id)?.owner !== undefined) return [{ label, reason: 'workspace.ownerRunning' as LoomKey }]
        if ((snapshot?.tasks ?? []).some(task => (task.status === 'running' || task.status === 'review') && task.attempts.some(attempt => attempt.workspaceId === entry.workspace.id))) return [{ label, reason: 'version.workspaceReuseBusyRound' as LoomKey }]
        return []
      })
  }
  const reuseCandidates = reuseOptionsFor(displayVersionProject?.id, displayVersion?.id, displayVersion?.sources.map(source => source.sourceId) ?? [])
  // The wizard filters candidates against the sub-projects the user selected,
  // which only that form knows.
  const createReuseCandidates = reuseOptionsFor(currentProject?.id, undefined, undefined)
  const createReuseUnavailable = reuseUnavailableFor(currentProject?.id, undefined)
  const reuseUnavailable = reuseUnavailableFor(displayVersionProject?.id, displayVersion?.id)
  const note: React.CSSProperties = { padding: 12, borderRadius: 8, color: COLORS.dim, background: COLORS.panel2, lineHeight: 1.6, margin: 0 }
  return <>
    {create !== undefined && <div style={modalOverlay}>
      <div role="dialog" aria-modal="true" aria-label={create === 'project' ? t('top.newProject') : create === 'import' ? t('project.import') : create === 'version' ? t('top.newVersion') : t('top.newTask')} style={{ ...modalCard, maxWidth: MODAL_WIDTH[create] }} onClick={event => event.stopPropagation()}>
        <div style={modalHeader}>
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <strong style={modalTitle}>{create === 'project' ? t('top.newProject') : create === 'import' ? t('project.import') : create === 'version' ? t('top.newVersion') : `${t('top.newTask')}${currentVersion === undefined ? '' : ` · ${currentVersionProject?.config.name ?? ''} / ${currentVersion.name}`}`}</strong>
            {create === 'version' && <span style={modalSub}>{t(versionStep === 'name' ? 'version.sub.name' : versionStep === 'refs' ? 'version.sub.refs' : versionStep === 'workspace' ? 'version.sub.workspace' : 'version.sub.preview')}</span>}
          </div>
          <Button size="sm" variant="ghost" icon={<IconCloseOutlineRegular />} aria-label={t('form.close')} title={t('form.close')} onClick={() => setCreate(undefined)} style={{ marginLeft: 'auto', width: 28, height: 28, padding: 0, justifyContent: 'center' }} />
        </div>
        {create !== 'version' && <p style={modalHint}>{create === 'project' ? t('flow.project') : create === 'task' ? t('flow.task') : t('flow.import')}</p>}
        {create === 'project' && <ProjectForm t={t} open onBusyChange={setModalBusy} agentPresets={agentPresets} pickDirectory={chooseDirectory} onOpenChange={value => { if (!value) setCreate(undefined) }} create={createProject} onCreated={created => { setProject(created.id); setVersion(undefined); setTask(undefined); setSelected(undefined); setCreate(undefined); setAttempt(current => current + 1) }} />}
        {create === 'import' && <ImportProjectForm t={t} open onBusyChange={setModalBusy} onOpenChange={value => { if (!value) setCreate(undefined) }} create={createProject} onCreated={created => { setProject(created.id); setVersion(undefined); setTask(undefined); setSelected(undefined); setCreate(undefined); setAttempt(current => current + 1) }} />}
        {create === 'version' && currentProject !== undefined && <VersionForm t={t} open onBusyChange={setModalBusy} onStepChange={setVersionStep} listBranches={repositoryBranches} onOpenChange={value => { if (!value) setCreate(undefined) }} project={currentProject} pickDirectory={chooseDirectory} create={createVersion} reuseCandidates={createReuseCandidates} reuseUnavailable={createReuseUnavailable} createReusingWorkspace={createVersionReusingWorkspace} onCreated={created => { setVersion(created.id); setTask(undefined); setSelected(undefined); setCreate(undefined); setAttempt(current => current + 1) }} />}
        {create === 'task' && currentVersion !== undefined && currentVersionProject !== undefined && <TaskForm t={t} open onBusyChange={setModalBusy} onOpenChange={value => { if (!value) setCreate(undefined) }} version={currentVersion} project={currentVersionProject} versionWorkspaces={taskVersionWorkspaces} onRefresh={() => setAttempt(current => current + 1)} createWorkspace={createTaskWorkspace} useWorkspaceDirectory={registerTaskDirectory} pickDirectory={chooseDirectory} agentPresets={agentPresets} workspaces={(snapshot?.workspaces ?? []).filter(workspace => workspace.versionId === currentVersion.id && workspace.cleaned !== true && (workspace.preparation === undefined || workspace.preparation.status === 'ready'))} create={createTask} onCreated={created => { setTask(created); setSelected(undefined); setView('workbench'); navigate('task'); setCreate(undefined); setAttempt(current => current + 1) }} />}
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
        {edit === 'version' && displayVersion !== undefined && displayVersionProject !== undefined && <VersionForm t={t} open onBusyChange={setModalBusy} version={displayVersion} project={displayVersionProject} listBranches={repositoryBranches} pickDirectory={chooseDirectory} boundWorkspaces={(snapshot?.workspaces ?? []).filter(workspace => workspace.versionId === displayVersion.id).map(workspace => ({ ...workspace, taskCount: (snapshot?.tasks ?? []).filter(task => task.workspaceId === workspace.id || task.attempts.some(attempt => attempt.workspaceId === workspace.id)).length, ...(snapshot?.executions.find(execution => execution.workspaceId === workspace.id)?.owner === undefined ? {} : { ownerSessionId: snapshot?.executions.find(execution => execution.workspaceId === workspace.id)?.owner?.sessionId }) }))} otherWorkspaces={(snapshot?.workspaces ?? []).filter(workspace => workspace.versionId !== displayVersion.id && workspace.cleaned !== true).map(workspace => ({ id: workspace.id, label: workspace.label, rootPath: workspace.rootPath, path: workspace.path, mode: workspace.mode, versionId: workspace.versionId, versionName: snapshot?.versions.find(version => version.id === workspace.versionId)?.name ?? '' }))} renameWorkspace={renameVersionWorkspace} deleteWorkspace={removeVersionWorkspace} cleanupWorkspace={removeVersionWorkspace} addWorkspace={addVersionWorkspace} reuseWorkspace={reuseVersionWorkspace} reuseCandidates={reuseCandidates} reuseUnavailable={reuseUnavailable} onWorkspaceAdded={() => setAttempt(current => current + 1)} create={createVersion} update={updateVersion} onOpenChange={value => { if (!value) setEdit(undefined) }} onCreated={updated => { setVersion(updated.id); setEdit(undefined); setAttempt(current => current + 1) }} />}
        {edit === 'task' && detailTask !== undefined && displayVersion !== undefined && displayVersionProject !== undefined && <TaskForm t={t} open onBusyChange={setModalBusy} task={detailTask} version={displayVersion} project={displayVersionProject} create={createTask} update={updateTask} onOpenChange={value => { if (!value) setEdit(undefined) }} onCreated={updated => { setTask(updated); setView('workbench'); setEdit(undefined); setAttempt(current => current + 1) }} />}
      </div>
    </div>}
    {directoryRequest !== undefined && <LoomDirectoryBrowser t={t}
      {...(directoryRequest.startPath === undefined ? {} : { startPath: directoryRequest.startPath })}
      loadListing={listDirectory}
      onCancel={() => finishDirectory(null)} onPick={path => finishDirectory(path)} />}
    {treeDelete !== undefined && <LoomDeleteDialog t={t} kind="project" subject={treeDelete.config.name} busy={treeDeleting} failure={treeDeleteFailure}
      onCancel={() => { setTreeDelete(undefined); setTreeDeleteFailure(undefined) }} onConfirm={() => { void confirmTreeDelete() }} />}
  </>
}
