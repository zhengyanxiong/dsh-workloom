import { Context } from '@deepseek-ai/cordis'
import { Peer } from '@deepseek-ai/dsh-client-connection'
import Registry from '@deepseek-ai/dsh-typert-registry'
import Access from '@deepseek-ai/dsh-api-remote-access'
import Gateway from '@deepseek-ai/dsh-api-gateway'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readFile, rm, writeFile, mkdir, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import Schema from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-typert-protocol'
import Loom from '../src/index.ts'

declare module '@deepseek-ai/dsh-typert-protocol' { interface PrincipalMap { loomGuest: { kind: 'loomGuest' } } }
const contexts: Context[] = []
const dirs: string[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const dir of dirs.splice(0)) { if (!resolve(dir).startsWith(join(tmpdir(), 'loom-service-'))) throw Error('unsafe cleanup'); await rm(dir, { recursive: true, force: true }) }
})
async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'loom-service-')); dirs.push(dir)
  const ctx = new Context(); contexts.push(ctx)
  await ctx.plugin(Registry); await ctx.plugin(Access); await ctx.plugin(Gateway)
  const fiber = ctx.plugin(Loom, { catalogFile: join(dir, 'catalog.json') }); await fiber
  const peer = new Peer(ctx, { principal: { kind: 'owner' } })
  const call = (method: string, args: Record<string, unknown> = {}) => ctx.typertGateway.invoke({ namespace: 'loom', method, args, peer })
  return { ctx, call, fiber, dir }
}
it('creates durable catalog records through the real gateway', async () => {
  const { call } = await setup()
  const project = await call('createProject', { request: { name: 'Shop', sources: [{ id: 'web', repo: '/local/web', path: 'web' }], modules: [] } }) as { id: string }
  const version = await call('createVersion', { request: { projectId: project.id, name: 'v1', sources: [{ sourceId: 'web', ref: 'main' }] } }) as { id: string }
  await call('createTask', { request: { versionId: version.id, title: 'Checkout' } })
  expect(await call('snapshot')).toMatchObject({ projects: [{ id: project.id }], tasks: [{ title: 'Checkout', status: 'pending' }] })
})
it('edits catalog records through the real gateway', async () => {
  const { call } = await setup()
  const project = await call('createProject', { request: { name: 'Shop', sources: [{ id: 'web', repo: '/local/web', path: 'web' }], modules: [{ id: 'api', sourceId: 'web', path: 'src/api' }] } }) as { id: string }
  const version = await call('createVersion', { request: { projectId: project.id, name: 'v1', sources: [{ sourceId: 'web', ref: 'main' }] } }) as { id: string }
  const task = await call('createTask', { request: { versionId: version.id, title: 'Checkout' } }) as { id: string }
  const updatedProject = await call('updateProject', { request: { projectId: project.id, config: { name: 'Shop 2', sources: [{ id: 'web', repo: '/local/renamed', path: 'web' }], modules: [{ id: 'api', sourceId: 'web', path: 'src/api' }] } } }) as { config: { name: string } }
  const updatedVersion = await call('updateVersion', { request: { versionId: version.id, name: 'v2', sources: [{ sourceId: 'web', ref: 'release' }] } }) as { name: string }
  const updatedTask = await call('updateTask', { request: { taskId: task.id, title: 'Checkout 2', priority: 'high' } }) as { title: string; priority: string }
  expect(updatedProject.config.name).toBe('Shop 2')
  expect(updatedVersion.name).toBe('v2')
  expect(updatedTask).toMatchObject({ title: 'Checkout 2', priority: 'high' })
})

it('deletes catalog records through the real gateway', async () => {
  const { call } = await setup()
  const project = await call('createProject', { request: { name: 'Shop', sources: [{ id: 'web', repo: '/local/web', path: 'web' }], modules: [] } }) as { id: string }
  const version = await call('createVersion', { request: { projectId: project.id, name: 'v1', sources: [{ sourceId: 'web', ref: 'main' }] } }) as { id: string }
  const task = await call('createTask', { request: { versionId: version.id, title: 'Checkout' } }) as { id: string }
  await expect(call('deleteProject', { request: { projectId: project.id } })).rejects.toThrow('project_has_versions')
  await call('deleteTask', { request: { taskId: task.id } })
  await call('deleteVersion', { request: { versionId: version.id } })
  await call('deleteProject', { request: { projectId: project.id } })
  expect(await call('snapshot')).toMatchObject({ projects: [], versions: [], tasks: [] })
})

