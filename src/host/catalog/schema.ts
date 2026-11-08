/**
 * Persisted catalog schema, migrations and structural admission.
 *
 * Loading is filesystem-free: the JSON store calls these functions when it
 * opens the catalog, before any Host operation runs.
 */
import { isAbsolute, normalize, resolve } from 'node:path'
import { z } from 'zod'
import { brandNumber, brandString, type Branded } from '@deepseek-ai/dsh-brand'
import { parseProject, projectSubProjects } from '../../domain/project.ts'
import type { WorkspaceRepositoryBinding, WorkspaceRepositoryKind } from '../../domain/workspace.ts'
import type { ExecutionOwner } from '../../domain/execution.ts'
import { VERSION_DESCRIPTION_MAX_CHARS } from '../../shared/version-context.ts'
import type { CatalogSnapshot, ProjectRecord, VersionRecord, WorkspaceRecord } from '../../api/records.ts'
import { CatalogError } from './errors.ts'

export { CatalogError } from './errors.ts'

export const text = z.string().trim().min(1)
/**
 * ISO 8601 UTC timestamp written by the Host; older records legitimately omit it.
 */
const isoTimestamp = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u)
/**
 * Absolute path in either host spelling; a migrated catalog may originate on another operating
 * system.
 */
const catalogPath = (value: string): boolean => isAbsolute(value)
  ? normalize(value) === value
  : /^[A-Za-z]:[\\/]/u.test(value) || /^\\\\/u.test(value)
const id = <B extends string>() => text.transform(value => brandString<Branded<B>>(value))
const sourceSchema = z.strictObject({ sourceId: id<'loom.source'>(), ref: text })
const targetSchema = z.strictObject({ subProjectId: id<'loom.subproject'>(), sourceId: id<'loom.source'>(), ref: text })
const versionDescription = z.string().max(VERSION_DESCRIPTION_MAX_CHARS)
export const versionSchema = z.strictObject({
  id: id<'loom.version'>(),
  projectId: id<'loom.project'>(),
  name: text,
  description: versionDescription.optional().transform(value => value?.trim() ?? ''),
  sources: z.array(sourceSchema).min(1),
  targets: z.array(targetSchema).min(1).optional(),
})
const lockSchema = z.strictObject({ id: id<'loom.lock'>(), versionId: id<'loom.version'>(), repositories: z.array(z.strictObject({ sourceId: id<'loom.source'>(), commit: z.string().regex(/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u), subProjectId: id<'loom.subproject'>().optional(), committedAt: isoTimestamp.optional() })).min(1), createdAt: isoTimestamp.optional() })
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
  agentPreset: z.string().max(200).optional(),
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
export const schema = z.strictObject({
  projects: z.array(z.strictObject({ id: id<'loom.project'>(), config: z.unknown().transform(parseProject) })),
  versions: z.array(versionSchema), locks: z.array(lockSchema), tasks: z.array(taskSchema), workspaces: z.array(workspaceSchema),
  temporarySessions: z.array(temporarySessionSchema).optional().transform(value => value ?? []),
  audit: z.array(auditSchema).max(500).optional().transform(value => value ?? []),
  executions: z.array(executionSchema).optional().transform(value => value ?? []),
})
export function distinct(values: readonly string[]): boolean { return new Set(values).size === values.length }
/**
 * Host-side mutation timestamp; ISO strings sort chronologically for version-context ordering.
 */
export function nowIso(): string { return new Date().toISOString() }
/**
 * Admit one version description: trimmed, bounded and localizable through `invalid_version`.
 */
export function admitVersionDescription(value: string): string {
  if (typeof value !== 'string') throw new CatalogError('invalid_version')
  const trimmed = value.trim()
  if (trimmed.length > VERSION_DESCRIPTION_MAX_CHARS) throw new CatalogError('invalid_version')
  return trimmed
}
export function validVersion(project: ProjectRecord, version: Pick<VersionRecord, 'sources' | 'targets'>): boolean {
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

/**
 * Project owning a task/version, or undefined when the catalog is dangling.
 */
export function projectOf(draft: CatalogSnapshot, versionId: string): ProjectRecord | undefined {
  const version = draft.versions.find(candidate => candidate.id === versionId)
  return version === undefined ? undefined : draft.projects.find(candidate => candidate.id === version.projectId)
}

/**
 * Project owning a workspace, tolerating records accepted before projectId was added.
 */
export function projectOfWorkspace(draft: CatalogSnapshot, workspace: WorkspaceRecord): ProjectRecord | undefined {
  if (workspace.projectId !== undefined) return draft.projects.find(candidate => candidate.id === workspace.projectId)
  return projectOf(draft, workspace.versionId)
}

/**
 * Repository bindings for a workspace, deriving legacy fields when the record predates
 * layouts.
 */
export function workspaceBindings(draft: CatalogSnapshot, workspace: WorkspaceRecord): readonly WorkspaceRepositoryBinding[] {
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
