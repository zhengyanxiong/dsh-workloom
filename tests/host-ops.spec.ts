import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { brandString, type Branded } from '@deepseek-ai/dsh-brand'
import { createCatalog, type Catalog, type TaskRecord, type WorkspaceRecord } from '../src/host/catalog.ts'
import { registerLoomAgentTools, type LoomToolDefinition } from '../src/host/tools.ts'
import { resolveCommit } from '../src/git/workspace.ts'
const exec = promisify(execFile)
const dirs: string[] = []
afterEach(async () => {
  for (const dir of dirs.splice(0)) {
    if (!resolve(dir).startsWith(join(tmpdir(), 'loom-host-ops-'))) throw Error('unsafe cleanup')
    await rm(dir, { recursive: true, force: true })
  }
})

/** Create one isolated catalog file backed by a deterministic commit resolver. */
async function fixture(): Promise<{ dir: string; file: string; catalog: Catalog }> {
  const dir = await mkdtemp(join(tmpdir(), 'loom-host-ops-'))
  dirs.push(dir)
  const file = join(dir, 'state.json')
  return { dir, file, catalog: await createCatalog(file, async () => 'a'.repeat(40)) }
}

/** Create a real Git repository with one commit and return its path and HEAD. */
async function repository(dir: string, name: string): Promise<{ repo: string; commit: string }> {
  const repo = join(dir, name)
  await mkdir(repo)
  await exec('git', ['init', '--quiet', '--initial-branch=main', repo])
  await writeFile(join(repo, 'file.txt'), `${name}\n`)
  await exec('git', ['-C', repo, 'add', '.'])
  await exec('git', ['-C', repo, '-c', 'user.name=Loom Test', '-c', 'user.email=loom@example.invalid', 'commit', '-qm', 'initial'])
  return { repo, commit: (await exec('git', ['-C', repo, 'rev-parse', 'HEAD'])).stdout.trim() }
}

/** Register one direct workspace and start a round attached to a Session. */
async function round(catalog: Catalog, dir: string, session: string, name = 'ws'): Promise<{ task: TaskRecord; workspaceId: WorkspaceRecord['id'] }> {
  const project = await catalog.createProject({ name: 'Shop', sources: [{ id: 'web', repo: join(dir, 'repo'), path: 'web' }], modules: [] })
  const version = await catalog.createVersion(project.id, 'v', [{ sourceId: project.config.sources[0]!.id, ref: 'main' }])
  const lock = await catalog.generateLock(version.id)
  const workspace = await catalog.registerPreparedWorkspace({ path: join(dir, name), versionId: version.id, lockId: lock.id })
  const task = await catalog.createTask(version.id, 'Checkout')
  await catalog.startAttempt(task.id, workspace.id)
  const attached = await catalog.attachSession(task.id, brandString<Branded<'SessionId'>>(session))
  return { task: attached, workspaceId: workspace.id }
}

/** One captured definition plus its disposal flag. */
function registrar(): { definitions: Map<string, LoomToolDefinition>; disposed: string[]; register: (definition: LoomToolDefinition) => () => void } {
  const definitions = new Map<string, LoomToolDefinition>()
  const disposed: string[] = []
  return {
    definitions,
    disposed,
    register: definition => {
      definitions.set(definition.name, definition)
      return () => { definitions.delete(definition.name); disposed.push(definition.name) }
    },
  }
}

const context = (session: string): { agent: { session: { id: string } } } => ({ agent: { session: { id: session } } })

/** Await a call that must reject and return the rejection for message assertions. */
async function rejection(call: Promise<unknown>): Promise<Error> {
  try { await call } catch (error) { return error as Error }
  throw new Error('expected the call to reject')
}

