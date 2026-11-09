import { expect, it } from 'vitest'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { WorkspaceRecord, WorkspaceStatusResult, WorkspaceStatusRepository } from 'dsh-workloom/types'
import { reuseWorkspace, type ReuseWorkspaceDeps } from '../../../src/client/features/version/reuse-workspace.ts'

const workspace = {
  id: 'ws-old',
  path: '/work/old',
  rootPath: '/work/old',
  versionId: 'v-old',
  projectId: 'p1',
  repositories: [
    { sourceId: 'web', path: 'web', targetPath: '/work/old/web', kind: 'direct' as const },
    { sourceId: 'api', path: 'api', targetPath: '/work/old/api', kind: 'direct' as const },
  ],
}

function deps(overrides: {
  readonly running?: boolean
  readonly dirty?: boolean
  readonly cleanup?: RemoteResult<void>
  readonly registered?: RemoteResult<WorkspaceRecord>
} = {}): { readonly deps: ReuseWorkspaceDeps; readonly order: string[]; readonly register: Record<string, unknown> | undefined } {
  const order: string[] = []
  let register: Record<string, unknown> | undefined
  const clean: WorkspaceStatusRepository = { repo: 'web', directory: '/work/old/web', files: [] }
  const status: RemoteResult<WorkspaceStatusResult> = {
    ok: true,
    value: {
      running: overrides.running ?? false,
      repositories: overrides.dirty === true ? [{ ...clean, files: [{ path: 'a.txt', added: 1, deleted: 0, binary: false, before: false, after: true, hunks: [] }] }] : [clean],
    },
  }
  return {
    order,
    get register() { return register },
    deps: {
      workspaceStatus: async () => { order.push('status'); return status },
      cleanupWorkspace: async () => { order.push('cleanup'); return overrides.cleanup ?? { ok: true, value: undefined } },
      registerWorkspace: async (request) => {
        order.push('register')
        register = request as unknown as Record<string, unknown>
        return overrides.registered ?? { ok: true, value: { id: 'ws-new' } as WorkspaceRecord }
      },
    },
  }
}

const input = { workspace, versionId: 'v-new', projectId: 'p1', lockId: 'lock-new' }

it('refuses to reuse a running, dirty, same-version or mapping-less workspace', async () => {
  const running = deps({ running: true })
  expect(await reuseWorkspace(running.deps, input)).toMatchObject({ ok: false, code: 'workspace_busy' })
  expect(running.order).toEqual(['status'])
  const dirty = deps({ dirty: true })
  expect(await reuseWorkspace(dirty.deps, input)).toMatchObject({ ok: false, code: 'workspace_changes' })
  expect(dirty.order).toEqual(['status'])
  const sameVersion = deps()
  expect(await reuseWorkspace(sameVersion.deps, { ...input, versionId: 'v-old' })).toMatchObject({ ok: false, code: 'workspace_mismatch' })
  expect(sameVersion.order).toEqual([])
  const mappingless = deps()
  expect(await reuseWorkspace(mappingless.deps, { ...input, workspace: { ...workspace, repositories: undefined } })).toMatchObject({ ok: false, code: 'workspace_mismatch' })
})

it('retires the old record before registering the same directories for the new version', async () => {
  const host = deps()
  const result = await reuseWorkspace(host.deps, input)
  expect(result).toMatchObject({ ok: true, workspace: { id: 'ws-new' } })
  expect(host.order).toEqual(['status', 'cleanup', 'register'])
  expect(host.register).toMatchObject({
    path: '/work/old',
    rootPath: '/work/old',
    versionId: 'v-new',
    lockId: 'lock-new',
    mode: 'direct',
    rootOwner: 'user',
    projectId: 'p1',
    repositories: [
      { sourceId: 'web', path: 'web', targetPath: '/work/old/web' },
      { sourceId: 'api', path: 'api', targetPath: '/work/old/api' },
    ],
  })
})

it('re-registers a cleaned direct workspace without status or cleanup calls', async () => {
  const host = deps()
  const result = await reuseWorkspace(host.deps, { ...input, workspace: { ...workspace, cleaned: true } })
  expect(result).toMatchObject({ ok: true })
  expect(host.order).toEqual(['register'])
  expect(host.register).toMatchObject({ versionId: 'v-new', lockId: 'lock-new', repositories: expect.arrayContaining([expect.objectContaining({ sourceId: 'web' })]) })
})

it('stops when cleanup or re-registration fails, without inventing a record', async () => {
  const cleanup = deps({ cleanup: { ok: false, error: { code: 'workspace_task_running', message: 'busy' } as never } })
  expect(await reuseWorkspace(cleanup.deps, input)).toMatchObject({ ok: false, code: 'workspace_task_running' })
  expect(cleanup.order).toEqual(['status', 'cleanup'])
  const register = deps({ registered: { ok: false, error: { code: 'invalid_workspace_path', message: 'nope' } as never } })
  expect(await reuseWorkspace(register.deps, input)).toMatchObject({ ok: false, code: 'invalid_workspace_path' })
  expect(register.order).toEqual(['status', 'cleanup', 'register'])
})
