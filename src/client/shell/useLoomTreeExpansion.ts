/**
 * Project-tree expansion and section-collapse state.
 *
 * Selecting a project or version expands it once; users can still collapse it
 * manually afterwards. The three section toggles are independent.
 */
import { useEffect, useState } from 'react'
import type { ProjectRecord, VersionRecord } from 'dsh-workloom/types'

/** Sidebar sections that can be collapsed. */
export type LoomSidebarSection = 'pinned' | 'projects' | 'sessions'

/** Expansion surface consumed by the project tree. */
export interface LoomTreeExpansion {
  readonly expandedProjects: ReadonlySet<string>
  readonly expandedVersions: ReadonlySet<string>
  readonly collapsedSections: ReadonlySet<LoomSidebarSection>
  readonly toggleSection: (section: LoomSidebarSection) => void
  readonly toggleProject: (id: ProjectRecord['id']) => void
  readonly toggleVersion: (id: VersionRecord['id']) => void
}

/**
 * Own project/version expansion and sidebar section collapse.
 *
 * @param project - selected project identity, when one is selected.
 * @param version - selected version identity, when one is selected.
 * @returns expansion sets and their toggles.
 */
export function useLoomTreeExpansion(
  project: ProjectRecord['id'] | undefined,
  version: VersionRecord['id'] | undefined,
): LoomTreeExpansion {
  const [expandedProjects, setExpandedProjects] = useState<ReadonlySet<string>>(new Set())
  const [expandedVersions, setExpandedVersions] = useState<ReadonlySet<string>>(new Set())
  const [collapsedSections, setCollapsedSections] = useState<ReadonlySet<LoomSidebarSection>>(new Set())
  useEffect(() => {
    if (project !== undefined) setExpandedProjects(current => current.has(project) ? current : new Set(current).add(project))
    if (version !== undefined) setExpandedVersions(current => current.has(version) ? current : new Set(current).add(version))
  }, [project, version])
  const toggle = (set: ReadonlySet<string>, apply: (next: ReadonlySet<string>) => void, id: string): void => {
    const next = new Set(set)
    if (next.has(id)) next.delete(id); else next.add(id)
    apply(next)
  }
  const toggleSection = (section: LoomSidebarSection): void => {
    setCollapsedSections(current => {
      const next = new Set(current)
      if (next.has(section)) next.delete(section)
      else next.add(section)
      return next
    })
  }
  return {
    expandedProjects,
    expandedVersions,
    collapsedSections,
    toggleSection,
    toggleProject: id => { toggle(expandedProjects, setExpandedProjects, id) },
    toggleVersion: id => { toggle(expandedVersions, setExpandedVersions, id) },
  }
}
