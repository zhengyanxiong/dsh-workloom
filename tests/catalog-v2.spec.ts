import { expect, it } from 'vitest'
import { migrateCatalog, parseCatalog } from '../src/host/catalog.ts'

const legacy = () => ({
  projects: [{ id: 'p1', config: { name: 'Legacy', sources: [{ id: 'web', repo: '/repos/web', path: 'web' }], modules: [] } }],
  versions: [{ id: 'v1', projectId: 'p1', name: 'v1', sources: [{ sourceId: 'web', ref: 'main' }] }],
  locks: [{ id: 'l1', versionId: 'v1', repositories: [{ sourceId: 'web', commit: 'a'.repeat(40) }] }],
  tasks: [], workspaces: [],
})

it('migrates legacy flat projects into a default sub-project and targets', () => {
  const migrated = migrateCatalog(legacy()) as {
    projects: { config: { subProjects?: { id: string; sources: { id: string }[] }[] } }[]
    versions: { targets?: { subProjectId: string; sourceId: string; ref: string }[] }[]
    locks: { repositories: { subProjectId?: string }[] }[]
  }
  expect(migrated.projects[0]?.config.subProjects?.[0]).toMatchObject({ id: 'default', sources: [{ id: 'web' }] })
  expect(migrated.versions[0]?.targets).toEqual([{ subProjectId: 'default', sourceId: 'web', ref: 'main' }])
  expect(migrated.locks[0]?.repositories[0]?.subProjectId).toBe('default')
})

it('parses a catalog with sub-projects, version targets and Lock sub-project entries', () => {
  const catalog = parseCatalog({
    projects: [{
      id: 'p1',
      config: {
        name: 'Product',
        subProjects: [
          { id: 'web', name: 'Web', sources: [{ id: 'shop', repo: '/repos/shop', path: 'shop' }], modules: [] },
          { id: 'api', name: 'API', sources: [{ id: 'service', repo: '/repos/service', path: 'service' }], modules: [] },
        ],
      },
    }],
    versions: [{
      id: 'v1', projectId: 'p1', name: 'v1', sources: [{ sourceId: 'shop', ref: 'main' }],
      targets: [{ subProjectId: 'web', sourceId: 'shop', ref: 'main' }, { subProjectId: 'api', sourceId: 'service', ref: 'release' }],
    }],
    locks: [{
      id: 'l1', versionId: 'v1',
      repositories: [
        { sourceId: 'shop', commit: 'a'.repeat(40), subProjectId: 'web' },
        { sourceId: 'service', commit: 'b'.repeat(40), subProjectId: 'api' },
      ],
    }],
    tasks: [], workspaces: [],
  })
  expect(catalog.versions[0]?.targets).toHaveLength(2)
  expect(catalog.locks[0]?.repositories.map(entry => entry.subProjectId)).toEqual(['web', 'api'])
})

it('creates a version with sub-project targets and rejects a task workspace that does not exist', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { createCatalog } = await import('../src/host/catalog.ts')
  const { brandString } = await import('@deepseek-ai/dsh-brand')
  const dir = await mkdtemp(join(tmpdir(), 'loom-v2-'))
  try {
    const catalog = await createCatalog(join(dir, 'state.json'), async () => 'a'.repeat(40))
    const project = await catalog.createProject({
      name: 'Product',
      sources: [
        { id: 'shop', repo: join(dir, 'shop'), path: 'shop' },
        { id: 'service', repo: join(dir, 'service'), path: 'service' },
      ],
      modules: [],
      subProjects: [
        { id: 'web', name: 'Web', sources: [{ id: 'shop', repo: join(dir, 'shop'), path: 'shop' }], modules: [] },
        { id: 'api', name: 'API', sources: [{ id: 'service', repo: join(dir, 'service'), path: 'service' }], modules: [] },
      ],
    })
    const version = await catalog.createVersion(project.id, 'v1', [
      { sourceId: brandString<'loom.source'>('shop'), ref: 'main' },
      { sourceId: brandString<'loom.source'>('service'), ref: 'release' },
    ], undefined, [
      { subProjectId: brandString<'loom.subproject'>('web'), sourceId: brandString<'loom.source'>('shop'), ref: 'main' },
      { subProjectId: brandString<'loom.subproject'>('api'), sourceId: brandString<'loom.source'>('service'), ref: 'release' },
    ])
    expect(version.targets?.map(target => target.subProjectId)).toEqual(['web', 'api'])
    await expect(catalog.createTask(version.id, 'Task', { workspaceId: brandString<'loom.workspace'>('missing') })).rejects.toThrow('missing_workspace')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

it('updates version targets when an edit changes selected sub-projects', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { createCatalog } = await import('../src/host/catalog.ts')
  const { brandString } = await import('@deepseek-ai/dsh-brand')
  const dir = await mkdtemp(join(tmpdir(), 'loom-update-'))
  try {
    const catalog = await createCatalog(join(dir, 'state.json'), async () => 'a'.repeat(40))
    const project = await catalog.createProject({
      name: 'Product',
      sources: [{ id: 'shop', repo: join(dir, 'shop'), path: 'shop' }, { id: 'service', repo: join(dir, 'service'), path: 'service' }],
      modules: [],
      subProjects: [
        { id: 'web', name: 'Web', sources: [{ id: 'shop', repo: join(dir, 'shop'), path: 'shop' }], modules: [] },
        { id: 'api', name: 'API', sources: [{ id: 'service', repo: join(dir, 'service'), path: 'service' }], modules: [] },
      ],
    })
    const version = await catalog.createVersion(project.id, 'v1', [
      { sourceId: brandString<'loom.source'>('shop'), ref: 'main' },
      { sourceId: brandString<'loom.source'>('service'), ref: 'main' },
    ], undefined, [
      { subProjectId: brandString<'loom.subproject'>('web'), sourceId: brandString<'loom.source'>('shop'), ref: 'main' },
      { subProjectId: brandString<'loom.subproject'>('api'), sourceId: brandString<'loom.source'>('service'), ref: 'main' },
    ])
    const updated = await catalog.updateVersion(version.id, 'v2', [{ sourceId: brandString<'loom.source'>('shop'), ref: 'release' }], undefined, [
      { subProjectId: brandString<'loom.subproject'>('web'), sourceId: brandString<'loom.source'>('shop'), ref: 'release' },
    ])
    expect(updated.targets).toEqual([{ subProjectId: 'web', sourceId: 'shop', ref: 'release' }])
  } finally { await rm(dir, { recursive: true, force: true }) }
})
