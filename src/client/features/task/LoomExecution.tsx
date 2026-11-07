/** Execution controls for the selected task: workspaces, sessions and business status. */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { Button } from '../../ui/primitives.ts'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {
  AttachSessionRequest, CatalogSnapshot, CleanupWorkspaceRequest, CommitWorkspaceRequest, ExecutionRequest, ExecutionState, PrepareWorkspaceRequest, WorkspaceCommitResult,
  ReleaseExecutionRequest, StartAttemptRequest, TaskRecord, TransitionTaskRequest, WorkspaceRecord, RegisterWorkspaceRequest,
  RepositoryBranches, RepositoryBranchesRequest, InspectWorkspaceRequest, WorkspaceInspection, ReorderExecutionQueueRequest,
} from 'dsh-workloom/types'
import type { LoomKey } from '../../shared/locales.ts'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { currentExecution } from '../../shared/projection.ts'
import { COLORS } from '../../ui/tokens.ts'
import { failureKey, failureReport, thrownFailureReport } from '../../ui/failure.ts'
import type { FailureReport } from '../../ui/failure.ts'
import { LoomCleanupDialog, type LoomCleanupFailure } from '../dialogs/LoomCleanupDialog.tsx'
import { LoomTakeoverDialog } from '../dialogs/LoomTakeoverDialog.tsx'
import { LoomPreparationPanel } from './LoomPreparationPanel.tsx'
import { autoWorkspaceRepositoryPath } from '../../../domain/workspace.ts'
import type { WorkspaceCreateOutcome, WorkspaceCreationInput } from '../workspace/WorkspaceChoice.tsx'
import { WorkspaceChoice } from '../workspace/WorkspaceChoice.tsx'
import type { LoadWorkspaceChanges } from '../preview/LoomDiff.tsx'

type Translate = (key: LoomKey) => string

const box: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12, padding: 12, borderRadius: 8, background: 'var(--dsw-alias-bg-layer-1)' }
const facts: CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '5px 18px', minWidth: 0, color: COLORS.faint, fontSize: 'var(--text-small-size)' }
const fact: CSSProperties = { display: 'inline-flex', alignItems: 'baseline', gap: 5, minWidth: 0 }
const factValue: CSSProperties = { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: COLORS.text, fontFamily: 'ui-monospace, monospace', fontSize: 'var(--text-small-size)' }
const actionBar: CSSProperties = { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 4 }
const ownerBox: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4, padding: '10px 12px', border: `0.5px solid ${COLORS.border}`, borderRadius: 8, background: COLORS.panel2 }
const ownerLine: CSSProperties = { display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 6, minWidth: 0 }
const ownerLabel: CSSProperties = { color: COLORS.faint, fontSize: 'var(--text-small-size)' }
const ownerValue: CSSProperties = { minWidth: 0, overflowWrap: 'anywhere', color: COLORS.text, fontFamily: 'ui-monospace, monospace', fontSize: 'var(--text-small-size)' }
const ownerMeta: CSSProperties = { margin: 0, color: COLORS.faint, fontSize: 'var(--text-label-size)', lineHeight: 1.5 }
const footer: CSSProperties = { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 4, paddingTop: 10, borderTop: `0.5px solid ${COLORS.border}` }
const alert: CSSProperties = { margin: 0, color: 'var(--dsw-alias-label-secondary)', fontSize: 'var(--text-compact-size)' }

/** One named operation failure, kept inline so the user sees which command failed and why. */
interface OperationFailure {
  readonly operation: string
  readonly report: FailureReport
}