it('records a review request with real evidence and keeps the task out of completed', async () => {
  const { dir, file, catalog } = await fixture()
  const { task } = await round(catalog, dir, 'session-agent')
  const tools = registrar()
  const dispose = registerLoomAgentTools(tools, catalog)
  const review = tools.definitions.get('loom_request_review')!
  const reported = await review.execute({
    summary: 'Implemented the checkout endpoint.',
    completed: ['endpoint', 'tests'],
    notDone: ['docs'],
    risks: ['no integration test yet'],
    impact: ['src/checkout.ts'],
    testResults: [{ name: 'checkout.spec.ts', status: 'passed', command: 'vitest checkout' }],
    basis: 'ready for review',
  }, context('session-agent') as never) as { status: string; suggestedStatus: string; attemptId: string }
  expect(reported).toMatchObject({ status: 'review', suggestedStatus: 'review' })
  const current = catalog.snapshot().tasks[0]!
  expect(current.status).toBe('review')
  expect(current.outcome).toMatchObject({
    state: 'suggested',
    suggestedStatus: 'review',
    suggestedBy: 'agent',
    agentSummary: 'Implemented the checkout endpoint.',
    completed: ['endpoint', 'tests'],
    notDone: ['docs'],
    risks: ['no integration test yet'],
    impact: ['src/checkout.ts'],
    testResults: [{ name: 'checkout.spec.ts', status: 'passed', command: 'vitest checkout' }],
    basis: 'ready for review',
    attemptId: reported.attemptId,
    sessionId: 'session-agent',
  })
  expect(catalog.snapshot().audit.map(entry => entry.event)).toContain('task.review-requested')
  // The Agent has no tool that can complete the task; human confirmation is a Remote transition.
  await expect(catalog.transitionTask(task.id, 'completed', 'agent')).rejects.toThrow()
  expect((await createCatalog(file, resolveCommit)).snapshot().tasks[0]?.outcome?.state).toBe('suggested')
  dispose()
  expect(tools.disposed).toEqual(expect.arrayContaining(['loom_request_review', 'loom_report_failure']))
})

it('omits test results instead of fabricating them', async () => {
  const { dir, catalog } = await fixture()
  const { task } = await round(catalog, dir, 'session-agent')
  const tools = registrar()
  registerLoomAgentTools(tools, catalog)
  await tools.definitions.get('loom_request_review')!.execute({ summary: 'Done, no tests ran.' }, context('session-agent') as never)
  const outcome = catalog.snapshot().tasks.find(candidate => candidate.id === task.id)?.outcome
  expect(outcome).not.toHaveProperty('testResults')
  expect(outcome?.agentSummary).toBe('Done, no tests ran.')
})

it('records a failure suggestion without moving the task out of running', async () => {
  const { dir, catalog } = await fixture()
  const { task } = await round(catalog, dir, 'session-agent')
  const tools = registrar()
  registerLoomAgentTools(tools, catalog)
  await tools.definitions.get('loom_report_failure')!.execute({
    reason: 'the upstream service rejects the new payload',
    summary: 'Tried the integration.',
    notDone: ['retry with the old payload'],
    testResults: [{ name: 'integration.spec.ts', status: 'failed', detail: '422' }],
  }, context('session-agent') as never)
  const current = catalog.snapshot().tasks.find(candidate => candidate.id === task.id)!
  expect(current.status).toBe('running')
  expect(current.outcome).toMatchObject({ state: 'suggested', suggestedStatus: 'failed', basis: 'the upstream service rejects the new payload' })
  expect(catalog.snapshot().audit.map(entry => entry.event)).toContain('task.failure-suggested')
})

it('rejects an unbound Session and a Session without execution ownership', async () => {
  const { dir, catalog } = await fixture()
  const { workspaceId, task } = await round(catalog, dir, 'session-agent')
  const tools = registrar()
  registerLoomAgentTools(tools, catalog)
  const review = tools.definitions.get('loom_request_review')!
  await expect(review.execute({ summary: 'x' }, context('session-stranger') as never)).rejects.toThrow(/not attached/u)
  // Another Session owning execution blocks the report even though the round is bound.
  await catalog.acquireExecution(workspaceId, brandString<Branded<'SessionId'>>('session-owner'))
  await expect(review.execute({ summary: 'x' }, context('session-agent') as never)).rejects.toThrow(/owned by Session session-owner/u)
  expect(catalog.snapshot().tasks.find(candidate => candidate.id === task.id)?.outcome).toBeUndefined()
})

