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