it('resolves exact Git commits through the Lock endpoint', async () => {
  const { call, dir } = await setup()
  const repo = join(dir, 'repo'); await mkdir(repo)
  const exec = promisify(execFile)
  await exec('git', ['init', '--quiet', repo])
  await writeFile(join(repo, 'file'), 'content')
  await exec('git', ['-C', repo, 'add', 'file'])
  await exec('git', ['-C', repo, '-c', 'user.name=Loom Test', '-c', 'user.email=loom@example.invalid', 'commit', '-qm', 'initial'])
  const project = await call('createProject', { request: { name: 'Git', sources: [{ id: 'web', repo, path: 'web' }], modules: [] } }) as { id: string }
  const version = await call('createVersion', { request: { projectId: project.id, name: 'v', sources: [{ sourceId: 'web', ref: 'HEAD' }] } }) as { id: string }
  const lock = await call('generateLock', { request: { versionId: version.id } })
  expect(lock).toMatchObject({ versionId: version.id, repositories: [{ sourceId: 'web', commit: (await exec('git', ['-C', repo, 'rev-parse', 'HEAD'])).stdout.trim() }] })
})
it('creates a missing catalog parent directory on init', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'loom-service-')); dirs.push(dir)
  const ctx = new Context(); contexts.push(ctx)
  await ctx.plugin(Registry); await ctx.plugin(Access); await ctx.plugin(Gateway)
  const file = join(dir, 'nested', 'deeper', 'catalog.json')
  await ctx.plugin(Loom, { catalogFile: file })
  const envelope = JSON.parse(await readFile(file, 'utf8')) as { schema: string; data: { projects: unknown[] } }
  expect(envelope).toMatchObject({ schema: 'loom-json-store', data: { projects: [] } })
})
it('materializes a workspace from a Lock through the gateway', async () => {
  const { call, dir } = await setup()
  const repo = join(dir, 'repo'); await mkdir(repo)
  const exec = promisify(execFile)
  await exec('git', ['init', '--quiet', repo])
  await writeFile(join(repo, 'file'), 'content')
  await exec('git', ['-C', repo, 'add', 'file'])
  await exec('git', ['-C', repo, '-c', 'user.name=Loom Test', '-c', 'user.email=loom@example.invalid', 'commit', '-qm', 'initial'])
  const project = await call('createProject', { request: { name: 'Git', sources: [{ id: 'web', repo, path: 'web' }], modules: [] } }) as { id: string }
  const version = await call('createVersion', { request: { projectId: project.id, name: 'v', sources: [{ sourceId: 'web', ref: 'HEAD' }] } }) as { id: string }
  const lock = await call('generateLock', { request: { versionId: version.id } }) as { id: string }
  const root = join(dir, 'workspace')
  const workspace = await call('prepareWorkspace', { request: { path: root, versionId: version.id, lockId: lock.id } }) as { id: string; path: string }
  expect(workspace.path).toBe(root)
  expect(await readFile(join(root, 'web', 'file'), 'utf8')).toBe('content')
  expect(await call('snapshot')).toMatchObject({ workspaces: [{ id: workspace.id, versionId: version.id, lockId: lock.id }] })
  expect(await call('registerTemporarySession', { request: { sessionId: 'session-temp', workspacePath: root } })).toMatchObject({ sessionId: 'session-temp', workspacePath: root })
  expect(await call('snapshot')).toMatchObject({ temporarySessions: [{ sessionId: 'session-temp', workspacePath: root }] })
  await call('forgetTemporarySession', { request: { sessionId: 'session-temp' } })
  expect(await call('snapshot')).toMatchObject({ temporarySessions: [] })
  await writeFile(join(root, 'web', 'file'), 'changed\nsecond\n')
  await writeFile(join(root, 'web', 'new.txt'), 'added\n')
  await writeFile(join(root, 'web', 'Loom上下文.md'), 'unicode path\n')
  const changes = await call('workspaceChanges', { request: { workspaceId: workspace.id } }) as { repositories: { files: { path: string; added: number; deleted: number; before: boolean; after: boolean; hunks: { lines: string[] }[] }[] }[] }
  const files = changes.repositories[0]!.files
  expect(files.map(file => file.path).sort((left, right) => left.localeCompare(right))).toEqual(['file', 'Loom上下文.md', 'new.txt'].sort((left, right) => left.localeCompare(right)))
  const changed = files.find(file => file.path === 'file')!
  expect(changed.added).toBe(2)
  expect(changed.deleted).toBe(1)
  expect(changed.before).toBe(true)
  expect(changed.after).toBe(true)
  expect(changed.hunks.flatMap(hunk => hunk.lines)).toContain('-content')
  expect(files.find(file => file.path === 'new.txt')).toMatchObject({ before: false, after: true })
  expect(files.find(file => file.path === 'new.txt')!.hunks[0]!.lines).toEqual(['+added'])
  expect(files.find(file => file.path === 'Loom上下文.md')).toMatchObject({ before: false, after: true })
  expect(await call('workspaceChangeCount', { request: { workspaceId: workspace.id } })).toBe(3)
  const status = await call('workspaceStatus', { request: { workspaceId: workspace.id } }) as { running: boolean; repositories: { files: unknown[] }[] }
  expect(status.running).toBe(false)
  expect(status.repositories[0]!.files).toHaveLength(3)
  await exec('git', ['-C', join(root, 'web'), 'checkout', '--', 'file'])
  await rm(join(root, 'web', 'new.txt'), { force: true })
  await rm(join(root, 'web', 'Loom上下文.md'), { force: true })
  const task = await call('createTask', { request: { versionId: version.id, title: 'Clean' } }) as { id: string }
  await call('startAttempt', { request: { taskId: task.id, workspaceId: workspace.id } })
  const execution = await call('acquireExecution', { request: { workspaceId: workspace.id, sessionId: 'session-owner' } }) as { owner: { generation: number } }
  await expect(call('cleanupWorkspace', { request: { workspaceId: workspace.id } })).rejects.toThrow('workspace_busy')
  await call('releaseExecution', { request: { workspaceId: workspace.id, sessionId: 'session-owner', generation: execution.owner.generation } })
  await writeFile(join(root, 'web', 'file'), 'changed again\n')
  await call('transitionTask', { request: { taskId: task.id, target: 'failed', actor: 'human' } })
  await expect(call('cleanupWorkspace', { request: { workspaceId: workspace.id } })).rejects.toThrow('workspace_changes')
  await rm(join(root, 'web', 'new.txt'), { force: true })
  await writeFile(join(root, 'web', 'file'), 'unpushed\n')
  await exec('git', ['-C', join(root, 'web'), 'add', 'file'])
  await exec('git', ['-C', join(root, 'web'), '-c', 'user.name=Loom Test', '-c', 'user.email=loom@example.invalid', 'commit', '-qm', 'unpushed'])
  await expect(call('cleanupWorkspace', { request: { workspaceId: workspace.id } })).rejects.toThrow('workspace_unpushed')
  await call('cleanupWorkspace', { request: { workspaceId: workspace.id, discardChanges: true } })
  expect(await call('snapshot')).toMatchObject({ workspaces: [{ id: workspace.id, cleaned: true }] })
  await expect(call('startAttempt', { request: { taskId: task.id, workspaceId: workspace.id } })).rejects.toThrow('workspace_cleaned')
  await expect(readFile(join(root, 'web', 'file'), 'utf8')).rejects.toThrow()
  const recreated = await call('prepareWorkspace', { request: { path: root, versionId: version.id, lockId: lock.id } }) as { id: string }
  await call('cleanupWorkspace', { request: { workspaceId: recreated.id, discardChanges: true } })
  await call('deleteTask', { request: { taskId: task.id } })
  expect(await call('snapshot')).toMatchObject({ tasks: [], workspaces: [] })
  await call('deleteVersion', { request: { versionId: version.id } })
  await call('deleteProject', { request: { projectId: project.id } })
  expect(await call('snapshot')).toMatchObject({ projects: [], versions: [], locks: [], tasks: [], workspaces: [] })
})
it('inspects an existing Git workspace, lists branches and registers it without a default branch', async () => {
  const { call, dir } = await setup()
  const repo = join(dir, 'repo'); await mkdir(repo)
  const exec = promisify(execFile)
  await exec('git', ['init', '--quiet', repo])
  await writeFile(join(repo, 'file'), 'content')
  await exec('git', ['-C', repo, 'add', 'file'])
  await exec('git', ['-C', repo, '-c', 'user.name=Loom Test', '-c', 'user.email=loom@example.invalid', 'commit', '-qm', 'initial'])
  await exec('git', ['-C', repo, 'branch', 'feature/start'])
  const existing = join(dir, 'existing'); await mkdir(existing)
  await exec('git', ['-C', repo, 'worktree', 'add', '--quiet', join(existing, 'web'), 'feature/start'])
  const project = await call('createProject', { request: { name: 'Existing', sources: [{ id: 'web', repo, path: 'web' }], modules: [] } }) as { id: string }
  const version = await call('createVersion', { request: { projectId: project.id, name: 'v', sources: [{ sourceId: 'web', ref: 'feature/start' }] } }) as { id: string }
  const lock = await call('generateLock', { request: { versionId: version.id } }) as { id: string }
  expect(await call('repositoryBranches', { request: { repo } })).toMatchObject({ branches: expect.arrayContaining(['feature/start']), current: expect.any(String) })
  const inspection = await call('inspectWorkspace', { request: { path: existing, versionId: version.id } }) as { repositories: { sourceId: string; current?: string; error?: string }[] }
  expect(inspection.repositories[0]).toMatchObject({ sourceId: 'web', current: 'feature/start' })
  const workspace = await call('registerWorkspace', { request: { path: existing, versionId: version.id, lockId: lock.id } }) as { id: string; path: string; branches?: Record<string, string> }
  expect(workspace.path).toBe(existing)
  expect(workspace.branches).toEqual({ web: 'feature/start' })
  const again = await call('registerWorkspace', { request: { path: existing, versionId: version.id, lockId: lock.id } }) as { id: string }
  expect(again.id).toBe(workspace.id)
  const task = await call('createTask', { request: { versionId: version.id, title: 'Existing' } }) as { id: string }
  await writeFile(join(existing, 'web', 'dirty.txt'), 'dirty\n')
  await expect(call('startAttempt', { request: { taskId: task.id, workspaceId: workspace.id } })).rejects.toThrow('workspace_changes')
  await rm(join(existing, 'web', 'dirty.txt'))
  await writeFile(join(existing, 'web', 'committed.txt'), 'committed\n')
  await exec('git', ['-C', join(existing, 'web'), 'add', 'committed.txt'])
  await exec('git', ['-C', join(existing, 'web'), '-c', 'user.name=Loom Test', '-c', 'user.email=loom@example.invalid', 'commit', '-qm', 'committed'])
  const started = await call('startAttempt', { request: { taskId: task.id, workspaceId: workspace.id } }) as { attempts: unknown[] }
  expect(started.attempts).toHaveLength(1)
  const notGit = join(dir, 'not-git'); await mkdir(notGit)
  await expect(call('registerWorkspace', { request: { path: notGit, versionId: version.id, lockId: lock.id } })).rejects.toThrow('invalid_workspace_path')
})
it('creates its own isolated workspace when the request omits a path', async () => {
  const { call, dir } = await setup()
  const repo = join(dir, 'repo'); await mkdir(repo)
  const exec = promisify(execFile)
  await exec('git', ['init', '--quiet', repo])
  await writeFile(join(repo, 'file'), 'content')
  await exec('git', ['-C', repo, 'add', 'file'])
  await exec('git', ['-C', repo, '-c', 'user.name=Loom Test', '-c', 'user.email=loom@example.invalid', 'commit', '-qm', 'initial'])
  const project = await call('createProject', { request: { name: 'Auto', sources: [{ id: 'web', repo, path: 'web' }], modules: [] } }) as { id: string }
  const version = await call('createVersion', { request: { projectId: project.id, name: 'v', sources: [{ sourceId: 'web', ref: 'HEAD' }] } }) as { id: string }
  const lock = await call('generateLock', { request: { versionId: version.id } }) as { id: string }
  const workspace = await call('prepareWorkspace', { request: { versionId: version.id, lockId: lock.id } }) as { id: string; path: string }
  expect(workspace.path.startsWith(join(dir, 'workspaces', 'workspace-'))).toBe(true)
  expect(await readFile(join(workspace.path, 'web', 'file'), 'utf8')).toBe('content')
})
it('refuses stale direct service references after disposal', async () => {
  const { ctx, fiber } = await setup()
  const stale = ctx.loom
  await fiber.dispose()
  expect(() => stale.snapshot()).toThrow('owner_required')
})
it('rejects malformed wire payloads without publishing', async () => {
  const { call } = await setup()
  await expect(call('createProject', { request: { name: 'bad', sources: [], modules: [], extra: true } })).rejects.toThrow()
  await expect(call('createTask', { request: { versionId: 12, title: 'x' } })).rejects.toThrow()
  expect(await call('snapshot')).toMatchObject({ projects: [], tasks: [] })
})
it('denies a non-owner even if a global policy grants its endpoint', async () => {
  const { ctx } = await setup()
  ctx.remoteAccess.registerPolicy('loomGuest', { bindings: () => [{ resource: { kind: 'global' }, role: { name: 'test', resource: 'global', actions: ['loom/snapshot'] } }] })
  const peer = new Peer(ctx, { principal: { kind: 'loomGuest' } })
  await expect(ctx.typertGateway.invoke({ namespace: 'loom', method: 'snapshot', args: {}, peer })).rejects.toThrow('owner_required')
})
it('withdraws the service on disposal', async () => {
  const { ctx, call, fiber } = await setup()
  await fiber.dispose()
  expect(ctx.get('loom')).toBeUndefined()
  await expect(call('snapshot')).rejects.toThrow()
})
it('requires an explicit absolute catalog file', () => {
  expect(() => Loom.Config({ catalogFile: 'relative.json' })).toThrow()
  expect(() => Schema.resolve({}, Loom.Config, {})).toThrow()
})
it('runs a task round through a prepared workspace, Session association, review and human completion', async () => {
  const { call, dir } = await setup()
  const repo = join(dir, 'repo'); await mkdir(repo)
  const exec = promisify(execFile)
  await exec('git', ['init', '--quiet', repo])
  await writeFile(join(repo, 'file'), 'content')
  await exec('git', ['-C', repo, 'add', 'file'])
  await exec('git', ['-C', repo, '-c', 'user.name=Loom Test', '-c', 'user.email=loom@example.invalid', 'commit', '-qm', 'initial'])
  const project = await call('createProject', { request: { name: 'Closed loop', sources: [{ id: 'web', repo, path: 'web' }], modules: [] } }) as { id: string }
  const version = await call('createVersion', { request: { projectId: project.id, name: 'v', sources: [{ sourceId: 'web', ref: 'HEAD' }] } }) as { id: string }
  const lock = await call('generateLock', { request: { versionId: version.id } }) as { id: string }
  const task = await call('createTask', { request: { versionId: version.id, title: 'Checkout' } }) as { id: string }
  const workspace = await call('prepareWorkspace', { request: { path: join(dir, 'ws'), versionId: version.id, lockId: lock.id, branches: { web: 'loom/v1/web-test0001' } } }) as { id: string }
  const started = await call('startAttempt', { request: { taskId: task.id, workspaceId: workspace.id } }) as { status: string; attempts: { workspaceId: string; lock: { id: string }; sessionIds: string[] }[] }
  expect(started).toMatchObject({ status: 'running', attempts: [{ workspaceId: workspace.id, lock: { id: lock.id }, sessionIds: [] }] })
  const attached = await call('attachSession', { request: { taskId: task.id, sessionId: 'session-1' } }) as { attempts: { sessionIds: string[] }[] }
  expect(attached).toMatchObject({ attempts: [{ sessionIds: ['session-1'] }] })
  await expect(call('transitionTask', { request: { taskId: task.id, target: 'completed', actor: 'agent' } })).rejects.toThrow()
  expect(await call('transitionTask', { request: { taskId: task.id, target: 'review', actor: 'agent' } })).toMatchObject({ status: 'review' })
  expect(await call('transitionTask', { request: { taskId: task.id, target: 'completed', actor: 'human' } })).toMatchObject({ status: 'completed', attempts: [{ status: 'completed' }] })
  expect(await call('snapshot')).toMatchObject({ workspaces: [{ id: workspace.id }], tasks: [{ id: task.id, status: 'completed' }] })
})

