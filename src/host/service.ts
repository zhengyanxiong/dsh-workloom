/** Owner-only Loom catalog Remote service with quiescent disposal. */
import { Context, Service } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-api-remote-access'
import { brandString, type Branded } from '@deepseek-ai/dsh-brand'
import { mkdirSync } from 'node:fs'
import { dirname, isAbsolute, join, normalize, resolve, win32 } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { createCatalog, findSessionAttempt, findWorkspaceByPath, type Catalog, type TemporarySessionRecord } from './catalog.ts'
import { registerLoomAgentTools, type LoomToolRegistrar } from './tools.ts'
import { parseProject } from '../domain/project.ts'
import type {
  AttachSessionRequest, CatalogSnapshot, CreateTaskRequest, CreateVersionRequest, GenerateLockRequest,
  CleanupWorkspaceRequest, PrepareWorkspaceRequest, ProjectConfig, ProjectRecord, RegisterWorkspaceRequest, StartAttemptRequest, TaskRecord, TransitionTaskRequest, WorkspaceChangesRequest, WorkspaceRepositoryChangesRecord, WorkspaceStatusResult,
  VersionRecord, WorkspaceRecord, ExecutionRequest, ReleaseExecutionRequest, UpdateProjectRequest, UpdateVersionRequest, UpdateTaskRequest,
  DeleteProjectRequest, DeleteVersionRequest, DeleteTaskRequest, RegisterTemporarySessionRequest, ForgetTemporarySessionRequest,
  RepositoryBranchesRequest, InspectWorkspaceRequest, WorkspaceInspection, CommitWorkspaceRequest, WorkspaceCommitResult, VersionWorkspaceInput, UpdateWorkspaceRequest, DeleteWorkspaceRequest, ReorderExecutionQueueRequest,
} from '../types.ts'
import type { Lock } from '../domain/task.ts'
import { autoWorkspaceRepositoryPath, type WorkspaceRepositoryBinding } from '../domain/workspace.ts'
import { ExecutionError, type ExecutionState, type StopOutcome } from '../domain/execution.ts'
import { repositoryBranches, resolveCommit } from '../git/workspace.ts'
import type {} from './events.ts'
import type { LoomAgent, LoomAgentRegistry } from './events.ts'
import {
  VERSION_CONTEXT_DEFAULTS, VERSION_DESCRIPTION_MAX_CHARS,
  deriveVersionContext, renderVersionContext, withCurrentTask,
  type VersionContext, type VersionContextLimits,
} from '../shared/version-context.ts'

/** Human-readable service failure with a stable code prefix. */
const SERVICE_ERROR_DESCRIPTION: Readonly<Record<string, string>> = {
  owner_required: 'Loom operations require the workspace owner',
  loom_disposed: 'the Loom host has been disposed; reload the panel',
  missing_project: 'the requested project does not exist',
  missing_version: 'the requested version does not exist',
  missing_workspace: 'the requested workspace does not exist',
  workspace_mismatch: 'the workspace does not belong to this version or Lock',
  invalid_workspace_path: 'the workspace path is invalid',
  workspace_cleaned: 'the workspace has already been cleaned',
  workspace_not_prepared: 'the workspace preparation is not ready',
  workspace_changes: 'the workspace has uncommitted changes',
  stale_owner: 'the execution owner token is stale',
  detached_head: 'the directory is on a detached HEAD; choose a branch',
}
function serviceError(code: string, detail?: string): Error {
  const description = SERVICE_ERROR_DESCRIPTION[code] ?? 'the Loom operation failed'
  return new Error(`${code}: ${description}${detail === undefined || detail === '' ? '' : ` (${detail})`}`)
}

/** Optional version-context injection limits; every value defaults from the shared module. */
export interface ContextConfig {
  readonly enabled?: boolean
  readonly maxTasks?: number
  readonly maxTitleChars?: number
  readonly maxPathChars?: number
  readonly maxDescriptionChars?: number
  readonly maxTokens?: number
}

/** Absolute catalog file, optional workspace parent and optional context limits; the service creates missing directories. */
export interface Config { catalogFile: string; workspacesDir?: string; context?: ContextConfig }
const absolute = Schema.transform(Schema.string().required(), value => {
  if (!isAbsolute(value) || normalize(value) !== value) throw new Error('path must be absolute and normalized')
  return value
})
const contextConfigSchema = Schema.object({
  enabled: Schema.boolean(),
  maxTasks: Schema.natural(),
  maxTitleChars: Schema.natural(),
  maxPathChars: Schema.natural(),
  maxDescriptionChars: Schema.natural(),
  maxTokens: Schema.natural(),
})
const configSchema: Schema<Config> = Schema.object({
  catalogFile: absolute.required(),
  workspacesDir: absolute,
  context: contextConfigSchema,
})
const nonempty = z.string().trim().min(1)
const versionDescription = z.string().max(VERSION_DESCRIPTION_MAX_CHARS).optional()
const versionTarget = z.strictObject({ subProjectId: nonempty, sourceId: nonempty, ref: nonempty })
const versionWorkspaceInput = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('auto'), parentPath: nonempty, name: nonempty, branchPrefix: nonempty.optional() }),
  z.strictObject({ mode: z.literal('linked'), rootPath: nonempty, repositories: z.array(z.strictObject({ sourceId: nonempty, targetPath: nonempty })).min(1) }),
])
const versionRequest = z.strictObject({ projectId: nonempty, name: nonempty, description: versionDescription, sources: z.array(z.strictObject({ sourceId: nonempty, ref: nonempty })).min(1), targets: z.array(versionTarget).min(1).optional(), workspaces: z.array(versionWorkspaceInput).min(1).optional() })
const updateProjectRequest = z.strictObject({ projectId: nonempty, config: z.unknown() })
const updateVersionRequest = z.strictObject({ versionId: nonempty, name: nonempty, description: versionDescription, sources: z.array(z.strictObject({ sourceId: nonempty, ref: nonempty })).min(1), targets: z.array(versionTarget).min(1).optional() })
const taskRequest = z.strictObject({ versionId: nonempty, workspaceId: nonempty.optional(), title: nonempty, description: z.string().max(4000).optional(), moduleIds: z.array(nonempty).max(50).optional(), priority: z.enum(['low', 'normal', 'high']).optional() })
const updateTaskRequest = z.strictObject({ taskId: nonempty, title: nonempty, description: z.string().max(4000).optional(), moduleIds: z.array(nonempty).max(50).optional(), priority: z.enum(['low', 'normal', 'high']).optional() })
const deleteProjectRequest = z.strictObject({ projectId: nonempty })
const deleteVersionRequest = z.strictObject({ versionId: nonempty })
const deleteTaskRequest = z.strictObject({ taskId: nonempty })
const lockRequest = z.strictObject({ versionId: nonempty })
const workspaceRepositoryInput = z.strictObject({ sourceId: nonempty, path: nonempty, targetPath: nonempty })
const workspaceRequest = z.strictObject({ path: nonempty.optional(), versionId: nonempty, lockId: nonempty, branches: z.record(z.string(), nonempty).optional(), mode: z.enum(['managed', 'linked']).optional(), repositories: z.array(workspaceRepositoryInput).min(1).optional(), workspaceId: nonempty.optional(), requireBranches: z.boolean().optional() })
const registerWorkspaceRequest = z.strictObject({ path: nonempty, versionId: nonempty, lockId: nonempty, branches: z.record(z.string(), nonempty).optional(), mode: z.enum(['direct', 'linked']).optional(), projectId: nonempty.optional(), rootPath: nonempty.optional(), rootOwner: z.enum(['loom', 'user']).optional(), repositories: z.array(workspaceRepositoryInput).min(1).optional(), requireBranches: z.boolean().optional() })
const repositoryBranchesRequest = z.strictObject({ repo: nonempty })
const inspectWorkspaceRequest = z.strictObject({ path: nonempty, versionId: nonempty })
const attemptRequest = z.strictObject({ taskId: nonempty, workspaceId: nonempty, allowBusy: z.boolean().optional() })
const sessionRequest = z.strictObject({ taskId: nonempty, sessionId: nonempty })
const temporarySessionRequest = z.strictObject({ sessionId: nonempty, workspacePath: nonempty })
const forgetTemporarySessionRequest = z.strictObject({ sessionId: nonempty })
const transitionRequest = z.strictObject({ taskId: nonempty, target: z.enum(['pending', 'running', 'review', 'completed', 'failed']), actor: z.enum(['human', 'agent']), basis: z.string().max(2000).optional() })
const workspaceChangesRequest = z.strictObject({ workspaceId: nonempty, attemptId: nonempty.optional() })
const commitWorkspaceRequest = z.strictObject({ workspaceId: nonempty, message: z.string().max(500).optional() })
const updateWorkspaceRequest = z.strictObject({ workspaceId: nonempty, label: z.string().max(80).optional() })
const deleteWorkspaceRequest = z.strictObject({ workspaceId: nonempty, deleteFiles: z.boolean().optional(), confirmPath: z.string().optional() })
const cleanupWorkspaceRequest = z.strictObject({ workspaceId: nonempty, discardChanges: z.boolean().optional() })
const executionRequest = z.strictObject({ workspaceId: nonempty, sessionId: nonempty })
const reorderExecutionQueueRequest = z.strictObject({ workspaceId: nonempty, sessionIds: z.array(nonempty) })
const releaseExecutionRequest = z.strictObject({ workspaceId: nonempty, sessionId: nonempty, generation: z.number().int().nonnegative() })