/** Actions the workbench owns; the execution panel never calls the wire itself. */
export interface ExecutionActions {
  prepareWorkspace(request: PrepareWorkspaceRequest): Promise<RemoteResult<WorkspaceRecord>>
  registerWorkspace(request: RegisterWorkspaceRequest): Promise<RemoteResult<WorkspaceRecord>>
  repositoryBranches(request: RepositoryBranchesRequest): Promise<RemoteResult<RepositoryBranches>>
  inspectWorkspace(request: InspectWorkspaceRequest): Promise<RemoteResult<WorkspaceInspection>>
  pickDirectory(startPath?: string): Promise<string | null>
  startAttempt(request: StartAttemptRequest): Promise<RemoteResult<TaskRecord>>
  attachSession(request: AttachSessionRequest): Promise<RemoteResult<TaskRecord>>
  transitionTask(request: TransitionTaskRequest): Promise<RemoteResult<TaskRecord>>
  createSessionInWorkspace(path: string, agentPreset?: string): Promise<SessionId>
  commitWorkspace?(request: CommitWorkspaceRequest): Promise<RemoteResult<WorkspaceCommitResult>>
  cleanupWorkspace(request: CleanupWorkspaceRequest): Promise<RemoteResult<void>>
  acquireExecution(request: ExecutionRequest): Promise<RemoteResult<ExecutionState>>
  cancelExecution(request: ExecutionRequest): Promise<RemoteResult<ExecutionState>>
  reorderExecutionQueue(request: ReorderExecutionQueueRequest): Promise<RemoteResult<ExecutionState>>
  releaseExecution(request: ReleaseExecutionRequest): Promise<RemoteResult<ExecutionState>>
  takeoverExecution(request: ExecutionRequest): Promise<RemoteResult<ExecutionState>>
  /** Re-read the catalog so an operation that returns before its record settles can be observed. */
  loadSnapshot(): Promise<RemoteResult<CatalogSnapshot>>
  onSession(sessionId: SessionId, draft?: string): void
  onChanged(): void
}

interface ExecutionPanelProps {
  t: Translate
  task: TaskRecord
  snapshot: CatalogSnapshot
  selectedSession: SessionId | undefined
  actions: ExecutionActions
  loadChanges: LoadWorkspaceChanges
  /** Whether comparisons wrap wide lines instead of scrolling sideways. */
  wrap: boolean
  onToggleWrap: () => void
}

/**
 * Poll the catalog while a multi-step workspace operation runs so per-repository
 * preparation and cleanup progress is visible before the operation settles.
 * @param actions - Host actions owned by the workbench.
 * @param workspaceId - workspace being prepared or cleaned.
 * @param active - whether a multi-step operation is running.
 * @param onRecord - receives the freshest workspace record on each poll.
 */
function useWorkspacePolling(actions: ExecutionActions, workspaceId: WorkspaceRecord['id'] | undefined, active: boolean, onRecord: (workspace: WorkspaceRecord) => void): void {
  useEffect(() => {
    if (!active || workspaceId === undefined) return
    let cancelled = false
    const timer = setInterval(() => {
      void actions.loadSnapshot().then(result => {
        if (cancelled || !result.ok) return
        const found = result.value.workspaces.find(candidate => candidate.id === workspaceId)
        if (found !== undefined) onRecord(found)
      }).catch(() => { /* the operation itself owns its failure report; polling only refreshes progress */ })
    }, 900)
    return () => { cancelled = true; clearInterval(timer) }
    // The poller must restart only when the operation or workspace changes.
  }, [active, workspaceId])
}

/** Human-readable task title for one Session, fallback to its short id. */
function sessionTaskLabel(snapshot: CatalogSnapshot, sessionId: string): string {
  for (const task of snapshot.tasks) {
    if (task.attempts.some(attempt => attempt.sessionIds.some(candidate => candidate === sessionId))) return task.title
  }
  return sessionId.slice(0, 12)
}

/** Asynchronous freshest record for one workspace, ignoring an unavailable snapshot. */
async function readWorkspace(actions: ExecutionActions, workspaceId: WorkspaceRecord['id']): Promise<WorkspaceRecord | undefined> {
  try {
    const result = await actions.loadSnapshot()
    return result.ok ? result.value.workspaces.find(candidate => candidate.id === workspaceId) : undefined
  } catch { return undefined }
}

function InlineFailure({ t, failure, style }: { t: Translate; failure: OperationFailure; style?: CSSProperties }): ReactNode {
  return <p role="alert" style={{ ...alert, ...style, color: COLORS.error }}>
    {t('notice.operationFailed')} · {failure.operation} · {t(failure.report.message)}
    {failure.report.detail === undefined ? '' : <span style={{ display: 'block', opacity: 0.75, marginTop: 3, fontFamily: 'ui-monospace, monospace', fontSize: 'var(--text-label-size)', overflowWrap: 'anywhere' }}>{failure.report.detail}</span>}
  </p>
}