it('exposes execution acquisition, blocked handoff and release through the gateway', async () => {
  const { call, dir } = await setup()
  const repo = join(dir, 'repo'); await mkdir(repo)
  const exec = promisify(execFile)
  await exec('git', ['init', '--quiet', repo])
  await writeFile(join(repo, 'file'), 'content')
  await exec('git', ['-C', repo, 'add', 'file'])
  await exec('git', ['-C', repo, '-c', 'user.name=Loom Test', '-c', 'user.email=loom@example.invalid', 'commit', '-qm', 'initial'])
  const project = await call('createProject', { request: { name: 'Git', sources: [{ id: 'web', repo, path: 'web' }], modules: [] } }) as { id: string }
  const version = await call('createVersion', { request: { projectId: project.id, name: 'v', sources: [{ sourceId: 'web', ref: 'HEAD' }] } }) as { id: string }
  const lock = await call('generateLock', { request: { versionId: version.id } }) as { id: string }
  const workspace = await call('prepareWorkspace', { request: { path: join(dir, 'workspace'), versionId: version.id, lockId: lock.id, branches: { web: 'loom/v1/web-test0001' } } }) as { id: string }
  const first = await call('acquireExecution', { request: { workspaceId: workspace.id, sessionId: 'session-a' } }) as { owner: { sessionId: string; generation: number }; waiting: string[] }
  expect(first.owner.sessionId).toBe('session-a')
  const second = await call('acquireExecution', { request: { workspaceId: workspace.id, sessionId: 'session-b' } }) as { owner: { sessionId: string }; waiting: string[] }
  expect(second.owner.sessionId).toBe('session-a')
  expect(second.waiting).toEqual(['session-b'])
  const released = await call('releaseExecution', { request: { workspaceId: workspace.id, sessionId: 'session-a', generation: first.owner.generation } }) as { owner: { sessionId: string; generation: number } }
  expect(released.owner.sessionId).toBe('session-b')
  const takeover = await call('takeoverExecution', { request: { workspaceId: workspace.id, sessionId: 'session-a' } }) as { owner: { sessionId: string }; takeover: { stopStatus: string } }
  expect(takeover.owner.sessionId).toBe('session-b')
  expect(takeover.takeover.stopStatus).toBe('unknown')
  expect((await call('snapshot') as { audit: { event: string }[] }).audit.map(entry => entry.event)).toEqual(expect.arrayContaining(['execution.acquired', 'execution.queued', 'execution.takeover-requested', 'execution.takeover-blocked', 'execution.released']))
})

