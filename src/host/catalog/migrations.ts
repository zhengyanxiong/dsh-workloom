/**
 * Catalog path helpers and version-1 to version-2 migrations.
 *
 * Migration stays filesystem-free: it only reshapes JSON before schema
 * admission, so a catalog can move between host platforms without rewriting.
 */
import { isAbsolute, resolve, win32 } from 'node:path'

/**
 * Resolve a repository path in the spelling the catalog stored, including a catalog moved from
 * Windows.
 */
function resolveCatalogPath(root: string, path: string): string {
  return /^[A-Za-z]:[\\/]/u.test(root) || /^\\\\/u.test(root) ? win32.resolve(root, path) : resolve(root, path)
}

/**
 * Compare two catalog paths in their own spelling, without assuming the host platform.
 */
function sameCatalogPath(left: string, right: string): boolean {
  const windows = /^[A-Za-z]:[\\/]/u.test(left) || /^\\\\/u.test(left)
  if (windows) return win32.isAbsolute(left) && win32.isAbsolute(right) && win32.resolve(left).toLowerCase() === win32.resolve(right).toLowerCase()
  return isAbsolute(left) && isAbsolute(right) && resolve(left) === resolve(right)
}

/**
 * Enrich a version-1 catalog without reading the filesystem.
 */
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