it('records human acceptance and rejection with audit evidence', async () => {
  const { dir, catalog } = await fixture()
  const { task } = await round(catalog, dir, 'session-agent')
  const tools = registrar()
  registerLoomAgentTools(tools, catalog)
  await tools.definitions.get('loom_request_review')!.execute({ summary: 'ready', basis: 'all green' }, context('session-agent') as never)
  const accepted = await catalog.transitionTask(task.id, 'completed', 'human', { basis: 'verified the diff' })
  expect(accepted.status).toBe('completed')
  expect(accepted.outcome).toMatchObject({ state: 'accepted', confirmationBasis: 'verified the diff' })
  expect(accepted.outcome?.confirmedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/u)
  const events = catalog.snapshot().audit.map(entry => entry.event)
  expect(events).toEqual(expect.arrayContaining(['task.review-requested', 'task.confirmation-accepted']))

  const second = await round(catalog, dir, 'session-agent', 'ws-2')
  await tools.definitions.get('loom_request_review')!.execute({ summary: 'please review' }, context('session-agent') as never)
  const rejected = await catalog.transitionTask(second.task.id, 'failed', 'human', { basis: 'regression found' })
  expect(rejected.status).toBe('failed')
  expect(rejected.outcome).toMatchObject({ state: 'rejected', confirmationBasis: 'regression found' })
  expect(catalog.snapshot().audit.map(entry => entry.event)).toContain('task.confirmation-rejected')
})

it('rejects a report after the round is no longer active', async () => {
  const { dir, catalog } = await fixture()
  const { task } = await round(catalog, dir, 'session-agent')
  const tools = registrar()
  registerLoomAgentTools(tools, catalog)
  await tools.definitions.get('loom_request_review')!.execute({ summary: 'ready' }, context('session-agent') as never)
  await catalog.transitionTask(task.id, 'completed', 'human')
  await expect(tools.definitions.get('loom_request_review')!.execute({ summary: 'again' }, context('session-agent') as never))
    .rejects.toThrow(/not running or in review|task_not_active/u)
})

it('reports per-repository preparation progress, keeps successful siblings and retries only the failed repository', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'loom-host-ops-')); dirs.push(dir)
  const web = await repository(dir, 'web-repo')
  const api = await repository(dir, 'api-repo')
  await exec('git', ['-C', api.repo, 'branch', 'feature'])
  await writeFile(join(api.repo, 'file.txt'), 'second\n')
  await exec('git', ['-C', api.repo, 'add', '.'])
  await exec('git', ['-C', api.repo, '-c', 'user.name=Loom Test', '-c', 'user.email=loom@example.invalid', 'commit', '-qm', 'second'])
  const catalog = await createCatalog(join(dir, 'state.json'), resolveCommit)
  const project = await catalog.createProject({
    name: 'Shop',
    sources: [{ id: 'web', repo: web.repo, path: 'web' }, { id: 'api', repo: api.repo, path: 'api' }],
    modules: [],
  })
  const version = await catalog.createVersion(project.id, 'v', [
    { sourceId: project.config.sources[0]!.id, ref: 'HEAD' },
    { sourceId: project.config.sources[1]!.id, ref: 'HEAD' },
  ])
  const lock = await catalog.generateLock(version.id)
  const root = join(dir, 'workspace')
  const failed = await catalog.prepareWorkspace({ path: root, versionId: version.id, lockId: lock.id, branches: { api: 'feature' } })
  expect(failed.preparation?.status).toBe('failed')
  const entries = failed.preparation?.repositories ?? []
  expect(entries).toMatchObject([
    { sourceId: 'web', status: 'done', path: join(root, 'web') },
    { sourceId: 'api', status: 'failed' },
  ])
  expect(entries[1]?.error).toContain('branch_mismatch')
  // The repository that succeeded keeps its checkout; nothing is silently deleted.
  expect(await readFile(join(root, 'web', 'file.txt'), 'utf8')).toBe('web-repo\n')
  expect(await readFile(join(root, 'api', 'file.txt'), 'utf8').catch(() => undefined)).toBeUndefined()
  // Starting a round on a partially prepared workspace is refused with the concrete state.
  const task = await catalog.createTask(version.id, 'blocked')
  await expect(catalog.startAttempt(task.id, failed.id)).rejects.toThrow(/workspace_not_prepared/u)
  await exec('git', ['-C', api.repo, 'branch', '-D', 'feature'])
  const retried = await catalog.prepareWorkspace({ path: root, versionId: version.id, lockId: lock.id, workspaceId: failed.id })
  expect(retried.preparation?.status).toBe('ready')
  expect(retried.preparation?.repositories.map(entry => entry.status)).toEqual(['done', 'done'])
  expect(await readFile(join(root, 'api', 'file.txt'), 'utf8')).toBe('second\n')
  await expect(catalog.startAttempt(task.id, retried.id)).resolves.toMatchObject({ status: 'running' })
  await catalog.transitionTask(task.id, 'failed', 'human')
  await catalog.cleanupWorkspace(retried.id, true)
  // The failed round still references the record, so cleanup keeps it as history.
  expect(catalog.snapshot().workspaces).toMatchObject([{ id: retried.id, cleaned: true }])
})

