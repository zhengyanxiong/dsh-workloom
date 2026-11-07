/** Draft types and pure request builders shared by Loom forms. */
import type {
  CreateTaskRequest, CreateVersionRequest, ModuleConfig, ProjectConfig, ProjectRecord, SourceConfig, SubProjectConfig,
  TaskPriority, VersionRecord, VersionWorkspaceInput,
} from 'dsh-workloom/types'
import { VERSION_DESCRIPTION_MAX_CHARS } from '../../../shared/version-context.ts'

export interface SourceDraft {
  readonly id?: SourceConfig['id']
  readonly repo: string
  readonly path: string
  /** Optional V2 sub-project name; rows sharing it are grouped together. */
  readonly subProject?: string
  /** Existing sub-project identity, preserved when its display name is edited. */
  readonly subProjectId?: string
}

/** One business module row; the repository choice names a derived source id. */
export interface ModuleDraft {
  readonly id?: ModuleConfig['id']
  readonly source: string
  readonly path: string
}

/**
 * Start a repository row empty so the form never silently submits placeholder ids or directories.
 * @returns a blank repository row.
 */
export function emptySourceRow(): SourceDraft {
  return { repo: '', path: '' }
}

/**
 * Start a module row empty.
 * @returns a blank module row.
 */
export function emptyModuleRow(): ModuleDraft {
  return { source: '', path: '' }
}

function segment(value: string): string {
  return value.split('/').map(part => part.trim()).filter(part => part !== '' && part !== '.').at(-1) ?? ''
}

function slug(value: string): string {
  return segment(value).replace(/[^A-Za-z0-9._-]+/gu, '-').replace(/^-+|-+$/gu, '').toLowerCase()
}

function uniqueId(base: string, used: Set<string>): string {
  let candidate = base
  let index = 2
  while (used.has(candidate)) { candidate = `${base}-${index}`; index += 1 }
  used.add(candidate)
  return candidate
}

/**
 * Derive one stable repository id per row from its workspace directory.
 * Users never type these ids; versions and Locks reference them internally.
 * @param sources - Repository rows in submission order.
 * @returns ids in the same order, disambiguated by a numeric suffix.
 */
export function sourceIds(sources: readonly SourceDraft[]): string[] {
  const used = new Set<string>()
  return sources.map((source) => {
    if (source.id !== undefined && !used.has(source.id)) { used.add(source.id); return source.id }
    return uniqueId(slug(source.path) || slug(source.repo) || 'repo', used)
  })
}

function moduleIds(modules: readonly ModuleDraft[], ids: readonly string[]): string[] {
  const used = new Set<string>()
  return modules.map((module) => {
    if (module.id !== undefined && !used.has(module.id)) { used.add(module.id); return module.id }
    const sourceId = ids[ids.indexOf(module.source)] ?? 'module'
    return uniqueId(slug(module.path) === '' ? `${sourceId}-root` : slug(module.path), used)
  })
}

/**
 * Report whether repository rows cannot share one workspace layout.
 * A multi-repository project cannot claim `.` because it contains every other path.
 * @param sources - Repository rows in submission order.
 * @returns true when two non-empty workspace paths are equal, nested, or one is the root.
 */
export function sourcePathsOverlap(sources: readonly SourceDraft[]): boolean {
  const paths = sources.map(source => source.path.trim()).filter(path => path !== '')
  for (let index = 0; index < paths.length; index += 1) {
    const path = paths[index]!.toLowerCase()
    if (path === '.' && paths.length > 1) return true
    for (const other of paths.slice(index + 1)) {
      const candidate = other.toLowerCase()
      if (path === candidate || path.startsWith(`${candidate}/`) || candidate.startsWith(`${path}/`)) return true
    }
  }
  return false
}

/**
 * Validate the project form and derive repository and module ids.
 * @param name - Admitted project name.
 * @param sources - Repository rows in submission order.
 * @param modules - Optional business module rows.
 * @returns detached request, or undefined while a required field is blank.
 */