/** Runtime-context name registered on each Agent bound to a Loom task. */
const VERSION_CONTEXT_NAME = 'loom:version-context'
/** Ordering above workspace repository hints, below identity sections. */
const VERSION_CONTEXT_ORDER = 40

/** Native runtime-context registration subset the Host calls. */
interface PromptContextRegistrar {
  context(entry: {
    readonly name: string
    readonly order: number
    readonly required?: boolean | undefined
    readonly interpolate?: boolean | undefined
    readonly text: string | (() => string)
  }): () => void
}

/** One Session's live version-context registration. */
interface VersionContextRegistration {
  readonly taskId: string
  readonly versionId: string
  readonly dispose: () => void
}

/** Resolve context limits from optional Cordis config, ignoring unusable values. */
function resolveContextLimits(config: ContextConfig | undefined): VersionContextLimits {
  const positive = (value: number | undefined, fallback: number): number => value !== undefined && Number.isSafeInteger(value) && value > 0 ? value : fallback
  const description = config?.maxDescriptionChars
  return {
    maxTasks: positive(config?.maxTasks, VERSION_CONTEXT_DEFAULTS.maxTasks),
    maxTitleChars: positive(config?.maxTitleChars, VERSION_CONTEXT_DEFAULTS.maxTitleChars),
    maxPathChars: positive(config?.maxPathChars, VERSION_CONTEXT_DEFAULTS.maxPathChars),
    maxDescriptionChars: description !== undefined && Number.isSafeInteger(description) && description >= 0 ? description : VERSION_CONTEXT_DEFAULTS.maxDescriptionChars,
    maxTokens: positive(config?.maxTokens, VERSION_CONTEXT_DEFAULTS.maxTokens),
  }
}

/** Compare the Agent's working directory with a catalog workspace in its own path spelling. */
function sameHostPath(left: string | undefined, right: string): boolean {
  if (left === undefined || left === '') return false
  const windows = /^[A-Za-z]:[\\/]/u.test(left) || /^\\\\/u.test(left) || /^[A-Za-z]:[\\/]/u.test(right) || /^\\\\/u.test(right)
  try {
    if (windows) return win32.isAbsolute(left) && win32.isAbsolute(right) && win32.resolve(left).toLowerCase() === win32.resolve(right).toLowerCase()
    return isAbsolute(left) && isAbsolute(right) && resolve(left) === resolve(right)
  } catch {
    // Path comparison must never break Agent creation for a malformed inherited path.
    return left === right
  }
}


/** Compare client-requested direct bindings with the persisted workspace before reusing it. */
function sameRepositoryMappings(
  requested: readonly { readonly sourceId: string; readonly path: string; readonly targetPath: string }[] | undefined,
  existing: readonly WorkspaceRepositoryBinding[] | undefined,
): boolean {
  if (requested === undefined || existing === undefined) return true
  return requested.length === existing.length
    && requested.every(repository => existing.some(binding => binding.sourceId === repository.sourceId
      && binding.path === repository.path && binding.targetPath === repository.targetPath))
}


/** Inspect each version repository inside an existing workspace root. */
async function inspectWorkspace(snapshot: CatalogSnapshot, path: string, versionId: string): Promise<WorkspaceInspection> {
  const version = snapshot.versions.find(candidate => candidate.id === versionId)
  if (version === undefined) throw serviceError('missing_version')
  const project = snapshot.projects.find(candidate => candidate.id === version.projectId)
  if (project === undefined) throw serviceError('missing_project')
  const repositories: WorkspaceInspection['repositories'][number][] = []
  for (const source of project.config.sources) {
    const directory = join(path, source.path)
    try {
      const branches = await repositoryBranches(directory)
      repositories.push({ sourceId: source.id, repo: source.repo, directory, topLevel: branches.topLevel, ...(branches.current === undefined ? {} : { current: branches.current }), branches: branches.branches })
    } catch (error) {
      const detail = error instanceof Error ? error.message.split(/\r?\n/u)[0] : String(error)
      repositories.push({ sourceId: source.id, repo: source.repo, directory, branches: [], error: detail ?? 'not_git' })
    }
  }
  return { path, repositories }
}

declare module '@deepseek-ai/cordis' { interface Context { loom: LoomService } }

/** Global catalog administration; Remote calls require the Host owner's principal. */
export default class LoomService extends TypertRemoteService {
  static inject = ['remoteAccess', 'typert']
  static Config = configSchema
  private readonly catalog: Promise<Catalog>
  /** Last committed snapshot, kept for synchronous Agent/Session listeners and context derivation. */
  private current: CatalogSnapshot | undefined
  private readonly pending = new Set<Promise<unknown>>()
  private readonly workspacesDir: string
  private closed = false
  private readonly contextEnabled: boolean
  private readonly contextLimits: VersionContextLimits
  /** Derived version-level contexts for the current snapshot; cleared whenever the snapshot refreshes. */
  private readonly versionContexts = new Map<string, VersionContext>()
  private readonly sessionVersionContexts = new Map<string, VersionContextRegistration>()
  /** Last pointer text per Session, returned when derivation temporarily cannot read the snapshot. */
  private readonly sessionPointerText = new Map<string, string>()

