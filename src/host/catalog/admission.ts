/**
 * Cross-record admission for the persisted catalog.
 *
 * Zod validates each record; this module validates the relationships between
 * records and rejects a catalog that would make Host operations ambiguous.
 */
import { admitWorkspaceLayout, WorkspaceLayoutError } from '../../domain/workspace.ts'
import type { CatalogSnapshot } from '../../api/records.ts'
import { CatalogError } from './errors.ts'
import { distinct, schema, validVersion } from './schema.ts'

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
