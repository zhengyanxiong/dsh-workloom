/** Untrusted project configuration admission, without network or filesystem effects. */
import { brandString, type Branded } from '@deepseek-ai/dsh-brand'

/** Repository location and its non-overlapping worktree directory. */
export interface SourceConfig {
  readonly id: Branded<'loom.source'>
  readonly repo: string
  readonly path: string
}
/** Business module within one repository; dot means repository root. */
export interface ModuleConfig {
  readonly id: Branded<'loom.module'>
  readonly sourceId: SourceConfig['id']
  readonly path: string
}
/** One logical sub-project inside a top-level project. */
export interface SubProjectConfig {
  readonly id: Branded<'loom.subproject'>
  readonly name: string
  readonly sources: readonly SourceConfig[]
  readonly modules: readonly ModuleConfig[]
}
/** Validated project input; version and Lock creation are separate operations. */
export interface ProjectConfig {
  readonly name: string
  /** Flat compatibility view used by existing UI/Host paths; derived from subProjects when present. */
  readonly sources: readonly SourceConfig[]
  readonly modules: readonly ModuleConfig[]
  /** Canonical V2 grouping. Absent on catalogs accepted before sub-projects existed. */
  readonly subProjects?: readonly SubProjectConfig[] | undefined
  /** Agent preset every Session created for this project starts with; omitted means the DSH default. */
  readonly agentPreset?: string
}
/** Return canonical sub-projects, synthesizing one default for pre-V2 projects.
 * @param project - admitted configuration
 * @returns at least one sub-project, never empty
 */
export function projectSubProjects(project: ProjectConfig): readonly SubProjectConfig[] {
  if (project.subProjects !== undefined && project.subProjects.length > 0) return project.subProjects
  return [{ id: brandString<SubProjectConfig['id']>('default'), name: project.name, sources: project.sources, modules: project.modules }]
}
/** Structured import failure for localized UI rendering. */
export class ProjectError extends Error {
  constructor(readonly code: 'invalid_object' | 'unknown_field' | 'invalid_string' | 'invalid_path' | 'invalid_list' | 'duplicate_id' | 'unknown_source' | 'overlapping_paths', readonly field: string) {
    super(`${code}: ${field}`)
    this.name = 'ProjectError'
  }
}

function object(value: unknown, fields: readonly string[], at: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new ProjectError('invalid_object', at)
  const record = value as Record<string, unknown>
  if (Object.keys(record).some(key => !fields.includes(key))) throw new ProjectError('unknown_field', at)
  return record
}
function text(value: unknown, at: string): string {
  if (typeof value !== 'string' || value.trim() === '' || /[\x00-\x1f]/u.test(value)) throw new ProjectError('invalid_string', at)
  return value
}
function relative(value: unknown, at: string, root: boolean): string {
  if (typeof value !== 'string') throw new ProjectError('invalid_path', at)
  if (root && value === '.') return value
  if (value === '' || value.includes('\\') || value.includes(':') || /[\x00-\x1f]/u.test(value)
    || value.split('/').some(part => part === '' || part === '.' || part === '..' || part.toLowerCase() === '.git' || part.trim() !== part)) {
    throw new ProjectError('invalid_path', at)
  }
  return value
}
function list(value: unknown, at: string): unknown[] {
  if (!Array.isArray(value)) throw new ProjectError('invalid_list', at)
  return value
}
function unique(ids: readonly string[], at: string): void {
  if (new Set(ids).size !== ids.length) throw new ProjectError('duplicate_id', at)
}

function validateFlat(sources: readonly SourceConfig[], modules: readonly ModuleConfig[]): void {
  if (sources.length === 0) throw new ProjectError('invalid_list', 'sources')
  if (sources.length > 1 && sources.some(source => source.path === '.')) throw new ProjectError('overlapping_paths', 'sources')
  unique(sources.map(source => source.id), 'sources')
  for (let index = 0; index < sources.length; index++) {
    const path = sources[index]!.path.toLowerCase()
    for (const other of sources.slice(index + 1)) {
      const candidate = other.path.toLowerCase()
      if (path === candidate || path.startsWith(`${candidate}/`) || candidate.startsWith(`${path}/`)) throw new ProjectError('overlapping_paths', 'sources')
    }
  }
  unique(modules.map(module => module.id), 'modules')
  for (const module of modules) {
    if (!sources.some(source => source.id === module.sourceId)) throw new ProjectError('unknown_source', 'modules.sourceId')
  }
}

function parseSourceList(value: unknown, at: string): SourceConfig[] {
  const sources = list(value, at).map((item, index): SourceConfig => {
    const itemAt = `${at}.${String(index)}`
    const source = object(item, ['id', 'repo', 'path'], itemAt)
    return { id: brandString<SourceConfig['id']>(text(source.id, `${itemAt}.id`)), repo: text(source.repo, `${itemAt}.repo`), path: relative(source.path, `${itemAt}.path`, true) }
  })
  return sources
}

function parseModuleList(value: unknown, at: string, sources: readonly SourceConfig[]): ModuleConfig[] {
  return list(value, at).map((item, index): ModuleConfig => {
    const itemAt = `${at}.${String(index)}`
    const module = object(item, ['id', 'sourceId', 'path'], itemAt)
    const sourceId = brandString<SourceConfig['id']>(text(module.sourceId, `${itemAt}.sourceId`))
    if (!sources.some(source => source.id === sourceId)) throw new ProjectError('unknown_source', `${itemAt}.sourceId`)
    return { id: brandString<ModuleConfig['id']>(text(module.id, `${itemAt}.id`)), sourceId, path: relative(module.path, `${itemAt}.path`, true) }
  })
}

/** Validate a parsed JSON configuration and return detached data.
 * @param input - Untrusted imported or form-generated value.
 * @returns admitted configuration; no repositories are fetched or scripts executed.
 */
export function parseProject(input: unknown): ProjectConfig {
  const root = object(input, ['name', 'sources', 'modules', 'subProjects', 'agentPreset'], 'project')
  const name = text(root.name, 'name')
  const agentPreset = root.agentPreset === undefined ? undefined : text(root.agentPreset, 'agentPreset').trim()
  if (root.subProjects !== undefined) {
    const subProjects = list(root.subProjects, 'subProjects').map((item, index): SubProjectConfig => {
      const at = `subProjects.${String(index)}`
      const sub = object(item, ['id', 'name', 'sources', 'modules'], at)
      const sources = parseSourceList(sub.sources, `${at}.sources`)
      if (sources.length === 0) throw new ProjectError('invalid_list', `${at}.sources`)
      const modules = parseModuleList(sub.modules, `${at}.modules`, sources)
      return {
        id: brandString<SubProjectConfig['id']>(text(sub.id, `${at}.id`)),
        name: text(sub.name, `${at}.name`),
        sources,
        modules,
      }
    })
    if (subProjects.length === 0) throw new ProjectError('invalid_list', 'subProjects')
    unique(subProjects.map(sub => sub.id), 'subProjects')
    const sources = subProjects.flatMap(sub => sub.sources)
    const modules = subProjects.flatMap(sub => sub.modules)
    unique(sources.map(source => source.id), 'subProjects.sources')
    unique(modules.map(module => module.id), 'subProjects.modules')
    validateFlat(sources, modules)
    return { name, sources, modules, subProjects, ...(agentPreset === undefined ? {} : { agentPreset }) }
  }
  const sources = parseSourceList(root.sources, 'sources')
  const modules = parseModuleList(root.modules, 'modules', sources)
  validateFlat(sources, modules)
  return { name, sources, modules, ...(agentPreset === undefined ? {} : { agentPreset }) }
}
