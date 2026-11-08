import { expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { ProjectRecord, VersionRecord } from 'dsh-workloom/types'
import { workspaceBranch, workspaceSourceGroups } from '../../../src/client/features/workspace/workspace-refs.ts'

const project: ProjectRecord = {
  id: brandString<'loom.project'>('p1'),
  config: {
    name: 'Shop',
    sources: [
      { id: brandString<'loom.source'>('web'), repo: '/repo/web', path: 'web' },
      { id: brandString<'loom.source'>('api'), repo: '/repo/api', path: 'api' },
    ],
    modules: [],
    subProjects: [
      { id: brandString<'loom.subproject'>('storefront'), name: 'Storefront', sources: [{ id: brandString<'loom.source'>('web'), repo: '/repo/web', path: 'web' }], modules: [] },
      { id: brandString<'loom.subproject'>('backend'), name: 'Backend', sources: [{ id: brandString<'loom.source'>('api'), repo: '/repo/api', path: 'api' }], modules: [] },
    ],
  },
}

it('groups a version workspace basis by every registered sub-project', () => {
  const version: VersionRecord = {
    id: brandString<'loom.version'>('v1'),
    projectId: project.id,
    name: 'v1',
    description: '',
    sources: [
      { sourceId: brandString<'loom.source'>('web'), ref: 'main' },
      { sourceId: brandString<'loom.source'>('api'), ref: 'feature/api' },
    ],
    targets: [
      { subProjectId: brandString<'loom.subproject'>('storefront'), sourceId: brandString<'loom.source'>('web'), ref: 'main' },
      { subProjectId: brandString<'loom.subproject'>('backend'), sourceId: brandString<'loom.source'>('api'), ref: 'feature/api' },
    ],
  }
  expect(workspaceSourceGroups(version, project)).toEqual([
    { subProject: 'Storefront', refs: [{ name: 'web', ref: 'main' }] },
    { subProject: 'Backend', refs: [{ name: 'api', ref: 'feature/api' }] },
  ])
})

it('infers sub-project membership for pre-V2 versions without targets', () => {
  const version: VersionRecord = {
    id: brandString<'loom.version'>('v2'),
    projectId: project.id,
    name: 'v2',
    description: '',
    sources: [
      { sourceId: brandString<'loom.source'>('web'), ref: 'main' },
      { sourceId: brandString<'loom.source'>('api'), ref: 'release' },
    ],
  }
  expect(workspaceSourceGroups(version, project)).toEqual([
    { subProject: 'Storefront', refs: [{ name: 'web', ref: 'main' }] },
    { subProject: 'Backend', refs: [{ name: 'api', ref: 'release' }] },
  ])
})


it('derives an ASCII Git branch from a non-ASCII workspace name', () => {
  const branch = workspaceBranch('loom_test', '测试工作区')
  expect(branch).toMatch(/^loom_test\/ws-[a-z0-9]+$/u)
  expect(workspaceBranch('loom_test', '测试工作区')).toBe(branch)
  expect(workspaceBranch('loom', 'race-condition')).toBe('loom/race-condition')
  expect(workspaceBranch('bad prefix', 'feature')).toBe('bad-prefix/feature')
  expect(workspaceBranch('loom_test', '测试工作区', 'feature-concurrency')).toBe('loom_test/feature-concurrency')
  expect(workspaceBranch('loom_test', '测试工作区', '中文覆盖')).toBe(branch)
})