/**
 * Render the current round, the transitions it allows, and the start form for pending or failed tasks.
 * Human acceptance lives in the outcome panel, so this panel never duplicates it.
 * @param props - Selected task, catalog records, the active Loom session, and Host actions.
 * @returns business controls without pretending a Session state is a task state.
 */
export function ExecutionPanel({ t, task, snapshot, selectedSession, actions, loadChanges, wrap, onToggleWrap }: ExecutionPanelProps) {
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<OperationFailure>()
  const [cleanOpen, setCleanOpen] = useState(false)
  const [cleanFailure, setCleanFailure] = useState<LoomCleanupFailure>()
  const [discardAllowed, setDiscardAllowed] = useState(false)
  const [takeoverConfirm, setTakeoverConfirm] = useState(false)
  const [busyLabel, setBusyLabel] = useState<string>()
  const [observed, setObserved] = useState<WorkspaceRecord>()
  const [polling, setPolling] = useState(false)
  const current = task.attempts.at(-1)
  const version = snapshot.versions.find(candidate => candidate.id === task.versionId)
  const agentPreset = snapshot.projects.find(candidate => candidate.id === version?.projectId)?.config.agentPreset
  const workspace = current === undefined ? undefined : snapshot.workspaces.find(candidate => candidate.id === current.workspaceId)
  const live = observed !== undefined && observed.id === workspace?.id ? observed : workspace
  const preparation = live?.preparation
  const execution = currentExecution(snapshot, task)
  const boundSession = current?.sessionIds.at(-1)
  const actorSession = selectedSession ?? boundSession
  const ownsExecution = execution?.owner != null && execution.owner.sessionId === actorSession
  const waitingExecution = actorSession !== undefined && execution?.waiting.includes(actorSession) === true
  useWorkspacePolling(actions, workspace?.id, polling, setObserved)

  function report(operation: string, code: string, message: string): void {
    setFailure({ operation, report: failureReport(code, message) })
  }

  async function attach(): Promise<void> {
    if (selectedSession === undefined || workspace === undefined) return
    setBusy(true); setFailure(undefined)
    try {
      const result = await actions.attachSession({ taskId: task.id, sessionId: selectedSession })
      if (!result.ok) { report(t('op.attach'), result.error.code, result.error.message); return }
      actions.onChanged()
    } catch (error) { setFailure({ operation: t('op.attach'), report: thrownFailureReport(error) }) } finally { setBusy(false) }
  }
  async function clean(discard: boolean): Promise<void> {
    if (workspace === undefined) return
    setBusy(true); setFailure(undefined); setPolling(true); setBusyLabel(t('op.cleanup'))
    try {
      // Only managed cleanup deletes worktrees, so direct and linked
      // workspaces never need a dirty/unpushed guard to be unregistered.
      // The explicit discard also keeps older Hosts from failing a safe
      // unregister on a stale or non-Git target with `diff_failed`.
      const managed = workspace.mode === 'managed' || (workspace.mode === undefined && workspace.managed === true)
      const result = await actions.cleanupWorkspace({ workspaceId: workspace.id, discardChanges: discard || !managed })
      if (!result.ok) {
        setCleanFailure({ code: result.error.code, message: result.error.message })
        const key = failureKey(result.error.code) ?? failureKey(result.error.message)
        setDiscardAllowed(!discard && (key === 'error.workspaceChanges' || key === 'error.workspaceUnpushed'))
        return
      }
      // Cleanup resolves even when only some repositories were removed: never
      // report success from the call alone, re-read what the Host persisted.
      const refreshed = await readWorkspace(actions, workspace.id)
      if (refreshed !== undefined) setObserved(refreshed)
      const cleanup = refreshed?.cleanup
      if (refreshed === undefined) {
        setCleanFailure({ code: 'workspace_cleanup_failed', message: '' })
        return
      }
      if (cleanup !== undefined && cleanup.status !== 'cleaned') {
        setCleanFailure({ code: 'workspace_cleanup_failed', message: cleanup.error ?? '' })
        setDiscardAllowed(false)
        actions.onChanged()
        return
      }
      if (refreshed.cleaned !== true) {
        // The snapshot does not say "cleaned": report failure rather than a success.
        setCleanFailure({ code: 'workspace_cleanup_failed', message: cleanup?.error ?? '' })
        actions.onChanged()
        return
      }
      setCleanOpen(false); setCleanFailure(undefined); setDiscardAllowed(false)
      actions.onChanged()
    } catch (error) {
      setCleanFailure({ code: 'workspace_cleanup_failed', message: error instanceof Error ? error.message : String(error) })
    } finally { setBusy(false); setPolling(false); setBusyLabel(undefined) }
  }
  async function retryPrepare(): Promise<void> {
    if (workspace === undefined) return
    setBusy(true); setFailure(undefined); setPolling(true); setBusyLabel(t('op.prepare'))
    try {
      const result = await actions.prepareWorkspace({ versionId: task.versionId, lockId: workspace.lockId, workspaceId: workspace.id })
      if (!result.ok) { report(t('op.prepare'), result.error.code, result.error.message); return }
      setObserved(result.value)
      const refreshed = await readWorkspace(actions, workspace.id)
      if (refreshed !== undefined) setObserved(refreshed)
      actions.onChanged()
    } catch (error) { setFailure({ operation: t('op.prepare'), report: thrownFailureReport(error) }) } finally { setBusy(false); setPolling(false); setBusyLabel(undefined) }
  }
  async function acquire(): Promise<void> {
    if (workspace === undefined || actorSession === undefined) return
    setBusy(true); setFailure(undefined)
    try {
      const result = await actions.acquireExecution({ workspaceId: workspace.id, sessionId: actorSession })
      if (!result.ok) { report(t('op.acquire'), result.error.code, result.error.message); return }
      actions.onChanged()
    } catch (error) { setFailure({ operation: t('op.acquire'), report: thrownFailureReport(error) }) } finally { setBusy(false) }
  }
  async function cancelWait(): Promise<void> {
    if (workspace === undefined || actorSession === undefined) return
    setBusy(true); setFailure(undefined)
    try {
      const result = await actions.cancelExecution({ workspaceId: workspace.id, sessionId: actorSession })
      if (!result.ok) { report(t('op.release'), result.error.code, result.error.message); return }
      actions.onChanged()
    } catch (error) { setFailure({ operation: t('op.release'), report: thrownFailureReport(error) }) } finally { setBusy(false) }
  }
  async function release(): Promise<void> {
    if (workspace === undefined || execution?.owner === null || execution?.owner === undefined) return
    setBusy(true); setFailure(undefined)
    try {
      const result = await actions.releaseExecution({ workspaceId: workspace.id, sessionId: execution.owner.sessionId, generation: Number(execution.owner.generation) })
      if (!result.ok) { report(t('op.release'), result.error.code, result.error.message); return }
      actions.onChanged()
    } catch (error) { setFailure({ operation: t('op.release'), report: thrownFailureReport(error) }) } finally { setBusy(false) }
  }
  async function takeover(): Promise<void> {
    if (workspace === undefined || actorSession === undefined) return
    setBusy(true); setFailure(undefined)
    try {
      const result = await actions.takeoverExecution({ workspaceId: workspace.id, sessionId: actorSession })
      if (!result.ok) { report(t('op.takeover'), result.error.code, result.error.message); return }
      setTakeoverConfirm(false)
      actions.onChanged()
    } catch (error) { setFailure({ operation: t('op.takeover'), report: thrownFailureReport(error) }) } finally { setBusy(false) }
  }
  function continueSession(): void {
    // Continue the Session selected in the task detail, not merely the most
    // recently attached one; fall back to that latest binding only when the
    // user has not selected a Session yet.
    const target = selectedSession ?? boundSession
    if (target !== undefined) { actions.onSession(target); return }
    void openSession()
  }
  async function openSession(): Promise<void> {
    if (workspace === undefined) return
    setBusy(true); setFailure(undefined)
    try {
      const sessionId = await actions.createSessionInWorkspace(workspace.path, agentPreset)
      const result = await actions.attachSession({ taskId: task.id, sessionId })
      if (!result.ok) { report(t('op.attach'), result.error.code, result.error.message); return }
      actions.onSession(sessionId)
      actions.onChanged()
    } catch (error) { setFailure({ operation: t('op.createSession'), report: thrownFailureReport(error) }) } finally { setBusy(false) }
  }
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
    <div style={facts}>
      <span style={fact}><span>{t('workspace.title')}</span><span style={factValue} title={workspace?.path}>{workspace?.path ?? '—'}</span></span>
      <span style={fact}><span>{t('session.title')}</span><span style={factValue}>{String(current?.sessionIds.length ?? 0)}</span></span>
    </div>
    {failure !== undefined && <InlineFailure t={t} failure={failure} />}
    {preparation !== undefined && workspace !== undefined && preparation.status !== 'ready' && <LoomPreparationPanel t={t} preparation={preparation} busy={busy} onRetry={() => { void retryPrepare() }} />}
    {(task.status === 'pending' || task.status === 'failed') && version !== undefined && <StartForm t={t} task={task} snapshot={snapshot} versionId={version.id} actions={actions} />}
    {(task.status === 'running' || task.status === 'review') && workspace !== undefined && <div style={actionBar}>
      {boundSession !== undefined && <Button size="sm" variant="outline" disabled={busy} onClick={continueSession}>{t('session.continue')}</Button>}
      <Button size="sm" variant="outline" disabled={busy} onClick={() => { void openSession() }}>{t('session.new')}</Button>
      {selectedSession !== undefined && current !== undefined && !current.sessionIds.includes(selectedSession) && <Button size="sm" variant="outline" disabled={busy} onClick={() => { void attach() }}>{t('session.open')}</Button>}
    </div>}
    {workspace !== undefined && boundSession !== undefined && workspace.cleaned !== true && <div style={ownerBox}>
      <div style={ownerLine}>
        <span style={ownerLabel}>{t('execution.owner')}</span>
        <span style={ownerValue}>{execution?.owner === null || execution?.owner === undefined ? t('workspace.ownerNone') : `${sessionTaskLabel(snapshot, execution.owner.sessionId)} · ${execution.owner.sessionId.slice(0, 8)}`}</span>
        {execution !== undefined && execution.waiting.length > 0 && <span style={ownerMeta}>{t('execution.waiting')} · {execution.waiting.map(id => sessionTaskLabel(snapshot, id)).join(', ')}</span>}
      </div>
      <div style={ownerLine}>
        <span style={ownerLabel}>{t('execution.currentSession')}</span>
        <span style={ownerValue}>{actorSession === undefined ? t('workspace.ownerNone') : `${sessionTaskLabel(snapshot, actorSession)} · ${actorSession.slice(0, 8)}`}</span>
        {waitingExecution && <span style={ownerMeta}>{`${t('execution.queuePosition')} ${String(execution!.waiting.indexOf(actorSession!) + 1)}`}</span>}
        {ownsExecution && <span style={ownerMeta}>{t('execution.currentOwner')}</span>}
        <span style={ownerMeta}>{t('execution.queueScope')}</span>
      </div>
      {execution?.takeover !== null && execution?.takeover !== undefined && <p style={{ ...ownerMeta, color: execution.takeover.stopStatus === 'requested' ? COLORS.dim : COLORS.warn }}>{execution.takeover.stopStatus === 'requested' ? t('execution.stopping') : t('execution.blocked')}</p>}
      {execution?.owner !== null && execution?.owner !== undefined && !ownsExecution && <div style={actionBar}>
        {!waitingExecution && <Button size="sm" variant="outline" disabled={busy || execution?.takeover !== null} onClick={() => { void acquire() }}>{t('execution.wait')}</Button>}
        {waitingExecution && <Button size="sm" variant="outline" disabled={busy} onClick={() => { void cancelWait() }}>{t('execution.leaveQueue')}</Button>}
        {!takeoverConfirm && <Button size="sm" variant="outline" disabled={busy || execution?.takeover !== null} onClick={() => { setTakeoverConfirm(true); setFailure(undefined) }}>{t('execution.takeover')}</Button>}
      </div>}
      {ownsExecution && (execution?.takeover === null || execution?.takeover === undefined) && <div style={actionBar}>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => { void release() }}>{t('execution.release')}</Button>
      </div>}
      {(execution?.owner === null || execution?.owner === undefined) && actorSession !== undefined && <div style={actionBar}>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => { void acquire() }}>{t('execution.acquire')}</Button>
      </div>}
    </div>}
    {workspace !== undefined && workspace.cleaned !== true && <div style={footer}>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => { setCleanOpen(true); setCleanFailure(undefined); setDiscardAllowed(false) }}>{t('workspace.cleanup')}</Button>
      {busy && busyLabel !== undefined && <span role="status" style={{ ...alert, fontFamily: 'ui-monospace, monospace', fontSize: 'var(--text-label-size)' }}>{busyLabel}…</span>}
    </div>}
    {cleanOpen && workspace !== undefined && <LoomCleanupDialog
      t={t}
      workspace={live ?? workspace}
      busy={busy}
      failure={cleanFailure}
      discardAllowed={discardAllowed}
      loadChanges={loadChanges}
      wrap={wrap}
      onToggleWrap={onToggleWrap}
      onConfirm={() => { void clean(false) }}
      onDiscard={() => { void clean(true) }}
      onCancel={() => { setCleanOpen(false); setCleanFailure(undefined); setDiscardAllowed(false) }}
    />}
    <LoomTakeoverDialog
      t={t}
      open={takeoverConfirm}
      busy={busy}
      failed={failure !== undefined}
      task={task}
      workspace={workspace}
      execution={execution}
      onCancel={() => setTakeoverConfirm(false)}
      onConfirm={() => { void takeover() }}
    />
  </div>
}

