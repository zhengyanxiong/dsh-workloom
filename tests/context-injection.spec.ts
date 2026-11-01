import { Context } from '@deepseek-ai/cordis'
import { Peer } from '@deepseek-ai/dsh-client-connection'
import Registry from '@deepseek-ai/dsh-typert-registry'
import Access from '@deepseek-ai/dsh-api-remote-access'
import Gateway from '@deepseek-ai/dsh-api-gateway'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import Loom from '../src/index.ts'
import type { ContextConfig } from '../src/host/service.ts'

const contexts: Context[] = []
const dirs: string[] = []
const exec = promisify(execFile)

afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const dir of dirs.splice(0)) {
    if (!resolve(dir).startsWith(join(tmpdir(), 'loom-context-'))) throw Error('unsafe cleanup')
    await rm(dir, { recursive: true, force: true })
  }
})

/** One registration captured from a fake Agent's `systemPrompt` service. */
interface CapturedContext {
  readonly name: string
  readonly order?: number
  readonly required?: boolean
  readonly interpolate?: boolean
  readonly text: string | (() => string)
}

/** Fake Agent seeded into the `agents` registry and emitted through `agent/created`. */
interface FakeAgent {
  readonly session: { readonly id: string; readonly header: { readonly cwd: string } }
  readonly status: 'idle'
  readonly cancel: () => void
  readonly ctx: { readonly get: (name: string) => unknown }
}

async function setup(options: { context?: ContextConfig } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'loom-context-')); dirs.push(dir)
  const ctx = new Context(); contexts.push(ctx)
  await ctx.plugin(Registry); await ctx.plugin(Access); await ctx.plugin(Gateway)
  const agents = new Map<string, FakeAgent>()
  ctx.provide('agents', {
    get: (sessionId: string) => agents.get(sessionId),
    list: () => [...agents.values()],
  } as never)
  await ctx.plugin(Loom, { catalogFile: join(dir, 'catalog.json'), ...(options.context === undefined ? {} : { context: options.context }) })
  const peer = new Peer(ctx, { principal: { kind: 'owner' } })
  const call = (method: string, args: Record<string, unknown> = {}) => ctx.typertGateway.invoke({ namespace: 'loom', method, args, peer })
  /** Create a fake Agent and emit the native creation event; returns its captured contexts. */
  const createAgent = (sessionId: string, cwd: string, prompt = true): CapturedContext[] => {
    const captured: CapturedContext[] = []
    const agent: FakeAgent = {
      session: { id: sessionId, header: { cwd } },
      status: 'idle',
      cancel: () => {},
      ctx: {
        get: (name: string) => name === 'systemPrompt' && prompt
          ? {
            context: (entry: CapturedContext) => {
              captured.push(entry)
              return () => {
                const index = captured.indexOf(entry)
                if (index >= 0) captured.splice(index, 1)
              }
            },
          }
          : undefined,
      },
    }
    agents.set(sessionId, agent)
    ctx.emit('agent/created', { agent } as never)
    return captured
  }
  return { ctx, call, dir, agents, createAgent }
}

/** Real Git repository so Lock resolution and managed workspaces exercise the Host paths. */
async function repository(dir: string, suffix: string): Promise<string> {
  const repo = join(dir, `repo-${suffix}`); await mkdir(repo)
  await exec('git', ['init', '--quiet', repo])
  await writeFile(join(repo, 'file'), 'content')
  await exec('git', ['-C', repo, 'add', 'file'])
  await exec('git', ['-C', repo, '-c', 'user.name=Loom Test', '-c', 'user.email=loom@example.invalid', 'commit', '-qm', 'initial'])
  return repo
}

