/** Persistent Loom catalog; one instance owns and serializes all mutations of its file. */
import { randomUUID } from 'node:crypto'
import { brandString, type Branded } from '@deepseek-ai/dsh-brand'
import { createTask as pendingTask, type Task } from '../domain/task.ts'
import { createJsonStore, JsonStoreError } from '../storage/json-store.ts'
import { CatalogError } from './catalog/errors.ts'
import { distinct, nowIso, text } from './catalog/schema.ts'
import { parseCatalog } from './catalog/admission.ts'
import { commitWorkspace, workspaceChangeCount, workspaceChanges, workspaceDirty, workspaceStatus } from './catalog/workspace-git.ts'
import { versionIn, workspaceIn } from './catalog/selectors.ts'
import { ensureWorkspaceBranches, ensureWorkspaceSkillLinks, updateWorkspace } from './catalog/workspace-write.ts'
import { cleanupWorkspace, deleteWorkspace } from './catalog/workspace-lifecycle.ts'
import { registerPreparedWorkspace } from './catalog/workspace-register.ts'
import { prepareWorkspace } from './catalog/workspace-prepare.ts'
import { acquireExecution, beginTakeover, cancelExecution, finishTakeover, releaseExecution, releaseSession, reorderExecutionQueue } from './catalog/execution-queue.ts'
import { attachSession, forgetTemporarySession, registerTemporarySession, startAttempt, suggestTaskOutcome, transitionTask } from './catalog/task-lifecycle.ts'
import { createProject, createVersion, deleteProject, deleteVersion, generateLock, updateProject, updateVersion } from './catalog/project-version-ops.ts'
import type { Catalog } from './catalog/contract.ts'
export type { Catalog, CreateTaskOptions, PrepareWorkspaceInput, RegisterPreparedWorkspaceInput, TaskConfirmation, TaskSuggestion, WorkspaceCommitRepository, WorkspaceCommitResult, WorkspaceStatusRepository } from './catalog/contract.ts'
export { findSessionAttempt, findWorkspaceByPath } from './catalog/selectors.ts'
import { migrateCatalog } from './catalog/migrations.ts'
export { CatalogError } from './catalog/errors.ts'
export { migrateCatalog } from './catalog/migrations.ts'
export { parseCatalog } from './catalog/admission.ts'
import type { CatalogSnapshot, TaskRecord, WorkspaceCleanup, WorkspacePreparation, WorkspaceRecord } from '../api/records.ts'
export type { CatalogSnapshot, ProjectRecord, TaskPriority, TaskRecord, TemporarySessionRecord, VersionRecord, WorkspaceCleanup, WorkspaceCleanupRepository, WorkspaceCleanupRepositoryStatus, WorkspaceCleanupStatus, WorkspacePreparation, WorkspacePreparationRepository, WorkspacePreparationRepositoryStatus, WorkspacePreparationStatus, WorkspaceRecord } from '../api/records.ts'
import type { AuditEntry, AuditEvent } from '../domain/audit.ts'
import {
  confirmStop, createExecution, releaseExecution as releaseExecutionState, type ExecutionState,
} from '../domain/execution.ts'

/** Open an existing catalog or initialize a missing one; corrupt data is never overwritten.
 * @param file - File in an existing parent directory, owned exclusively by this catalog instance.
 * @param resolveCommit - Local repository ref resolver; failures abort Lock generation.
 * @returns initialized catalog with instance-serialized transactions (not cross-process locking).
 */