export function projectRequest(name: string, sources: readonly SourceDraft[], modules: readonly ModuleDraft[], agentPreset = ''): ProjectConfig | undefined {
  const admittedName = name.trim()
  if (admittedName === '' || sources.length === 0) return undefined
  const rows = sources.map(source => ({ ...(source.id === undefined ? {} : { id: source.id }), repo: source.repo.trim(), path: source.path.trim() }))
  if (rows.some(source => source.repo === '' || source.path === '')) return undefined
  const ids = sourceIds(rows)
  const admittedSources = rows.map((source, index) => ({
    id: ids[index] as SourceConfig['id'],
    repo: source.repo,
    path: source.path,
  }))
  if (sourcePathsOverlap(admittedSources)) return undefined
  const draftedModules = modules.filter(module => module.source !== '' || module.path.trim() !== '')
  if (draftedModules.some(module => module.source === '' || !ids.includes(module.source) || module.path.trim() === '')) return undefined
  const moduleIdList = moduleIds(draftedModules, ids)
  const admittedModules = draftedModules.map((module, index) => ({
    id: moduleIdList[index] as ModuleConfig['id'],
    sourceId: module.source as SourceConfig['id'],
    path: module.path.trim(),
  }))
  const admittedPreset = agentPreset.trim()
  const subNames = sources.map(source => (source.subProject ?? '').trim())
  if (!subNames.some(value => value !== '' && value.toLowerCase() !== 'default')) {
    return { name: admittedName, sources: admittedSources, modules: admittedModules, ...(admittedPreset === '' ? {} : { agentPreset: admittedPreset }) }
  }
  const usedSubIds = new Set<string>()
  const subProjectsByIndex = new Map<number, SubProjectConfig>()
  const sourceIndexBySub = new Map<string, number>()
  const subIdBySourceId = new Map<string, string>()
  sources.forEach((source, index) => {
    const display = (source.subProject ?? '').trim() === '' ? 'default' : (source.subProject ?? '').trim()
    let subIndex = sourceIndexBySub.get(display)
    if (subIndex === undefined) {
      subIndex = subProjectsByIndex.size
      sourceIndexBySub.set(display, subIndex)
      const preferred = sources[index]?.subProjectId
      const subId = preferred !== undefined && preferred !== '' && !usedSubIds.has(preferred)
        ? (usedSubIds.add(preferred), preferred)
        : uniqueId(slug(display) || 'subproject', usedSubIds)
      subProjectsByIndex.set(subIndex, { id: subId as SubProjectConfig['id'], name: display, sources: [], modules: [] })
    }
    const current = subProjectsByIndex.get(subIndex)!
    subProjectsByIndex.set(subIndex, { ...current, sources: [...current.sources, admittedSources[index]!] })
    subIdBySourceId.set(String(admittedSources[index]!.id), String(current.id))
  })
  const admittedSubProjects = [...subProjectsByIndex.values()].map(sub => ({
    ...sub,
    modules: admittedModules.filter(module => subIdBySourceId.get(String(module.sourceId)) === String(sub.id)),
  }))
  return { name: admittedName, sources: admittedSources, modules: admittedModules, subProjects: admittedSubProjects, ...(admittedPreset === '' ? {} : { agentPreset: admittedPreset }) }
}

/**
 * Validate the version form against the selected project's repositories.
 * @param project - Project whose repository ids name the version sources.
 * @param name - Admitted version name.
 * @param refs - Ref text keyed by repository id.
 * @returns detached request, or undefined while an input is blank.
 */
