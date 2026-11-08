/** Group a version's registered refs by sub-project for workspace creation hints. */
import type { ProjectRecord, VersionRecord } from 'dsh-workloom/types'

/** One sub-project and the refs its repositories will start from. */
export interface WorkspaceSourceGroup {
  readonly subProject: string
  readonly refs: readonly { readonly name: string; readonly ref: string }[]
}

/**
 * Describe every sub-project in a version's registered refs.
 * @param version - selected version.
 * @param project - owning project configuration.
 * @returns groups in project order, each with repository path and ref.
 */
export function workspaceSourceGroups(version: VersionRecord, project: ProjectRecord): readonly WorkspaceSourceGroup[] {
  const subProjects = project.config.subProjects ?? [{ id: 'default', name: project.config.name, sources: project.config.sources }]
  const sourceName = (sourceId: string): string => project.config.sources.find(source => source.id === sourceId)?.path ?? sourceId
  const apply = (subProjectId: string, sourceId: string, ref: string, groups: Map<string, { name: string; refs: { name: string; ref: string }[] }>): void => {
    const subProject = subProjects.find(candidate => String(candidate.id) === subProjectId)
    const key = subProject === undefined ? subProjectId : String(subProject.id)
    const group = groups.get(key) ?? { name: subProject?.name ?? subProjectId, refs: [] }
    group.refs.push({ name: sourceName(sourceId), ref })
    groups.set(key, group)
  }
  const groups = new Map<string, { name: string; refs: { name: string; ref: string }[] }>()
  if (version.targets !== undefined && version.targets.length > 0) {
    for (const target of version.targets) apply(String(target.subProjectId), String(target.sourceId), target.ref, groups)
  } else {
    for (const source of version.sources) {
      const subProject = subProjects.find(candidate => candidate.sources.some(item => item.id === source.sourceId))
      apply(subProject === undefined ? 'default' : String(subProject.id), String(source.sourceId), source.ref, groups)
    }
  }
  return [...groups.values()].map(group => ({ subProject: group.name, refs: group.refs }))
}

/** Convert a workspace label into one ASCII Git branch segment. */
function branchSlug(value: string): string {
  return value.normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/[^A-Za-z0-9._-]+/gu, '-')
    .replace(/-+/gu, '-')
    .replace(/^[-.]+|[-.]+$/gu, '')
}

/** Stable short hash used when a name has no ASCII characters. */
function labelHash(value: string): string {
  let hash = 2166136261
  for (const character of value) hash = Math.imul(hash ^ (character.codePointAt(0) ?? 0), 16777619)
  return (hash >>> 0).toString(36)
}

/**
 * Derive the default branch segment from a workspace label.
 * @param name - workspace display name, possibly non-ASCII.
 * @returns an ASCII segment, or a stable hash fallback for non-ASCII names.
 */
export function workspaceBranchSegment(name: string): string {
  const raw = name.trim()
  return branchSlug(raw) || `ws-${labelHash(raw)}`
}

/**
 * Build a valid Git branch name from a human-readable workspace label.
 * @param prefix - user branch prefix; defaults to `loom`.
 * @param name - workspace display name, possibly non-ASCII.
 * @param branchName - optional user-entered branch segment overriding the label.
 * @returns an ASCII `prefix/name` branch that the Host accepts.
 */
export function workspaceBranch(prefix: string | undefined, name: string, branchName?: string): string {
  const scope = branchSlug(prefix ?? 'loom') || 'loom'
  const override = branchName?.trim() ?? ''
  const segment = override === '' ? workspaceBranchSegment(name) : (branchSlug(override) || workspaceBranchSegment(name))
  return `${scope}/${segment}`
}
