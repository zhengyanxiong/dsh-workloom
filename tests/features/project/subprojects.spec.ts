import { expect, it } from 'vitest'
import { parseProject, projectSubProjects } from '../../../src/domain/project.ts'

const input = () => ({
  name: 'Product',
  subProjects: [
    { id: 'web', name: 'Web', sources: [{ id: 'shop', repo: '/repos/shop', path: 'shop' }], modules: [{ id: 'checkout', sourceId: 'shop', path: 'apps/checkout' }] },
    { id: 'api', name: 'API', sources: [{ id: 'service', repo: '/repos/service', path: 'service' }], modules: [] },
  ],
})

it('admits sub-projects and exposes a flattened compatibility view', () => {
  const parsed = parseProject(input())
  expect(parsed.subProjects?.map(sub => sub.id)).toEqual(['web', 'api'])
  expect(parsed.sources.map(source => source.id)).toEqual(['shop', 'service'])
  expect(parsed.modules.map(module => module.id)).toEqual(['checkout'])
})

it('synthesizes a default sub-project for pre-V2 projects', () => {
  const parsed = parseProject({ name: 'Legacy', sources: [{ id: 'web', repo: '/repos/web', path: 'web' }], modules: [] })
  expect(parsed.subProjects).toBeUndefined()
  expect(projectSubProjects(parsed).map(sub => sub.id)).toEqual(['default'])
  expect(projectSubProjects(parsed)[0]?.sources[0]?.id).toBe('web')
})

it('rejects source ids shared across sub-projects', () => {
  const value = input()
  value.subProjects[1]!.sources[0]!.id = 'shop'
  expect(() => parseProject(value)).toThrow('duplicate_id')
})

it('rejects overlapping paths across sub-projects', () => {
  const value = input()
  value.subProjects[1]!.sources[0]!.path = 'shop/nested'
  expect(() => parseProject(value)).toThrow('overlapping_paths')
})

it('rejects a module pointing at another sub-project source', () => {
  const value = input()
  value.subProjects[0]!.modules[0]!.sourceId = 'service'
  expect(() => parseProject(value)).toThrow('unknown_source')
})

it('returns detached sub-project data', () => {
  const value = input()
  const parsed = parseProject(value)
  value.subProjects[0]!.sources[0]!.path = 'changed'
  expect(parsed.subProjects?.[0]?.sources[0]?.path).toBe('shop')
})

it('keeps the sub-project id on a workspace repository binding', async () => {
  const { admitWorkspaceLayout } = await import('../../../src/domain/workspace.ts')
  const layout = {
    projectId: 'p1' as never,
    mode: 'linked' as const,
    rootPath: '/ws',
    rootOwner: 'user' as const,
    repositories: [{ sourceId: 'shop' as never, subProjectId: 'web' as never, path: 'shop', targetPath: '/repos/shop', kind: 'link' as const }],
  }
  expect(() => admitWorkspaceLayout(layout)).not.toThrow()
})

it('derives the V2 auto workspace path from sub-project and repo', async () => {
  const { autoWorkspaceRepositoryPath, workspaceLifecycle } = await import('../../../src/domain/workspace.ts')
  expect(autoWorkspaceRepositoryPath('web', { id: 'shop', path: 'apps/shop' })).toBe('web/apps/shop')
  expect(autoWorkspaceRepositoryPath('web', { id: 'shop', path: '.' })).toBe('web/shop')
  expect(autoWorkspaceRepositoryPath('default', { id: 'shop', path: 'apps/shop' })).toBe('apps/shop')
  expect(workspaceLifecycle({ preparation: { status: 'waiting' } })).toBe('preparing')
  expect(workspaceLifecycle({ preparation: { status: 'failed' } })).toBe('failed')
  expect(workspaceLifecycle({ cleaned: true })).toBe('cleaned')
  expect(workspaceLifecycle({})).toBe('ready')
})

it('groups project form rows into sub-projects only when a non-default name is entered', async () => {
  const { projectRequest } = await import('../../../src/client/features/forms/drafts.ts')
  const flat = projectRequest('Shop', [{ repo: '/repos/shop', path: 'shop' }], [])
  expect(flat).not.toHaveProperty('subProjects')
  const grouped = projectRequest('Product', [
    { repo: '/repos/shop', path: 'shop', subProject: 'web' },
    { repo: '/repos/service', path: 'service', subProject: 'api' },
  ], [])
  expect(grouped?.subProjects?.map(sub => sub.name)).toEqual(['web', 'api'])
  expect(grouped?.sources.map(source => source.id)).toEqual(['shop', 'service'])
})

it('preserves an existing sub-project id when its display name is edited', async () => {
  const { projectRequest } = await import('../../../src/client/features/forms/drafts.ts')
  const grouped = projectRequest('Product', [{ repo: '/repos/shop', path: 'shop', subProject: 'Renamed', subProjectId: 'web' }], [])
  expect(grouped?.subProjects?.[0]?.id).toBe('web')
  expect(grouped?.subProjects?.[0]?.name).toBe('Renamed')
})

it('filters version sources and targets to the selected sub-projects', async () => {
  const { versionRequest } = await import('../../../src/client/features/forms/drafts.ts')
  const project = parseProject({
    name: 'Product',
    subProjects: [
      { id: 'web', name: 'Web', sources: [{ id: 'shop', repo: '/repos/shop', path: 'shop' }], modules: [] },
      { id: 'api', name: 'API', sources: [{ id: 'service', repo: '/repos/service', path: 'service' }], modules: [] },
    ],
  })
  const request = versionRequest({ id: 'p1' as never, config: project }, 'v1', { shop: 'main', service: 'main' }, '', [], ['web'])
  expect(request?.sources.map(source => source.sourceId)).toEqual(['shop'])
  expect(request?.targets).toEqual([{ subProjectId: 'web', sourceId: 'shop', ref: 'main' }])
})