  constructor(ctx: Context, config: Config) {
    super(ctx, 'loom')
    const admitted = configSchema(config)
    this.workspacesDir = admitted.workspacesDir ?? join(dirname(admitted.catalogFile), 'workspaces')
    this.contextEnabled = admitted.context?.enabled !== false
    this.contextLimits = resolveContextLimits(admitted.context)
    mkdirSync(dirname(admitted.catalogFile), { recursive: true })
    mkdirSync(this.workspacesDir, { recursive: true })
    this.catalog = createCatalog(admitted.catalogFile, resolveCommit)
    // Cache the loaded snapshot for synchronous Session and Agent lifecycle listeners.
    void this.catalog.then(catalog => { this.refreshSnapshot(catalog) }, () => undefined)
    ctx.effect(() => async () => {
      this.closed = true
      // Drop runtime-context registrations on the still-live Agents before the
      // service disappears, so a reloaded Host cannot inherit stale pointers.
      for (const sessionId of [...this.sessionVersionContexts.keys()]) this.disposeVersionContext(brandString<Branded<'SessionId'>>(sessionId))
      await Promise.allSettled([this.catalog, ...this.pending])
    }, 'loom: settle catalog operations')
  }

  /** Replace the synchronous snapshot cache and invalidate derived version contexts. */
  private refreshSnapshot(catalog: Catalog): void {
    try {
      this.current = catalog.snapshot()
      this.versionContexts.clear()
    } catch {
      // Keep the previous snapshot; a transient read failure must not fail a Remote reply or an Agent turn.
    }
  }

  async [Service.init](): Promise<void> {
    const catalog = await this.catalog
    this.refreshSnapshot(catalog)
    this.ctx.on('session/created', session => {
      const cwd = session.header.cwd
      if (cwd === undefined) return
      const workspace = this.current?.workspaces.find(candidate => candidate.cleaned !== true && (candidate.rootPath ?? candidate.path) === cwd && candidate.mode === 'linked')
      if (workspace !== undefined) session.append('sandbox/mode', { mode: 'danger-full-access' })
    })
    this.ctx.on('agent/created', ({ agent }) => {
      this.syncVersionContext(agent.session.id)
      const cwd = agent.session.header.cwd
      if (cwd === undefined) return
      const workspace = this.current?.workspaces.find(candidate => candidate.cleaned !== true && (candidate.rootPath ?? candidate.path) === cwd)
      if (workspace === undefined) return
      const bindings = workspace.repositories ?? this.fallbackBindings(workspace)
      if (bindings.every(binding => binding.path === '.')) return
      const prompt = agent.ctx.get('systemPrompt') as PromptContextRegistrar | undefined
      prompt?.context({
        name: 'loom:workspace-repositories',
        order: 20,
        required: true,
        text: [
          `This Session runs in a Loom workspace whose only working directory is ${cwd}.`,
          'It contains these repositories; use the mapped path below for each one:',
          ...bindings.map(binding => `- ${binding.path === '.' ? '(workspace root)' : binding.path} -> ${binding.targetPath}${binding.branch === undefined ? '' : ` (branch ${binding.branch})`}`),
          'Skills from these repositories are aggregated into this workspace root, so the native session skill catalog discovers them automatically. When the catalog lists a matching skill, load it with the skill tool before acting instead of reading SKILL.md manually.',
        ].join('\n'),
      })
    })
    for (const workspace of catalog.snapshot().workspaces) {
      if (workspace.cleaned === true) continue
      try { await catalog.ensureWorkspaceBranches(workspace.id) } catch (error) { this.ctx.logger.warn(`loom: branch reconciliation failed for ${workspace.path}: ${String(error)}`) }
    }
    this.refreshSnapshot(catalog)
    // Recover contexts for Agents that already exist when the service reloads.
    const agents = this.ctx.get('agents') as LoomAgentRegistry | undefined
    for (const agent of agents?.list?.() ?? []) this.syncVersionContext(agent.session.id)
    this.ctx.on('tools/pre-execute', async (exec, next) => {
      if (exec.agent === undefined) return next()
      if (exec.name === 'loom_request_takeover') {
        return {
          kind: 'ask',
          reason: 'Loom takeover stops the current workspace owner before transferring execution access.',
          displayReason: {
            en: 'Allow this Session to stop the current Loom workspace owner and take over execution?',
            zh: '允许当前会话停止原执行会话，并接管工作区执行权吗？',
          },
        }
      }
      const decision = await this.admitExecution(exec.agent.session.id, exec.agent.session.header.cwd)
      return decision ?? next()
    })
    this.ctx.on('agent/status', ({ agent, status }) => {
      if (status === 'idle') void this.releaseSession(agent.session.id)
    })
    this.ctx.on('session/disposed', session => {
      this.disposeVersionContext(session.id)
      void this.releaseSession(session.id)
    })
    this.registerAgentTools(catalog)
  }

  /** Expose the Loom reporting tools once a native tools registry exists. */
  private registerAgentTools(catalog: Catalog): void {
    const attach = (registry: LoomToolRegistrar): void => {
      this.ctx.effect(() => registerLoomAgentTools(registry, catalog, () => this.refreshSnapshot(catalog), sessionId => this.takeoverForAgent(sessionId)), 'loom: register Agent tools')
    }
    const tools = this.ctx.get('tools') as LoomToolRegistrar | undefined
    if (tools !== undefined) { attach(tools); return }
    // The tools service may mount after Loom; register as soon as it appears.
    this.ctx.inject(['tools'], child => { attach(child.get('tools') as LoomToolRegistrar) })
  }

  private fallbackBindings(workspace: WorkspaceRecord): readonly WorkspaceRepositoryBinding[] {
    const version = this.current?.versions.find(candidate => candidate.id === workspace.versionId)
    const project = version === undefined ? undefined : this.current?.projects.find(candidate => candidate.id === version.projectId)
    const root = workspace.rootPath ?? workspace.path
    return project?.config.sources.map(source => ({
      sourceId: source.id,
      path: source.path,
      targetPath: join(root, source.path),
      kind: 'direct' as const,
      ...(workspace.branches?.[source.id] === undefined ? {} : { branch: workspace.branches[source.id] }),
    })) ?? []
  }

  private run<T>(operation: (catalog: Catalog) => T | Promise<T>): Promise<T> {
    if (this.ctx.invocation?.peer.principal.kind !== 'owner') throw serviceError('owner_required')
    if (this.closed) throw serviceError('loom_disposed')
    const call = this.catalog.then(async catalog => {
      if (this.closed) throw serviceError('loom_disposed')
      try {
        const result = await operation(catalog)
        this.refreshSnapshot(catalog)
        return result
      } catch (error) {
        this.refreshSnapshot(catalog)
        throw error
      }
    })
    this.pending.add(call)
    void call.then(() => this.pending.delete(call), () => this.pending.delete(call))
    return call
  }