export function versionRequest(project: ProjectRecord, name: string, refs: Readonly<Record<string, string>>, description = '', workspaces: readonly VersionWorkspaceInput[] = [], selectedSubProjectIds?: readonly string[]): CreateVersionRequest | undefined {
  const admittedName = name.trim()
  if (admittedName === '') return undefined
  if (description.length > VERSION_DESCRIPTION_MAX_CHARS) return undefined
  const subProjects = project.config.subProjects
  const selected = subProjects === undefined ? undefined : (selectedSubProjectIds ?? subProjects.map(sub => String(sub.id)))
  const selectedSubs = subProjects === undefined ? undefined : subProjects.filter(sub => selected?.includes(String(sub.id)) === true)
  const selectedSources = selectedSubs === undefined ? project.config.sources : selectedSubs.flatMap(sub => sub.sources)
  if (selectedSources.length === 0) return undefined
  const sources = selectedSources.map(source => ({ sourceId: source.id, ref: (refs[source.id] ?? '').trim() }))
  if (sources.some(source => source.ref === '')) return undefined
  const admittedDescription = description.trim()
  const targets = selectedSubs === undefined
    ? undefined
    : selectedSubs.flatMap(sub => sub.sources.map(source => ({
        subProjectId: String(sub.id),
        sourceId: String(source.id),
        ref: (refs[source.id] ?? '').trim(),
      })))
  return {
    projectId: project.id,
    name: admittedName,
    sources,
    ...(targets === undefined ? {} : { targets }),
    ...(admittedDescription === '' ? {} : { description: admittedDescription }),
    ...(workspaces.length === 0 ? {} : { workspaces }),
  }
}

/** Optional task metadata admitted by the create form. */
export interface TaskMetadataDraft {
  readonly description: string
  readonly priority: TaskPriority
  readonly moduleIds: readonly string[]
  /** Per-task Agent preset; empty inherits the project preset. */
  readonly agentPreset?: string
}

/**
 * Validate the task form.
 * @param version - Version that owns the new task.
 * @param title - Admitted task title.
 * @param metadata - Optional description, priority and business modules.
 * @returns detached request, or undefined for a blank title.
 */
export function taskRequest(version: VersionRecord, title: string, metadata?: TaskMetadataDraft, workspaceId?: string): CreateTaskRequest | undefined {
  const admitted = title.trim()
  if (admitted === '') return undefined
  const description = metadata?.description.trim() ?? ''
  const priority = metadata?.priority ?? 'normal'
  const moduleIds = metadata?.moduleIds ?? []
  const agentPreset = metadata?.agentPreset?.trim() ?? ''
  return {
    versionId: version.id,
    ...(workspaceId === undefined || workspaceId === '' ? {} : { workspaceId }),
    title: admitted,
    ...(agentPreset === '' ? {} : { agentPreset }),
    ...(description === '' ? {} : { description }),
    ...(priority === 'normal' ? {} : { priority }),
    ...(moduleIds.length === 0 ? {} : { moduleIds }),
  }
}



export interface WorkspaceDraft {
  readonly mode: 'auto' | 'linked'
  readonly parentPath: string
  readonly name: string
  readonly branchPrefix: string
  readonly rootPath: string
  readonly targets: Readonly<Record<string, string>>
}

export function isAbsolutePath(value: string): boolean {
  return value.startsWith('/') || /^[A-Za-z]:[\\/]/u.test(value)
}

/** Validate one version workspace draft against the version repositories. */
export function workspaceDraftInput(draft: WorkspaceDraft, sources: readonly { readonly id: string }[]): VersionWorkspaceInput | undefined {
  if (draft.mode === 'auto') {
    if (!isAbsolutePath(draft.parentPath) || !/^[A-Za-z0-9._-]+$/u.test(draft.name) || draft.name === '.' || draft.name === '..') return undefined
    if (!/^(?![-.])[A-Za-z0-9._/-]+$/u.test(draft.branchPrefix)) return undefined
    return { mode: 'auto', parentPath: draft.parentPath, name: draft.name, branchPrefix: draft.branchPrefix }
  }
  if (!isAbsolutePath(draft.rootPath)) return undefined
  const repositories = sources.map(source => ({ sourceId: source.id, targetPath: (draft.targets[source.id] ?? '').trim() }))
  if (repositories.some(repository => !isAbsolutePath(repository.targetPath))) return undefined
  return { mode: 'linked', rootPath: draft.rootPath, repositories }
}

/** Create or edit one version with a ref per project repository; Lock generation stays separate. */