it('claims a free workspace as soon as its bound Session starts running', async () => {
  const { ctx, call, dir } = await setup()
  const repo = join(dir, 'repo'); await mkdir(repo)
  const exec = promisify(execFile)
  await exec('git', ['init', '--quiet', repo])
  await writeFile(join(repo, 'file'), 'content')
  await exec('git', ['-C', repo, 'add', 'file'])
  await exec('git', ['-C', repo, '-c', 'user.name=Loom Test', '-c', 'user.email=loom@example.invalid', 'commit', '-qm', 'initial'])
  const project = await call('createProject', { request: { name: 'Git', sources: [{ id: 'web', repo, path: 'web' }], modules: [] } }) as { id: string }
  const version = await call('createVersion', { request: { projectId: project.id, name: 'v', sources: [{ sourceId: 'web', ref: 'HEAD' }] } }) as { id: string }
  const lock = await call('generateLock', { request: { versionId: version.id } }) as { id: string }
  const task = await call('createTask', { request: { versionId: version.id, title: 'Checkout' } }) as { id: string }
  const workspace = await call('prepareWorkspace', { request: { path: join(dir, 'workspace'), versionId: version.id, lockId: lock.id, branches: { web: 'loom/v1/web-test0001' } } }) as { id: string }
  await call('startAttempt', { request: { taskId: task.id, workspaceId: workspace.id } })
  await call('attachSession', { request: { taskId: task.id, sessionId: 'session-live' } })
  const owner = async (): Promise<string | null> => {
    const snapshot = await call('snapshot') as { executions: { workspaceId: string; owner: { sessionId: string } | null }[] }
    return snapshot.executions.find(execution => execution.workspaceId === workspace.id)?.owner?.sessionId ?? null
  }
  ctx.emit('agent/status', { agent: { session: { id: 'session-live' } }, status: 'running' } as never)
  let current = await owner()
  for (let attempt = 0; attempt < 100 && current === null; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 20))
    current = await owner()
  }
  expect(current).toBe('session-live')
  // Execution rights are Session-scoped: idling between turns keeps the owner.
  ctx.emit('agent/status', { agent: { session: { id: 'session-live' } }, status: 'idle' } as never)
  await new Promise(resolve => setTimeout(resolve, 60))
  expect(await owner()).toBe('session-live')
  // A running turn never preempts a workspace that already has an owner.
  await call('attachSession', { request: { taskId: task.id, sessionId: 'session-late' } })
  ctx.emit('agent/status', { agent: { session: { id: 'session-late' } }, status: 'running' } as never)
  await new Promise(resolve => setTimeout(resolve, 60))
  expect(await owner()).toBe('session-live')
  // Disposing the owner releases the workspace and promotes the queue head.
  await call('acquireExecution', { request: { workspaceId: workspace.id, sessionId: 'session-late' } })
  ctx.emit('session/disposed', { id: 'session-live' } as never)
  let promoted: string | null = null
  for (let attempt = 0; attempt < 100 && promoted !== 'session-late'; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 20))
    promoted = await owner()
  }
  expect(promoted).toBe('session-late')
})

it('marks linked sessions with full access and gives the Agent the repository map', async () => {
  const { ctx, call, dir } = await setup()
  const exec = promisify(execFile)
  const repo = join(dir, 'repo'); await mkdir(repo)
  await exec('git', ['init', '--quiet', repo])
  await writeFile(join(repo, 'file'), 'content')
  await exec('git', ['-C', repo, 'add', 'file'])
  await exec('git', ['-C', repo, '-c', 'user.name=Loom Test', '-c', 'user.email=loom@example.invalid', 'commit', '-qm', 'initial'])
  const project = await call('createProject', { request: { name: 'Linked', sources: [{ id: 'back', repo, path: 'back' }], modules: [] } }) as { id: string }
  const version = await call('createVersion', { request: { projectId: project.id, name: 'v', sources: [{ sourceId: 'back', ref: 'HEAD' }] } }) as { id: string }
  const lock = await call('generateLock', { request: { versionId: version.id } }) as { id: string }
  const workspace = await call('prepareWorkspace', { request: { path: join(dir, 'linked'), versionId: version.id, lockId: lock.id, mode: 'linked', repositories: [{ sourceId: 'back', path: 'back', targetPath: repo }] } }) as { path: string }
  const events: unknown[] = []
  ctx.emit('session/created', { header: { cwd: workspace.path }, append: (type: string, data: unknown) => { events.push([type, data]) } } as never)
  expect(events).toEqual([['sandbox/mode', { mode: 'danger-full-access' }]])
  const contexts: { text: string }[] = []
  ctx.emit('agent/created', { agent: { session: { header: { cwd: workspace.path } }, ctx: { get: (name: string) => name === 'systemPrompt' ? { context: (context: { text: string }) => { contexts.push(context) } } : undefined } } } as never)
  expect(contexts[0]?.text).toContain(repo)
  expect(contexts[0]?.text).toContain('back')
  expect(contexts[0]?.text).toContain('native session skill catalog')
  expect(contexts[0]?.text).not.toContain('read the relevant SKILL.md directly')
})

it('persists version descriptions and mutation timestamps through the gateway', async () => {
  const { call, dir } = await setup()
  const repo = join(dir, 'repo'); await mkdir(repo)
  const exec = promisify(execFile)
  await exec('git', ['init', '--quiet', repo])
  await writeFile(join(repo, 'file'), 'content')
  await exec('git', ['-C', repo, 'add', 'file'])
  await exec('git', ['-C', repo, '-c', 'user.name=Loom Test', '-c', 'user.email=loom@example.invalid', 'commit', '-qm', 'initial'])
  const project = await call('createProject', { request: { name: 'Shop', sources: [{ id: 'web', repo, path: 'web' }], modules: [] } }) as { id: string }
  const version = await call('createVersion', { request: { projectId: project.id, name: 'v1', description: '目标：分页修复', sources: [{ sourceId: 'web', ref: 'HEAD' }] } }) as { id: string; description: string }
  expect(version.description).toBe('目标：分页修复')
  // Older clients omit the field and must not erase the stored description.
  const renamed = await call('updateVersion', { request: { versionId: version.id, name: 'v2', sources: [{ sourceId: 'web', ref: 'HEAD' }] } }) as { name: string; description: string }
  expect(renamed).toMatchObject({ name: 'v2', description: '目标：分页修复' })
  const cleared = await call('updateVersion', { request: { versionId: version.id, name: 'v3', description: '', sources: [{ sourceId: 'web', ref: 'HEAD' }] } }) as { description: string }
  expect(cleared.description).toBe('')
  await expect(call('updateVersion', { request: { versionId: version.id, name: 'v4', description: 'x'.repeat(2001), sources: [{ sourceId: 'web', ref: 'HEAD' }] } })).rejects.toThrow()
  const lock = await call('generateLock', { request: { versionId: version.id } }) as { id: string; createdAt?: string }
  expect(lock.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u)
  const task = await call('createTask', { request: { versionId: version.id, title: 'Checkout' } }) as { id: string; updatedAt?: string }
  expect(task.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u)
  await new Promise(resolve => setTimeout(resolve, 5))
  const edited = await call('updateTask', { request: { taskId: task.id, title: 'Checkout 2' } }) as { updatedAt?: string }
  expect(edited.updatedAt! > task.updatedAt!).toBe(true)
  const snapshot = await call('snapshot') as {
    versions: { id: string; description: string }[]
    locks: { id: string; createdAt?: string }[]
    tasks: { id: string; updatedAt?: string }[]
  }
  expect(snapshot.versions.find(candidate => candidate.id === version.id)?.description).toBe('')
  expect(snapshot.locks.find(candidate => candidate.id === lock.id)?.createdAt).toBe(lock.createdAt)
  expect(snapshot.tasks.find(candidate => candidate.id === task.id)?.updatedAt).toBe(edited.updatedAt)
})

/** Await a gateway call that must reject and return the rejection for message assertions. */
async function rejection(call: Promise<unknown>): Promise<Error> {
  try { await call } catch (error) { return error as Error }
  throw new Error('expected the call to reject')
}

