/** Persistent Loom catalog; one instance owns and serializes all mutations of its file. */
import { randomUUID } from 'node:crypto'
import { lstat } from 'node:fs/promises'
import { z } from 'zod'
import { brandNumber, brandString, type Branded } from '@deepseek-ai/dsh-brand'
import { parseProject, projectSubProjects, type ProjectConfig } from '../domain/project.ts'
import { resolveLock, type VersionTarget } from '../domain/version.ts'
import { isAbsolute, normalize, resolve, sep, win32 } from 'node:path'
import { createTask as pendingTask, startAttempt, attachSession, transitionTask, type Attempt, type Task, type Lock, type TaskEvidence, type TaskOutcome, type TaskStatus } from '../domain/task.ts'
import { createJsonStore, JsonStoreError } from '../storage/json-store.ts'
import type { CatalogSnapshot, ProjectRecord, TaskPriority, TaskRecord, TemporarySessionRecord, VersionRecord, WorkspaceCleanup, WorkspaceCleanupRepository, WorkspaceCleanupRepositoryStatus, WorkspacePreparation, WorkspaceRecord } from '../api/records.ts'
export type { CatalogSnapshot, ProjectRecord, TaskPriority, TaskRecord, TemporarySessionRecord, VersionRecord, WorkspaceCleanup, WorkspaceCleanupRepository, WorkspaceCleanupRepositoryStatus, WorkspaceCleanupStatus, WorkspacePreparation, WorkspacePreparationRepository, WorkspacePreparationRepositoryStatus, WorkspacePreparationStatus, WorkspaceRecord } from '../api/records.ts'
import {
  addLinkedWorkspaceLink, addWorkspaceWorktree, commitsSince, createWorkspaceRoot, ensureWorktreeBranch, linkWorkspaceSkills,
  planLinkedWorkspace, planWorkspace, removeLinkedWorkspaceLink, removeLinkedWorkspaceRoot, removeWorkspaceRoot, removeWorkspaceSkills,
  commitWorkingTree, removeWorkspaceWorktree, resolveHead, unpushedCommits, workingTreeChangeCount, workingTreeChanges, workingTreeDirty,
  WorkspacePreparationError,
  type LinkedRepositoryPlan, type WorkspaceRepositoryChanges, type WorkspaceRepositoryPlan,
} from '../git/workspace.ts'
import { admitWorkspaceLayout, WorkspaceLayoutError, type WorkspaceLayout, type WorkspaceMode, type WorkspaceRepositoryBinding, type WorkspaceRepositoryKind } from '../domain/workspace.ts'
import type { AuditEntry, AuditEvent } from '../domain/audit.ts'
import { VERSION_DESCRIPTION_MAX_CHARS } from '../shared/version-context.ts'
import {
  cancelExecutionRequest, confirmStop, reorderWaiting, createExecution, releaseExecution as releaseExecutionState, requestExecution,
  requestTakeover, type ExecutionOwner, type ExecutionState, type StopOutcome,
} from '../domain/execution.ts'

/** Human-readable explanation for every catalog failure code. */
const CATALOG_ERROR_DESCRIPTION: Readonly<Record<string, string>> = {
  missing_project: 'the requested project does not exist',
  missing_version: 'the requested version does not exist',
  invalid_version: 'the version record is invalid',
  invalid_catalog: 'the Loom catalog is corrupt or inconsistent',
  missing_lock: 'the requested Lock does not exist',
  missing_task: 'the requested task does not exist',
  missing_workspace: 'the requested workspace does not exist',
  workspace_mismatch: 'the workspace does not belong to this version or Lock',
  workspace_path_registered: 'the directory is already registered as a workspace',
  invalid_workspace_path: 'the workspace path is invalid',
  workspace_busy: 'the workspace is owned by another session',
  workspace_task_running: 'another task is running in this workspace',
  workspace_branch_failed: 'the workspace branch could not be created or recorded',
  workspace_parent_missing: 'the workspace parent directory is missing',
  workspace_in_use: 'the workspace is still referenced by a task attempt',
  invalid_workspace_label: 'the workspace display label is too long',
  invalid_task: 'the task fields are invalid',
  workspace_changes: 'the workspace has uncommitted changes',
  workspace_cleanup_failed: 'the workspace cleanup did not finish',
  workspace_cleaned: 'the workspace has already been cleaned',
  workspace_unpushed: 'the workspace has unpushed commits',
  workspace_not_prepared: 'the workspace preparation is not ready',
  execution_not_owned: 'the session does not own this workspace execution',
  task_not_active: 'the task is not in an active round',
  project_has_versions: 'the project still has versions',
  version_has_tasks: 'the version still has tasks',
  version_has_workspaces: 'the version still has workspaces',
  task_busy: 'the task is still running or owns a workspace',
  task_workspace_uncleaned: 'the task still has an uncleaned workspace',
}
/** Catalog operation rejection, suitable for caller-owned localization. */
export class CatalogError extends Error {
  constructor(
    readonly code: 'missing_project' | 'missing_version' | 'invalid_version' | 'invalid_catalog' | 'missing_lock' | 'missing_task' | 'missing_workspace' | 'workspace_mismatch' | 'workspace_path_registered' | 'invalid_workspace_path' | 'workspace_busy' | 'workspace_task_running' | 'workspace_branch_failed' | 'workspace_parent_missing' | 'workspace_in_use' | 'invalid_workspace_label' | 'invalid_task' | 'workspace_changes' | 'workspace_cleanup_failed' | 'workspace_cleaned' | 'workspace_unpushed' | 'workspace_not_prepared' | 'execution_not_owned' | 'task_not_active' | 'project_has_versions' | 'version_has_tasks' | 'version_has_workspaces' | 'task_busy' | 'task_workspace_uncleaned',
    /** Optional concrete diagnostic naming the task, owner or step that blocked the operation. */
    readonly detail?: string | undefined,
  ) {
    const description = CATALOG_ERROR_DESCRIPTION[code] ?? 'the operation was rejected'
    super(detail === undefined || detail === '' ? `${code}: ${description}` : `${code}: ${description} (${detail})`)
    this.name = 'CatalogError'
  }
}
const text = z.string().trim().min(1)
/** ISO 8601 UTC timestamp written by the Host; older records legitimately omit it. */
const isoTimestamp = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u)
/** Absolute path in either host spelling; a migrated catalog may originate on another operating system. */
const catalogPath = (value: string): boolean => isAbsolute(value)
  ? normalize(value) === value
  : /^[A-Za-z]:[\\/]/u.test(value) || /^\\\\/u.test(value)
const id = <B extends string>() => text.transform(value => brandString<Branded<B>>(value))
const sourceSchema = z.strictObject({ sourceId: id<'loom.source'>(), ref: text })
const targetSchema = z.strictObject({ subProjectId: id<'loom.subproject'>(), sourceId: id<'loom.source'>(), ref: text })
const versionDescription = z.string().max(VERSION_DESCRIPTION_MAX_CHARS)
const versionSchema = z.strictObject({
  id: id<'loom.version'>(),
  projectId: id<'loom.project'>(),
  name: text,
  description: versionDescription.optional().transform(value => value?.trim() ?? ''),
  sources: z.array(sourceSchema).min(1),
  targets: z.array(targetSchema).min(1).optional(),
})
const lockSchema = z.strictObject({ id: id<'loom.lock'>(), versionId: id<'loom.version'>(), repositories: z.array(z.strictObject({ sourceId: id<'loom.source'>(), commit: z.string().regex(/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u), subProjectId: id<'loom.subproject'>().optional() })).min(1), createdAt: isoTimestamp.optional() })
const status = z.enum(['running', 'review', 'completed', 'failed'])
const taskPrioritySchema = z.enum(['low', 'normal', 'high'])
const evidenceList = z.array(z.string().max(500)).max(50)
const taskTestResultSchema = z.strictObject({
  name: text,
  status: z.enum(['passed', 'failed', 'skipped']),
  command: z.string().max(1000).optional(),
  detail: z.string().max(2000).optional(),
})
const taskOutcomeSchema = z.strictObject({
  state: z.enum(['suggested', 'accepted', 'rejected']),
  suggestedStatus: z.enum(['review', 'failed']).optional(),
  agentSummary: z.string().max(4000).optional(),
  completed: evidenceList.optional(),
  notDone: evidenceList.optional(),
  risks: evidenceList.optional(),
  impact: evidenceList.optional(),
  // Real results only: an absent list means no tests ran, never a placeholder.
  testResults: z.array(taskTestResultSchema).max(50).optional(),
  suggestedBy: z.enum(['agent', 'human', 'system']).optional(),
  at: isoTimestamp.optional(),
  sessionId: id<'SessionId'>().optional(),
  attemptId: id<'loom.attempt'>().optional(),
  basis: z.string().max(2000).optional(),
  confirmedAt: isoTimestamp.optional(),
  confirmedBy: z.enum(['human', 'agent', 'system']).optional(),
  confirmationBasis: z.string().max(2000).optional(),
})
const taskSchema = z.strictObject({
  id: id<'loom.task'>(),
  versionId: id<'loom.version'>(),
  workspaceId: id<'loom.workspace'>().optional(),
  title: text,
  description: z.string().max(4000).optional().transform(value => value ?? ''),
  moduleIds: z.array(id<'loom.module'>()).optional().transform(value => value ?? []),
  priority: taskPrioritySchema.optional().transform(value => value ?? 'normal'),
  updatedAt: isoTimestamp.optional(),
  status: z.enum(['pending', 'running', 'review', 'completed', 'failed']),
  attempts: z.array(z.strictObject({ id: id<'loom.attempt'>(), lock: lockSchema, workspaceId: id<'loom.workspace'>(), sessionIds: z.array(id<'SessionId'>()), status })),
  outcome: taskOutcomeSchema.optional(),
})
const preparationRepositorySchema = z.strictObject({
  sourceId: id<'loom.source'>(),
  status: z.enum(['waiting', 'preparing', 'done', 'failed']),
  path: z.string().max(4096).optional(),
  error: z.string().max(1000).optional(),
  rollback: z.string().max(1000).optional(),
})
const preparationSchema = z.strictObject({
  status: z.enum(['waiting', 'preparing', 'ready', 'failed']),
  startedAt: isoTimestamp.optional(),
  updatedAt: isoTimestamp.optional(),
  error: z.string().max(1000).optional(),
  repositories: z.array(preparationRepositorySchema).min(1),
})
const cleanupRepositorySchema = z.strictObject({
  sourceId: id<'loom.source'>(),
  status: z.enum(['waiting', 'removed', 'kept', 'failed']),
  path: z.string().max(4096).optional(),
  error: z.string().max(1000).optional(),
  residual: z.string().max(4096).optional(),
})
const cleanupSchema = z.strictObject({
  status: z.enum(['waiting', 'cleaning', 'partial', 'cleaned']),
  startedAt: isoTimestamp.optional(),
  updatedAt: isoTimestamp.optional(),
  error: z.string().max(1000).optional(),
  residual: z.array(z.string().max(4096)).max(50).optional(),
  repositories: z.array(cleanupRepositorySchema).min(1),
})
const workspaceRepositorySchema = z.strictObject({
  sourceId: id<'loom.source'>(),
  subProjectId: id<'loom.subproject'>().optional(),
  path: text,
  targetPath: z.string().refine(catalogPath),
  kind: z.enum(['worktree', 'direct', 'link']),
  branch: text.optional(),
})
const workspaceSchema = z.strictObject({
  id: id<'loom.workspace'>(),
  path: z.string().refine(catalogPath),
  label: z.string().trim().max(80).optional(),
  versionId: id<'loom.version'>(),
  lockId: id<'loom.lock'>(),
  branches: z.record(z.string(), text).optional(),
  managed: z.boolean().optional(),
  cleaned: z.boolean().optional(),
  projectId: id<'loom.project'>().optional(),
  mode: z.enum(['managed', 'direct', 'linked']).optional(),
  rootPath: z.string().refine(catalogPath).optional(),
  rootOwner: z.enum(['loom', 'user']).optional(),
  repositories: z.array(workspaceRepositorySchema).min(1).optional(),
  skillLinks: z.array(z.string().refine(catalogPath)).optional(),
  preparation: preparationSchema.optional(),
  cleanup: cleanupSchema.optional(),
})
const temporarySessionSchema = z.strictObject({
  sessionId: id<'SessionId'>(),
  workspacePath: z.string().refine(value => isAbsolute(value) && normalize(value) === value),
  createdAt: z.number().int().nonnegative(),
})
const auditEvents = ['project.created', 'project.updated', 'project.deleted', 'version.created', 'version.updated', 'version.deleted', 'lock.generated', 'task.created', 'task.updated', 'task.deleted', 'task.transitioned', 'task.review-requested', 'task.failure-suggested', 'task.confirmation-accepted', 'task.confirmation-rejected', 'workspace.prepared', 'workspace.updated', 'workspace.cleaned', 'attempt.started', 'session.attached', 'execution.acquired', 'execution.queued', 'execution.released', 'execution.takeover-requested', 'execution.takeover-stopped', 'execution.takeover-blocked'] as const
const auditSchema = z.strictObject({
  id: text,
  at: z.number().int().nonnegative(),
  actor: z.enum(['human', 'agent', 'system']),
  event: z.enum(auditEvents),
  taskId: id<'loom.task'>().optional(),
  attemptId: id<'loom.attempt'>().optional(),
  workspaceId: id<'loom.workspace'>().optional(),
  sessionId: id<'SessionId'>().optional(),
  basis: z.string().max(2000).optional(),
  detail: z.string().optional(),
})
const generation = z.number().int().nonnegative().transform(value => brandNumber<ExecutionOwner['generation']>(value))
const ownerSchema = z.strictObject({ workspaceId: id<'loom.workspace'>(), sessionId: id<'SessionId'>(), generation })
const executionSchema = z.strictObject({
  workspaceId: id<'loom.workspace'>(),
  generation,
  owner: ownerSchema.nullable(),
  waiting: z.array(id<'SessionId'>()),
  takeover: z.strictObject({ sessionId: id<'SessionId'>(), stopStatus: z.enum(['requested', 'unknown', 'failed']) }).nullable(),
})
const schema = z.strictObject({
  projects: z.array(z.strictObject({ id: id<'loom.project'>(), config: z.unknown().transform(parseProject) })),
  versions: z.array(versionSchema), locks: z.array(lockSchema), tasks: z.array(taskSchema), workspaces: z.array(workspaceSchema),
  temporarySessions: z.array(temporarySessionSchema).optional().transform(value => value ?? []),
  audit: z.array(auditSchema).max(500).optional().transform(value => value ?? []),
  executions: z.array(executionSchema).optional().transform(value => value ?? []),
})
function distinct(values: readonly string[]): boolean { return new Set(values).size === values.length }
/** Host-side mutation timestamp; ISO strings sort chronologically for version-context ordering. */
function nowIso(): string { return new Date().toISOString() }
/** Admit one version description: trimmed, bounded and localizable through `invalid_version`. */
function admitVersionDescription(value: string): string {
  if (typeof value !== 'string') throw new CatalogError('invalid_version')
  const trimmed = value.trim()
  if (trimmed.length > VERSION_DESCRIPTION_MAX_CHARS) throw new CatalogError('invalid_version')
  return trimmed
}
function validVersion(project: ProjectRecord, version: Pick<VersionRecord, 'sources' | 'targets'>): boolean {
  if (version.targets !== undefined) {
    if (version.targets.length === 0) return false
    const subProjects = new Map(projectSubProjects(project.config).map(sub => [sub.id, sub]))
    const seen = new Set<string>()
    return version.targets.every(target => {
      const key = `${String(target.subProjectId)}\u0000${String(target.sourceId)}`
      if (seen.has(key)) return false
      seen.add(key)
      return subProjects.get(target.subProjectId)?.sources.some(source => source.id === target.sourceId) === true
    })
  }
  return distinct(version.sources.map(s => s.sourceId)) && version.sources.every(s => project.config.sources.some(p => p.id === s.sourceId))
}

