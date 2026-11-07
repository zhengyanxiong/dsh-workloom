import { expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SourceConfig, SubProjectConfig } from '../../../src/domain/project.ts'
import { resolveLock } from '../../../src/domain/version.ts'

const source = (id: string, repo: string): SourceConfig => ({ id: brandString<SourceConfig['id']>(id), repo, path: id })
const sub = (id: string, sources: SourceConfig[]): SubProjectConfig => ({
  id: brandString<SubProjectConfig['id']>(id), name: id, sources, modules: [],
})
const project = {
  name: 'Product',
  sources: [source('web', '/repos/web'), source('api', '/repos/api')],
  modules: [],
  subProjects: [sub('frontend', [source('web', '/repos/web')]), sub('backend', [source('api', '/repos/api')])],
}

it('resolves a version across sub-projects and records each sub-project in the Lock', async () => {
  const lock = await resolveLock(project, {
    id: 'v1', sources: [],
    targets: [
      { subProjectId: brandString<'loom.subproject'>('frontend'), sourceId: brandString<'loom.source'>('web'), ref: 'main' },
      { subProjectId: brandString<'loom.subproject'>('backend'), sourceId: brandString<'loom.source'>('api'), ref: 'release/1.0' },
    ],
  }, 'l1', async (_repo, ref) => ref === 'main' ? 'a'.repeat(40) : 'b'.repeat(40))
  expect(lock.repositories).toEqual([
    { sourceId: 'web', commit: 'a'.repeat(40), subProjectId: 'frontend' },
    { sourceId: 'api', commit: 'b'.repeat(40), subProjectId: 'backend' },
  ])
})

it('rejects an unknown sub-project target', async () => {
  await expect(resolveLock(project, {
    id: 'v1', sources: [],
    targets: [{ subProjectId: brandString<'loom.subproject'>('missing'), sourceId: brandString<'loom.source'>('web'), ref: 'main' }],
  }, 'l1', async () => 'a'.repeat(40))).rejects.toThrow('unknown_subproject')
})

it('rejects a source that belongs to another sub-project', async () => {
  await expect(resolveLock(project, {
    id: 'v1', sources: [],
    targets: [{ subProjectId: brandString<'loom.subproject'>('frontend'), sourceId: brandString<'loom.source'>('api'), ref: 'main' }],
  }, 'l1', async () => 'a'.repeat(40))).rejects.toThrow('unknown_source')
})

it('keeps pre-V2 source resolution unchanged', async () => {
  const lock = await resolveLock(project, { id: 'v1', sources: [{ sourceId: brandString<'loom.source'>('web'), ref: 'main' }] }, 'l1', async () => 'a'.repeat(40))
  expect(lock.repositories).toEqual([{ sourceId: 'web', commit: 'a'.repeat(40) }])
})