/** Prepare a real managed workspace and a running round for execution-gate tests. */
async function runningRound(call: (method: string, args?: Record<string, unknown>) => Promise<unknown>, dir: string) {
  const repo = join(dir, 'gate-repo'); await mkdir(repo)
  const exec = promisify(execFile)
  await exec('git', ['init', '--quiet', repo])
  await writeFile(join(repo, 'file'), 'content')
  await exec('git', ['-C', repo, 'add', 'file'])
  await exec('git', ['-C', repo, '-c', 'user.name=Loom Test', '-c', 'user.email=loom@example.invalid', 'commit', '-qm', 'initial'])
  const project = await call('createProject', { request: { name: 'Gate', sources: [{ id: 'web', repo, path: 'web' }], modules: [] } }) as { id: string }
  const version = await call('createVersion', { request: { projectId: project.id, name: 'v', sources: [{ sourceId: 'web', ref: 'HEAD' }] } }) as { id: string }
  const lock = await call('generateLock', { request: { versionId: version.id } }) as { id: string }
  const root = join(dir, 'gate-workspace')
  const workspace = await call('prepareWorkspace', { request: { path: root, versionId: version.id, lockId: lock.id } }) as { id: string; path: string }
  const task = await call('createTask', { request: { versionId: version.id, title: 'Gate' } }) as { id: string }
  await call('startAttempt', { request: { taskId: task.id, workspaceId: workspace.id } })
  const attached = await call('attachSession', { request: { taskId: task.id, sessionId: 'session-bound' } }) as { id: string }
  return { workspace, task: attached, root }
}

it('leaves an unbound native Session unmanaged and admits the attached Session', async () => {
  const { ctx, call, dir } = await setup()
  const { workspace, root } = await runningRound(call, dir)
  const gate = (sessionId: string | undefined) => ctx.waterfall(
    'tools/pre-execute',
    (sessionId === undefined ? {} : { agent: { session: { id: sessionId, header: { cwd: root } } } }) as never,
    () => Promise.resolve(undefined as never),
  )
  // A native Session whose cwd happens to be a workspace is not part of Loom.
  await expect(gate('session-stranger')).resolves.toBeUndefined()
  await expect(gate('session-bound')).resolves.toBeUndefined()
  const snapshot = await call('snapshot') as { executions: { workspaceId: string; owner: { sessionId: string } | null }[] }
  expect(snapshot.executions.find(execution => execution.workspaceId === workspace.id)?.owner?.sessionId).toBe('session-bound')
  // A call without an owning Agent is not a Loom write and stays untouched.
  await expect(gate(undefined)).resolves.toBeUndefined()
})

it('gives temporary Sessions execution rights and releases them when forgotten', async () => {
  const { ctx, call, dir } = await setup()
  const { workspace, root } = await runningRound(call, dir)
  await call('registerTemporarySession', { request: { sessionId: 'session-temp-a', workspacePath: root } })
  await call('registerTemporarySession', { request: { sessionId: 'session-temp-b', workspacePath: root } })
  const gate = (sessionId: string) => ctx.waterfall(
    'tools/pre-execute',
    { agent: { session: { id: sessionId, header: { cwd: root } } } } as never,
    () => Promise.resolve(undefined as never),
  )
  await expect(gate('session-temp-a')).resolves.toBeUndefined()
  const queued = await gate('session-temp-b') as { kind: string; reason: string }
  expect(queued.kind).toBe('deny')
  expect(queued.reason).toContain('queued')
  await call('forgetTemporarySession', { request: { sessionId: 'session-temp-a' } })
  await expect(gate('session-temp-b')).resolves.toBeUndefined()
  const snapshot = await call('snapshot') as { executions: { workspaceId: string; owner: { sessionId: string } | null; waiting: string[] }[] }
  expect(snapshot.executions.find(execution => execution.workspaceId === workspace.id)).toMatchObject({ owner: { sessionId: 'session-temp-b' }, waiting: [] })
  await call('forgetTemporarySession', { request: { sessionId: 'session-temp-b' } })
  // Once forgotten, the Session is a plain native Session and leaves Loom's
  // execution model entirely; it must not keep or re-acquire ownership.
  await expect(gate('session-temp-b')).resolves.toBeUndefined()
  const released = await call('snapshot') as { executions: { workspaceId: string; owner: unknown }[] }
  expect(released.executions.find(execution => execution.workspaceId === workspace.id)?.owner).toBeNull()
})

it('names the concrete blocker when cleanup is refused through the Remote', async () => {
  const { call, dir } = await setup()
  const { workspace, task } = await runningRound(call, dir)
  const blockedByTask = await rejection(call('cleanupWorkspace', { request: { workspaceId: workspace.id } }))
  expect(blockedByTask.message).toContain('workspace_task_running')
  expect(blockedByTask.message).toContain(task.id)
  const execution = await call('acquireExecution', { request: { workspaceId: workspace.id, sessionId: 'session-owner' } }) as { owner: { generation: number } }
  await call('transitionTask', { request: { taskId: task.id, target: 'failed', actor: 'human' } })
  const blockedByOwner = await rejection(call('cleanupWorkspace', { request: { workspaceId: workspace.id, discardChanges: true } }))
  expect(blockedByOwner.message).toContain('workspace_busy')
  expect(blockedByOwner.message).toContain('session-owner')
  await call('releaseExecution', { request: { workspaceId: workspace.id, sessionId: 'session-owner', generation: execution.owner.generation } })
  await expect(call('cleanupWorkspace', { request: { workspaceId: workspace.id, discardChanges: true } })).resolves.toBeUndefined()
  expect(await call('snapshot')).toMatchObject({ workspaces: [{ id: workspace.id, cleaned: true }] })
})

it('creates a version with sub-project targets through the gateway', async () => {
  const { call } = await setup()
  const project = await call('createProject', { request: {
    name: 'Product',
    sources: [{ id: 'shop', repo: '/local/shop', path: 'shop' }, { id: 'service', repo: '/local/service', path: 'service' }],
    modules: [],
    subProjects: [
      { id: 'web', name: 'Web', sources: [{ id: 'shop', repo: '/local/shop', path: 'shop' }], modules: [] },
      { id: 'api', name: 'API', sources: [{ id: 'service', repo: '/local/service', path: 'service' }], modules: [] },
    ],
  } }) as { id: string }
  const version = await call('createVersion', { request: {
    projectId: project.id, name: 'v1',
    sources: [{ sourceId: 'shop', ref: 'main' }, { sourceId: 'service', ref: 'release' }],
    targets: [
      { subProjectId: 'web', sourceId: 'shop', ref: 'main' },
      { subProjectId: 'api', sourceId: 'service', ref: 'release' },
    ],
  } }) as { id: string; targets: { subProjectId: string }[] }
  expect(version.targets.map(target => target.subProjectId)).toEqual(['web', 'api'])
  await expect(call('createTask', { request: { versionId: version.id, workspaceId: 'missing', title: 'Checkout' } })).rejects.toThrow('missing_workspace')
})

it('creates a version Lock and an auto workspace in one save', async () => {
  const { call, dir } = await setup()
  const exec = promisify(execFile)
  const makeRepo = async (name: string, file: string): Promise<string> => {
    const repo = join(dir, name); await mkdir(repo)
    await exec('git', ['init', '--quiet', repo])
    await writeFile(join(repo, file), name)
    await exec('git', ['-C', repo, 'add', file])
    await exec('git', ['-C', repo, '-c', 'user.name=Loom Test', '-c', 'user.email=loom@example.invalid', 'commit', '-qm', 'initial'])
    return repo
  }
  const shop = await makeRepo('shop', 'shop.txt')
  const service = await makeRepo('service', 'service.txt')
  const project = await call('createProject', { request: {
    name: 'Product',
    sources: [{ id: 'shop', repo: shop, path: 'shop' }, { id: 'service', repo: service, path: 'service' }],
    modules: [],
    subProjects: [
      { id: 'web', name: 'Web', sources: [{ id: 'shop', repo: shop, path: 'shop' }], modules: [] },
      { id: 'api', name: 'API', sources: [{ id: 'service', repo: service, path: 'service' }], modules: [] },
    ],
  } }) as { id: string }
  const version = await call('createVersion', { request: {
    projectId: project.id, name: 'v1',
    sources: [{ sourceId: 'shop', ref: 'HEAD' }, { sourceId: 'service', ref: 'HEAD' }],
    targets: [
      { subProjectId: 'web', sourceId: 'shop', ref: 'HEAD' },
      { subProjectId: 'api', sourceId: 'service', ref: 'HEAD' },
    ],
    workspaces: [{ mode: 'auto', parentPath: dir, name: 'v1-auto' }],
  } }) as { id: string }
  const snapshot = await call('snapshot') as { locks: { versionId: string }[]; workspaces: { versionId: string; preparation?: { status: string }; repositories?: { path: string; targetPath: string }[] }[] }
  expect(snapshot.locks).toHaveLength(1)
  expect(snapshot.workspaces[0]).toMatchObject({
    versionId: version.id,
    preparation: { status: 'ready' },
    repositories: [
      { path: 'web/shop', targetPath: join(dir, 'v1-auto', 'web', 'shop') },
      { path: 'api/service', targetPath: join(dir, 'v1-auto', 'api', 'service') },
    ],
  })
  const branch = (await exec('git', ['-C', join(dir, 'v1-auto', 'web', 'shop'), 'branch', '--show-current'])).stdout.trim()
  expect(branch).toBe('loom/v1-auto')
})