/** Project owning a task/version, or undefined when the catalog is dangling. */
function projectOf(draft: CatalogSnapshot, versionId: string): ProjectRecord | undefined {
  const version = draft.versions.find(candidate => candidate.id === versionId)
  return version === undefined ? undefined : draft.projects.find(candidate => candidate.id === version.projectId)
}

/** Project owning a workspace, tolerating records accepted before projectId was added. */
function projectOfWorkspace(draft: CatalogSnapshot, workspace: WorkspaceRecord): ProjectRecord | undefined {
  if (workspace.projectId !== undefined) return draft.projects.find(candidate => candidate.id === workspace.projectId)
  return projectOf(draft, workspace.versionId)
}

/** Repository bindings for a workspace, deriving legacy fields when the record predates layouts. */
function workspaceBindings(draft: CatalogSnapshot, workspace: WorkspaceRecord): readonly WorkspaceRepositoryBinding[] {
  if (workspace.repositories !== undefined && workspace.repositories.length > 0) return workspace.repositories
  const project = projectOfWorkspace(draft, workspace)
  if (project === undefined) throw new CatalogError('missing_project')
  const base = workspace.rootPath ?? workspace.path
  const kind: WorkspaceRepositoryKind = workspace.managed === true ? 'worktree' : 'direct'
  return project.config.sources.map(source => ({
    sourceId: source.id,
    path: source.path,
    targetPath: resolve(base, source.path),
    kind,
  }))
}

/** Resolve a repository path in the spelling the catalog stored, including a catalog moved from Windows. */
function resolveCatalogPath(root: string, path: string): string {
  return /^[A-Za-z]:[\\/]/u.test(root) || /^\\\\/u.test(root) ? win32.resolve(root, path) : resolve(root, path)
}

/** Compare two catalog paths in their own spelling, without assuming the host platform. */
function sameCatalogPath(left: string, right: string): boolean {
  const windows = /^[A-Za-z]:[\\/]/u.test(left) || /^\\\\/u.test(left)
  if (windows) return win32.isAbsolute(left) && win32.isAbsolute(right) && win32.resolve(left).toLowerCase() === win32.resolve(right).toLowerCase()
  return isAbsolute(left) && isAbsolute(right) && resolve(left) === resolve(right)
}