export async function createCatalog(file: string, resolveCommit: (repo: string, ref: string) => Promise<string>): Promise<Catalog> {
  const store = createJsonStore<CatalogSnapshot>({ file, version: 2, parse: parseCatalog, migrate: value => migrateCatalog(value) })
  let state: CatalogSnapshot
  try { state = await store.load() } catch (error) {
    if (!(error instanceof JsonStoreError) || error.code !== 'missing') throw error
    state = { projects: [], versions: [], locks: [], tasks: [], workspaces: [], temporarySessions: [], audit: [], executions: [] }
    await store.write(state)
  }
  let queue: Promise<void> = Promise.resolve()
  function transaction<T>(operation: (draft: CatalogSnapshot) => Promise<T> | T): Promise<T> {
    const result = queue.then(async () => {
      const draft = structuredClone(state)
      const result = await operation(draft)
      await store.write(draft)
      state = draft
      return structuredClone(result)
    })
    queue = result.then(() => undefined, () => undefined)
    return result
  }
  function recordAudit(draft: CatalogSnapshot, event: AuditEvent, actor: AuditEntry['actor'], fields: Omit<AuditEntry, 'id' | 'at' | 'event' | 'actor'> = {}): void {
    draft.audit.push({ id: randomUUID(), at: Date.now(), actor, event, ...fields })
    if (draft.audit.length > 500) draft.audit.splice(0, draft.audit.length - 500)
  }

  function taskIn(draft: CatalogSnapshot, taskId: TaskRecord['id']): TaskRecord {
    const task = draft.tasks.find(item => item.id === taskId)
    if (!task) throw new CatalogError('missing_task')
    return task
  }

  function executionIn(draft: CatalogSnapshot, workspaceId: WorkspaceRecord['id']): ExecutionState {
    workspaceIn(draft, workspaceId)
    return draft.executions.find(item => item.workspaceId === workspaceId) ?? createExecution(workspaceId)
  }
  function storeExecution(draft: CatalogSnapshot, execution: ExecutionState): void {
    const index = draft.executions.findIndex(item => item.workspaceId === execution.workspaceId)
    if (index === -1) draft.executions.push(execution)
    else draft.executions[index] = execution
  }
  /** Drop one Session from every ownership queue; a confirmed takeover target stops first. */
  function releaseSessionInDraft(draft: CatalogSnapshot, sessionId: Branded<'SessionId'>): void {
    for (const previous of [...draft.executions]) {
      if (previous.owner?.sessionId !== sessionId && !previous.waiting.includes(sessionId)) continue
      const next = previous.owner?.sessionId === sessionId
        ? previous.takeover ? confirmStop(previous, previous.owner, 'stopped') : releaseExecutionState(previous, previous.owner)
        : { ...previous, waiting: previous.waiting.filter(waiter => waiter !== sessionId) }
      if (next === previous) continue
      storeExecution(draft, next)
      recordAudit(draft, 'execution.released', 'system', { workspaceId: previous.workspaceId, sessionId, detail: next.owner?.sessionId })
    }
  }
  /** Replace one workspace record inside a transaction. */
  function updateWorkspaceIn(draft: CatalogSnapshot, workspaceId: WorkspaceRecord['id'], mutate: (workspace: WorkspaceRecord) => WorkspaceRecord): WorkspaceRecord {
    const index = draft.workspaces.findIndex(item => item.id === workspaceId)
    if (index === -1) throw new CatalogError('missing_workspace')
    const next = mutate(draft.workspaces[index]!)
    draft.workspaces[index] = next
    return next
  }
  /** Patch preparation progress and stamp its update time. */
  function patchPreparation(draft: CatalogSnapshot, workspaceId: WorkspaceRecord['id'], patch: (preparation: WorkspacePreparation, workspace: WorkspaceRecord) => WorkspacePreparation): WorkspaceRecord {
    return updateWorkspaceIn(draft, workspaceId, workspace => {
      if (workspace.preparation === undefined) throw new CatalogError('invalid_catalog')
      return { ...workspace, preparation: { ...patch(workspace.preparation, workspace), updatedAt: nowIso() } }
    })
  }
  /** Patch cleanup progress and stamp its update time. */
  function patchCleanup(draft: CatalogSnapshot, workspaceId: WorkspaceRecord['id'], patch: (cleanup: WorkspaceCleanup, workspace: WorkspaceRecord) => WorkspaceCleanup): WorkspaceRecord {
    return updateWorkspaceIn(draft, workspaceId, workspace => {
      if (workspace.cleanup === undefined) throw new CatalogError('invalid_catalog')
      return { ...workspace, cleanup: { ...patch(workspace.cleanup, workspace), updatedAt: nowIso() } }
    })
  }
  /** Detached copy of one current workspace record. */
  function currentWorkspace(workspaceId: WorkspaceRecord['id']): WorkspaceRecord {
    return structuredClone(workspaceIn(state, workspaceId))
  }

  const workspaceLifecycle = {
    snapshot: (): CatalogSnapshot => state,
    transaction: <T,>(operation: (draft: CatalogSnapshot) => Promise<T> | T): Promise<T> => transaction(operation),
    updateWorkspaceIn,
    patchCleanup,
    recordAudit,
  }

  const workspaceWrite = {
    snapshot: (): CatalogSnapshot => state,
    transaction: <T,>(operation: (draft: CatalogSnapshot) => Promise<T> | T): Promise<T> => transaction(operation),
    recordAudit,
  }

  const workspaceRegister = {
    transaction: <T,>(operation: (draft: CatalogSnapshot) => Promise<T> | T): Promise<T> => transaction(operation),
    recordAudit,
  }

  const workspacePrepare = {
    transaction: <T,>(operation: (draft: CatalogSnapshot) => Promise<T> | T): Promise<T> => transaction(operation),
    currentWorkspace,
    patchPreparation,
    updateWorkspaceIn,
    recordAudit,
  }

  const executionQueue = {
    snapshot: (): CatalogSnapshot => state,
    transaction: <T,>(operation: (draft: CatalogSnapshot) => Promise<T> | T): Promise<T> => transaction(operation),
    executionIn,
    storeExecution,
    releaseSessionInDraft,
    recordAudit,
  }

  const taskLifecycle = {
    transaction: <T,>(operation: (draft: CatalogSnapshot) => Promise<T> | T): Promise<T> => transaction(operation),
    executionIn,
    storeExecution,
    releaseSessionInDraft,
    recordAudit,
  }

  const projectVersion = {
    transaction: <T,>(operation: (draft: CatalogSnapshot) => Promise<T> | T): Promise<T> => transaction(operation),
    resolveCommit,
    recordAudit,
  }

  const api: Catalog = {
    prepareWorkspace: input => prepareWorkspace(workspacePrepare, input),
    ensureWorkspaceBranches: workspaceId => ensureWorkspaceBranches(workspaceWrite, workspaceId),
    ensureWorkspaceSkillLinks: workspaceId => ensureWorkspaceSkillLinks(workspaceWrite, workspaceId),
    workspaceChanges: (workspaceId, attemptId) => workspaceChanges(state, workspaceId, attemptId),
    workspaceChangeCount: (workspaceId, attemptId) => workspaceChangeCount(state, workspaceId, attemptId),
    workspaceStatus: (workspaceId, attemptId) => workspaceStatus(state, workspaceId, attemptId),
    commitWorkspace: (workspaceId, message) => commitWorkspace(state, workspaceId, message),
    workspaceDirty: workspaceId => workspaceDirty(state, workspaceId),
    updateWorkspace: (workspaceId, label) => updateWorkspace(workspaceWrite, workspaceId, label),
    deleteWorkspace: (workspaceId, deleteFiles, confirmPath) => deleteWorkspace(workspaceLifecycle, workspaceId, deleteFiles, confirmPath),
    cleanupWorkspace: (workspaceId, discardChanges) => cleanupWorkspace(workspaceLifecycle, workspaceId, discardChanges),
    registerPreparedWorkspace: input => registerPreparedWorkspace(workspaceRegister, input),
    startAttempt: (taskId, workspaceId, options) => startAttempt(taskLifecycle, taskId, workspaceId, options),
    attachSession: (taskId, sessionId) => attachSession(taskLifecycle, taskId, sessionId),
    registerTemporarySession: (sessionId, workspacePath) => registerTemporarySession(taskLifecycle, sessionId, workspacePath),
    forgetTemporarySession: sessionId => forgetTemporarySession(taskLifecycle, sessionId),
    transitionTask: (taskId, target, actor, confirmation) => transitionTask(taskLifecycle, taskId, target, actor, confirmation),
    suggestTaskOutcome: (taskId, suggestion) => suggestTaskOutcome(taskLifecycle, taskId, suggestion),
    acquireExecution: (workspaceId, sessionId) => acquireExecution(executionQueue, workspaceId, sessionId),
    releaseExecution: (workspaceId, expected) => releaseExecution(executionQueue, workspaceId, expected),
    cancelExecution: (workspaceId, sessionId) => cancelExecution(executionQueue, workspaceId, sessionId),
    reorderExecutionQueue: (workspaceId, sessionIds) => reorderExecutionQueue(executionQueue, workspaceId, sessionIds),
    beginTakeover: (workspaceId, sessionId) => beginTakeover(executionQueue, workspaceId, sessionId),
    finishTakeover: (workspaceId, expected, outcome) => finishTakeover(executionQueue, workspaceId, expected, outcome),
    releaseSession: sessionId => releaseSession(executionQueue, sessionId),
    snapshot: () => structuredClone(state),
    createProject: input => createProject(projectVersion, input),
    updateProject: (projectId, input) => updateProject(projectVersion, projectId, input),
    deleteProject: projectId => deleteProject(projectVersion, projectId),
    createVersion: (projectId, name, sources, description, targets) => createVersion(projectVersion, projectId, name, sources, description, targets),
    updateVersion: (versionId, name, sources, description, targets) => updateVersion(projectVersion, versionId, name, sources, description, targets),
    deleteVersion: versionId => deleteVersion(projectVersion, versionId),
    generateLock: versionId => generateLock(projectVersion, versionId),
    createTask: async (versionId, title, options = {}) => {
      const admittedTitle = text.parse(title)
      const description = options.description?.trim() ?? ''
      if (description.length > 4000) throw new CatalogError('invalid_task')
      const moduleIds = [...(options.moduleIds ?? [])]
      if (!distinct(moduleIds)) throw new CatalogError('invalid_task')
      const priority = options.priority ?? 'normal'
      return transaction(draft => {
        const version = versionIn(draft, versionId)
        const project = draft.projects.find(p => p.id === version.projectId)
        if (project === undefined || moduleIds.some(moduleId => !project.config.modules.some(module => module.id === moduleId))) throw new CatalogError('invalid_task')
        if (options.workspaceId !== undefined) {
          const workspace = draft.workspaces.find(candidate => candidate.id === options.workspaceId)
          if (workspace === undefined || workspace.cleaned === true) throw new CatalogError('missing_workspace')
          if (workspace.versionId !== versionId) throw new CatalogError('workspace_mismatch')
          if (workspace.preparation !== undefined && workspace.preparation.status !== 'ready') throw new CatalogError('workspace_not_prepared')
        }
        const record: TaskRecord = {
          ...pendingTask(brandString<Task['id']>(randomUUID()), versionId),
          ...(options.workspaceId === undefined ? {} : { workspaceId: options.workspaceId }),
          title: admittedTitle,
          description,
          moduleIds,
          priority,
          updatedAt: nowIso(),
        }
        draft.tasks.push(record)
        recordAudit(draft, 'task.created', 'human', { taskId: record.id, detail: admittedTitle })
        return record
      })
    },
    updateTask: async (taskId, title, options = {}) => {
      const admittedTitle = text.parse(title)
      const description = options.description?.trim() ?? ''
      if (description.length > 4000) throw new CatalogError('invalid_task')
      const moduleIds = [...(options.moduleIds ?? [])]
      if (!distinct(moduleIds)) throw new CatalogError('invalid_task')
      const priority = options.priority ?? 'normal'
      return transaction(draft => {
        const task = taskIn(draft, taskId)
        const version = versionIn(draft, task.versionId)
        const project = draft.projects.find(candidate => candidate.id === version.projectId)
        if (project === undefined || moduleIds.some(moduleId => !project.config.modules.some(module => module.id === moduleId))) throw new CatalogError('invalid_task')
        const next: TaskRecord = { ...task, title: admittedTitle, description, moduleIds, priority, updatedAt: nowIso() }
        draft.tasks[draft.tasks.indexOf(task)] = next
        recordAudit(draft, 'task.updated', 'human', { taskId: next.id, detail: admittedTitle })
        return next
      })
    },
    deleteTask: async taskId => transaction(draft => {
      const task = taskIn(draft, taskId)
      if (task.status === 'running') throw new CatalogError('task_busy')
      const workspaceIds = new Set<TaskRecord['attempts'][number]['workspaceId']>(task.attempts.map(attempt => attempt.workspaceId))
      // A workspace can be shared by attempts of several tasks, so only the
      // records no remaining task references may disappear with this task.
      const remaining = new Set(draft.tasks.filter(candidate => candidate !== task).flatMap(candidate => candidate.attempts.map(attempt => attempt.workspaceId)))
      const removed = new Set([...workspaceIds].filter(workspaceId => !remaining.has(workspaceId)))
      if (draft.executions.some(execution => removed.has(execution.workspaceId) && (execution.owner !== null || execution.waiting.length > 0))) throw new CatalogError('task_busy')
      if (draft.workspaces.some(workspace => removed.has(workspace.id) && workspace.cleaned !== true)) throw new CatalogError('task_workspace_uncleaned')
      draft.tasks.splice(draft.tasks.indexOf(task), 1)
      draft.workspaces = draft.workspaces.filter(workspace => !removed.has(workspace.id))
      draft.executions = draft.executions.filter(execution => !removed.has(execution.workspaceId))
      recordAudit(draft, 'task.deleted', 'human', { taskId, detail: task.title })
    }),
  }
  return api
}