interface StartFormProps {
  t: Translate
  task: TaskRecord
  snapshot: CatalogSnapshot
  versionId: TaskRecord['versionId']
  actions: ExecutionActions
}

/** Compose the editable first message that carries a task into the native composer. */
export function taskDraftPrompt(t: Translate, task: TaskRecord): string {
  const title = `${t('task.draftTitle')}${task.title}`
  const description = task.description?.trim() ?? ''
  return description === '' ? title : `${title}\n\n${t('task.draftDescription')}\n${description}`
}

/** Select one ready workspace bound to the task's version; creation belongs to the version flow. */
function StartForm({ t, task, snapshot, versionId, actions }: StartFormProps) {
  const version = snapshot.versions.find(candidate => candidate.id === versionId)
  const project = version === undefined ? undefined : snapshot.projects.find(candidate => candidate.id === version.projectId)
  const lock = version === undefined ? undefined : snapshot.locks.filter(candidate => candidate.versionId === version.id).at(-1)
  const ready = snapshot.workspaces.filter(workspace => workspace.versionId === versionId && workspace.cleaned !== true
    && (workspace.preparation === undefined || workspace.preparation.status === 'ready'))
  const [createdWorkspace, setCreatedWorkspace] = useState<WorkspaceRecord>()
  const [selectedId, setSelectedId] = useState<WorkspaceRecord['id'] | undefined>(task.workspaceId ?? ready[0]?.id)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<OperationFailure>()
  const available = createdWorkspace === undefined || ready.some(workspace => workspace.id === createdWorkspace.id)
    ? ready
    : [...ready, createdWorkspace]
  const selected = available.find(workspace => workspace.id === selectedId)
  function report(operation: string, code: string, message: string): void { setFailure({ operation, report: failureReport(code, message) }) }
  async function createWorkspace(input: WorkspaceCreationInput): Promise<WorkspaceCreateOutcome> {
    if (project === undefined) return { ok: false, error: { message: 'state.error' } }
    if (lock === undefined) return { ok: false, error: { message: 'task.workspaceCreateLock' } }
    try {
      const parent = input.parentPath.replace(/\/+$/u, '')
      const root = `${parent}/${input.name.trim()}`
      const prefix = (input.branchPrefix.trim() === '' ? 'loom' : input.branchPrefix.trim()).replace(/\/+$/u, '')
      const branch = `${prefix}/${input.name.trim()}`
      const branches: Record<string, string> = {}
      const repositories = lock.repositories.map(entry => {
        const source = project.config.sources.find(candidate => candidate.id === entry.sourceId)
        if (source === undefined) throw new Error(t('error.workspaceMismatch'))
        const subProjectId = entry.subProjectId === undefined ? 'default' : String(entry.subProjectId)
        const path = autoWorkspaceRepositoryPath(subProjectId, source)
        branches[String(source.id)] = branch
        return { sourceId: String(source.id), path, targetPath: `${root}/${path}` }
      })
      const result = await actions.prepareWorkspace({ path: root, versionId, lockId: lock.id, mode: 'managed', repositories, branches, requireBranches: true })
      if (!result.ok) return { ok: false, error: failureReport(result.error.code, result.error.message) }
      if (result.value.preparation?.status === 'failed') {
        const failed = result.value.preparation.repositories.filter(repository => repository.status === 'failed')
        const reason = failed.length > 0
          ? failed.map(repository => `${repository.path ?? String(repository.sourceId)}: ${repository.error ?? 'failed'}`).join('; ')
          : result.value.preparation.error ?? t('error.workspaceNotPrepared')
        await actions.cleanupWorkspace({ workspaceId: result.value.id, discardChanges: true })
        return { ok: false, error: { message: 'error.workspaceNotPrepared', detail: reason } }
      }
      return { ok: true, workspace: result.value }
    } catch (error) {
      return { ok: false, error: failureReport('unknown', error instanceof Error ? error.message : String(error)) }
    }
  }
  async function start(): Promise<void> {
    if (selected === undefined) { report(t('task.start'), 'missing_workspace', ''); return }
    setBusy(true); setFailure(undefined)
    try {
      if (actions.commitWorkspace !== undefined) {
        const committed = await actions.commitWorkspace({ workspaceId: selected.id, message: 'Loom: checkpoint before execution' })
        if (!committed.ok) { report(t('op.commit'), committed.error.code, committed.error.message); return }
        const failed = committed.value.repositories.find(repository => repository.error !== undefined)
        if (failed !== undefined) { report(t('op.commit'), 'workspace_commit_failed', `${failed.sourceId}: ${failed.error ?? ''}`); return }
      }
      const started = await actions.startAttempt({ taskId: task.id, workspaceId: selected.id })
      if (!started.ok) { report(t('task.start'), started.error.code, started.error.message); return }
      const sessionId = await actions.createSessionInWorkspace(selected.path, project?.config.agentPreset)
      const attached = await actions.attachSession({ taskId: task.id, sessionId })
      if (!attached.ok) { report(t('op.attach'), attached.error.code, attached.error.message); return }
      const acquired = await actions.acquireExecution({ workspaceId: selected.id, sessionId })
      if (!acquired.ok) { report(t('op.acquire'), acquired.error.code, acquired.error.message); return }
      actions.onSession(sessionId, taskDraftPrompt(t, task))
      actions.onChanged()
    } catch (error) {
      setFailure({ operation: t('task.start'), report: thrownFailureReport(error) })
    } finally { setBusy(false) }
  }
  return <form style={box} onSubmit={event => { event.preventDefault(); void start() }}>
    <div style={formHeading}>{t('task.start')}</div>
    <div style={field}>
      <span>{t('task.workspace')}</span>
      <WorkspaceChoice
        t={t}
        ariaLabel={t('task.workspace')}
        workspaces={available}
        value={selectedId}
        onChange={id => setSelectedId(id as WorkspaceRecord['id'])}
        create={createWorkspace}
        pickDirectory={actions.pickDirectory}
        onCreated={workspace => { setCreatedWorkspace(workspace); actions.onChanged() }}
        defaultName={`task-${String(task.id).slice(0, 8)}`}
      />
    </div>
    {available.length <= 1 && <p style={{ ...hint, margin: 0 }}>{t('task.workspaceConcurrentHint')}</p>}
    {failure !== undefined && <InlineFailure t={t} failure={failure} />}
    <Button type="submit" variant="primary" className="loom-primary" disabled={busy || selected === undefined} style={{ alignSelf: 'flex-start' }}>
      {busy ? t('form.submitPending') : t('task.start')}
    </Button>
  </form>
}

const formHeading: CSSProperties = { fontSize: 'var(--text-compact-size)', fontWeight: 500, color: 'var(--dsw-alias-label-primary)' }
const field: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--text-compact-size)', color: 'var(--dsw-alias-label-secondary)' }
const hint: CSSProperties = { color: 'var(--dsw-alias-label-caption)', fontSize: 'var(--text-label-size)', lineHeight: 1.5 }
