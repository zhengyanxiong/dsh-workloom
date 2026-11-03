/**
 * Project, version and Lock mutations.
 *
 * Version and Lock admission stays in `schema.ts`; this module owns the
 * transaction ordering and audit records for project/version resources.
 */
import { randomUUID } from 'node:crypto'
import { brandString, type Branded } from '@deepseek-ai/dsh-brand'
import { parseProject, type ProjectConfig } from '../../domain/project.ts'
import { resolveLock, type VersionTarget } from '../../domain/version.ts'
import type { Lock } from '../../domain/task.ts'
import type { AuditEntry, AuditEvent } from '../../domain/audit.ts'
import type { CatalogSnapshot, ProjectRecord, VersionRecord } from '../../api/records.ts'
import { CatalogError } from './errors.ts'
import { admitVersionDescription, nowIso, text, validVersion, versionSchema } from './schema.ts'
import { versionIn } from './selectors.ts'

/**
 * The catalog transaction surface required by project and version mutations.
 */
export interface ProjectVersionRuntime {
  transaction<T>(operation: (draft: CatalogSnapshot) => Promise<T> | T): Promise<T>
  resolveCommit(repo: string, ref: string): Promise<string>
  recordAudit(
    draft: CatalogSnapshot,
    event: AuditEvent,
    actor: AuditEntry['actor'],
    fields?: Omit<AuditEntry, 'id' | 'at' | 'event' | 'actor'>,
  ): void
}

export async function createProject(runtime: ProjectVersionRuntime, input: unknown): Promise<ProjectRecord> {
    const config = parseProject(input)
    return runtime.transaction(draft => {
      const record = { id: brandString<ProjectRecord['id']>(randomUUID()), config }
      draft.projects.push(record)
      runtime.recordAudit(draft, 'project.created', 'human', { detail: config.name })
      return record
    })
  }
export async function updateProject(runtime: ProjectVersionRuntime, projectId: ProjectRecord['id'], input: ProjectConfig): Promise<ProjectRecord> {
    const config = parseProject(input)
    return runtime.transaction(draft => {
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
      runtime.recordAudit(draft, 'project.updated', 'human', { detail: config.name })
      return next
    })
  }
export async function deleteProject(runtime: ProjectVersionRuntime, projectId: ProjectRecord['id']): Promise<void> {
  return runtime.transaction(draft => {
    const project = draft.projects.find(candidate => candidate.id === projectId)
    if (project === undefined) throw new CatalogError('missing_project')
    if (draft.versions.some(version => version.projectId === projectId)) throw new CatalogError('project_has_versions')
    draft.projects.splice(draft.projects.indexOf(project), 1)
    runtime.recordAudit(draft, 'project.deleted', 'human', { detail: project.config.name })
  })
}
export async function createVersion(runtime: ProjectVersionRuntime, projectId: ProjectRecord['id'], name: string, sources: readonly { sourceId: Branded<'loom.source'>; ref: string }[], description?: string, targets?: readonly VersionTarget[]): Promise<VersionRecord> {
    const admittedSources = sources.length > 0 ? sources : (targets ?? []).map(target => ({ sourceId: target.sourceId, ref: target.ref }))
    const record = versionSchema.parse({
      id: randomUUID(), projectId, name,
      ...(description === undefined ? {} : { description }),
      sources: admittedSources,
      ...(targets === undefined ? {} : { targets }),
    })
    return runtime.transaction(draft => {
      const project = draft.projects.find(p => p.id === projectId)
      if (!project) throw new CatalogError('missing_project')
      if (!validVersion(project, record)) throw new CatalogError('invalid_version')
      draft.versions.push(record)
      runtime.recordAudit(draft, 'version.created', 'human', { detail: record.name })
      return record
    })
  }
export async function updateVersion(runtime: ProjectVersionRuntime, versionId: VersionRecord['id'], name: string, sources: readonly { sourceId: Branded<'loom.source'>; ref: string }[], description?: string, targets?: readonly VersionTarget[]): Promise<VersionRecord> {
    const admittedName = text.parse(name)
    return runtime.transaction(draft => {
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
      runtime.recordAudit(draft, 'version.updated', 'human', { detail: admittedName })
      return next
    })
  }
export async function deleteVersion(runtime: ProjectVersionRuntime, versionId: VersionRecord['id']): Promise<void> {
  return runtime.transaction(draft => {
    const version = versionIn(draft, versionId)
    if (draft.tasks.some(task => task.versionId === versionId)) throw new CatalogError('version_has_tasks')
    if (draft.workspaces.some(workspace => workspace.versionId === versionId)) throw new CatalogError('version_has_workspaces')
    draft.versions.splice(draft.versions.indexOf(version), 1)
    draft.locks = draft.locks.filter(lock => lock.versionId !== versionId)
    runtime.recordAudit(draft, 'version.deleted', 'human', { detail: version.name })
  })
}
export async function generateLock(runtime: ProjectVersionRuntime, versionId: VersionRecord['id']): Promise<Lock> {
  return runtime.transaction(async draft => {
    const version = versionIn(draft, versionId)
    const project = draft.projects.find(p => p.id === version.projectId)!
    const previous = draft.locks.filter(lock => lock.versionId === version.id).at(-1)
    const resolved = await resolveLock(project.config, version, randomUUID(), runtime.resolveCommit)
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
        runtime.recordAudit(draft, 'workspace.updated', 'human', { workspaceId: workspace.id, detail: `baseline advanced to ${lock.id}` })
        advancedWorkspaces += 1
      }
      for (const task of [...draft.tasks]) {
        if (task.versionId !== version.id || (task.status !== 'running' && task.status !== 'review')) continue
        const attempt = task.attempts.at(-1)
        if (attempt === undefined) continue
        draft.tasks[draft.tasks.indexOf(task)] = { ...task, attempts: [...task.attempts.slice(0, -1), { ...attempt, lock }] }
        runtime.recordAudit(draft, 'task.updated', 'human', { taskId: task.id, workspaceId: attempt.workspaceId, detail: `round baseline advanced to ${lock.id}` })
        rebasedTasks += 1
      }
    }
    const commitDetail = lock.repositories.map(repository => repository.commit.slice(0, 8)).join(' ')
    const advanced = advancedWorkspaces === 0 && rebasedTasks === 0
      ? ''
      : ` · advanced ${advancedWorkspaces} workspace${advancedWorkspaces === 1 ? '' : 's'}, ${rebasedTasks} task${rebasedTasks === 1 ? '' : 's'}`
    runtime.recordAudit(draft, 'lock.generated', 'human', { detail: `${commitDetail}${advanced}` })
    return lock
  })
}