it('binds existing git directories as a linked version workspace and rejects detached HEAD', async () => {
  const { call, dir } = await setup()
  const exec = promisify(execFile)
  const makeRepo = async (name: string): Promise<string> => {
    const repo = join(dir, name); await mkdir(repo)
    await exec('git', ['init', '--quiet', repo])
    await writeFile(join(repo, 'file.txt'), name)
    await exec('git', ['-C', repo, 'add', 'file.txt'])
    await exec('git', ['-C', repo, '-c', 'user.name=Loom Test', '-c', 'user.email=loom@example.invalid', 'commit', '-qm', 'initial'])
    return repo
  }
  const shop = await makeRepo('shop')
  const serviceRepo = await makeRepo('service')
  const project = await call('createProject', { request: {
    name: 'Product',
    sources: [{ id: 'shop', repo: shop, path: 'web' }, { id: 'service', repo: serviceRepo, path: 'api' }],
    modules: [],
    subProjects: [
      { id: 'web', name: 'Web', sources: [{ id: 'shop', repo: shop, path: 'web' }], modules: [] },
      { id: 'api', name: 'API', sources: [{ id: 'service', repo: serviceRepo, path: 'api' }], modules: [] },
    ],
  } }) as { id: string }
  const version = await call('createVersion', { request: {
    projectId: project.id, name: 'linked',
    sources: [{ sourceId: 'shop', ref: 'HEAD' }, { sourceId: 'service', ref: 'HEAD' }],
    targets: [
      { subProjectId: 'web', sourceId: 'shop', ref: 'HEAD' },
      { subProjectId: 'api', sourceId: 'service', ref: 'HEAD' },
    ],
    workspaces: [{ mode: 'linked', rootPath: dir, repositories: [{ sourceId: 'shop', targetPath: shop }, { sourceId: 'service', targetPath: serviceRepo }] }],
  } }) as { id: string }
  const snapshot = await call('snapshot') as { workspaces: { id: string; mode: string; versionId: string; branches?: Record<string, string> }[] }
  expect(snapshot.workspaces[0]).toMatchObject({ mode: 'direct', versionId: version.id })

  await exec('git', ['-C', serviceRepo, 'checkout', '--quiet', '--detach', 'HEAD'])
  await expect(call('createVersion', { request: {
    projectId: project.id, name: 'detached',
    sources: [{ sourceId: 'shop', ref: 'HEAD' }, { sourceId: 'service', ref: 'HEAD' }],
    targets: [
      { subProjectId: 'web', sourceId: 'shop', ref: 'HEAD' },
      { subProjectId: 'api', sourceId: 'service', ref: 'HEAD' },
    ],
    workspaces: [{ mode: 'linked', rootPath: dir, repositories: [{ sourceId: 'shop', targetPath: shop }, { sourceId: 'service', targetPath: serviceRepo }] }],
  } })).rejects.toThrow('detached_head')
})

it('rolls back a version created with an invalid workspace name', async () => {
  const { call, dir } = await setup()
  const exec = promisify(execFile)
  const repo = join(dir, 'repo'); await mkdir(repo)
  await exec('git', ['init', '--quiet', repo])
  await writeFile(join(repo, 'file.txt'), 'x')
  await exec('git', ['-C', repo, 'add', 'file.txt'])
  await exec('git', ['-C', repo, '-c', 'user.name=Loom Test', '-c', 'user.email=loom@example.invalid', 'commit', '-qm', 'initial'])
  const project = await call('createProject', { request: { name: 'P', sources: [{ id: 'repo', repo, path: 'repo' }], modules: [] } }) as { id: string }
  await expect(call('createVersion', { request: {
    projectId: project.id, name: 'bad', sources: [{ sourceId: 'repo', ref: 'HEAD' }],
    workspaces: [{ mode: 'auto', parentPath: dir, name: 'bad/name' }],
  } })).rejects.toThrow()
  const snapshot = await call('snapshot') as { versions: unknown[]; locks: unknown[]; workspaces: unknown[] }
  expect(snapshot.versions).toHaveLength(0)
  expect(snapshot.locks).toHaveLength(0)
  expect(snapshot.workspaces).toHaveLength(0)
})

it('rejects a version when its workspace preparation fails and removes the partial records', async () => {
  const { call, dir } = await setup()
  const exec = promisify(execFile)
  const repo = join(dir, 'repo'); await mkdir(repo)
  await exec('git', ['init', '--quiet', repo])
  await writeFile(join(repo, 'file.txt'), 'x')
  await exec('git', ['-C', repo, 'add', 'file.txt'])
  await exec('git', ['-C', repo, '-c', 'user.name=Loom Test', '-c', 'user.email=loom@example.invalid', 'commit', '-qm', 'initial'])
  const project = await call('createProject', { request: { name: 'P', sources: [{ id: 'repo', repo, path: 'repo' }], modules: [] } }) as { id: string }
  const occupied = join(dir, 'occupied'); await mkdir(occupied); await writeFile(join(occupied, 'busy.txt'), 'busy')
  await expect(call('createVersion', { request: {
    projectId: project.id, name: 'bad-workspace', sources: [{ sourceId: 'repo', ref: 'HEAD' }],
    workspaces: [{ mode: 'auto', parentPath: dir, name: 'occupied' }],
  } })).rejects.toThrow()
  const snapshot = await call('snapshot') as { versions: unknown[]; locks: unknown[]; workspaces: unknown[] }
  expect(snapshot.versions).toHaveLength(0)
  expect(snapshot.locks).toHaveLength(0)
  expect(snapshot.workspaces).toHaveLength(0)
})

it('rejects a missing workspace parent before writing any catalog record', async () => {
  const { call, dir } = await setup()
  const exec = promisify(execFile)
  const repo = join(dir, 'repo'); await mkdir(repo)
  await exec('git', ['init', '--quiet', repo])
  await writeFile(join(repo, 'file.txt'), 'x')
  await exec('git', ['-C', repo, 'add', 'file.txt'])
  await exec('git', ['-C', repo, '-c', 'user.name=Loom Test', '-c', 'user.email=loom@example.invalid', 'commit', '-qm', 'initial'])
  const project = await call('createProject', { request: { name: 'P', sources: [{ id: 'repo', repo, path: 'repo' }], modules: [] } }) as { id: string }
  await expect(call('createVersion', { request: {
    projectId: project.id, name: 'missing-parent', sources: [{ sourceId: 'repo', ref: 'HEAD' }],
    workspaces: [{ mode: 'auto', parentPath: join(dir, 'missing', 'nested'), name: 'ws' }],
  } })).rejects.toThrow('workspace_parent_missing')
  const snapshot = await call('snapshot') as { versions: unknown[]; locks: unknown[]; workspaces: unknown[] }
  expect(snapshot.versions).toHaveLength(0)
  expect(snapshot.locks).toHaveLength(0)
  expect(snapshot.workspaces).toHaveLength(0)
})

