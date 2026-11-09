import { expect, it } from 'vitest'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { CreateVersionRequest, Lock, VersionRecord } from 'dsh-workloom/types'
import { createVersionAdoptingLinkedDirectory, createVersionReusingWorkspace, type CreateVersionReuseDeps } from '../../../src/client/features/version/create-version-reuse.ts'
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

it('creates normally when the linked directory is not registered yet', async () => {
  const host = deps()
  const outcome = await createVersionAdoptingLinkedDirectory({ ...host.deps, findWorkspace: () => undefined }, request, '/work/old')
  expect(outcome).toMatchObject({ ok: true })
  expect(host.order).toEqual(['create'])
})

it('adopts a registered direct directory instead of failing on the path rule', async () => {
  const calls: { readonly workspaces: unknown }[] = []
  let adopted = ''
  const host = {
    order: [] as string[],
    deps: {
      createVersion: async (input: CreateVersionRequest) => {
        calls.push({ workspaces: input.workspaces })
        host.order.push('create')
        if (calls.length === 1) return { ok: false as const, error: { code: 'loom/workspace_path_registered', message: 'workspace_path_registered: registered' } as never }
        return { ok: true as const, value: version }
      },
      generateLock: async () => { host.order.push('lock'); return { ok: true as const, value: { id: 'lock-new' } as Lock } },
      deleteVersion: async () => { host.order.push('delete'); return { ok: true as const, value: undefined } },
      reuse: async (_version: VersionRecord, _lockId: string, workspaceId: string) => { host.order.push('reuse'); adopted = workspaceId; return { ok: true as const, workspace: { id: 'ws-new' } as never } },
      findWorkspace: (rootPath: string) => rootPath === '/work/old' ? { id: 'ws-old' } : undefined,
    },
  }
  const outcome = await createVersionAdoptingLinkedDirectory(host.deps, request, '/work/old')
  expect(outcome).toMatchObject({ ok: true, version })
  expect(host.order).toEqual(['create', 'create', 'lock', 'reuse'])
  expect(calls[1]?.workspaces).toBeUndefined()
  expect(adopted).toBe('ws-old')
})

it('keeps the original failure when no registered workspace owns the directory', async () => {
  const host = deps({ create: { ok: false, error: { code: 'loom/workspace_path_registered', message: 'workspace_path_registered: registered' } as never } })
  const outcome = await createVersionAdoptingLinkedDirectory({ ...host.deps, findWorkspace: () => undefined }, request, '/work/old')
  expect(outcome).toMatchObject({ ok: false, code: 'loom/workspace_path_registered' })
  expect(host.order).toEqual(['create'])
})