it('reports partial cleanup, keeps retryable state and never reports a false success', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'loom-host-ops-')); dirs.push(dir)
  const web = await repository(dir, 'web-repo')
  const api = await repository(dir, 'api-repo')
  const catalog = await createCatalog(join(dir, 'state.json'), resolveCommit)
  const project = await catalog.createProject({
    name: 'Shop',
    sources: [{ id: 'web', repo: web.repo, path: 'web' }, { id: 'api', repo: api.repo, path: 'api' }],
    modules: [],
  })
  const version = await catalog.createVersion(project.id, 'v', [
    { sourceId: project.config.sources[0]!.id, ref: 'HEAD' },
    { sourceId: project.config.sources[1]!.id, ref: 'HEAD' },
  ])
  const lock = await catalog.generateLock(version.id)
  const root = join(dir, 'workspace')
  const workspace = await catalog.prepareWorkspace({ path: root, versionId: version.id, lockId: lock.id })
  expect(workspace.preparation?.status).toBe('ready')
  // Break only the second repository's worktree so its removal fails.
  await rm(join(root, 'api'), { recursive: true, force: true })
  await mkdir(join(root, 'api'))
  await writeFile(join(root, 'api', 'file.txt'), 'plain directory, not a worktree\n')
  await expect(catalog.cleanupWorkspace(workspace.id, true)).resolves.toBeUndefined()
  const partial = catalog.snapshot().workspaces.find(candidate => candidate.id === workspace.id)!
  expect(partial.cleaned).not.toBe(true)
  expect(partial.cleanup?.status).toBe('partial')
  expect(partial.cleanup?.repositories).toMatchObject([
    { sourceId: 'web', status: 'removed' },
    { sourceId: 'api', status: 'failed' },
  ])
  expect(partial.cleanup?.residual).toContain(join(root, 'api'))
  expect(await readFile(join(root, 'api', 'file.txt'), 'utf8')).toContain('not a worktree')
  // Fix the residual and retry: the already-removed repository is not treated as a failure.
  await rm(join(root, 'api'), { recursive: true, force: true })
  await exec('git', ['-C', api.repo, 'worktree', 'prune'])
  await catalog.cleanupWorkspace(workspace.id, true)
  expect(catalog.snapshot().workspaces).toEqual([])
  expect(await readFile(join(root, 'web', 'file.txt'), 'utf8').catch(() => undefined)).toBeUndefined()
  await expect(readFile(join(root, 'x'))).rejects.toThrow()
})

