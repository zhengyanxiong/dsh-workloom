import { expect, it } from 'vitest'
import { registerDirectoryWorkspace } from '../../../src/client/features/workspace/register-directory.ts'
import type { ProjectRecord, WorkspaceRecord } from '../../../src/domain/index.ts'
import { brandString } from '@deepseek-ai/dsh-brand'

const project = {
  id: brandString<'loom.project'>('p'),
  config: { name: 'Shop', sources: [{ id: 'web', repo: '/repo/web', path: 'web' }], modules: [] },
} as unknown as ProjectRecord
const workspace = { id: 'w', rootPath: '/repo', path: '/repo' } as unknown as WorkspaceRecord

it('registers a directory whose project sub-repositories inspect cleanly', async () => {
  const calls: unknown[] = []
  const outcome = await registerDirectoryWorkspace({
    inspectWorkspace: async () => ({ ok: true, value: { path: '/repo', repositories: [{ sourceId: 'web', repo: '/repo/web', directory: '/repo/web', branches: ['main'], current: 'main' }] } }) as never,
    registerWorkspace: async request => { calls.push(request); return { ok: true, value: workspace } as never },
    repositoryBranches: async () => ({ ok: false, error: { code: 'unused', message: '' } } as never),
  }, { path: '/repo', versionId: 'v', lockId: 'l', project })
  expect(outcome).toMatchObject({ ok: true })
  expect(calls).toEqual([{ path: '/repo', versionId: 'v', lockId: 'l', mode: 'direct' }])
})

it('maps the directory itself for a single-repository project', async () => {
  const calls: unknown[] = []
  const outcome = await registerDirectoryWorkspace({
    inspectWorkspace: async () => ({ ok: true, value: { path: '/repo/web', repositories: [{ sourceId: 'web', repo: '/repo/web', directory: '/repo/web/web', branches: [], error: 'not_git' }] } }) as never,
    registerWorkspace: async request => { calls.push(request); return { ok: true, value: workspace } as never },
    repositoryBranches: async () => ({ ok: true, value: { topLevel: '/repo/web', branches: ['main'], current: 'main' } }) as never,
  }, { path: '/repo/web', versionId: 'v', lockId: 'l', project })
  expect(outcome).toMatchObject({ ok: true })
  expect(calls).toEqual([{
    path: '/repo/web', versionId: 'v', lockId: 'l', mode: 'direct',
    repositories: [{ sourceId: 'web', path: '.', targetPath: '/repo/web' }],
  }])
})

it('reports a missing sub-repository in a multi-repository project', async () => {
  const multi = {
    id: brandString<'loom.project'>('p'),
    config: { name: 'Shop', sources: [{ id: 'web', repo: '/repo/web', path: 'web' }, { id: 'api', repo: '/repo/api', path: 'api' }], modules: [] },
  } as unknown as ProjectRecord
  const outcome = await registerDirectoryWorkspace({
    inspectWorkspace: async () => ({ ok: true, value: { path: '/repo', repositories: [
      { sourceId: 'web', repo: '/repo/web', directory: '/repo/web', branches: ['main'], current: 'main' },
      { sourceId: 'api', repo: '/repo/api', directory: '/repo/api', branches: [], error: 'not_git' },
    ] } }) as never,
    registerWorkspace: async () => { throw new Error('must not register') },
    repositoryBranches: async () => ({ ok: false, error: { code: 'unused', message: '' } } as never),
  }, { path: '/repo', versionId: 'v', lockId: 'l', project: multi })
  expect(outcome.ok).toBe(false)
  if (!outcome.ok) expect(outcome.error.detail).toContain('/repo/api')
})