  /**
   * Acquire or enqueue execution access for a Session that is explicitly bound
   * to a task round or registered as a temporary Session.
   *
   * A native Session whose cwd merely lives inside a Loom workspace is not part
   * of Loom's execution model and keeps its normal tool access.
   * @param sessionId - Session observed on the Agent runtime.
   * @param cwd - the Agent's working directory, used to resolve a temporary Session's workspace.
   * @returns a denial when the bound Session may not write, otherwise undefined.
   */
  private async admitExecution(sessionId: Branded<'SessionId'>, cwd: string | undefined): Promise<{ readonly kind: 'deny'; readonly reason: string } | undefined> {
    try {
      const catalog = await this.catalog
      if (this.closed) return undefined
      const snapshot = catalog.snapshot()
      const binding = findSessionAttempt(snapshot, sessionId)
      if (binding === undefined) {
        const temporary = cwd === undefined ? undefined : findWorkspaceByPath(snapshot, cwd)
        if (temporary === undefined || !snapshot.temporarySessions.some(record => record.sessionId === sessionId
          && (record.workspacePath === (temporary.rootPath ?? temporary.path) || record.workspacePath === temporary.path))) return undefined
        return this.admitWorkspaceExecution(catalog, temporary, sessionId)
      }
      const workspace = snapshot.workspaces.find(candidate => candidate.id === binding.attempt.workspaceId && candidate.cleaned !== true)
      if (workspace === undefined) return undefined
      return this.admitWorkspaceExecution(catalog, workspace, sessionId)
    } catch {
      return { kind: 'deny', reason: 'Loom execution state is unavailable; the tool call was not executed.' }
    }
  }

  /** Apply the workspace owner/waiting rule for one already-authorized Session. */
  private async admitWorkspaceExecution(catalog: Catalog, workspace: WorkspaceRecord, sessionId: Branded<'SessionId'>): Promise<{ readonly kind: 'deny'; readonly reason: string } | undefined> {
    const current = catalog.snapshot().executions.find(execution => execution.workspaceId === workspace.id)
    if (current?.owner?.sessionId === sessionId) return undefined
    if (current?.waiting.includes(sessionId) === true) return { kind: 'deny', reason: 'Loom workspace execution is queued behind another session.' }
    const state = await catalog.acquireExecution(workspace.id, sessionId)
    if (state.owner?.sessionId === sessionId) return undefined
    return { kind: 'deny', reason: 'Loom workspace execution is held by another session. Wait for handoff or request takeover.' }
  }

  private async releaseSession(sessionId: Branded<'SessionId'>): Promise<void> {
    try {
      const catalog = await this.catalog
      if (this.closed) return
      await catalog.releaseSession(sessionId)
    } catch {
      // Teardown cleanup is best effort; the tool gate still refuses a non-owner.
    }
  }

  /** Derive (or reuse) the version-level context for the current snapshot. */
  private versionContextFor(versionId: string): VersionContext | undefined {
    const cached = this.versionContexts.get(versionId)
    if (cached !== undefined) return cached
    const snapshot = this.current
    if (snapshot === undefined) return undefined
    const context = deriveVersionContext(snapshot, versionId, { limits: this.contextLimits })
    if (context !== undefined) this.versionContexts.set(versionId, context)
    return context
  }

  /**
   * Resolve the task a Session is attached to, as recorded by the Host catalog.
   * Temporary Sessions and Sessions without a live workspace have no binding.
   */
  private findSessionBinding(sessionId: Branded<'SessionId'>): { taskId: string; versionId: string; workspacePath: string } | undefined {
    const snapshot = this.current
    if (snapshot === undefined) return undefined
    for (let taskIndex = snapshot.tasks.length - 1; taskIndex >= 0; taskIndex -= 1) {
      const task = snapshot.tasks[taskIndex]!
      for (let attemptIndex = task.attempts.length - 1; attemptIndex >= 0; attemptIndex -= 1) {
        const attempt = task.attempts[attemptIndex]!
        if (!attempt.sessionIds.includes(sessionId)) continue
        const workspace = snapshot.workspaces.find(candidate => candidate.id === attempt.workspaceId && candidate.cleaned !== true)
        if (workspace === undefined) return undefined
        if (!snapshot.versions.some(candidate => candidate.id === task.versionId)) return undefined
        return { taskId: task.id, versionId: task.versionId, workspacePath: workspace.rootPath ?? workspace.path }
      }
    }
    return undefined
  }

  /** Synchronous model-request provider; returns the last pointer when the snapshot cannot be read. */
  private versionContextPointer(sessionId: Branded<'SessionId'>): string {
    try {
      if (!this.contextEnabled || this.closed) return ''
      const binding = this.findSessionBinding(sessionId)
      if (binding === undefined) {
        this.sessionPointerText.delete(sessionId)
        return ''
      }
      const base = this.versionContextFor(binding.versionId)
      if (base === undefined) return this.sessionPointerText.get(sessionId) ?? ''
      const context = withCurrentTask(base, binding.taskId, { limits: this.contextLimits })
      const text = renderVersionContext(context, { limits: this.contextLimits })
      this.sessionPointerText.set(sessionId, text)
      return text
    } catch {
      return this.sessionPointerText.get(sessionId) ?? ''
    }
  }

  /** Register, refresh or remove one Session's Agent-scoped version context. */
  private syncVersionContext(sessionId: Branded<'SessionId'>): void {
    try {
      if (!this.contextEnabled || this.closed) return
      const binding = this.findSessionBinding(sessionId)
      if (binding === undefined || this.versionContextFor(binding.versionId) === undefined) {
        this.disposeVersionContext(sessionId)
        return
      }
      const agents = this.ctx.get('agents') as LoomAgentRegistry | undefined
      const agent = agents?.get(sessionId)
      // An Agent created before the task attachment registers on `agent/created`.
      if (agent === undefined) return
      if (!sameHostPath(agent.session.header.cwd, binding.workspacePath)) {
        this.disposeVersionContext(sessionId)
        return
      }
      const existing = this.sessionVersionContexts.get(sessionId)
      if (existing !== undefined && existing.taskId === binding.taskId && existing.versionId === binding.versionId) return
      const prompt = agent.ctx.get('systemPrompt') as PromptContextRegistrar | undefined
      if (prompt === undefined || typeof prompt.context !== 'function') return
      existing?.dispose()
      this.sessionVersionContexts.delete(sessionId)
      this.sessionPointerText.delete(sessionId)
      const dispose = prompt.context({
        name: VERSION_CONTEXT_NAME,
        order: VERSION_CONTEXT_ORDER,
        required: true,
        interpolate: false,
        text: () => this.versionContextPointer(sessionId),
      })
      this.sessionVersionContexts.set(sessionId, { taskId: binding.taskId, versionId: binding.versionId, dispose })
    } catch {
      // Agent creation and Remote replies must never fail because context registration did.
    }
  }

  /** Drop one Session's registration and cached pointer after teardown or a lost binding. */
  private disposeVersionContext(sessionId: Branded<'SessionId'>): void {
    const existing = this.sessionVersionContexts.get(sessionId)
    this.sessionVersionContexts.delete(sessionId)
    this.sessionPointerText.delete(sessionId)
    if (existing === undefined) return
    try {
      existing.dispose()
    } catch {
      // The Agent scope may already be disposed; its registration disappeared with it.
    }
  }