it('blocks cleanup while a round runs or a Session owns execution and names the concrete owner', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'loom-host-ops-')); dirs.push(dir)
  const repo = await repository(dir, 'repo')
  const catalog = await createCatalog(join(dir, 'state.json'), resolveCommit)
  const project = await catalog.createProject({ name: 'Shop', sources: [{ id: 'web', repo: repo.repo, path: 'web' }], modules: [] })
  const version = await catalog.createVersion(project.id, 'v', [{ sourceId: project.config.sources[0]!.id, ref: 'HEAD' }])
  const lock = await catalog.generateLock(version.id)
  const root = join(dir, 'workspace')
  const workspace = await catalog.prepareWorkspace({ path: root, versionId: version.id, lockId: lock.id })
  const task = await catalog.createTask(version.id, 'Checkout')
  await catalog.startAttempt(task.id, workspace.id)
  const blockedByTask = await rejection(catalog.cleanupWorkspace(workspace.id, true))
  expect(blockedByTask.message).toContain('workspace_task_running')
  expect(blockedByTask.message).toContain(task.id)
  expect(blockedByTask.message).toContain('running')
  // A round awaiting human review still occupies the workspace.
  await catalog.transitionTask(task.id, 'review', 'human')
  const blockedByReview = await rejection(catalog.cleanupWorkspace(workspace.id, true))
  expect(blockedByReview.message).toContain('workspace_task_running')
  expect(blockedByReview.message).toContain('review')
  const owner = brandString<Branded<'SessionId'>>('session-owner')
  const execution = await catalog.acquireExecution(workspace.id, owner)
  await catalog.transitionTask(task.id, 'failed', 'human')
  const blockedByOwner = await rejection(catalog.cleanupWorkspace(workspace.id, true))
  expect(blockedByOwner.message).toContain('workspace_busy')
  expect(blockedByOwner.message).toContain('session-owner')
  await catalog.releaseExecution(workspace.id, execution.owner!)
  await catalog.cleanupWorkspace(workspace.id, true)
  expect(catalog.snapshot().workspaces[0]).toMatchObject({ id: workspace.id, cleaned: true })
  await expect(readFile(join(root, 'web', 'file.txt'))).rejects.toThrow()
})

it('gives temporary Sessions execution rights and releases them on forget', async () => {
  const { dir, catalog } = await fixture()
  const project = await catalog.createProject({ name: 'Shop', sources: [{ id: 'web', repo: join(dir, 'repo'), path: 'web' }], modules: [] })
  const version = await catalog.createVersion(project.id, 'v', [{ sourceId: project.config.sources[0]!.id, ref: 'main' }])
  const lock = await catalog.generateLock(version.id)
  const workspace = await catalog.registerPreparedWorkspace({ path: join(dir, 'ws'), versionId: version.id, lockId: lock.id })
  const first = brandString<Branded<'SessionId'>>('session-temp-a')
  const second = brandString<Branded<'SessionId'>>('session-temp-b')
  await catalog.registerTemporarySession(first, workspace.path)
  await catalog.registerTemporarySession(second, workspace.path)
  const queued = catalog.snapshot()
  expect(queued.executions.find(execution => execution.workspaceId === workspace.id)).toMatchObject({
    owner: { sessionId: 'session-temp-a' },
    waiting: ['session-temp-b'],
  })
  // A task round cannot start while a temporary Session holds the workspace.
  const task = await catalog.createTask(version.id, 'Checkout')
  await expect(catalog.startAttempt(task.id, workspace.id)).rejects.toThrow('workspace_task_running')
  await catalog.forgetTemporarySession(first)
  const promoted = catalog.snapshot()
  expect(promoted.executions.find(execution => execution.workspaceId === workspace.id)).toMatchObject({
    owner: { sessionId: 'session-temp-b' },
    waiting: [],
  })
  expect(promoted.temporarySessions.map(record => record.sessionId)).toEqual(['session-temp-b'])
  await catalog.forgetTemporarySession(second)
  expect(catalog.snapshot().executions.find(execution => execution.workspaceId === workspace.id)?.owner).toBeNull()
  // Releasing both makes the workspace startable by a task round.
  await catalog.startAttempt(task.id, workspace.id)
  expect(catalog.snapshot().tasks[0]?.status).toBe('running')
})