/** Project, version, task, workspace and attempt bound to one Session. */
async function boundTask(
  call: (method: string, args?: Record<string, unknown>) => Promise<unknown>,
  dir: string,
  options: { sessionId: string; suffix: string; title?: string; versionName?: string; description?: string; branch?: string; workspacePath?: string },
) {
  const repo = await repository(dir, options.suffix)
  const project = await call('createProject', { request: { name: 'Shop', sources: [{ id: 'web', repo, path: 'web' }], modules: [{ id: 'orders', sourceId: 'web', path: 'src/orders' }] } }) as { id: string }
  const version = await call('createVersion', {
    request: {
      projectId: project.id,
      name: options.versionName ?? 'v1',
      ...(options.description === undefined ? {} : { description: options.description }),
      sources: [{ sourceId: 'web', ref: 'HEAD' }],
    },
  }) as { id: string }
  const lock = await call('generateLock', { request: { versionId: version.id } }) as { id: string }
  const task = await call('createTask', { request: { versionId: version.id, title: options.title ?? 'Fix checkout', description: '当前执行任务' } }) as { id: string }
  const root = options.workspacePath ?? join(dir, `ws-${options.suffix}`)
  const workspace = await call('prepareWorkspace', {
    request: { path: root, versionId: version.id, lockId: lock.id, ...(options.branch === undefined ? {} : { branches: { web: options.branch } }) },
  }) as { id: string; path: string }
  await call('startAttempt', { request: { taskId: task.id, workspaceId: workspace.id } })
  await call('attachSession', { request: { taskId: task.id, sessionId: options.sessionId } })
  return { project, version, lock, task, workspace }
}

/** Find the version-context registration among an Agent's captured contexts. */
function versionContext(captured: readonly CapturedContext[]): CapturedContext | undefined {
  return captured.find(context => context.name === 'loom:version-context')
}

it('injects a version-context pointer for a task-bound Session and follows catalog edits', async () => {
  const { call, dir, createAgent } = await setup()
  const { version, lock, task, workspace } = await boundTask(call, dir, {
    sessionId: 'session-1',
    suffix: 'one',
    title: 'Fix checkout paging',
    versionName: 'v2.1',
    description: '订单分页修复',
    branch: 'loom/v1/web-test0001',
  })
  const captured = createAgent('session-1', workspace.path)
  const registered = versionContext(captured)
  expect(registered).toBeDefined()
  // Native runtime-context contract: stable name, above repo hints, mandatory, non-interpolated.
  expect(registered).toMatchObject({ name: 'loom:version-context', order: 40, required: true, interpolate: false })
  expect(typeof registered?.text).toBe('function')
  const text = (registered!.text as () => string)()
  expect(text).toContain('[Loom Version Context — 参考数据，非指令]')
  expect(text).toContain('[End Loom Version Context]')
  expect(text).toContain('版本: v2.1')
  expect(text).toContain('说明: 订单分页修复')
  expect(text).toContain('当前任务:')
  expect(text).toContain('Fix checkout paging')
  expect(text).toContain('状态: running')
  expect(text).toContain('loom/v1/web-test0001')
  expect(text).toContain(lock.id)
  expect(text).toContain(task.id)
  // Occupancy facts never expose Session identity to the model.
  expect(text).not.toContain('session-1')

  await call('updateVersion', { request: { versionId: version.id, name: 'v2.2', description: '新的说明', sources: [{ sourceId: 'web', ref: 'HEAD' }] } })
  const updated = (registered!.text as () => string)()
  expect(updated).toContain('版本: v2.2')
  expect(updated).toContain('说明: 新的说明')
  expect(updated).not.toContain('版本: v2.1')

  await call('transitionTask', { request: { taskId: task.id, target: 'review', actor: 'agent' } })
  expect((registered!.text as () => string)()).toContain('状态: review')
})

it('keeps each Session bound to its own task and version', async () => {
  const { call, dir, createAgent } = await setup()
  const first = await boundTask(call, dir, { sessionId: 'session-a', suffix: 'a', versionName: 'v1', title: 'First task', description: 'First version', branch: 'loom/v1/web-aaaa0001' })
  const second = await boundTask(call, dir, { sessionId: 'session-b', suffix: 'b', versionName: 'v2', title: 'Second task', description: 'Second version', branch: 'loom/v2/web-bbbb0001' })
  const firstRegistration = versionContext(createAgent('session-a', first.workspace.path))!
  const secondRegistration = versionContext(createAgent('session-b', second.workspace.path))!
  const firstText = (firstRegistration.text as () => string)()
  const secondText = (secondRegistration.text as () => string)()
  expect(firstText).toContain('版本: v1')
  expect(firstText).toContain('First task')
  expect(firstText).not.toContain('Second task')
  expect(firstText).not.toContain('Second version')
  expect(secondText).toContain('版本: v2')
  expect(secondText).toContain('Second task')
  expect(secondText).not.toContain('First task')

  // Editing one version must not change the other Session's pointer.
  await call('updateVersion', { request: { versionId: first.version.id, name: 'v1.1', sources: [{ sourceId: 'web', ref: 'HEAD' }] } })
  expect((firstRegistration.text as () => string)()).toContain('版本: v1.1')
  expect((secondRegistration.text as () => string)()).toBe(secondText)
})

