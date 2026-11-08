/** Version refs and immutable multi-repository Lock resolution. */
import { brandString, type Branded } from '@deepseek-ai/dsh-brand'
import { projectSubProjects, type ProjectConfig, type SourceConfig, type SubProjectConfig } from './project.ts'

/** One repository ref selected by a version, scoped to a sub-project. */
export interface VersionTarget {
  readonly subProjectId: SubProjectConfig['id']
  readonly sourceId: SourceConfig['id']
  readonly ref: string
}
/** Version configuration before refs resolve to commits. */
export interface VersionConfig {
  readonly id: string
  /** Pre-V2 compatibility refs; when `targets` exists this field is derived and ignored by resolution. */
  readonly sources: readonly { readonly sourceId: SourceConfig['id']; readonly ref: string }[]
  /** Canonical V2 refs across sub-projects. Absent on pre-V2 versions. */
  readonly targets?: readonly VersionTarget[] | undefined
}
/** Resolved exact repository baseline. */
export interface ResolvedLock {
  readonly id: Branded<'loom.lock'>
  readonly versionId: Branded<'loom.version'>
  readonly repositories: readonly {
    readonly sourceId: SourceConfig['id']
    readonly commit: string
    readonly subProjectId?: SubProjectConfig['id'] | undefined
    readonly committedAt?: string | undefined
  }[]
}
/** Stable version failure with a descriptive message. */
function versionError(code: string, detail = ''): Error {
  return new Error(`${code}: ${detail}`)
}

/** Resolve one configured ref per repository; the callback performs Git I/O. */
export async function resolveLock(
  project: ProjectConfig,
  version: VersionConfig,
  lockId: string,
  resolveCommit: (repo: string, ref: string) => Promise<string>,
  resolveCommitTime?: ((repo: string, commit: string) => Promise<string | undefined>) | undefined,
): Promise<ResolvedLock> {
  const versionId = version.id
  const targets = version.targets
  const selected: { source: SourceConfig; ref: string; subProjectId?: SubProjectConfig['id'] }[] = []
  if (targets !== undefined) {
    if (targets.length === 0) throw versionError('empty_version', 'a version needs at least one repository target')
    const subProjects = new Map(projectSubProjects(project).map(sub => [sub.id, sub]))
    const seen = new Set<string>()
    for (const target of targets) {
      const key = `${target.subProjectId}\u0000${target.sourceId}`
      if (seen.has(key)) throw versionError('duplicate_source', `${target.sourceId} is listed more than once`)
      seen.add(key)
      const subProject = subProjects.get(target.subProjectId)
      if (subProject === undefined) throw versionError('unknown_subproject', `${target.subProjectId} does not exist in this project`)
      const source = subProject.sources.find(candidate => candidate.id === target.sourceId)
      if (source === undefined) throw versionError('unknown_source', `${target.sourceId} does not exist in this sub-project`)
      selected.push({ source: Object.freeze({ ...source }), ref: target.ref, subProjectId: target.subProjectId })
    }
  } else {
    const versionSources = version.sources
    if (versionSources.length === 0) throw versionError('empty_version', 'a version needs at least one repository target')
    const sourceById = new Map(project.sources.map(source => [source.id, source]))
    const seen = new Set<string>()
    for (const entry of versionSources) {
      if (seen.has(entry.sourceId)) throw versionError('duplicate_source', `${entry.sourceId} is listed more than once`)
      seen.add(entry.sourceId)
      const source = sourceById.get(entry.sourceId)
      if (source === undefined) throw versionError('unknown_source', `${entry.sourceId} does not exist in this project`)
      selected.push({ source: Object.freeze({ ...source }), ref: entry.ref })
    }
  }
  const repositories = []
  for (const { source, ref, subProjectId } of selected) {
    const commit = await resolveCommit(source.repo, ref)
    if (!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u.test(commit)) throw versionError('invalid_commit', `the resolver returned an invalid commit for ${source.id}`)
    const committedAt = await resolveCommitTime?.(source.repo, commit).catch(() => undefined)
    repositories.push(Object.freeze({
      sourceId: source.id,
      commit,
      ...(subProjectId === undefined ? {} : { subProjectId }),
      ...(committedAt === undefined ? {} : { committedAt }),
    }))
  }
  return Object.freeze({
    id: brandString<ResolvedLock['id']>(lockId),
    versionId: brandString<ResolvedLock['versionId']>(versionId),
    repositories: Object.freeze(repositories),
  })
}
