import { expect, it } from 'vitest'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { CreateVersionRequest, Lock, VersionRecord } from 'dsh-workloom/types'
import { createVersionReusingWorkspace, type CreateVersionReuseDeps } from '../../../src/client/features/version/create-version-reuse.ts'
import type { ReuseWorkspaceOutcome } from '../../../src/client/features/version/reuse-workspace.ts'

const version = { id: 'v-new', projectId: 'p1', name: 'v2', description: '', sources: [] } as unknown as VersionRecord
const request: CreateVersionRequest = { projectId: 'p1', name: 'v2', sources: [{ sourceId: 'web', ref: 'main' }], workspaces: [{ mode: 'auto', parentPath: '/w', name: 'x' }] }

function deps(overrides: {
  readonly create?: RemoteResult<VersionRecord>
  readonly lock?: RemoteResult<Lock>
  readonly deleteVersion?: RemoteResult<void>
  readonly reuse?: ReuseWorkspaceOutcome
} = {}): { readonly deps: CreateVersionReuseDeps; readonly order: string[]; readonly created: CreateVersionRequest[] } {
  const order: string[] = []
  const created: CreateVersionRequest[] = []
  return {
    order,
    created,
    deps: {
      createVersion: async (input) => { order.push('create'); created.push(input); return overrides.create ?? { ok: true, value: version } },
      generateLock: async () => { order.push('lock'); return overrides.lock ?? { ok: true, value: { id: 'lock-new' } as Lock } },
      deleteVersion: async () => { order.push('delete'); return overrides.deleteVersion ?? { ok: true, value: undefined } },
      reuse: async () => { order.push('reuse'); return overrides.reuse ?? { ok: true, workspace: { id: 'ws-old' } as never } },
    },
  }
}

it('creates the version without workspace drafts, locks it, then binds the reused workspace', async () => {
  const host = deps()
  const outcome = await createVersionReusingWorkspace(host.deps, request, 'ws-old')
  expect(outcome).toEqual({ ok: true, version })
  expect(host.order).toEqual(['create', 'lock', 'reuse'])
  expect(host.created[0]?.workspaces).toBeUndefined()
  expect(host.created[0]).toMatchObject({ name: 'v2', sources: [{ sourceId: 'web', ref: 'main' }] })
})

it('returns the creation failure without touching anything else', async () => {
  const host = deps({ create: { ok: false, error: { code: 'invalid_version', message: 'bad' } as never } })
  expect(await createVersionReusingWorkspace(host.deps, request, 'ws-old')).toMatchObject({ ok: false, code: 'invalid_version' })
  expect(host.order).toEqual(['create'])
})

it('removes the half-created version when the Lock or the reuse fails', async () => {
  const lock = deps({ lock: { ok: false, error: { code: 'invalid_commit', message: 'no ref' } as never } })
  expect(await createVersionReusingWorkspace(lock.deps, request, 'ws-old')).toMatchObject({ ok: false, code: 'invalid_commit' })
  expect(lock.order).toEqual(['create', 'lock', 'delete'])
  const reuse = deps({ reuse: { ok: false, code: 'workspace_changes', message: 'dirty', stage: 'check' } })
  expect(await createVersionReusingWorkspace(reuse.deps, request, 'ws-old')).toMatchObject({ ok: false, code: 'workspace_changes' })
  expect(reuse.order).toEqual(['create', 'lock', 'reuse', 'delete'])
})

it('reports a rollback failure beside the original failure', async () => {
  const host = deps({
    reuse: { ok: false, code: 'workspace_changes', message: 'dirty', stage: 'check' },
    deleteVersion: { ok: false, error: { code: 'version_has_tasks', message: 'busy' } as never },
  })
  expect(await createVersionReusingWorkspace(host.deps, request, 'ws-old')).toMatchObject({ ok: false, code: 'workspace_changes', rollbackError: 'busy' })
})