/** Enrich a version-1 catalog without reading the filesystem. */
export function migrateCatalog(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value
  const data = value as Record<string, unknown>
  const versions = Array.isArray(data.versions) ? data.versions as Record<string, unknown>[] : []
  const projects = Array.isArray(data.projects) ? data.projects as Record<string, unknown>[] : []
  const workspaces = Array.isArray(data.workspaces) ? data.workspaces as Record<string, unknown>[] : []
  const locks = Array.isArray(data.locks) ? data.locks as Record<string, unknown>[] : []
  const migratedProjects = projects.map(project => {
    const config = project.config as Record<string, unknown> | undefined
    if (config === undefined || Array.isArray(config.subProjects) || !Array.isArray(config.sources)) return project
    return {
      ...project,
      config: {
        ...config,
        subProjects: [{
          id: 'default',
          name: typeof config.name === 'string' ? config.name : 'default',
          sources: config.sources,
          modules: Array.isArray(config.modules) ? config.modules : [],
        }],
      },
    }
  })
  const projectById = new Map(migratedProjects.map(project => [project.id, project]))
  const migratedVersions = versions.map(version => {
    if (Array.isArray(version.targets)) return version
    const project = projectById.get(version.projectId)
    const config = project?.config as Record<string, unknown> | undefined
    const subProjects = Array.isArray(config?.subProjects) ? config.subProjects as Record<string, unknown>[] : []
    const subProjectId = typeof subProjects[0]?.id === 'string' ? subProjects[0].id : 'default'
    const sources = Array.isArray(version.sources) ? version.sources as Record<string, unknown>[] : []
    return {
      ...version,
      targets: sources.map(source => ({ subProjectId, sourceId: source.sourceId, ref: source.ref })),
    }
  })
  const versionById = new Map(migratedVersions.map(version => [version.id, version]))
  const migratedLocks = locks.map(lock => {
    if (!Array.isArray(lock.repositories)) return lock
    const version = versionById.get(lock.versionId)
    const targets = Array.isArray(version?.targets) ? version.targets as Record<string, unknown>[] : []
    const targetBySource = new Map(targets.map(target => [target.sourceId, target.subProjectId]))
    return {
      ...lock,
      repositories: (lock.repositories as Record<string, unknown>[]).map(repository => {
        const subProjectId = targetBySource.get(repository.sourceId)
        return subProjectId === undefined ? repository : { ...repository, subProjectId }
      }),
    }
  })
  const migrated = workspaces.map(workspace => {
    if (Array.isArray(workspace.repositories) && workspace.repositories.length > 0) return workspace
    const version = versions.find(candidate => candidate.id === workspace.versionId)
    const project = version === undefined ? undefined : projects.find(candidate => candidate.id === version.projectId)
    const config = project?.config as { sources?: { id: string; path: string; repo: string }[] } | undefined
    const managed = workspace.managed === true
    const sources = config?.sources
    return {
      ...workspace,
      ...(version?.projectId === undefined ? {} : { projectId: version.projectId }),
      mode: managed ? 'managed' : 'direct',
      rootPath: workspace.path,
      rootOwner: managed ? 'loom' : 'user',
      ...(sources === undefined ? {} : {
        repositories: sources.map(source => {
          const root = String(workspace.path)
          const sameRoot = !managed && sources.length === 1 && sameCatalogPath(root, source.repo)
          return {
            sourceId: source.id,
            path: sameRoot ? '.' : source.path,
            targetPath: sameRoot ? root : resolveCatalogPath(root, source.path),
            kind: managed ? 'worktree' : 'direct',
          }
        }),
      }),
    }
  })
  return { ...data, projects: migratedProjects, versions: migratedVersions, locks: migratedLocks, workspaces: migrated }
}
export function parseCatalog(value: unknown): CatalogSnapshot {
  const data = schema.parse(value)
  const fail = (): never => { throw new CatalogError('invalid_catalog') }
  for (const rows of [data.projects, data.versions, data.locks, data.tasks, data.workspaces]) if (!distinct(rows.map(r => r.id))) fail()
  if (!distinct(data.workspaces.filter(w => w.cleaned !== true).map(w => w.rootPath ?? w.path))) fail()
  for (const version of data.versions) {
    const project = data.projects.find(p => p.id === version.projectId)
    if (!project || !validVersion(project, version)) fail()
  }
  for (const lock of data.locks) {
    const version = data.versions.find(v => v.id === lock.versionId)
    // Locks are historical baselines: adding a source to a version must not
    // invalidate Locks created before that source existed.
    if (!version || !distinct(lock.repositories.map(r => r.sourceId))) fail()
  }
  const attempts: string[] = []
  for (const workspace of data.workspaces) {
    const version = data.versions.find(v => v.id === workspace.versionId)
    const lock = data.locks.find(l => l.id === workspace.lockId)
    if (!version || !lock || lock.versionId !== version.id) throw new CatalogError('invalid_catalog')
    if (workspace.repositories !== undefined) {
      try {
        admitWorkspaceLayout({
          projectId: workspace.projectId ?? version.projectId,
          mode: workspace.mode ?? (workspace.managed === true ? 'managed' : 'direct'),
          rootPath: workspace.rootPath ?? workspace.path,
          rootOwner: workspace.rootOwner ?? (workspace.managed === true ? 'loom' : 'user'),
          repositories: workspace.repositories,
        })
      } catch (error) {
        if (error instanceof WorkspaceLayoutError) fail()
        throw error
      }
    }
    if (workspace.projectId !== undefined && !data.projects.some(project => project.id === workspace.projectId)) fail()
    if (workspace.preparation !== undefined) {
      const entries = workspace.preparation.repositories
      if (!distinct(entries.map(entry => entry.sourceId))) fail()
      if (workspace.preparation.status === 'ready' && entries.some(entry => entry.status !== 'done')) fail()
      if (entries.some(entry => entry.status === 'done' && entry.path === undefined)) fail()
    }
    if (workspace.cleanup !== undefined) {
      if (!distinct(workspace.cleanup.repositories.map(entry => entry.sourceId))) fail()
      if (workspace.cleanup.status === 'cleaned' && workspace.cleaned !== true) fail()
    }
  }
  if (!distinct(data.executions.map(execution => execution.workspaceId))) fail()
  for (const execution of data.executions) {
    if (!data.workspaces.some(workspace => workspace.id === execution.workspaceId)) fail()
    if (execution.owner !== null && (execution.owner.workspaceId !== execution.workspaceId || Number(execution.owner.generation) > Number(execution.generation) || execution.owner.generation < 1)) fail()
    if (!distinct(execution.waiting)) fail()
    if (execution.owner !== null && execution.waiting.includes(execution.owner.sessionId)) fail()
    if (execution.takeover !== null && !execution.waiting.includes(execution.takeover.sessionId)) fail()
  }
  for (const task of data.tasks) {
    const taskVersion = data.versions.find(v => v.id === task.versionId)
    if (taskVersion === undefined) throw new CatalogError('invalid_catalog')
    const taskProject = data.projects.find(p => p.id === taskVersion.projectId)
    if (taskProject === undefined || !distinct(task.moduleIds) || task.moduleIds.some(moduleId => !taskProject.config.modules.some(module => module.id === moduleId))) throw new CatalogError('invalid_catalog')
    if (task.status === 'pending' ? task.attempts.length !== 0 : task.attempts.at(-1)?.status !== task.status) fail()
    if (task.outcome?.attemptId !== undefined && !task.attempts.some(attempt => attempt.id === task.outcome!.attemptId)) fail()
    for (const attempt of task.attempts) {
      attempts.push(attempt.id)
      const workspace = data.workspaces.find(w => w.id === attempt.workspaceId)
      if (!workspace) throw new CatalogError('invalid_catalog')
      const workspaceProject = workspace.projectId ?? data.versions.find(v => v.id === workspace.versionId)?.projectId
      if (workspaceProject !== taskVersion.projectId) fail()
      const lock = data.locks.find(l => l.id === attempt.lock.id)
      if (!lock || lock.versionId !== task.versionId || JSON.stringify(lock) !== JSON.stringify(attempt.lock) || !distinct(attempt.sessionIds)) fail()
    }
  }
  if (!distinct(attempts)) fail()
  if (!distinct(data.temporarySessions.map(row => row.sessionId))) fail()
  for (const temporary of data.temporarySessions) {
    if (!data.workspaces.some(workspace => workspace.cleaned !== true && (workspace.path === temporary.workspacePath || (workspace.rootPath ?? workspace.path) === temporary.workspacePath))) fail()
  }
  return data
}
/** A Session's advisory completion report; only a human transition confirms it. */
export interface TaskSuggestion extends TaskEvidence {
  /** Session whose Agent produced the report. */
  readonly sessionId: Branded<'SessionId'>
  /** `review` asks for human review; `failed` suggests the round cannot complete. */
  readonly suggestedStatus: 'review' | 'failed'
  /** Stated reason for the suggestion. */
  readonly basis?: string | undefined
}
/** Human metadata supplied with a terminal transition that decides a suggestion. */
export interface TaskConfirmation {
  /** Human rationale recorded with the confirmation decision. */
  readonly basis?: string | undefined
}
/** Per-repository push state reported alongside change counts. */
/** One repository checkpoint created by a workspace commit. */
export interface WorkspaceCommitRepository {
  readonly sourceId: Branded<'loom.source'>
  readonly path: string
  readonly changed: boolean
  readonly commit?: string
  readonly error?: string
}
/** Per-repository checkpoint result for a workspace commit. */
export interface WorkspaceCommitResult {
  readonly repositories: readonly WorkspaceCommitRepository[]
  readonly committed: number
}
export interface WorkspaceStatusRepository extends WorkspaceRepositoryChanges {
  /** Commits HEAD has that its upstream does not; absent when no upstream is configured. */
  readonly unpushed?: number | undefined
  /** True when the branch has no upstream, so no ahead count exists. */
  readonly unpushedUnavailable?: boolean | undefined
}
/** Find the active workspace whose root equals or contains one host path. */
export function findWorkspaceByPath(snapshot: CatalogSnapshot, path: string): WorkspaceRecord | undefined {
  return snapshot.workspaces.find(workspace => workspace.cleaned !== true && pathWithin(workspace.rootPath ?? workspace.path, path))
}
/** Resolve the task and its current round for one attached Session; newest records win. */
export function findSessionAttempt(snapshot: CatalogSnapshot, sessionId: string): { task: TaskRecord; attempt: Attempt } | undefined {
  for (let taskIndex = snapshot.tasks.length - 1; taskIndex >= 0; taskIndex -= 1) {
    const task = snapshot.tasks[taskIndex]!
    for (let attemptIndex = task.attempts.length - 1; attemptIndex >= 0; attemptIndex -= 1) {
      const attempt = task.attempts[attemptIndex]!
      if (attempt.sessionIds.some(candidate => candidate === sessionId)) return { task, attempt }
    }
  }
  return undefined
}
/** Trim and bound one Agent report; empty strings become absent, never placeholder evidence. */
function admitEvidence(input: TaskEvidence): TaskEvidence {
  const summary = input.agentSummary?.trim()
  if (summary !== undefined && summary.length > 4000) throw new CatalogError('invalid_task', 'agentSummary is too long')
  const admitList = (values: readonly string[] | undefined): readonly string[] | undefined => {
    if (values === undefined) return undefined
    const trimmed = values.map(value => value.trim()).filter(value => value !== '')
    if (trimmed.length > 50 || trimmed.some(value => value.length > 500)) throw new CatalogError('invalid_task', 'an evidence list is too long')
    return trimmed.length === 0 ? undefined : trimmed
  }
  const tests = input.testResults?.map(result => {
    const name = result.name.trim()
    if (name === '' || name.length > 500) throw new CatalogError('invalid_task', 'a test result needs a bounded name')
    const command = result.command?.trim()
    const detail = result.detail?.trim()
    if (command !== undefined && command.length > 1000) throw new CatalogError('invalid_task', 'a test command is too long')
    if (detail !== undefined && detail.length > 2000) throw new CatalogError('invalid_task', 'a test detail is too long')
    return {
      name,
      status: result.status,
      ...(command === undefined || command === '' ? {} : { command }),
      ...(detail === undefined || detail === '' ? {} : { detail }),
    }
  })
  if (tests !== undefined && tests.length > 50) throw new CatalogError('invalid_task', 'too many test results')
  const completed = admitList(input.completed)
  const notDone = admitList(input.notDone)
  const risks = admitList(input.risks)
  const impact = admitList(input.impact)
  return {
    ...(summary === undefined || summary === '' ? {} : { agentSummary: summary }),
    ...(completed === undefined ? {} : { completed }),
    ...(notDone === undefined ? {} : { notDone }),
    ...(risks === undefined ? {} : { risks }),
    ...(impact === undefined ? {} : { impact }),
    ...(tests === undefined || tests.length === 0 ? {} : { testResults: tests }),
  }
}
/** Whether one path equals or lives below a directory, using host path semantics. */
function pathWithin(root: string, candidate: string): boolean {
  const normalizedRoot = resolve(root)
  const normalized = resolve(candidate)
  if (normalized === normalizedRoot) return true
  if (process.platform === 'win32') return normalized.toLowerCase().startsWith(`${normalizedRoot.toLowerCase()}${sep}`)
  return normalized.startsWith(`${normalizedRoot}${sep}`)
}
/** True when a filesystem entry exists; a broken link still counts as present. */
async function pathExists(path: string): Promise<boolean> {
  try { await lstat(path); return true } catch { return false }
}
/** One preparation step failure rendered for persistence. */
function preparationFailure(error: unknown): { error: string, rollback: string | undefined } {
  if (error instanceof WorkspacePreparationError) {
    const detail = error.detail === undefined || error.detail === '' ? error.code : `${error.code}: ${error.detail}`
    return { error: detail.slice(0, 1000), rollback: error.rollbackErrors.length === 0 ? undefined : error.rollbackErrors.join('; ').slice(0, 1000) }
  }
  return { error: String(error).slice(0, 1000), rollback: undefined }
}
/** Optional task metadata admitted with the title. */
export interface CreateTaskOptions {
  readonly workspaceId?: WorkspaceRecord['id'] | undefined
  readonly description?: string | undefined
  readonly moduleIds?: readonly Branded<'loom.module'>[] | undefined
  readonly priority?: TaskPriority | undefined
}