  /**
   * Stop the owning Agent turn, cancel live descendants, and wait for observable idleness.
   * Descendant ownership is read from the live Agent registry; a child that disappears
   * during cancellation no longer contributes stop evidence.
   * @param sessionId - Session holding the current workspace execution token.
   * @returns the trusted stop outcome used to confirm or block handoff.
   */
  /** Take over for an Agent tool after the human approved the native confirmation prompt. */
  private async takeoverForAgent(sessionIdValue: string): Promise<Record<string, unknown>> {
    const catalog = await this.catalog
    if (this.closed) throw serviceError('loom_disposed')
    const sessionId = brandString<Branded<'SessionId'>>(sessionIdValue)
    const snapshot = catalog.snapshot()
    const binding = findSessionAttempt(snapshot, sessionId)
    if (binding === undefined) throw new Error('this Session is not attached to a Loom task round; takeover was not performed')
    const workspace = snapshot.workspaces.find(candidate => candidate.id === binding.attempt.workspaceId && candidate.cleaned !== true)
    if (workspace === undefined) throw new Error('the task workspace is no longer active')
    const previous = snapshot.executions.find(candidate => candidate.workspaceId === workspace.id)
    if (previous?.owner === null || previous?.owner === undefined) {
      const state = await catalog.acquireExecution(workspace.id, sessionId)
      return { workspaceId: workspace.id, owner: state.owner?.sessionId ?? null, sessionId }
    }
    if (previous.owner.sessionId === sessionId) return { workspaceId: workspace.id, owner: sessionId, sessionId }
    const begun = await catalog.beginTakeover(workspace.id, sessionId)
    const outcome = await this.stopOwner(begun.owner.sessionId)
    try {
      const state = await catalog.finishTakeover(workspace.id, begun.owner, outcome)
      return { workspaceId: workspace.id, owner: state.owner?.sessionId ?? null, sessionId, previousOwner: begun.owner.sessionId }
    } finally {
      this.refreshSnapshot(catalog)
    }
  }