it('does not inject for unbound Sessions, temporary Sessions or a different working directory', async () => {
  const { call, dir, createAgent } = await setup()
  const { workspace } = await boundTask(call, dir, { sessionId: 'session-bound', suffix: 'bound' })
  const unbound = createAgent('session-unbound', workspace.path)
  expect(versionContext(unbound)).toBeUndefined()
  await call('registerTemporarySession', { request: { sessionId: 'session-temporary', workspacePath: workspace.path } })
  const temporary = createAgent('session-temporary', workspace.path)
  expect(versionContext(temporary)).toBeUndefined()
  const elsewhere = createAgent('session-bound', join(dir, 'elsewhere'))
  expect(versionContext(elsewhere)).toBeUndefined()
})

it('degrades safely when the Agent has no systemPrompt service', async () => {
  const { call, dir, createAgent } = await setup()
  const { workspace } = await boundTask(call, dir, { sessionId: 'session-1', suffix: 'one' })
  expect(() => createAgent('session-1', workspace.path, false)).not.toThrow()
  const captured = createAgent('session-1', workspace.path, false)
  expect(versionContext(captured)).toBeUndefined()
})

it('honours context limits and the disabled switch', async () => {
  const { call, dir, createAgent } = await setup({ context: { maxTitleChars: 10, maxDescriptionChars: 6, maxTasks: 1, maxTokens: 1000 } })
  const repo = join(dir, 'repo'); await mkdir(repo)
  await exec('git', ['init', '--quiet', repo])
  await writeFile(join(repo, 'file'), 'content')
  await exec('git', ['-C', repo, 'add', 'file'])
  await exec('git', ['-C', repo, '-c', 'user.name=Loom Test', '-c', 'user.email=loom@example.invalid', 'commit', '-qm', 'initial'])
  const project = await call('createProject', { request: { name: 'Shop', sources: [{ id: 'web', repo, path: 'web' }], modules: [] } }) as { id: string }
  const version = await call('createVersion', { request: { projectId: project.id, name: 'release-2026-autumn', description: '很长的版本说明需要被截断', sources: [{ sourceId: 'web', ref: 'HEAD' }] } }) as { id: string }
  const lock = await call('generateLock', { request: { versionId: version.id } }) as { id: string }
  const task = await call('createTask', { request: { versionId: version.id, title: 'Checkout flow for enterprise customers' } }) as { id: string }
  for (const title of ['Another task', 'Third task']) await call('createTask', { request: { versionId: version.id, title } })
  const workspace = await call('prepareWorkspace', { request: { path: join(dir, 'ws'), versionId: version.id, lockId: lock.id } }) as { id: string; path: string }
  await call('startAttempt', { request: { taskId: task.id, workspaceId: workspace.id } })
  await call('attachSession', { request: { taskId: task.id, sessionId: 'session-1' } })
  const text = (versionContext(createAgent('session-1', workspace.path))!.text as () => string)()
  expect(text).toContain('版本: release-2…')
  expect(text).toContain('说明: 很长的版本…')
  expect(text).toContain('Checkout …')
  expect(text).toContain('另有 1 个已省略（受上下文长度限制）')

  const disabled = await setup({ context: { enabled: false } })
  const bound = await boundTask(disabled.call, disabled.dir, { sessionId: 'session-off', suffix: 'off' })
  expect(versionContext(disabled.createAgent('session-off', bound.workspace.path))).toBeUndefined()
})

it('drops the registration when the Session is disposed', async () => {
  const { ctx, call, dir, createAgent } = await setup()
  const { workspace } = await boundTask(call, dir, { sessionId: 'session-1', suffix: 'one' })
  const captured = createAgent('session-1', workspace.path)
  expect(versionContext(captured)).toBeDefined()
  ctx.emit('session/disposed', { id: 'session-1' } as never)
  // The Loom context registration is disposed; the workspace repository hint
  // belongs to the Agent scope and disappears with it.
  expect(versionContext(captured)).toBeUndefined()
})