it('reads status for a legacy direct workspace whose Lock predates a repository', async () => {
  const { call, dir } = await setup()
  const exec = promisify(execFile)
  const alpha = join(dir, 'alpha'); await mkdir(alpha)
  const beta = join(dir, 'beta'); await mkdir(beta)
  for (const repo of [alpha, beta]) {
    await exec('git', ['init', '--quiet', repo])
    await writeFile(join(repo, 'file.txt'), `${repo}\n`)
    await exec('git', ['-C', repo, 'add', 'file.txt'])
    await exec('git', ['-C', repo, '-c', 'user.name=Loom Test', '-c', 'user.email=loom@example.invalid', 'commit', '-qm', 'initial'])
  }
  const project = await call('createProject', { request: { name: 'Legacy', sources: [{ id: 'alpha', repo: alpha, path: 'alpha' }], modules: [] } }) as { id: string }
  const version = await call('createVersion', { request: { projectId: project.id, name: 'v', sources: [{ sourceId: 'alpha', ref: 'HEAD' }] } }) as { id: string }
  const oldLock = await call('generateLock', { request: { versionId: version.id } }) as { id: string }
  await call('updateProject', { request: { projectId: project.id, config: { name: 'Legacy', sources: [{ id: 'alpha', repo: alpha, path: 'alpha' }, { id: 'beta', repo: beta, path: 'beta' }], modules: [] } } })
  await call('updateVersion', { request: { versionId: version.id, name: 'v', sources: [{ sourceId: 'alpha', ref: 'HEAD' }, { sourceId: 'beta', ref: 'HEAD' }] } })
  await call('generateLock', { request: { versionId: version.id } })
  const root = join(dir, 'direct'); await mkdir(root)
  await symlink(alpha, join(root, 'alpha'))
  await symlink(beta, join(root, 'beta'))
  const workspace = await call('registerWorkspace', { request: {
    path: root, versionId: version.id, lockId: oldLock.id, mode: 'direct',
    repositories: [
      { sourceId: 'alpha', path: 'alpha', targetPath: join(root, 'alpha') },
      { sourceId: 'beta', path: 'beta', targetPath: join(root, 'beta') },
    ],
  } }) as { id: string }
  const status = await call('workspaceStatus', { request: { workspaceId: workspace.id } }) as { repositories: { directory: string }[] }
  expect(status.repositories.map(repository => repository.directory).sort()).toEqual([join(root, 'alpha'), join(root, 'beta')])
})

it('reads workspace status when the Git diff exceeds the default child-process buffer', async () => {
  const { call, dir } = await setup()
  const exec = promisify(execFile)
  const repo = join(dir, 'big'); await mkdir(repo)
  await exec('git', ['init', '--quiet', repo])
  await writeFile(join(repo, 'big.txt'), 'one line\n')
  await exec('git', ['-C', repo, 'add', 'big.txt'])
  await exec('git', ['-C', repo, '-c', 'user.name=Loom Test', '-c', 'user.email=loom@example.invalid', 'commit', '-qm', 'initial'])
  const project = await call('createProject', { request: { name: 'Big', sources: [{ id: 'web', repo, path: 'web' }], modules: [] } }) as { id: string }
  const version = await call('createVersion', { request: { projectId: project.id, name: 'v', sources: [{ sourceId: 'web', ref: 'HEAD' }] } }) as { id: string }
  const lock = await call('generateLock', { request: { versionId: version.id } }) as { id: string }
  const root = join(dir, 'big-workspace')
  const workspace = await call('prepareWorkspace', { request: { path: root, versionId: version.id, lockId: lock.id } }) as { id: string }
  await writeFile(join(root, 'web', 'big.txt'), `${'changed line\n'.repeat(200_000)}`)
  const status = await call('workspaceStatus', { request: { workspaceId: workspace.id } }) as { repositories: { files: unknown[] }[] }
  expect(status.repositories[0]!.files.length).toBeGreaterThan(0)
})

it('lets a waiting Session leave the execution queue without touching the owner', async () => {
  const { call, dir } = await setup()
  const { workspace } = await runningRound(call, dir)
  await call('acquireExecution', { request: { workspaceId: workspace.id, sessionId: 'session-owner' } })
  await call('acquireExecution', { request: { workspaceId: workspace.id, sessionId: 'session-waiting' } })
  let state = (await call('snapshot') as { executions: { workspaceId: string; owner: { sessionId: string } | null; waiting: string[] }[] }).executions.find(execution => execution.workspaceId === workspace.id)
  expect(state).toMatchObject({ owner: { sessionId: 'session-owner' }, waiting: ['session-waiting'] })
  await call('cancelExecution', { request: { workspaceId: workspace.id, sessionId: 'session-waiting' } })
  state = (await call('snapshot') as { executions: { workspaceId: string; owner: { sessionId: string } | null; waiting: string[] }[] }).executions.find(execution => execution.workspaceId === workspace.id)
  expect(state).toMatchObject({ owner: { sessionId: 'session-owner' }, waiting: [] })
})

it('reorders the waiting queue and rejects a mismatched Session set', async () => {
  const { call, dir } = await setup()
  const { workspace } = await runningRound(call, dir)
  await call('acquireExecution', { request: { workspaceId: workspace.id, sessionId: 'session-owner' } })
  await call('acquireExecution', { request: { workspaceId: workspace.id, sessionId: 'session-a' } })
  await call('acquireExecution', { request: { workspaceId: workspace.id, sessionId: 'session-b' } })
  await call('reorderExecutionQueue', { request: { workspaceId: workspace.id, sessionIds: ['session-b', 'session-a'] } })
  const state = (await call('snapshot') as { executions: { workspaceId: string; waiting: string[] }[] }).executions.find(execution => execution.workspaceId === workspace.id)
  expect(state?.waiting).toEqual(['session-b', 'session-a'])
  await expect(call('reorderExecutionQueue', { request: { workspaceId: workspace.id, sessionIds: ['session-b'] } })).rejects.toThrow('invalid_waiting_order')
})

it('requires approval before the Agent takeover tool reaches the Host', async () => {
  const { ctx, call, dir } = await setup()
  const { root } = await runningRound(call, dir)
  const decision = await ctx.waterfall(
    'tools/pre-execute',
    { name: 'loom_request_takeover', agent: { session: { id: 'session-bound', header: { cwd: root } } } } as never,
    () => Promise.resolve(undefined as never),
  ) as { kind: string; displayReason?: { en?: string } }
  expect(decision.kind).toBe('ask')
  expect(decision.displayReason?.en).toContain('take over')
})

it('cleans a workspace after its Lock advances past the preparation baseline', async () => {
  const { call, dir } = await setup()
  const repo = join(dir, 'repo'); await mkdir(repo)
  const exec = promisify(execFile)
  await exec('git', ['init', '--quiet', '--initial-branch=main', repo])
  await writeFile(join(repo, 'file'), 'main\n')
  await exec('git', ['-C', repo, 'add', 'file'])
  await exec('git', ['-C', repo, '-c', 'user.name=Loom Test', '-c', 'user.email=loom@example.invalid', 'commit', '-qm', 'main'])
  await exec('git', ['-C', repo, 'checkout', '-q', '-b', 'feature'])
  await writeFile(join(repo, 'file'), 'feature\n')
  await exec('git', ['-C', repo, '-c', 'user.name=Loom Test', '-c', 'user.email=loom@example.invalid', 'commit', '-qam', 'feature'])
  await exec('git', ['-C', repo, 'checkout', '-q', 'main'])
  const project = await call('createProject', { request: { name: 'Git', sources: [{ id: 'web', repo, path: 'web' }], modules: [] } }) as { id: string }
  const version = await call('createVersion', { request: { projectId: project.id, name: 'v', sources: [{ sourceId: 'web', ref: 'feature' }] } }) as { id: string }
  const firstLock = await call('generateLock', { request: { versionId: version.id } }) as { id: string }
  const root = join(dir, 'workspace')
  const workspace = await call('prepareWorkspace', { request: { path: root, versionId: version.id, lockId: firstLock.id } }) as { id: string }
  await call('updateVersion', { request: { versionId: version.id, name: 'v', sources: [{ sourceId: 'web', ref: 'main' }] } })
  await call('generateLock', { request: { versionId: version.id } })
  await expect(call('cleanupWorkspace', { request: { workspaceId: workspace.id } })).resolves.toBeUndefined()
  expect(await call('snapshot')).toMatchObject({ workspaces: [] })
  await expect(readFile(join(root, 'web', 'file'), 'utf8')).rejects.toThrow()
})