  private async stopOwner(sessionId: Branded<'SessionId'>): Promise<StopOutcome> {
    const agents = this.ctx.get('agents') as LoomAgentRegistry | undefined
    if (agents === undefined) return 'unknown'
    const agent = agents.get(sessionId)
    if (agent === undefined || agent.status !== 'running') return 'stopped'
    const targets = new Set<LoomAgent>([agent])
    const listed = agents.list?.()
    const ownedBy = agents.isOwnedBy
    if (listed !== undefined && ownedBy !== undefined) {
      let changed = true
      while (changed) {
        changed = false
        for (const candidate of listed) {
          if (targets.has(candidate)) continue
          if ([...targets].some(owner => ownedBy(candidate.session.id, owner))) {
            targets.add(candidate)
            changed = true
          }
        }
      }
    }
    try {
      agent.cancel({ kind: 'user' }, { keepInbox: true })
    } catch {
      return 'failed'
    }
    for (const target of targets) {
      if (target === agent) continue
      try { target.cancel({ kind: 'user' }, { keepInbox: true }) } catch { /* the child may have stopped with its owner */ }
    }
    const deadline = Date.now() + 10_000
    while (Date.now() < deadline) {
      if ([...targets].every(target => target.status !== 'running')) return 'stopped'
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    return 'unknown'
  }

  /** Read a detached catalog snapshot. @returns current committed records. */
  @Remote
  snapshot(): Promise<CatalogSnapshot> { return this.run(catalog => catalog.snapshot()) }

  /** Admit imported project JSON. @param request - project configuration. @returns persisted project. */
  @Remote
  createProject(request: ProjectConfig): Promise<ProjectRecord> { return this.run(catalog => catalog.createProject(request)) }

  /** Replace a project's admitted configuration. @param request - project identity and new configuration. @returns persisted project. */
  @Remote
  updateProject(request: UpdateProjectRequest): Promise<ProjectRecord> {
    return this.run(catalog => {
      const parsed = updateProjectRequest.parse(request)
      return catalog.updateProject(brandString<ProjectRecord['id']>(parsed.projectId), parseProject(parsed.config))
    })
  }

  /** Delete a project with no versions. @param request - project identity. @returns nothing after the record is gone. */
  @Remote
  deleteProject(request: DeleteProjectRequest): Promise<void> {
    return this.run(catalog => catalog.deleteProject(brandString<ProjectRecord['id']>(deleteProjectRequest.parse(request).projectId)))
  }

  /** Create a version. @param request - project, title, description and repository refs. @returns persisted version. */
  @Remote
  createVersion(request: CreateVersionRequest): Promise<VersionRecord> {
    return this.run(async catalog => {
      const parsed = versionRequest.parse(request)
      const version = await catalog.createVersion(
        brandString<ProjectRecord['id']>(parsed.projectId),
        parsed.name,
        parsed.sources.map(source => ({ sourceId: brandString<VersionRecord['sources'][number]['sourceId']>(source.sourceId), ref: source.ref })),
        parsed.description,
        parsed.targets?.map(target => ({
          subProjectId: brandString<Branded<'loom.subproject'>>(target.subProjectId),
          sourceId: brandString<VersionRecord['sources'][number]['sourceId']>(target.sourceId),
          ref: target.ref,
        })),
      )
      if (parsed.workspaces === undefined) return version
      try {
        const lock = await catalog.generateLock(version.id)
        for (const input of parsed.workspaces) await this.prepareVersionWorkspace(catalog, version, lock, input)
        return version
      } catch (error) {
        // A partially prepared workspace can exist even when its own call rejected.
        // Remove only records created for this new version, then remove the version.
        for (const workspace of catalog.snapshot().workspaces.filter(candidate => candidate.versionId === version.id)) {
          try { await catalog.cleanupWorkspace(workspace.id, true) } catch { /* retain the original failure for the caller */ }
        }
        try { await catalog.deleteVersion(version.id) } catch { /* report the original preparation failure */ }
        throw error
      }
    })
  }

  /** Materialize one workspace while saving a version.
   * @param catalog - live catalog
   * @param version - owning version
   * @param lock - resolved baseline
   * @param input - auto-created or linked workspace input
   */
  private async prepareVersionWorkspace(catalog: Catalog, version: VersionRecord, lock: Lock, input: VersionWorkspaceInput): Promise<WorkspaceRecord> {
    const snapshot = catalog.snapshot()
    const project = snapshot.projects.find(candidate => candidate.id === version.projectId)
    if (project === undefined) throw serviceError('missing_project')
    const targetIds = new Set(lock.repositories.map(repository => repository.sourceId))
    const sources = project.config.sources.filter(source => targetIds.has(source.id))
    if (sources.length === 0) throw serviceError('workspace_mismatch')
    if (input.mode === 'auto') {
      if (!isAbsolute(input.parentPath) || normalize(input.parentPath) !== input.parentPath) throw serviceError('invalid_workspace_path')
      if (!/^[A-Za-z0-9._-]+$/u.test(input.name) || input.name === '.' || input.name === '..') throw serviceError('invalid_workspace_path')
      const root = join(input.parentPath, input.name)
      const prefix = input.branchPrefix ?? 'loom'
      if (!/^(?![-.])[A-Za-z0-9._/-]+$/u.test(prefix)) throw serviceError('invalid_workspace_path')
      const branch = `${prefix}/${input.name}`
      const branches: Record<string, string> = {}
      const repositories = sources.map(source => {
        const pinned = lock.repositories.find(repository => repository.sourceId === source.id)
        const subProjectId = pinned?.subProjectId === undefined ? 'default' : String(pinned.subProjectId)
        const path = autoWorkspaceRepositoryPath(subProjectId, source)
        branches[source.id] = branch
        return { sourceId: source.id, path, targetPath: join(root, path) }
      })
      const prepared = await catalog.prepareWorkspace({ path: root, versionId: version.id, lockId: lock.id, mode: 'managed', repositories, branches, requireBranches: true })
      if (prepared.preparation?.status === 'failed') {
        const failed = prepared.preparation.repositories.filter(repository => repository.status === 'failed')
        const reason = failed.length > 0
          ? failed.map(repository => `${repository.path ?? String(repository.sourceId)}: ${repository.error ?? 'failed'}`).join('; ')
          : prepared.preparation.error ?? 'workspace preparation failed'
        throw new Error(reason)
      }
      return prepared
    }
    if (!isAbsolute(input.rootPath) || normalize(input.rootPath) !== input.rootPath) throw serviceError('invalid_workspace_path')
    if (input.repositories.length !== sources.length) throw serviceError('workspace_mismatch')
    const branches: Record<string, string> = {}
    const repositories: { sourceId: Branded<'loom.source'>; path: string; targetPath: string }[] = []
    for (const source of sources) {
      const mapping = input.repositories.find(candidate => candidate.sourceId === source.id)
      if (mapping === undefined) throw serviceError('workspace_mismatch')
      if (!isAbsolute(mapping.targetPath) || normalize(mapping.targetPath) !== mapping.targetPath) throw serviceError('invalid_workspace_path')
      const current = await repositoryBranches(mapping.targetPath)
      if (current.current === undefined) throw serviceError('detached_head', mapping.targetPath)
      branches[source.id] = current.current
      const pinned = lock.repositories.find(repository => repository.sourceId === source.id)
      const subProjectId = pinned?.subProjectId === undefined ? 'default' : String(pinned.subProjectId)
      repositories.push({ sourceId: source.id, path: autoWorkspaceRepositoryPath(subProjectId, source), targetPath: mapping.targetPath })
    }
    return catalog.registerPreparedWorkspace({
      path: input.rootPath, rootPath: input.rootPath, rootOwner: 'user', versionId: version.id, lockId: lock.id, mode: 'direct', branches, repositories,
    })
  }

  /** Replace a version's name, description and repository refs. @param request - version identity and new values. @returns persisted version. */
  @Remote
  updateVersion(request: UpdateVersionRequest): Promise<VersionRecord> {
    return this.run(catalog => {
      const parsed = updateVersionRequest.parse(request)
      return catalog.updateVersion(
        brandString<VersionRecord['id']>(parsed.versionId),
        parsed.name,
        parsed.sources.map(source => ({ sourceId: brandString<VersionRecord['sources'][number]['sourceId']>(source.sourceId), ref: source.ref })),
        parsed.description,
        parsed.targets?.map(target => ({
          subProjectId: brandString<Branded<'loom.subproject'>>(target.subProjectId),
          sourceId: brandString<VersionRecord['sources'][number]['sourceId']>(target.sourceId),
          ref: target.ref,
        })),
      )
    })
  }

  /** Delete a version with no tasks or workspaces. @param request - version identity. @returns nothing after its Locks are gone. */
  @Remote
  deleteVersion(request: DeleteVersionRequest): Promise<void> {
    return this.run(catalog => catalog.deleteVersion(brandString<VersionRecord['id']>(deleteVersionRequest.parse(request).versionId)))
  }

  /** Delete a task after its workspaces are cleaned. @param request - task identity. @returns nothing after the task record is gone. */
  @Remote
  deleteTask(request: DeleteTaskRequest): Promise<void> {
    return this.run(catalog => catalog.deleteTask(brandString<TaskRecord['id']>(deleteTaskRequest.parse(request).taskId)))
  }

  /** Resolve all version refs. @param request - owning version. @returns immutable Lock. */
  @Remote
  generateLock(request: GenerateLockRequest): Promise<Lock> {
    return this.run(catalog => catalog.generateLock(brandString<VersionRecord['id']>(lockRequest.parse(request).versionId)))
  }

  /** Create a pending task. @param request - fixed version and title. @returns persisted task. */
  @Remote
  createTask(request: CreateTaskRequest): Promise<TaskRecord> {
    return this.run(catalog => {
      const parsed = taskRequest.parse(request)
      return catalog.createTask(brandString<VersionRecord['id']>(parsed.versionId), parsed.title, {
        ...(parsed.workspaceId === undefined ? {} : { workspaceId: brandString<WorkspaceRecord['id']>(parsed.workspaceId) }),
        ...(parsed.description === undefined ? {} : { description: parsed.description }),
        ...(parsed.moduleIds === undefined ? {} : { moduleIds: parsed.moduleIds.map(moduleId => brandString<Branded<'loom.module'>>(moduleId)) }),
        ...(parsed.priority === undefined ? {} : { priority: parsed.priority }),
      })
    })
  }

  /** Replace editable task metadata. @param request - task identity and metadata. @returns persisted task. */
  @Remote
  updateTask(request: UpdateTaskRequest): Promise<TaskRecord> {
    return this.run(catalog => {
      const parsed = updateTaskRequest.parse(request)
      return catalog.updateTask(brandString<TaskRecord['id']>(parsed.taskId), parsed.title, {
        ...(parsed.description === undefined ? {} : { description: parsed.description }),
        ...(parsed.moduleIds === undefined ? {} : { moduleIds: parsed.moduleIds.map(moduleId => brandString<Branded<'loom.module'>>(moduleId)) }),
        ...(parsed.priority === undefined ? {} : { priority: parsed.priority }),
      })
    })
  }

  /** Materialize a workspace from a version Lock and record it. @param request - owning baseline and an optional absolute root. @returns persisted workspace. */
  @Remote
  prepareWorkspace(request: PrepareWorkspaceRequest): Promise<WorkspaceRecord> {
    return this.run(catalog => {
      const parsed = workspaceRequest.parse(request)
      const path = parsed.path ?? join(this.workspacesDir, `workspace-${randomUUID().slice(0, 8)}`)
      return catalog.prepareWorkspace({
        path,
        versionId: brandString<Lock['versionId']>(parsed.versionId),
        lockId: brandString<Lock['id']>(parsed.lockId),
        ...(parsed.branches === undefined ? {} : { branches: parsed.branches }),
        ...(parsed.mode === undefined ? {} : { mode: parsed.mode }),
        ...(parsed.repositories === undefined ? {} : {
          repositories: parsed.repositories.map(repository => ({
            sourceId: brandString<Branded<'loom.source'>>(repository.sourceId),
            path: repository.path,
            targetPath: repository.targetPath,
          })),
        }),
        ...(parsed.workspaceId === undefined ? {} : { workspaceId: brandString<WorkspaceRecord['id']>(parsed.workspaceId) }),
        ...(parsed.requireBranches === undefined ? {} : { requireBranches: parsed.requireBranches }),
      })
    })
  }

  /** Read local branches of one repository. @param request - absolute repository path. @returns current and available branches. */
  @Remote
  repositoryBranches(request: RepositoryBranchesRequest): Promise<{ topLevel: string; current?: string; branches: readonly string[] }> {
    return this.run(() => repositoryBranches(repositoryBranchesRequest.parse(request).repo))
  }

  /** Commit all uncommitted workspace changes without pushing. @param request - workspace identity and optional subject. @returns per-repository checkpoint results. */
  @Remote
  commitWorkspace(request: CommitWorkspaceRequest): Promise<WorkspaceCommitResult> {
    return this.run(catalog => {
      const parsed = commitWorkspaceRequest.parse(request)
      return catalog.commitWorkspace(brandString<WorkspaceRecord['id']>(parsed.workspaceId), parsed.message ?? 'Loom checkpoint')
    })
  }

  /** Check one existing workspace root against a version's repositories. @param request - absolute root and version. @returns per-repository Git status, without registering anything. */
  @Remote
  inspectWorkspace(request: InspectWorkspaceRequest): Promise<WorkspaceInspection> {
    const parsed = inspectWorkspaceRequest.parse(request)
    return this.run(catalog => inspectWorkspace(catalog.snapshot(), parsed.path, parsed.versionId))
  }

  /** Read every repository's changes against a workspace Lock. @param request - prepared workspace identity. @returns changed files and hunks per repository. */
  @Remote
  workspaceChanges(request: WorkspaceChangesRequest): Promise<{ repositories: WorkspaceRepositoryChangesRecord[] }> {
    return this.run(catalog => {
      const parsed = workspaceChangesRequest.parse(request)
      return catalog.workspaceChanges(
        brandString<WorkspaceRecord['id']>(parsed.workspaceId),
        parsed.attemptId === undefined ? undefined : brandString<Branded<'loom.attempt'>>(parsed.attemptId),
      )
    })
  }

  /** Count changed files in a workspace without reading their diffs. @param request - prepared workspace identity. @returns changed-file count, including untracked files. */
  @Remote
  workspaceChangeCount(request: WorkspaceChangesRequest): Promise<number> {
    return this.run(catalog => {
      const parsed = workspaceChangesRequest.parse(request)
      return catalog.workspaceChangeCount(
        brandString<WorkspaceRecord['id']>(parsed.workspaceId),
        parsed.attemptId === undefined ? undefined : brandString<Branded<'loom.attempt'>>(parsed.attemptId),
      )
    })
  }

  /** Read whether a workspace is owned by a running task and what it has changed. @param request - prepared workspace identity. @returns ownership and changes. */
  @Remote
  workspaceStatus(request: WorkspaceChangesRequest): Promise<WorkspaceStatusResult> {
    return this.run(catalog => {
      const parsed = workspaceChangesRequest.parse(request)
      return catalog.workspaceStatus(
        brandString<WorkspaceRecord['id']>(parsed.workspaceId),
        parsed.attemptId === undefined ? undefined : brandString<Branded<'loom.attempt'>>(parsed.attemptId),
      )
    })
  }

  /** Remove a workspace, optionally deleting its directory after path confirmation. @param request - workspace, delete-files flag and echoed root. @returns nothing after the record and optional files are gone. */
  @Remote
  deleteWorkspace(request: DeleteWorkspaceRequest): Promise<void> {
    return this.run(catalog => {
      const parsed = deleteWorkspaceRequest.parse(request)
      return catalog.deleteWorkspace(
        brandString<WorkspaceRecord['id']>(parsed.workspaceId),
        parsed.deleteFiles === true,
        parsed.confirmPath,
      )
    })
  }

  /** Update editable Workspace metadata. @param request - workspace identity and display label. @returns persisted workspace. */
  @Remote
  updateWorkspace(request: UpdateWorkspaceRequest): Promise<WorkspaceRecord> {
    return this.run(catalog => {
      const parsed = updateWorkspaceRequest.parse(request)
      return catalog.updateWorkspace(brandString<WorkspaceRecord['id']>(parsed.workspaceId), parsed.label ?? '')
    })
  }

  /** Remove a retained workspace after explicit confirmation. @param request - workspace and whether uncommitted changes may be discarded. @returns nothing after worktrees and the record are gone. */
  @Remote
  cleanupWorkspace(request: CleanupWorkspaceRequest): Promise<void> {
    return this.run(async catalog => {
      const parsed = cleanupWorkspaceRequest.parse(request)
      await catalog.cleanupWorkspace(brandString<WorkspaceRecord['id']>(parsed.workspaceId), parsed.discardChanges === true)
    })
  }

  /** Record a prepared workspace whose files already exist. @param request - absolute path and owning baseline. @returns persisted workspace. */
  @Remote
  registerWorkspace(request: RegisterWorkspaceRequest): Promise<WorkspaceRecord> {
    return this.run(async catalog => {
      const parsed = registerWorkspaceRequest.parse(request)
      const snapshot = catalog.snapshot()
      const registered = parsed.mode === 'linked' ? undefined : snapshot.workspaces.find(candidate => candidate.cleaned !== true
        && (candidate.rootPath ?? candidate.path) === (parsed.rootPath ?? parsed.path)
        && (candidate.mode ?? 'direct') === 'direct'
        && sameRepositoryMappings(parsed.repositories, candidate.repositories))
      if (registered !== undefined) {
        const version = snapshot.versions.find(candidate => candidate.id === parsed.versionId)
        const projectId = registered.projectId ?? snapshot.versions.find(candidate => candidate.id === registered.versionId)?.projectId
        if (version !== undefined && projectId === version.projectId) {
          await catalog.ensureWorkspaceBranches(registered.id)
          return catalog.ensureWorkspaceSkillLinks(registered.id)
        }
      }
      const branches = { ...parsed.branches }
      let repositories: { sourceId: Branded<'loom.source'>; path: string; targetPath: string }[] | undefined
      if (parsed.repositories !== undefined) {
        repositories = parsed.repositories.map(repository => {
          const sourceId = brandString<Branded<'loom.source'>>(repository.sourceId)
          return { sourceId, path: repository.path, targetPath: repository.targetPath }
        })
        for (const repository of repositories) {
          const current = await repositoryBranches(repository.targetPath)
          if (parsed.requireBranches === true && current.current === undefined) throw serviceError('detached_head', repository.targetPath)
          if (branches[repository.sourceId] === undefined && current.current !== undefined) branches[repository.sourceId] = current.current
        }
      } else {
        const inspection = await inspectWorkspace(catalog.snapshot(), parsed.path, parsed.versionId)
        const failed = inspection.repositories.find(repository => repository.error !== undefined)
        if (failed !== undefined) throw new Error(`invalid_workspace_path: ${failed.directory} (${failed.error ?? 'not_git'})`)
        for (const repository of inspection.repositories) {
          if (parsed.requireBranches === true && repository.current === undefined) throw serviceError('detached_head', repository.directory)
          if (branches[repository.sourceId] === undefined && repository.current !== undefined) branches[repository.sourceId] = repository.current
        }
      }
      const workspace = await catalog.registerPreparedWorkspace({
        path: parsed.path,
        versionId: brandString<Lock['versionId']>(parsed.versionId),
        lockId: brandString<Lock['id']>(parsed.lockId),
        ...(Object.keys(branches).length === 0 ? {} : { branches }),
        ...(parsed.mode === undefined ? {} : { mode: parsed.mode }),
        ...(parsed.projectId === undefined ? {} : { projectId: brandString<Branded<'loom.project'>>(parsed.projectId) }),
        ...(parsed.rootPath === undefined ? {} : { rootPath: parsed.rootPath }),
        ...(parsed.rootOwner === undefined ? {} : { rootOwner: parsed.rootOwner }),
        ...(repositories === undefined ? {} : { repositories }),
      })
      await catalog.ensureWorkspaceBranches(workspace.id)
      return catalog.ensureWorkspaceSkillLinks(workspace.id)
    })
  }

  /** Start the next execution round on a prepared workspace. @param request - task and workspace identities. @returns the running task. */
  @Remote
  startAttempt(request: StartAttemptRequest): Promise<TaskRecord> {
    return this.run(async catalog => {
      const parsed = attemptRequest.parse(request)
      const workspaceId = brandString<WorkspaceRecord['id']>(parsed.workspaceId)
      const record = catalog.snapshot().workspaces.find(candidate => candidate.id === workspaceId)
      if (record === undefined) throw serviceError('missing_workspace')
      if (record.cleaned === true) throw serviceError('workspace_cleaned')
      // A partially prepared workspace has no complete worktree set to reconcile.
      if (record.preparation !== undefined && record.preparation.status !== 'ready') throw serviceError('workspace_not_prepared', `preparation is ${record.preparation.status}`)
      const workspace = await catalog.ensureWorkspaceBranches(workspaceId)
      if (workspace.cleaned === true) throw serviceError('workspace_cleaned')
      if (await catalog.workspaceDirty(workspaceId)) throw serviceError('workspace_changes')
      await catalog.ensureWorkspaceSkillLinks(workspaceId)
      return catalog.startAttempt(brandString<TaskRecord['id']>(parsed.taskId), workspaceId, parsed.allowBusy === true ? { allowBusy: true } : undefined)
    })
  }

  /** Associate another native Session with the current round. @param request - task and Session identities. @returns the updated task. */
  @Remote
  attachSession(request: AttachSessionRequest): Promise<TaskRecord> {
    const parsed = sessionRequest.parse(request)
    const sessionId = brandString<Branded<'SessionId'>>(parsed.sessionId)
    const call = this.run(catalog => catalog.attachSession(brandString<TaskRecord['id']>(parsed.taskId), sessionId))
    // The Agent may predate the attachment; register after the catalog write and
    // its snapshot refresh, without delaying the Remote reply.
    void call.then(() => this.syncVersionContext(sessionId), () => undefined)
    return call
  }

  /** Mark a native Session as a Loom temporary Session. @param request - Session identity and prepared workspace path. @returns the committed record. */
  @Remote
  registerTemporarySession(request: RegisterTemporarySessionRequest): Promise<TemporarySessionRecord> {
    const parsed = temporarySessionRequest.parse(request)
    const sessionId = brandString<Branded<'SessionId'>>(parsed.sessionId)
    const call = this.run(catalog => catalog.registerTemporarySession(sessionId, parsed.workspacePath))
    // Temporary Sessions are never task-bound; drop any stale registration.
    void call.then(() => this.syncVersionContext(sessionId), () => undefined)
    return call
  }

  /** Stop treating a native Session as a Loom temporary Session. @param request - Session identity. @returns nothing after the record is gone. */
  @Remote
  forgetTemporarySession(request: ForgetTemporarySessionRequest): Promise<void> {
    return this.run(catalog => catalog.forgetTemporarySession(brandString<Branded<'SessionId'>>(forgetTemporarySessionRequest.parse(request).sessionId)))
  }

  /** Change business status under the trusted caller identity. @param request - task, target state and actor. @returns the updated task. */
  @Remote
  transitionTask(request: TransitionTaskRequest): Promise<TaskRecord> {
    return this.run(catalog => {
      const parsed = transitionRequest.parse(request)
      return catalog.transitionTask(brandString<TaskRecord['id']>(parsed.taskId), parsed.target, parsed.actor, parsed.basis === undefined ? undefined : { basis: parsed.basis })
    })
  }

  /** Acquire workspace execution access or join its FIFO wait queue. @param request - workspace and requesting Session. @returns the committed scheduling state. */
  @Remote
  acquireExecution(request: ExecutionRequest): Promise<ExecutionState> {
    return this.run(catalog => {
      const parsed = executionRequest.parse(request)
      return catalog.acquireExecution(
        brandString<WorkspaceRecord['id']>(parsed.workspaceId),
        brandString<Branded<'SessionId'>>(parsed.sessionId),
      )
    })
  }

  /** Replace the FIFO waiting order for one workspace. @param request - workspace and every waiting Session in the new order. @returns scheduling state after reordering. */
  @Remote
  reorderExecutionQueue(request: ReorderExecutionQueueRequest): Promise<ExecutionState> {
    return this.run(catalog => {
      const parsed = reorderExecutionQueueRequest.parse(request)
      return catalog.reorderExecutionQueue(
        brandString<WorkspaceRecord['id']>(parsed.workspaceId),
        parsed.sessionIds.map(id => brandString<Branded<'SessionId'>>(id)),
      )
    })
  }

  /** Leave the execution waiting queue for one Session. @param request - workspace and Session. @returns scheduling state after removal. */
  @Remote
  cancelExecution(request: ExecutionRequest): Promise<ExecutionState> {
    return this.run(catalog => {
      const parsed = executionRequest.parse(request)
      return catalog.cancelExecution(
        brandString<WorkspaceRecord['id']>(parsed.workspaceId),
        brandString<Branded<'SessionId'>>(parsed.sessionId),
      )
    })
  }

  /** Release an exact owned generation after its Agent turn settles. @param request - workspace, Session and generation. @returns the scheduling state after FIFO promotion. */
  @Remote
  releaseExecution(request: ReleaseExecutionRequest): Promise<ExecutionState> {
    return this.run(catalog => {
      const parsed = releaseExecutionRequest.parse(request)
      const workspaceId = brandString<WorkspaceRecord['id']>(parsed.workspaceId)
      const sessionId = brandString<Branded<'SessionId'>>(parsed.sessionId)
      const state = catalog.snapshot().executions.find(candidate => candidate.workspaceId === workspaceId)
      if (state?.owner?.sessionId !== sessionId || Number(state.owner.generation) !== parsed.generation) throw serviceError('stale_owner')
      return catalog.releaseExecution(workspaceId, state.owner)
    })
  }

  /**
   * Stop the current owner through the Agent runtime, then confirm or block handoff.
   * @param request - workspace and the Session requesting ownership.
   * @returns the state after confirmed stop, or the blocked takeover state.
   */
  @Remote
  async takeoverExecution(request: ExecutionRequest): Promise<ExecutionState> {
    if (this.ctx.invocation?.peer.principal.kind !== 'owner') throw serviceError('owner_required')
    if (this.closed) throw serviceError('loom_disposed')
    const parsed = executionRequest.parse(request)
    const workspaceId = brandString<WorkspaceRecord['id']>(parsed.workspaceId)
    const sessionId = brandString<Branded<'SessionId'>>(parsed.sessionId)
    const call = (async () => {
      const catalog = await this.catalog
      if (this.closed) throw serviceError('loom_disposed')
      try {
        const begun = await catalog.beginTakeover(workspaceId, sessionId)
        const outcome = await this.stopOwner(begun.owner.sessionId)
        try {
          return await catalog.finishTakeover(workspaceId, begun.owner, outcome)
        } catch (error) {
          if (!(error instanceof ExecutionError) || error.code !== 'stale_owner') throw error
          const settled = catalog.snapshot().executions.find(candidate => candidate.workspaceId === workspaceId)
          if (settled?.owner?.sessionId !== sessionId) throw error
          return settled
        }
      } finally {
        this.refreshSnapshot(catalog)
      }
    })()
    this.pending.add(call)
    void call.then(() => this.pending.delete(call), () => this.pending.delete(call))
    return call
  }
}