it('drops a temporary registration and its execution when the Session is disposed', async () => {
  const { dir, catalog } = await fixture()
  const project = await catalog.createProject({ name: 'Shop', sources: [{ id: 'web', repo: join(dir, 'repo'), path: 'web' }], modules: [] })
  const version = await catalog.createVersion(project.id, 'v', [{ sourceId: project.config.sources[0]!.id, ref: 'main' }])
  const lock = await catalog.generateLock(version.id)
  const workspace = await catalog.registerPreparedWorkspace({ path: join(dir, 'ws'), versionId: version.id, lockId: lock.id })
  const session = brandString<Branded<'SessionId'>>('session-disposed')
  await catalog.registerTemporarySession(session, workspace.path)
  expect(catalog.snapshot().executions.find(execution => execution.workspaceId === workspace.id)?.owner?.sessionId).toBe('session-disposed')
  await catalog.releaseSession(session)
  const released = catalog.snapshot()
  expect(released.temporarySessions).toEqual([])
  expect(released.executions.find(execution => execution.workspaceId === workspace.id)?.owner).toBeNull()
})

it('reports unpushed commits and flags a branch without upstream instead of throwing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'loom-host-ops-')); dirs.push(dir)
  const repo = await repository(dir, 'repo')
  const catalog = await createCatalog(join(dir, 'state.json'), resolveCommit)
  const project = await catalog.createProject({ name: 'Shop', sources: [{ id: 'web', repo: repo.repo, path: 'web' }], modules: [] })
  const version = await catalog.createVersion(project.id, 'v', [{ sourceId: project.config.sources[0]!.id, ref: 'HEAD' }])
  const lock = await catalog.generateLock(version.id)
  const root = join(dir, 'workspace')
  const workspace = await catalog.prepareWorkspace({ path: root, versionId: version.id, lockId: lock.id })
  const detached = await catalog.workspaceStatus(workspace.id)
  expect(detached.repositories[0]).toMatchObject({ unpushedUnavailable: true })
  expect(detached.repositories[0]).not.toHaveProperty('unpushed')
  // Track a local branch with an upstream, then make one unpushed commit.
  const worktree = join(root, 'web')
  await exec('git', ['-C', worktree, 'checkout', '-q', '-b', 'work'])
  await exec('git', ['-C', worktree, 'config', 'branch.work.remote', '.'])
  await exec('git', ['-C', worktree, 'config', 'branch.work.merge', 'refs/heads/main'])
  expect((await catalog.workspaceStatus(workspace.id)).repositories[0]?.unpushed).toBe(0)
  await writeFile(join(worktree, 'file.txt'), 'changed\n')
  await exec('git', ['-C', worktree, '-c', 'user.name=Loom Test', '-c', 'user.email=loom@example.invalid', 'commit', '-qam', 'local only'])
  const ahead = await catalog.workspaceStatus(workspace.id)
  expect(ahead.repositories[0]).toMatchObject({ unpushed: 1 })
  await catalog.cleanupWorkspace(workspace.id, true)
  expect(catalog.snapshot().audit.map(entry => entry.event)).toContain('workspace.cleaned')
})

it('registers a takeover tool that runs only the Host-provided takeover callback', async () => {
  const { catalog } = await fixture()
  const tools = registrar()
  let called = ''
  registerLoomAgentTools(tools, catalog, undefined, async sessionId => {
    called = sessionId
    return { workspaceId: 'w1', owner: sessionId, sessionId }
  })
  const tool = tools.definitions.get('loom_request_takeover')!
  const result = await tool.execute({ reason: 'owner is blocked' }, context('session-agent') as never)
  expect(called).toBe('session-agent')
  expect(result).toMatchObject({ workspaceId: 'w1', owner: 'session-agent' })
})