it('extends a managed workspace with a repository the version gained before it starts', async () => {
  const { call, dir } = await setup()
  const exec = promisify(execFile)
  const commitRepo = async (name: string): Promise<string> => {
    const repo = join(dir, name)
    await mkdir(repo)
    await exec('git', ['init', '--quiet', repo])
    await writeFile(join(repo, 'file'), `${name}\n`)
    await exec('git', ['-C', repo, 'add', 'file'])
    await exec('git', ['-C', repo, '-c', 'user.name=Loom Test', '-c', 'user.email=loom@example.invalid', 'commit', '-qm', 'initial'])
    return repo
  }
  const web = await commitRepo('web')
  const api = await commitRepo('api')
  const project = await call('createProject', { request: { name: 'Grow', sources: [{ id: 'web', repo: web, path: 'web' }, { id: 'api', repo: api, path: 'api' }], modules: [] } }) as { id: string }
  const version = await call('createVersion', { request: { projectId: project.id, name: 'v1', sources: [{ sourceId: 'web', ref: 'HEAD' }] } }) as { id: string }
  const firstLock = await call('generateLock', { request: { versionId: version.id } }) as { id: string }
  const root = join(dir, 'workspace')
  await call('prepareWorkspace', { request: { path: root, versionId: version.id, lockId: firstLock.id } })
  await call('updateVersion', { request: { versionId: version.id, name: 'v1', sources: [{ sourceId: 'web', ref: 'HEAD' }, { sourceId: 'api', ref: 'HEAD' }] } })
  await call('generateLock', { request: { versionId: version.id } })
  const task = await call('createTask', { request: { versionId: version.id, title: 'Touch both repos' } }) as { id: string }
  const workspace = await call('snapshot').then(snapshot => (snapshot as { workspaces: { id: string }[] }).workspaces[0]!)
  const started = await call('startAttempt', { request: { taskId: task.id, workspaceId: workspace.id } }) as { status: string }
  expect(started.status).toBe('running')
  expect(await readFile(join(root, 'api', 'file'), 'utf8')).toBe('api\n')
  const snapshot = await call('snapshot') as { workspaces: { repositories: { sourceId: string }[]; lockId: string }[] }
  expect(snapshot.workspaces[0]!.repositories.map(repository => repository.sourceId).sort()).toEqual(['api', 'web'])
})

it('refuses a direct workspace that cannot map every repository and reports a lagging Lock', async () => {
  const { call, dir } = await setup()
  const exec = promisify(execFile)
  const commitRepo = async (name: string): Promise<string> => {
    const repo = join(dir, name)
    await mkdir(repo)
    await exec('git', ['init', '--quiet', repo])
    await writeFile(join(repo, 'file'), `${name}\n`)
    await exec('git', ['-C', repo, 'add', 'file'])
    await exec('git', ['-C', repo, '-c', 'user.name=Loom Test', '-c', 'user.email=loom@example.invalid', 'commit', '-qm', 'initial'])
    return repo
  }
  const web = await commitRepo('web')
  const api = await commitRepo('api')
  const project = await call('createProject', { request: { name: 'Direct', sources: [{ id: 'web', repo: web, path: 'web' }, { id: 'api', repo: api, path: 'api' }], modules: [{ id: 'api-module', sourceId: 'api', path: 'src' }] } }) as { id: string }
  const version = await call('createVersion', { request: { projectId: project.id, name: 'v1', sources: [{ sourceId: 'web', ref: 'HEAD' }] } }) as { id: string }
  const firstLock = await call('generateLock', { request: { versionId: version.id } }) as { id: string }
  const existing = join(dir, 'existing')
  await mkdir(existing)
  await exec('git', ['-C', web, 'worktree', 'add', '--quiet', join(existing, 'web'), 'HEAD'])
  const direct = await call('registerWorkspace', { request: { path: existing, versionId: version.id, lockId: firstLock.id, mode: 'direct', repositories: [{ sourceId: 'web', path: 'web', targetPath: join(existing, 'web') }] } }) as { id: string }
  // The version Lock has not resolved the module's repository yet, so no
  // workspace can cover it and the round must name the version problem.
  const laggingTask = await call('createTask', { request: { versionId: version.id, title: 'Needs module', moduleIds: ['api-module'] } }) as { id: string }
  await expect(call('startAttempt', { request: { taskId: laggingTask.id, workspaceId: direct.id } })).rejects.toThrow('version_lagging')
  await call('updateVersion', { request: { versionId: version.id, name: 'v1', sources: [{ sourceId: 'web', ref: 'HEAD' }, { sourceId: 'api', ref: 'HEAD' }] } })
  await call('generateLock', { request: { versionId: version.id } })
  const needsApi = await call('createTask', { request: { versionId: version.id, title: 'Needs api' } }) as { id: string }
  await expect(call('startAttempt', { request: { taskId: needsApi.id, workspaceId: direct.id } })).rejects.toThrow('workspace_incomplete')
})

it('retires a direct workspace and re-registers its directories for another version', async () => {
  const { call, dir } = await setup()
  const exec = promisify(execFile)
  const repo = join(dir, 'repo'); await mkdir(repo)
  await exec('git', ['init', '--quiet', repo])
  await writeFile(join(repo, 'file'), 'content\n')
  await exec('git', ['-C', repo, 'add', 'file'])
  await exec('git', ['-C', repo, '-c', 'user.name=Loom Test', '-c', 'user.email=loom@example.invalid', 'commit', '-qm', 'initial'])
  const project = await call('createProject', { request: { name: 'Reuse', sources: [{ id: 'web', repo, path: 'web' }], modules: [] } }) as { id: string }
  const oldVersion = await call('createVersion', { request: { projectId: project.id, name: 'v1', sources: [{ sourceId: 'web', ref: 'HEAD' }] } }) as { id: string }
  const newVersion = await call('createVersion', { request: { projectId: project.id, name: 'v2', sources: [{ sourceId: 'web', ref: 'HEAD' }] } }) as { id: string }
  const oldLock = await call('generateLock', { request: { versionId: oldVersion.id } }) as { id: string }
  const newLock = await call('generateLock', { request: { versionId: newVersion.id } }) as { id: string }
  const existing = join(dir, 'existing'); await mkdir(existing)
  await exec('git', ['-C', repo, 'worktree', 'add', '--quiet', join(existing, 'web'), 'HEAD'])
  const first = await call('registerWorkspace', { request: { path: existing, versionId: oldVersion.id, lockId: oldLock.id } }) as { id: string }
  const task = await call('createTask', { request: { versionId: oldVersion.id, title: 'Old round', workspaceId: first.id } }) as { id: string }
  await call('startAttempt', { request: { taskId: task.id, workspaceId: first.id } })
  await call('transitionTask', { request: { taskId: task.id, target: 'review', actor: 'human' } })
  await call('transitionTask', { request: { taskId: task.id, target: 'completed', actor: 'human' } })
  await call('cleanupWorkspace', { request: { workspaceId: first.id } })
  const reused = await call('registerWorkspace', { request: { path: existing, rootPath: existing, versionId: newVersion.id, lockId: newLock.id, mode: 'direct', rootOwner: 'user', repositories: [{ sourceId: 'web', path: 'web', targetPath: join(existing, 'web') }] } }) as { id: string; versionId: string }
  expect(reused.id).not.toBe(first.id)
  expect(reused.versionId).toBe(newVersion.id)
  const snapshot = await call('snapshot') as { workspaces: { id: string; versionId: string; cleaned?: boolean }[] }
  expect(snapshot.workspaces.find(workspace => workspace.id === first.id)).toMatchObject({ cleaned: true })
  expect(snapshot.workspaces.find(workspace => workspace.id === reused.id)).toMatchObject({ versionId: newVersion.id })
})