/** Persistent catalog operations. Writes are committed before snapshots change. */
export interface Catalog {
  snapshot(): CatalogSnapshot
  createProject(config: unknown): Promise<ProjectRecord>
  updateProject(projectId: ProjectRecord['id'], config: ProjectConfig): Promise<ProjectRecord>
  deleteProject(projectId: ProjectRecord['id']): Promise<void>
  createVersion(projectId: ProjectRecord['id'], name: string, sources: readonly { sourceId: Branded<'loom.source'>; ref: string }[], description?: string, targets?: readonly VersionTarget[]): Promise<VersionRecord>
  updateVersion(versionId: VersionRecord['id'], name: string, sources: readonly { sourceId: Branded<'loom.source'>; ref: string }[], description?: string, targets?: readonly VersionTarget[]): Promise<VersionRecord>
  deleteVersion(versionId: VersionRecord['id']): Promise<void>
  generateLock(versionId: VersionRecord['id']): Promise<Lock>
  createTask(versionId: VersionRecord['id'], title: string, options?: CreateTaskOptions): Promise<TaskRecord>
  updateTask(taskId: TaskRecord['id'], title: string, options?: CreateTaskOptions): Promise<TaskRecord>
  deleteTask(taskId: TaskRecord['id']): Promise<void>
  prepareWorkspace(input: { path: string; versionId: Lock['versionId']; lockId: Lock['id']; branches?: Readonly<Record<string, string>>; mode?: 'managed' | 'linked'; repositories?: readonly { sourceId: Branded<'loom.source'>; path: string; targetPath: string }[]; workspaceId?: WorkspaceRecord['id']; requireBranches?: boolean }): Promise<WorkspaceRecord>
  workspaceChanges(workspaceId: WorkspaceRecord['id'], attemptId?: Branded<'loom.attempt'>): Promise<{ repositories: WorkspaceRepositoryChanges[] }>
  workspaceChangeCount(workspaceId: WorkspaceRecord['id'], attemptId?: Branded<'loom.attempt'>): Promise<number>
  workspaceStatus(workspaceId: WorkspaceRecord['id'], attemptId?: Branded<'loom.attempt'>): Promise<{ running: boolean; repositories: WorkspaceStatusRepository[] }>
  /** Commit every repository's uncommitted changes without pushing. */
  commitWorkspace(workspaceId: WorkspaceRecord['id'], message: string): Promise<WorkspaceCommitResult>
  workspaceDirty(workspaceId: WorkspaceRecord['id']): Promise<boolean>
  updateWorkspace(workspaceId: WorkspaceRecord['id'], label: string): Promise<WorkspaceRecord>
  deleteWorkspace(workspaceId: WorkspaceRecord['id'], deleteFiles: boolean, confirmPath?: string): Promise<void>
  cleanupWorkspace(workspaceId: WorkspaceRecord['id'], discardChanges: boolean): Promise<void>
  ensureWorkspaceBranches(workspaceId: WorkspaceRecord['id']): Promise<WorkspaceRecord>
  ensureWorkspaceSkillLinks(workspaceId: WorkspaceRecord['id']): Promise<WorkspaceRecord>
  registerPreparedWorkspace(input: { path: string; versionId: Lock['versionId']; lockId: Lock['id']; branches?: Readonly<Record<string, string>>; projectId?: Branded<'loom.project'>; mode?: WorkspaceMode; rootPath?: string; rootOwner?: 'loom' | 'user'; repositories?: readonly Omit<WorkspaceRepositoryBinding, 'kind'>[] }): Promise<WorkspaceRecord>
  startAttempt(taskId: TaskRecord['id'], workspaceId: WorkspaceRecord['id'], options?: { readonly allowBusy?: boolean }): Promise<TaskRecord>
  attachSession(taskId: TaskRecord['id'], sessionId: Branded<'SessionId'>): Promise<TaskRecord>
  registerTemporarySession(sessionId: Branded<'SessionId'>, workspacePath: string): Promise<TemporarySessionRecord>
  forgetTemporarySession(sessionId: Branded<'SessionId'>): Promise<void>
  transitionTask(taskId: TaskRecord['id'], target: TaskStatus, actor: 'human' | 'agent', confirmation?: TaskConfirmation): Promise<TaskRecord>
  /** Record one Agent report; a review suggestion may move running→review, never to completed. */
  suggestTaskOutcome(taskId: TaskRecord['id'], suggestion: TaskSuggestion): Promise<TaskRecord>
  acquireExecution(workspaceId: WorkspaceRecord['id'], sessionId: Branded<'SessionId'>): Promise<ExecutionState>
  cancelExecution(workspaceId: WorkspaceRecord['id'], sessionId: Branded<'SessionId'>): Promise<ExecutionState>
  reorderExecutionQueue(workspaceId: WorkspaceRecord['id'], sessionIds: readonly Branded<'SessionId'>[]): Promise<ExecutionState>
  releaseExecution(workspaceId: WorkspaceRecord['id'], expected: ExecutionOwner): Promise<ExecutionState>
  beginTakeover(workspaceId: WorkspaceRecord['id'], sessionId: Branded<'SessionId'>): Promise<{ state: ExecutionState; owner: ExecutionOwner }>
  finishTakeover(workspaceId: WorkspaceRecord['id'], expected: ExecutionOwner, outcome: StopOutcome): Promise<ExecutionState>
  releaseSession(sessionId: Branded<'SessionId'>): Promise<void>
}
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
  function versionIn(draft: CatalogSnapshot, versionId: VersionRecord['id']): VersionRecord {
    const version = draft.versions.find(v => v.id === versionId)
    if (!version) throw new CatalogError('missing_version')
    return version
  }
  function taskIn(draft: CatalogSnapshot, taskId: TaskRecord['id']): TaskRecord {
    const task = draft.tasks.find(item => item.id === taskId)
    if (!task) throw new CatalogError('missing_task')
    return task
  }
  function workspaceWorktrees(draft: CatalogSnapshot, workspaceId: WorkspaceRecord['id'], lockId?: Lock['id'], allowLegacyDirect = false): { sourceId: Branded<'loom.source'>; repo: string; directory: string; commit: string; branch?: string | undefined }[] {
    const workspace = workspaceIn(draft, workspaceId)
    const project = projectOfWorkspace(draft, workspace)
    if (!project) throw new CatalogError('missing_project')
    const lock = draft.locks.find(item => item.id === (lockId ?? workspace.lockId))
    if (!lock) throw new CatalogError('missing_lock')
    const mode = workspace.mode ?? (workspace.managed === true ? 'managed' : 'direct')
    // Direct workspaces may have been created before the project gained a
    // repository. Their pinned Lock then has no entry for the newer binding;
    // status/diff reads may use the latest Lock for that repository instead of
    // refusing the whole workspace.
    const fallback = allowLegacyDirect && mode === 'direct'
      ? draft.locks.filter(item => item.versionId === workspace.versionId).at(-1)
      : undefined
    return workspaceBindings(draft, workspace).map(binding => {
      const source = project.config.sources.find(item => item.id === binding.sourceId)
      if (source === undefined) throw new CatalogError('workspace_mismatch')
      const pinned = lock.repositories.find(repository => repository.sourceId === binding.sourceId)
        ?? fallback?.repositories.find(repository => repository.sourceId === binding.sourceId)
      if (pinned === undefined) throw new CatalogError('workspace_mismatch')
      return { sourceId: binding.sourceId, repo: source.repo, directory: binding.targetPath, commit: pinned.commit, branch: binding.branch ?? workspace.branches?.[binding.sourceId] }
    })
  }
  function workspaceIn(draft: CatalogSnapshot, workspaceId: WorkspaceRecord['id']): WorkspaceRecord {
    const workspace = draft.workspaces.find(item => item.id === workspaceId)
    if (!workspace) throw new CatalogError('missing_workspace')
    return workspace
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
  /** Repository worktree requests for the bindings that are still pending. */
  function repositoryRequests(project: ProjectRecord, lock: Lock, bindings: readonly WorkspaceRepositoryBinding[], pending?: ReadonlySet<string>): { repo: string; path: string; commit: string; branch?: string }[] {
    return bindings.filter(binding => pending === undefined || pending.has(binding.sourceId)).map(binding => {
      const source = project.config.sources.find(item => item.id === binding.sourceId)
      if (source === undefined) throw new CatalogError('workspace_mismatch')
      const pinned = lock.repositories.find(repository => repository.sourceId === binding.sourceId)
      if (pinned === undefined) throw new CatalogError('workspace_mismatch')
      return { repo: source.repo, path: binding.path, commit: pinned.commit, ...(binding.branch === undefined ? {} : { branch: binding.branch }) }
    })
  }

  const api: Catalog = {
    prepareWorkspace: async input => {
      const requested = input.branches ?? {}
      for (const branch of Object.values(requested)) {
        if (branch !== '' && !/^(?![-.])[A-Za-z0-9._/-]+$/u.test(branch)) throw new CatalogError('invalid_workspace_path')
      }
      /** One admitted preparation: the root, its bindings and the steps still to run. */
      type PreparationWork =
        | { readonly kind: 'ready'; readonly workspaceId: WorkspaceRecord['id'] }
        | { readonly kind: 'failed'; readonly workspaceId: WorkspaceRecord['id'] }
        | {
          readonly kind: 'prepare'
          readonly workspaceId: WorkspaceRecord['id']
          readonly root: string
          readonly mode: 'managed' | 'linked'
          readonly bindings: readonly WorkspaceRepositoryBinding[]
          readonly pending: readonly Branded<'loom.source'>[]
          readonly worktreePlans: readonly WorkspaceRepositoryPlan[]
          readonly linkPlans: readonly LinkedRepositoryPlan[]
        }
      // Admission happens before any filesystem effect: a rejected plan leaves no
      // record behind, and a retry continues only the repositories that failed.
      const work: PreparationWork = await transaction(async draft => {
        const version = versionIn(draft, input.versionId)
        const lock = draft.locks.find(item => item.id === input.lockId)
        if (!lock) throw new CatalogError('missing_lock')
        if (lock.versionId !== version.id) throw new CatalogError('workspace_mismatch')
        const project = draft.projects.find(item => item.id === version.projectId)
        if (!project) throw new CatalogError('missing_project')
        const targetIds = new Set(lock.repositories.map(repository => repository.sourceId))
        const versionSources = project.config.sources.filter(source => targetIds.has(source.id))
        if (versionSources.length === 0) throw new CatalogError('workspace_mismatch')
        const retry = input.workspaceId !== undefined
        let workspaceId: WorkspaceRecord['id']
        let root: string
        let mode: WorkspaceMode
        let bindings: readonly WorkspaceRepositoryBinding[]
        let pending: readonly Branded<'loom.source'>[]
        if (input.workspaceId !== undefined) {
          const existing = workspaceIn(draft, input.workspaceId)
          if (existing.cleaned === true) throw new CatalogError('workspace_cleaned')
          if (existing.versionId !== version.id || existing.lockId !== lock.id) throw new CatalogError('workspace_mismatch')
          mode = existing.mode ?? (existing.managed === true ? 'managed' : 'direct')
          if (mode === 'direct') throw new CatalogError('invalid_workspace_path', 'a direct workspace has nothing to prepare')
          const preparation = existing.preparation
          if (preparation === undefined) throw new CatalogError('invalid_workspace_path', 'the workspace has no recorded preparation to retry')
          if (preparation.status === 'ready') return { kind: 'ready', workspaceId: existing.id }
          workspaceId = existing.id
          root = existing.rootPath ?? existing.path
          bindings = workspaceBindings(draft, existing)
          pending = preparation.repositories.filter(entry => entry.status !== 'done').map(entry => entry.sourceId)
        } else {
          if (!isAbsolute(input.path) || normalize(input.path) !== input.path) throw new CatalogError('invalid_workspace_path')
          if (draft.workspaces.some(item => item.cleaned !== true && (item.rootPath ?? item.path) === input.path)) throw new CatalogError('workspace_path_registered')
          mode = input.mode ?? 'managed'
          if (mode === 'linked') {
            if (input.repositories === undefined || input.repositories.length !== versionSources.length) throw new CatalogError('invalid_workspace_path')
            bindings = versionSources.map(source => {
              const requestedBinding = input.repositories!.find(binding => binding.sourceId === source.id)
              if (requestedBinding === undefined) throw new CatalogError('workspace_mismatch')
              const branch = requested[source.id]
              const pinned = lock.repositories.find(repository => repository.sourceId === source.id)
              return {
                sourceId: source.id,
                ...(pinned?.subProjectId === undefined ? {} : { subProjectId: pinned.subProjectId }),
                path: requestedBinding.path,
                targetPath: requestedBinding.targetPath,
                kind: 'link' as const,
                ...(branch === undefined || branch === '' ? {} : { branch }),
              }
            })
            const layout: WorkspaceLayout = { projectId: project.id, mode: 'linked', rootPath: input.path, rootOwner: 'loom', repositories: bindings }
            try { admitWorkspaceLayout(layout) } catch (error) {
              if (error instanceof WorkspaceLayoutError) throw new CatalogError('invalid_workspace_path')
              throw error
            }
          } else {
            if (input.repositories !== undefined && input.repositories.length !== versionSources.length) throw new CatalogError('workspace_mismatch')
            bindings = versionSources.map(source => {
              const requestedBinding = input.repositories?.find(binding => binding.sourceId === source.id)
              const path = requestedBinding?.path ?? source.path
              const branch = requested[source.id]
              const pinned = lock.repositories.find(repository => repository.sourceId === source.id)
              return {
                sourceId: source.id,
                ...(pinned?.subProjectId === undefined ? {} : { subProjectId: pinned.subProjectId }),
                path,
                targetPath: resolve(input.path, path),
                kind: 'worktree' as const,
                ...(branch === undefined || branch === '' ? {} : { branch }),
              }
            })
            if (input.repositories !== undefined) {
              try { admitWorkspaceLayout({ projectId: project.id, mode: 'managed', rootPath: input.path, rootOwner: 'loom', repositories: bindings }) } catch (error) {
                if (error instanceof WorkspaceLayoutError) throw new CatalogError('invalid_workspace_path')
                throw error
              }
            }
          }
          workspaceId = brandString<WorkspaceRecord['id']>(randomUUID())
          root = input.path
          pending = bindings.map(binding => binding.sourceId)
        }
        if (input.requireBranches === true && mode === 'managed' && bindings.some(binding => binding.branch === undefined || binding.branch === '')) {
          throw new CatalogError('invalid_workspace_path', 'every repository requires a branch')
        }
        // A new Loom-owned root is created with a non-recursive mkdir. Reject a
        // missing parent before persisting a workspace record, so a simple path
        // mistake never leaves a failed record that needs cleanup.
        if (!retry) {
          const parent = resolve(root, '..')
          try {
            const info = await lstat(parent)
            if (!info.isDirectory()) throw new CatalogError('workspace_parent_missing', parent)
          } catch (error) {
            if (error instanceof CatalogError) throw error
            throw new CatalogError('workspace_parent_missing', `${parent} does not exist`)
          }
        }
        const pendingSet = new Set<string>(pending)
        let worktreePlans: readonly WorkspaceRepositoryPlan[] = []
        let linkPlans: readonly LinkedRepositoryPlan[] = []
        try {
          if (mode === 'managed') {
            worktreePlans = (await planWorkspace(root, repositoryRequests(project, lock, bindings, pendingSet), { existingRoot: retry })).plans
          } else {
            linkPlans = (await planLinkedWorkspace(
              root,
              bindings.filter(binding => pendingSet.has(binding.sourceId)).map(binding => ({ path: binding.path, target: binding.targetPath })),
              { existingRoot: retry },
            )).plans
          }
        } catch (error) {
          if (!retry) throw error
          const failure = preparationFailure(error)
          patchPreparation(draft, workspaceId, preparation => ({
            ...preparation,
            status: 'failed',
            error: failure.error,
            repositories: preparation.repositories.map(entry => entry.status === 'done'
              ? entry
              : { sourceId: entry.sourceId, status: 'failed' as const, error: failure.error, ...(failure.rollback === undefined ? {} : { rollback: failure.rollback }) }),
          }))
          return { kind: 'failed', workspaceId }
        }
        if (retry) {
          patchPreparation(draft, workspaceId, preparation => ({
            ...preparation,
            status: 'preparing',
            error: undefined,
            repositories: preparation.repositories.map(entry => entry.status === 'done' ? entry : { sourceId: entry.sourceId, status: 'waiting' as const }),
          }))
        } else {
          const branches = Object.fromEntries(bindings.flatMap(binding => binding.branch === undefined ? [] : [[binding.sourceId, binding.branch] as const]))
          const record: WorkspaceRecord = {
            id: workspaceId,
            path: root,
            rootPath: root,
            versionId: version.id,
            lockId: lock.id,
            projectId: project.id,
            mode,
            rootOwner: 'loom',
            repositories: bindings,
            ...(Object.keys(branches).length === 0 ? {} : { branches }),
            ...(mode === 'managed' ? { managed: true } : {}),
            preparation: {
              status: 'waiting',
              startedAt: nowIso(),
              updatedAt: nowIso(),
              repositories: bindings.map(binding => ({ sourceId: binding.sourceId, status: 'waiting' as const })),
            },
          }
          draft.workspaces.push(record)
        }
        return { kind: 'prepare', workspaceId, root, mode, bindings, pending, worktreePlans, linkPlans }
      })
      if (work.kind !== 'prepare') return currentWorkspace(work.workspaceId)
      const prepared = work
      const pendingBindings = prepared.bindings.filter(binding => prepared.pending.includes(binding.sourceId))
      /** Mark one repository step without touching its siblings. */
      const markStep = async (sourceId: Branded<'loom.source'>, status: 'preparing' | 'done', path?: string): Promise<void> => {
        await transaction(draft => patchPreparation(draft, prepared.workspaceId, preparation => ({
          ...preparation,
          status: 'preparing',
          repositories: preparation.repositories.map(entry => entry.sourceId === sourceId
            ? { sourceId: entry.sourceId, status, ...(path === undefined ? {} : { path }) }
            : entry),
        })))
      }
      /** Persist the aggregate failure that stops the remaining steps. */
      const failPreparation = async (error: unknown, sourceId?: Branded<'loom.source'>): Promise<void> => {
        const failure = preparationFailure(error)
        await transaction(draft => patchPreparation(draft, prepared.workspaceId, preparation => ({
          ...preparation,
          status: 'failed',
          error: failure.error,
          repositories: preparation.repositories.map(entry => sourceId !== undefined && entry.sourceId === sourceId
            ? { sourceId: entry.sourceId, status: 'failed' as const, error: failure.error, ...(failure.rollback === undefined ? {} : { rollback: failure.rollback }) }
            : entry),
        })))
      }
      if (!(await pathExists(prepared.root))) {
        try { await createWorkspaceRoot(prepared.root) } catch (error) {
          await failPreparation(error)
          return currentWorkspace(prepared.workspaceId)
        }
      }
      for (const [index, binding] of pendingBindings.entries()) {
        const worktreePlan = prepared.mode === 'managed' ? prepared.worktreePlans[index] : undefined
        const linkPlan = prepared.mode === 'linked' ? prepared.linkPlans[index] : undefined
        if (worktreePlan === undefined && linkPlan === undefined) throw new CatalogError('invalid_catalog', 'preparation is missing a repository step')
        await markStep(binding.sourceId, 'preparing')
        try {
          let path: string
          if (worktreePlan !== undefined) path = (await addWorkspaceWorktree(prepared.root, worktreePlan)).plan.target
          else {
            await addLinkedWorkspaceLink(prepared.root, linkPlan!)
            path = linkPlan!.link
          }
          await markStep(binding.sourceId, 'done', path)
        } catch (error) {
          await failPreparation(error, binding.sourceId)
          return currentWorkspace(prepared.workspaceId)
        }
      }
      const skillTargets = prepared.mode === 'linked' || prepared.bindings.length > 1 ? prepared.bindings.map(binding => binding.targetPath) : []
      const skillLinks = skillTargets.length === 0 ? [] : await linkWorkspaceSkills(prepared.root, skillTargets)
      return transaction(draft => {
        const updated = updateWorkspaceIn(draft, prepared.workspaceId, workspace => ({
          ...workspace,
          ...(skillLinks.length === 0 ? {} : { skillLinks: [...new Set([...(workspace.skillLinks ?? []), ...skillLinks])] }),
          preparation: { ...(workspace.preparation!), status: 'ready' as const, error: undefined },
        }))
        recordAudit(draft, 'workspace.prepared', 'human', { workspaceId: prepared.workspaceId, detail: prepared.root })
        return updated
      })
    },
    ensureWorkspaceBranches: async workspaceId => {
      const workspace = workspaceIn(state, workspaceId)
      if (workspace.cleaned === true) return workspace
      if ((workspace.mode ?? (workspace.managed === true ? 'managed' : 'direct')) !== 'managed') return workspace
      if (state.executions.some(execution => execution.workspaceId === workspaceId && execution.owner !== null)) return workspace
      const bindings = workspaceBindings(state, workspace)
      const branches = { ...workspace.branches }
      let changed = false
      for (const binding of bindings) {
        const requested = binding.branch ?? branches[binding.sourceId]
        if (requested === undefined) continue
        let attached: string
        try { attached = await ensureWorktreeBranch(binding.targetPath, requested) }
        catch (error) {
          if (!(error instanceof WorkspacePreparationError)) throw error
          throw new CatalogError('workspace_branch_failed')
        }
        if (attached !== requested) { branches[binding.sourceId] = attached; changed = true }
      }
      if (!changed) return workspace
      return transaction(draft => {
        const index = draft.workspaces.findIndex(item => item.id === workspaceId)
        if (index === -1) throw new CatalogError('missing_workspace')
        draft.workspaces[index] = { ...draft.workspaces[index]!, branches }
        return draft.workspaces[index]!
      })
    },
    ensureWorkspaceSkillLinks: async workspaceId => {
      const workspace = workspaceIn(state, workspaceId)
      if (workspace.cleaned === true) return workspace
      const bindings = workspaceBindings(state, workspace)
      if (bindings.length < 2) return workspace
      const existing = workspace.skillLinks ?? []
      const links = await linkWorkspaceSkills(workspace.rootPath ?? workspace.path, bindings.map(binding => binding.targetPath))
      const merged = [...new Set([...existing, ...links])]
      if (merged.length === existing.length) return workspace
      return transaction(draft => {
        const index = draft.workspaces.findIndex(item => item.id === workspaceId)
        if (index === -1) throw new CatalogError('missing_workspace')
        draft.workspaces[index] = { ...draft.workspaces[index]!, skillLinks: merged }
        return draft.workspaces[index]!
      })
    },
    workspaceChanges: async (workspaceId, attemptId) => {
      const lockId = attemptId === undefined ? undefined : state.tasks.flatMap(task => task.attempts).find(attempt => attempt.id === attemptId)?.lock.id
      if (attemptId !== undefined && lockId === undefined) throw new CatalogError('missing_task')
      return { repositories: await workingTreeChanges(workspaceWorktrees(state, workspaceId, lockId, true)) }
    },
    workspaceChangeCount: async (workspaceId, attemptId) => {
      const lockId = attemptId === undefined ? undefined : state.tasks.flatMap(task => task.attempts).find(attempt => attempt.id === attemptId)?.lock.id
      if (attemptId !== undefined && lockId === undefined) throw new CatalogError('missing_task')
      return workingTreeChangeCount(workspaceWorktrees(state, workspaceId, lockId, true))
    },
    workspaceStatus: async (workspaceId, attemptId) => {
      const running = state.executions.some(execution => execution.workspaceId === workspaceId && execution.owner !== null)
      const lockId = attemptId === undefined ? undefined : state.tasks.flatMap(task => task.attempts).find(attempt => attempt.id === attemptId)?.lock.id
      if (attemptId !== undefined && lockId === undefined) throw new CatalogError('missing_task')
      const changes = await workingTreeChanges(workspaceWorktrees(state, workspaceId, lockId, true))
      // Push state is advisory: a missing upstream reports itself instead of
      // failing the whole status read.
      const repositories: WorkspaceStatusRepository[] = await Promise.all(changes.map(async repository => {
        const unpushed = await unpushedCommits(repository.directory)
        return unpushed === undefined ? { ...repository, unpushedUnavailable: true } : { ...repository, unpushed }
      }))
      return { running, repositories }
    },
    commitWorkspace: async (workspaceId, message) => {
      const workspace = workspaceIn(state, workspaceId)
      if (workspace.cleaned === true) throw new CatalogError('workspace_cleaned')
      const subject = message.trim() === '' ? 'Loom checkpoint' : message.trim().slice(0, 500)
      const repositories: WorkspaceCommitRepository[] = []
      for (const binding of workspaceBindings(state, workspace)) {
        try {
          const commit = await commitWorkingTree(binding.targetPath, subject)
          repositories.push({ sourceId: binding.sourceId, path: binding.path, changed: commit !== undefined, ...(commit === undefined ? {} : { commit }) })
        } catch (error) {
          repositories.push({ sourceId: binding.sourceId, path: binding.path, changed: false, error: error instanceof Error ? error.message : String(error) })
        }
      }
      return { repositories, committed: repositories.filter(repository => repository.commit !== undefined).length }
    },
    workspaceDirty: workspaceId => {
      const workspace = workspaceIn(state, workspaceId)
      // A dirtiness check reads working trees, not the Lock baseline. Requiring
      // a pin for every binding rejects valid direct workspaces whose Lock was
      // created before the project gained a repository.
      return workingTreeDirty(workspaceBindings(state, workspace).map(binding => binding.targetPath))
    },
    updateWorkspace: async (workspaceId, label) => {
      const admitted = label.trim()
      if (admitted.length > 80) throw new CatalogError('invalid_workspace_label')
      return transaction(draft => {
        const workspace = workspaceIn(draft, workspaceId)
        const { label: _previous, ...rest } = workspace
        const next: WorkspaceRecord = { ...rest, ...(admitted === '' ? {} : { label: admitted }) }
        draft.workspaces[draft.workspaces.indexOf(workspace)] = next
        recordAudit(draft, 'workspace.updated', 'human', { workspaceId, detail: admitted === '' ? workspace.path : admitted })
        return next
      })
    },
    deleteWorkspace: async (workspaceId, deleteFiles, confirmPath) => {
      const workspace = workspaceIn(state, workspaceId)
      const root = workspace.rootPath ?? workspace.path
      const execution = state.executions.find(item => item.workspaceId === workspaceId)
      if (execution !== undefined && execution.owner !== null) throw new CatalogError('workspace_busy', execution.owner.sessionId)
      if (state.tasks.some(task => task.attempts.some(attempt => attempt.workspaceId === workspaceId))) throw new CatalogError('workspace_in_use', root)
      if (!deleteFiles) return api.cleanupWorkspace(workspaceId, true)
      if (confirmPath !== root) throw new CatalogError('invalid_workspace_path', 'confirmPath must equal the workspace root')
      const mode = workspace.mode ?? (workspace.managed === true ? 'managed' : 'direct')
      if (mode !== 'direct') {
        await api.cleanupWorkspace(workspaceId, true)
        // Cleanup can leave a partial root when git refuses one worktree. The
        // explicit delete action promised the directory is gone, so force the
        // Loom-owned root and then drop any partial cleanup record.
        if (await pathExists(root)) {
          const residual = await removeWorkspaceRoot(root)
          if (residual.length > 0) throw new CatalogError('workspace_cleanup_failed', residual.join('; '))
          await transaction(draft => {
            const index = draft.workspaces.findIndex(item => item.id === workspaceId)
            if (index === -1) return
            draft.workspaces.splice(index, 1)
            draft.temporarySessions = draft.temporarySessions.filter(temporary => temporary.workspacePath !== root && temporary.workspacePath !== workspace.path)
            draft.executions = draft.executions.filter(item => item.workspaceId !== workspaceId)
            recordAudit(draft, 'workspace.cleaned', 'human', { workspaceId, detail: root })
          })
        }
        return
      }
      const residual = await removeWorkspaceRoot(root)
      if (residual.length > 0) throw new CatalogError('workspace_cleanup_failed', residual.join('; '))
      await transaction(draft => {
        const index = draft.workspaces.findIndex(item => item.id === workspaceId)
        if (index === -1) throw new CatalogError('missing_workspace')
        draft.workspaces.splice(index, 1)
        draft.temporarySessions = draft.temporarySessions.filter(temporary => temporary.workspacePath !== root && temporary.workspacePath !== workspace.path)
        draft.executions = draft.executions.filter(item => item.workspaceId !== workspaceId)
        recordAudit(draft, 'workspace.cleaned', 'human', { workspaceId, detail: root })
      })
    },
    cleanupWorkspace: async (workspaceId, discardChanges) => {
      const workspace = workspaceIn(state, workspaceId)
      if (workspace.cleaned === true) throw new CatalogError('workspace_cleaned')
      const mode = workspace.mode ?? (workspace.managed === true ? 'managed' : 'direct')
      const root = workspace.rootPath ?? workspace.path
      // Ownership outranks task status: a live Session has to hand the workspace
      // back before cleanup destroys its evidence.
      const execution = state.executions.find(item => item.workspaceId === workspaceId)
      if (execution !== undefined && execution.owner !== null) {
        throw new CatalogError('workspace_busy', `Session ${execution.owner.sessionId} still owns execution (generation ${execution.owner.generation}); release it or complete a takeover first`)
      }
      // A running or under-review round still needs the workspace diff; failed
      // and completed rounds keep their records and may release the files.
      const occupying = state.tasks.filter(task => (task.status === 'running' || task.status === 'review')
        && task.attempts.some(attempt => attempt.workspaceId === workspaceId))
      if (occupying.length > 0) {
        throw new CatalogError('workspace_task_running', `task ${occupying.map(task => `${task.id} (${task.status})`).join(', ')} still occupies this workspace; finish or fail the round first`)
      }
      const bindings = workspaceBindings(state, workspace)
      // Only managed cleanup deletes versioned worktrees. Direct and linked
      // workspaces keep the real repositories, so uncommitted work must not
      // block unregistering them; those checks also fail for legacy records
      // whose target points at a parent directory rather than a Git root.
      const worktrees = mode === 'managed' ? workspaceWorktrees(state, workspaceId) : []
      const prior = workspace.cleanup
      const priorStatus = (sourceId: Branded<'loom.source'>): WorkspaceCleanupRepositoryStatus | undefined =>
        prior?.repositories.find(entry => entry.sourceId === sourceId)?.status
      const units: { sourceId: Branded<'loom.source'>; kind: 'worktree' | 'link'; repo: string; directory: string; branch?: string | undefined }[] = mode === 'managed'
        ? worktrees.map(worktree => ({ sourceId: worktree.sourceId, kind: 'worktree' as const, repo: worktree.repo, directory: worktree.directory, ...(worktree.branch === undefined ? {} : { branch: worktree.branch }) }))
        : mode === 'linked'
          ? bindings.map(binding => ({ sourceId: binding.sourceId, kind: 'link' as const, repo: '', directory: resolve(root, binding.path) }))
          : []
      const pendingWorktrees = worktrees.filter(worktree => priorStatus(worktree.sourceId) !== 'removed')
      if (!discardChanges && mode === 'managed') {
        for (const worktree of pendingWorktrees) if (await commitsSince(worktree.directory, worktree.commit) > 0) throw new CatalogError('workspace_unpushed', worktree.directory)
        const changes = await workingTreeChanges(pendingWorktrees)
        if (changes.some(repository => repository.files.length > 0)) throw new CatalogError('workspace_changes', changes.filter(repository => repository.files.length > 0).map(repository => repository.directory).join(', '))
      }
      // Publish per-repository progress before the first deletion so the client
      // can poll a partial attempt instead of a single opaque busy state.
      await transaction(draft => {
        const entries: WorkspaceCleanupRepository[] = mode === 'direct'
          ? bindings.map(binding => ({ sourceId: binding.sourceId, status: 'kept' as const, path: binding.targetPath }))
          : units.map(unit => priorStatus(unit.sourceId) === 'removed'
            ? { sourceId: unit.sourceId, status: 'removed' as const, path: unit.directory }
            : { sourceId: unit.sourceId, status: 'waiting' as const, path: unit.directory })
        updateWorkspaceIn(draft, workspaceId, workspace => ({
          ...workspace,
          cleanup: { status: 'cleaning', startedAt: prior?.startedAt ?? nowIso(), updatedAt: nowIso(), repositories: entries },
        }))
      })
      /** Record one repository step without invalidating its siblings. */
      const markRepository = async (unit: typeof units[number], status: 'removed' | 'failed', diagnostic?: { error?: string | undefined; residual?: string | undefined }): Promise<void> => {
        await transaction(draft => patchCleanup(draft, workspaceId, cleanup => ({
          ...cleanup,
          repositories: cleanup.repositories.map(entry => entry.sourceId === unit.sourceId
            ? {
              sourceId: entry.sourceId,
              status,
              path: unit.directory,
              ...(diagnostic?.error === undefined ? {} : { error: diagnostic.error }),
              ...(diagnostic?.residual === undefined ? {} : { residual: diagnostic.residual }),
            }
            : entry),
        })))
      }
      const residual: string[] = []
      for (const unit of units) {
        if (priorStatus(unit.sourceId) === 'removed') continue
        let errors: string[] = []
        if (await pathExists(unit.directory)) {
          errors = unit.kind === 'link'
            ? await removeLinkedWorkspaceLink(unit.directory)
            : await removeWorkspaceWorktree(unit.repo, unit.directory, unit.branch)
        }
        if (errors.length === 0) await markRepository(unit, 'removed')
        else {
          const error = errors.join('; ').slice(0, 1000)
          residual.push(unit.directory)
          await markRepository(unit, 'failed', { error, residual: unit.directory })
        }
      }
      // Direct workspaces keep their repositories but must still remove the skill
      // links they added; a leftover link keeps the workspace retryable.
      let rootErrors: string[] = []
      if (mode === 'direct') {
        rootErrors = workspace.skillLinks === undefined ? [] : await removeWorkspaceSkills(workspace.skillLinks)
      } else if (residual.length === 0) {
        // The Loom-owned root is only destroyed once every repository step
        // succeeded, so a partial attempt keeps the evidence for a retry.
        rootErrors = mode === 'linked' ? await removeLinkedWorkspaceRoot(root) : await removeWorkspaceRoot(root)
      }
      const references = state.tasks.some(task => task.attempts.some(attempt => attempt.workspaceId === workspaceId))
      if (residual.length > 0 || rootErrors.length > 0) {
        await transaction(draft => patchCleanup(draft, workspaceId, cleanup => ({
          ...cleanup,
          status: 'partial',
          error: [...residual.map(path => `${path}: still present`), ...rootErrors].join('; ').slice(0, 1000),
          residual: [...residual, ...rootErrors].slice(0, 50),
          repositories: cleanup.repositories.map(entry => entry.status === 'waiting' || entry.status === 'failed'
            ? { sourceId: entry.sourceId, status: 'failed' as const, path: entry.path, error: 'cleanup incomplete', residual: entry.path }
            : entry),
        })))
        return
      }
      await transaction(draft => {
        const index = draft.workspaces.findIndex(item => item.id === workspaceId)
        if (index === -1) throw new CatalogError('missing_workspace')
        if (references) {
          draft.workspaces[index] = {
            ...draft.workspaces[index]!,
            cleaned: true,
            cleanup: {
              status: 'cleaned',
              startedAt: prior?.startedAt ?? nowIso(),
              updatedAt: nowIso(),
              repositories: draft.workspaces[index]!.cleanup?.repositories ?? [],
            },
          }
        } else {
          draft.workspaces.splice(index, 1)
        }
        draft.temporarySessions = draft.temporarySessions.filter(temporary => temporary.workspacePath !== root && temporary.workspacePath !== workspace.path)
        draft.executions = draft.executions.filter(item => item.workspaceId !== workspaceId)
        recordAudit(draft, 'workspace.cleaned', 'human', { workspaceId, detail: root })
      })
    },
    registerPreparedWorkspace: async input => {
      return transaction(async draft => {
        const version = versionIn(draft, input.versionId)
        const project = draft.projects.find(item => item.id === (input.projectId ?? version.projectId))
        if (!project) throw new CatalogError('missing_project')
        const lock = draft.locks.find(item => item.id === input.lockId)
        if (!lock) throw new CatalogError('missing_lock')
        if (lock.versionId !== version.id) throw new CatalogError('workspace_mismatch')
        const rootPath = input.rootPath ?? input.path
        if (!isAbsolute(rootPath) || normalize(rootPath) !== rootPath) throw new CatalogError('invalid_workspace_path')
        const mode = input.mode ?? (input.repositories === undefined ? 'direct' : 'direct')
        const kind: WorkspaceRepositoryKind = mode === 'managed' ? 'worktree' : mode === 'linked' ? 'link' : 'direct'
        const repositories: WorkspaceRepositoryBinding[] = (input.repositories ?? project.config.sources.map(source => ({
          sourceId: source.id,
          path: source.path,
          targetPath: resolve(rootPath, source.path),
        }))).map(repository => ({ ...repository, kind }))
        const layout: WorkspaceLayout = {
          projectId: project.id,
          mode,
          rootPath,
          rootOwner: input.rootOwner ?? (mode === 'managed' ? 'loom' : 'user'),
          repositories,
        }
        try { admitWorkspaceLayout(layout) } catch (error) {
          if (error instanceof WorkspaceLayoutError) throw new CatalogError('invalid_workspace_path')
          throw error
        }
        if (repositories.some(repository => !project.config.sources.some(source => source.id === repository.sourceId))) throw new CatalogError('workspace_mismatch')
        if (draft.workspaces.some(item => item.cleaned !== true && (item.rootPath ?? item.path) === rootPath)) throw new CatalogError('workspace_path_registered')
        const skillLinks = mode === 'direct' && repositories.length > 1
          ? await linkWorkspaceSkills(rootPath, repositories.map(repository => repository.targetPath))
          : []
        const record: WorkspaceRecord = {
          id: brandString<WorkspaceRecord['id']>(randomUUID()),
          path: rootPath,
          rootPath,
          versionId: version.id,
          lockId: lock.id,
          projectId: project.id,
          mode,
          rootOwner: layout.rootOwner,
          repositories,
          ...(input.branches === undefined || Object.keys(input.branches).length === 0 ? {} : { branches: input.branches }),
          ...(input.mode === 'managed' ? { managed: true } : {}),
          ...(skillLinks.length === 0 ? {} : { skillLinks }),
        }
        draft.workspaces.push(record)
        recordAudit(draft, 'workspace.prepared', 'system', { workspaceId: record.id, detail: rootPath })
        return record
      })
    },
    startAttempt: (taskId, workspaceId, options) => transaction(async draft => {
      const requestedTask = draft.tasks.find(candidate => candidate.id === taskId)
      if (requestedTask?.workspaceId !== undefined && requestedTask.workspaceId !== workspaceId) throw new CatalogError('workspace_mismatch')
      const task = taskIn(draft, taskId)
      const workspace = workspaceIn(draft, workspaceId)
      if (workspace.cleaned === true) throw new CatalogError('workspace_cleaned')
      if (workspace.preparation !== undefined && workspace.preparation.status !== 'ready') throw new CatalogError('workspace_not_prepared', `preparation is ${workspace.preparation.status}`)
      const taskProject = projectOf(draft, task.versionId)
      const workspaceProject = projectOfWorkspace(draft, workspace)
      if (taskProject === undefined || workspaceProject === undefined || taskProject.id !== workspaceProject.id) throw new CatalogError('workspace_mismatch')
      const otherExecuting = draft.executions.some(execution => execution.workspaceId === workspaceId && execution.owner !== null)
      if (otherExecuting && options?.allowBusy !== true) throw new CatalogError('workspace_task_running')
      const currentLock = draft.locks.find(item => item.id === workspace.lockId)
      if (!currentLock) throw new CatalogError('missing_lock')
      const bindings = workspaceBindings(draft, workspace)
      const baseline = await Promise.all(bindings.map(async binding => {
        const pinned = currentLock.repositories.find(repository => repository.sourceId === binding.sourceId)
        try {
          return { sourceId: binding.sourceId, commit: await resolveHead(binding.targetPath) }
        } catch {
          if (pinned === undefined) throw new CatalogError('workspace_mismatch')
          return { sourceId: binding.sourceId, commit: pinned.commit }
        }
      }))
      const sameAsCurrent = currentLock.versionId === task.versionId
        && currentLock.repositories.length === baseline.length
        && currentLock.repositories.every(repository => baseline.some(candidate => candidate.sourceId === repository.sourceId && candidate.commit === repository.commit))
      const lock: Lock = sameAsCurrent
        ? currentLock
        : { id: brandString<Lock['id']>(randomUUID()), versionId: task.versionId, repositories: baseline, createdAt: nowIso() }
      if (!sameAsCurrent) draft.locks.push(lock)
      const updated = { ...task, ...startAttempt(task, brandString<Branded<'loom.attempt'>>(randomUUID()), lock, { ...workspace, versionId: task.versionId, lockId: lock.id }), updatedAt: nowIso() }
      draft.tasks[draft.tasks.indexOf(task)] = updated
      recordAudit(draft, 'attempt.started', 'human', { taskId, workspaceId, detail: lock.id })
      return updated
    }),
    attachSession: (taskId, sessionId) => transaction(draft => {
      const task = taskIn(draft, taskId)
      const attached = attachSession(task, sessionId)
      // Re-attaching an already linked Session is a no-op that must not rewrite
      // the record's mutation time.
      const updated = attached === task ? task : { ...task, ...attached, updatedAt: nowIso() }
      draft.tasks[draft.tasks.indexOf(task)] = updated
      draft.temporarySessions = draft.temporarySessions.filter(temporary => temporary.sessionId !== sessionId)
      recordAudit(draft, 'session.attached', 'human', { taskId, sessionId, workspaceId: updated.attempts.at(-1)?.workspaceId })
      return updated
    }),
    registerTemporarySession: (sessionId, workspacePath) => transaction(draft => {
      const workspace = draft.workspaces.find(candidate => candidate.cleaned !== true
        && (candidate.path === workspacePath || (candidate.rootPath ?? candidate.path) === workspacePath))
      if (workspace === undefined) throw new CatalogError('missing_workspace')
      const previous = draft.temporarySessions.find(temporary => temporary.sessionId === sessionId)
      const record: TemporarySessionRecord = { sessionId, workspacePath, createdAt: previous?.createdAt ?? Date.now() }
      draft.temporarySessions = [...draft.temporarySessions.filter(temporary => temporary.sessionId !== sessionId), record]
      // A temporary Session gains the same execution rights a task Session gets,
      // so unbound and bound Sessions can never write one workspace at once.
      const execution = executionIn(draft, workspace.id)
      const next = requestExecution(execution, sessionId)
      if (next !== execution) {
        storeExecution(draft, next)
        if (next.owner?.sessionId === sessionId) recordAudit(draft, 'execution.acquired', 'agent', { workspaceId: workspace.id, sessionId })
        else recordAudit(draft, 'execution.queued', 'agent', { workspaceId: workspace.id, sessionId })
      }
      return record
    }),
    forgetTemporarySession: sessionId => transaction(draft => {
      draft.temporarySessions = draft.temporarySessions.filter(temporary => temporary.sessionId !== sessionId)
      releaseSessionInDraft(draft, sessionId)
    }),
    transitionTask: (taskId, target, actor, confirmation) => transaction(draft => {
      const task = taskIn(draft, taskId)
      const transitioned = transitionTask(task, target, actor)
      const previousOutcome = task.outcome
      let outcome = previousOutcome
      if (actor === 'human' && (target === 'completed' || target === 'failed') && previousOutcome?.state === 'suggested') {
        const basis = confirmation?.basis?.trim()
        if (basis !== undefined && basis.length > 2000) throw new CatalogError('invalid_task', 'confirmation basis is too long')
        const accepted = previousOutcome.suggestedStatus === 'review' ? target === 'completed' : previousOutcome.suggestedStatus === 'failed' && target === 'failed'
        outcome = {
          ...previousOutcome,
          state: accepted ? 'accepted' : 'rejected',
          confirmedAt: nowIso(),
          confirmedBy: actor,
          ...(basis === undefined || basis === '' ? {} : { confirmationBasis: basis }),
        }
        recordAudit(draft, accepted ? 'task.confirmation-accepted' : 'task.confirmation-rejected', 'human', {
          taskId,
          ...(previousOutcome.attemptId === undefined ? {} : { attemptId: previousOutcome.attemptId }),
          ...(previousOutcome.sessionId === undefined ? {} : { sessionId: previousOutcome.sessionId }),
          ...(basis === undefined || basis === '' ? {} : { basis }),
          detail: `suggested ${previousOutcome.suggestedStatus ?? target} -> ${target}`,
        })
      }
      const updated: TaskRecord = { ...task, ...transitioned, ...(outcome === undefined ? {} : { outcome }), updatedAt: nowIso() }
      draft.tasks[draft.tasks.indexOf(task)] = updated
      recordAudit(draft, 'task.transitioned', actor, { taskId, detail: `${task.status}->${target}` })
      return updated
    }),
    suggestTaskOutcome: (taskId, suggestion) => transaction(draft => {
      const task = taskIn(draft, taskId)
      const current = task.attempts.at(-1)
      if (current === undefined) throw new CatalogError('task_not_active', 'the task has no round to report on')
      if (!current.sessionIds.includes(suggestion.sessionId)) throw new CatalogError('task_not_active', 'the Session is not attached to the current round')
      if (task.status !== 'running' && task.status !== 'review') throw new CatalogError('task_not_active', `the round is ${task.status}; only a running or review round can be reported`)
      const execution = draft.executions.find(item => item.workspaceId === current.workspaceId)
      if (execution !== undefined && execution.owner !== null && execution.owner.sessionId !== suggestion.sessionId) {
        throw new CatalogError('execution_not_owned', `the workspace is owned by Session ${execution.owner.sessionId}`)
      }
      if (execution !== undefined && execution.waiting.includes(suggestion.sessionId)) throw new CatalogError('execution_not_owned', 'the Session is still queued for execution')
      const evidence = admitEvidence(suggestion)
      const basis = suggestion.basis?.trim()
      if (basis !== undefined && basis.length > 2000) throw new CatalogError('invalid_task', 'suggestion basis is too long')
      const outcome: TaskOutcome = {
        state: 'suggested',
        suggestedStatus: suggestion.suggestedStatus,
        ...evidence,
        suggestedBy: 'agent',
        at: nowIso(),
        sessionId: suggestion.sessionId,
        attemptId: current.id,
        ...(basis === undefined || basis === '' ? {} : { basis }),
      }
      const transitioned = suggestion.suggestedStatus === 'review' && task.status === 'running' ? transitionTask(task, 'review', 'agent') : task
      const updated: TaskRecord = { ...task, ...transitioned, outcome, updatedAt: nowIso() }
      draft.tasks[draft.tasks.indexOf(task)] = updated
      recordAudit(draft, suggestion.suggestedStatus === 'review' ? 'task.review-requested' : 'task.failure-suggested', 'agent', {
        taskId,
        attemptId: current.id,
        workspaceId: current.workspaceId,
        sessionId: suggestion.sessionId,
        ...(basis === undefined || basis === '' ? {} : { basis }),
        detail: suggestion.suggestedStatus === 'review' ? `review requested from ${task.status}` : 'failure suggested',
      })
      return updated
    }),
    acquireExecution: (workspaceId, sessionId) => {
      const existing = state.executions.find(execution => execution.workspaceId === workspaceId)
      if (existing !== undefined && (existing.owner?.sessionId === sessionId || existing.waiting.includes(sessionId))) {
        return Promise.resolve(structuredClone(existing))
      }
      return transaction(draft => {
        const previous = executionIn(draft, workspaceId)
        const next = requestExecution(previous, sessionId)
        storeExecution(draft, next)
        if (next.owner?.sessionId === sessionId) recordAudit(draft, 'execution.acquired', 'agent', { workspaceId, sessionId })
        else recordAudit(draft, 'execution.queued', 'agent', { workspaceId, sessionId })
        return next
      })
    },
    releaseExecution: (workspaceId, expected) => transaction(draft => {
      const next = releaseExecutionState(executionIn(draft, workspaceId), expected)
      storeExecution(draft, next)
      recordAudit(draft, 'execution.released', 'agent', { workspaceId, sessionId: expected.sessionId, detail: next.owner?.sessionId })
      return next
    }),
    cancelExecution: (workspaceId, sessionId) => transaction(draft => {
      const previous = executionIn(draft, workspaceId)
      const next = cancelExecutionRequest(previous, sessionId)
      if (next !== previous) {
        storeExecution(draft, next)
        recordAudit(draft, 'execution.released', 'human', { workspaceId, sessionId, detail: 'left waiting queue' })
      }
      return next
    }),
    reorderExecutionQueue: (workspaceId, sessionIds) => transaction(draft => {
      const previous = executionIn(draft, workspaceId)
      const next = reorderWaiting(previous, sessionIds)
      storeExecution(draft, next)
      recordAudit(draft, 'execution.released', 'human', { workspaceId, detail: `reordered waiting queue: ${sessionIds.join(', ')}` })
      return next
    }),
    beginTakeover: (workspaceId, sessionId) => transaction(draft => {
      const previous = executionIn(draft, workspaceId)
      if (!previous.owner) throw new CatalogError('workspace_busy')
      const owner = previous.owner
      const next = requestTakeover(previous, sessionId, owner)
      storeExecution(draft, next)
      recordAudit(draft, 'execution.takeover-requested', 'human', { workspaceId, sessionId, detail: owner.sessionId })
      return { state: next, owner }
    }),
    finishTakeover: (workspaceId, expected, outcome) => transaction(draft => {
      const next = confirmStop(executionIn(draft, workspaceId), expected, outcome)
      storeExecution(draft, next)
      recordAudit(draft, outcome === 'stopped' ? 'execution.takeover-stopped' : 'execution.takeover-blocked', 'system', { workspaceId, sessionId: next.owner?.sessionId, detail: outcome })
      return next
    }),
    releaseSession: sessionId => {
      const ownsExecution = state.executions.some(execution => execution.owner?.sessionId === sessionId || execution.waiting.includes(sessionId))
      // A disposed Session also drops any temporary-work registration it still holds.
      const registeredTemporary = state.temporarySessions.some(record => record.sessionId === sessionId)
      if (!ownsExecution && !registeredTemporary) return Promise.resolve()
      return transaction(draft => {
        draft.temporarySessions = draft.temporarySessions.filter(record => record.sessionId !== sessionId)
        releaseSessionInDraft(draft, sessionId)
      })
    },
    snapshot: () => structuredClone(state),
    createProject: async input => {
      const config = parseProject(input)
      return transaction(draft => {
        const record = { id: brandString<ProjectRecord['id']>(randomUUID()), config }
        draft.projects.push(record)
        recordAudit(draft, 'project.created', 'human', { detail: config.name })
        return record
      })
    },
    updateProject: async (projectId, input) => {
      const config = parseProject(input)
      return transaction(draft => {
        const project = draft.projects.find(candidate => candidate.id === projectId)
        if (project === undefined) throw new CatalogError('missing_project')
        const sourceIds = new Set(config.sources.map(source => source.id))
        if (draft.versions.some(version => version.projectId === projectId && version.sources.some(source => !sourceIds.has(source.sourceId)))) {
          throw new CatalogError('invalid_version')
        }
        const moduleIds = new Set(config.modules.map(module => module.id))
        const invalidTask = draft.tasks.some(task => {
          const version = draft.versions.find(candidate => candidate.id === task.versionId)
          return version?.projectId === projectId && (task.moduleIds ?? []).some(moduleId => !moduleIds.has(moduleId))
        })
        if (invalidTask) throw new CatalogError('invalid_task')
        const next: ProjectRecord = { ...project, config }
        draft.projects[draft.projects.indexOf(project)] = next
        recordAudit(draft, 'project.updated', 'human', { detail: config.name })
        return next
      })
    },
    deleteProject: async projectId => transaction(draft => {
      const project = draft.projects.find(candidate => candidate.id === projectId)
      if (project === undefined) throw new CatalogError('missing_project')
      if (draft.versions.some(version => version.projectId === projectId)) throw new CatalogError('project_has_versions')
      draft.projects.splice(draft.projects.indexOf(project), 1)
      recordAudit(draft, 'project.deleted', 'human', { detail: project.config.name })
    }),
    createVersion: async (projectId, name, sources, description, targets) => {
      const admittedSources = sources.length > 0 ? sources : (targets ?? []).map(target => ({ sourceId: target.sourceId, ref: target.ref }))
      const record = versionSchema.parse({
        id: randomUUID(), projectId, name,
        ...(description === undefined ? {} : { description }),
        sources: admittedSources,
        ...(targets === undefined ? {} : { targets }),
      })
      return transaction(draft => {
        const project = draft.projects.find(p => p.id === projectId)
        if (!project) throw new CatalogError('missing_project')
        if (!validVersion(project, record)) throw new CatalogError('invalid_version')
        draft.versions.push(record)
        recordAudit(draft, 'version.created', 'human', { detail: record.name })
        return record
      })
    },
    updateVersion: async (versionId, name, sources, description, targets) => {
      const admittedName = text.parse(name)
      return transaction(draft => {
        const version = versionIn(draft, versionId)
        const project = draft.projects.find(candidate => candidate.id === version.projectId)
        if (project === undefined) throw new CatalogError('missing_project')
        // An omitted description preserves the stored one; an explicit empty
        // string clears it, so older clients that do not know the field cannot
        // erase it by accident.
        const admittedDescription = description === undefined ? version.description : admitVersionDescription(description)
        const record = versionSchema.parse({ ...version, name: admittedName, description: admittedDescription, sources, ...(targets === undefined ? {} : { targets }) })
        if (!validVersion(project, record)) throw new CatalogError('invalid_version')
        const next: VersionRecord = { ...version, name: admittedName, description: record.description, sources: record.sources, ...(targets === undefined ? {} : { targets: record.targets }) }
        draft.versions[draft.versions.indexOf(version)] = next
        recordAudit(draft, 'version.updated', 'human', { detail: admittedName })
        return next
      })
    },
    deleteVersion: async versionId => transaction(draft => {
      const version = versionIn(draft, versionId)
      if (draft.tasks.some(task => task.versionId === versionId)) throw new CatalogError('version_has_tasks')
      if (draft.workspaces.some(workspace => workspace.versionId === versionId)) throw new CatalogError('version_has_workspaces')
      draft.versions.splice(draft.versions.indexOf(version), 1)
      draft.locks = draft.locks.filter(lock => lock.versionId !== versionId)
      recordAudit(draft, 'version.deleted', 'human', { detail: version.name })
    }),
    generateLock: versionId => transaction(async draft => {
      const version = versionIn(draft, versionId)
      const project = draft.projects.find(p => p.id === version.projectId)!
      const previous = draft.locks.filter(lock => lock.versionId === version.id).at(-1)
      const resolved = await resolveLock(project.config, version, randomUUID(), resolveCommit)
      const lock: Lock = { ...resolved, createdAt: nowIso() }
      draft.locks.push(lock)
      // A long-lived version advances its baseline here instead of forcing a new
      // round or version: every active workspace of the version moves onto the
      // new Lock, and the latest round of every running or reviewing task is
      // re-baselined so its Diff starts over. Completed and failed tasks keep
      // their historical baselines.
      let advancedWorkspaces = 0
      let rebasedTasks = 0
      if (previous !== undefined) {
        for (const workspace of [...draft.workspaces]) {
          if (workspace.cleaned === true || workspace.versionId !== version.id) continue
          draft.workspaces[draft.workspaces.indexOf(workspace)] = { ...workspace, lockId: lock.id }
          recordAudit(draft, 'workspace.updated', 'human', { workspaceId: workspace.id, detail: `baseline advanced to ${lock.id}` })
          advancedWorkspaces += 1
        }
        for (const task of [...draft.tasks]) {
          if (task.versionId !== version.id || (task.status !== 'running' && task.status !== 'review')) continue
          const attempt = task.attempts.at(-1)
          if (attempt === undefined) continue
          draft.tasks[draft.tasks.indexOf(task)] = { ...task, attempts: [...task.attempts.slice(0, -1), { ...attempt, lock }] }
          recordAudit(draft, 'task.updated', 'human', { taskId: task.id, workspaceId: attempt.workspaceId, detail: `round baseline advanced to ${lock.id}` })
          rebasedTasks += 1
        }
      }
      const commitDetail = lock.repositories.map(repository => repository.commit.slice(0, 8)).join(' ')
      const advanced = advancedWorkspaces === 0 && rebasedTasks === 0
        ? ''
        : ` · advanced ${advancedWorkspaces} workspace${advancedWorkspaces === 1 ? '' : 's'}, ${rebasedTasks} task${rebasedTasks === 1 ? '' : 's'}`
      recordAudit(draft, 'lock.generated', 'human', { detail: `${commitDetail}${advanced}` })
      return lock
    }),
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
