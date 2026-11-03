/**
 * Task creation, metadata edits and deletion.
 *
 * Execution state remains in `task-lifecycle.ts`; this module only owns the
 * task record itself and its workspace references.
 */
import { randomUUID } from 'node:crypto'
import { brandString } from '@deepseek-ai/dsh-brand'
import { createTask as pendingTask, type Task } from '../../domain/task.ts'
import type { AuditEntry, AuditEvent } from '../../domain/audit.ts'
import type { CatalogSnapshot, TaskRecord } from '../../api/records.ts'
import type { CreateTaskOptions } from './contract.ts'
import { CatalogError } from './errors.ts'
import { distinct, nowIso, text } from './schema.ts'
import { taskIn, versionIn } from './selectors.ts'

/**
 * The catalog transaction surface required by task CRUD.
 */
export interface TaskCrudRuntime {
  transaction<T>(operation: (draft: CatalogSnapshot) => Promise<T> | T): Promise<T>
  recordAudit(
    draft: CatalogSnapshot,
    event: AuditEvent,
    actor: AuditEntry['actor'],
    fields?: Omit<AuditEntry, 'id' | 'at' | 'event' | 'actor'>,
  ): void
}

/**
 * Create one pending task under a version.
 * @param runtime - Catalog transaction and audit surface.
 * @param versionId - Owning version.
 * @param title - Already-localized title input.
 * @param options - Optional workspace, description, modules and priority.
 * @returns the persisted task.
 */
export async function createTask(runtime: TaskCrudRuntime, versionId: TaskRecord['versionId'], title: string, options: CreateTaskOptions = {}): Promise<TaskRecord> {
  const admittedTitle = text.parse(title)
  const description = options.description?.trim() ?? ''
  if (description.length > 4000) throw new CatalogError('invalid_task')
  const moduleIds = [...(options.moduleIds ?? [])]
  if (!distinct(moduleIds)) throw new CatalogError('invalid_task')
  const priority = options.priority ?? 'normal'
  return runtime.transaction(draft => {
    const version = versionIn(draft, versionId)
    const project = draft.projects.find(candidate => candidate.id === version.projectId)
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
    runtime.recordAudit(draft, 'task.created', 'human', { taskId: record.id, detail: admittedTitle })
    return record
  })
}

/**
 * Replace editable task metadata without changing its version or attempts.
 * @param runtime - Catalog transaction and audit surface.
 * @param taskId - Task identity.
 * @param title - New title input.
 * @param options - Optional description, modules and priority.
 * @returns the updated task.
 */
export async function updateTask(runtime: TaskCrudRuntime, taskId: TaskRecord['id'], title: string, options: CreateTaskOptions = {}): Promise<TaskRecord> {
  const admittedTitle = text.parse(title)
  const description = options.description?.trim() ?? ''
  if (description.length > 4000) throw new CatalogError('invalid_task')
  const moduleIds = [...(options.moduleIds ?? [])]
  if (!distinct(moduleIds)) throw new CatalogError('invalid_task')
  const priority = options.priority ?? 'normal'
  return runtime.transaction(draft => {
    const task = taskIn(draft, taskId)
    const version = versionIn(draft, task.versionId)
    const project = draft.projects.find(candidate => candidate.id === version.projectId)
    if (project === undefined || moduleIds.some(moduleId => !project.config.modules.some(module => module.id === moduleId))) throw new CatalogError('invalid_task')
    const next: TaskRecord = { ...task, title: admittedTitle, description, moduleIds, priority, updatedAt: nowIso() }
    draft.tasks[draft.tasks.indexOf(task)] = next
    runtime.recordAudit(draft, 'task.updated', 'human', { taskId: next.id, detail: admittedTitle })
    return next
  })
}

/**
 * Delete a task and the workspace records only it references.
 * @param runtime - Catalog transaction and audit surface.
 * @param taskId - Task identity.
 * @returns nothing after the record and unreferenced workspace rows are gone.
 */
export async function deleteTask(runtime: TaskCrudRuntime, taskId: TaskRecord['id']): Promise<void> {
  return runtime.transaction(draft => {
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
    runtime.recordAudit(draft, 'task.deleted', 'human', { taskId, detail: task.title })
  })
}
