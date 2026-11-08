/** Owner-only Loom catalog Remote service with quiescent disposal. */
import { Context, Service } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-api-remote-access'
import { brandString, type Branded } from '@deepseek-ai/dsh-brand'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createCatalog, type Catalog, type TemporarySessionRecord } from './catalog.ts'
import type { ContextConfig, Config } from './service/config.ts'
import { configSchema } from './service/config.ts'
import { serviceError } from './service/errors.ts'
import { fallbackBindings } from './service/inspection.ts'
import { executionRequest } from './service/requests.ts'
import { VersionContextRegistry } from './service/version-context.ts'
import { ExecutionOwnership } from './service/execution-runtime.ts'
import { registerAgentTools } from './service/agent-tools.ts'
import { RemoteOperations } from './service/remote-operations.ts'
export type { ContextConfig, Config } from './service/config.ts'
import type {
  AttachSessionRequest, CatalogSnapshot, CreateTaskRequest, CreateVersionRequest, GenerateLockRequest,
  CleanupWorkspaceRequest, PrepareWorkspaceRequest, ProjectConfig, ProjectRecord, RegisterWorkspaceRequest, StartAttemptRequest, TaskRecord, TransitionTaskRequest, WorkspaceChangesRequest, WorkspaceStatusResult,
  VersionRecord, WorkspaceRecord, ExecutionRequest, ReleaseExecutionRequest, UpdateProjectRequest, UpdateVersionRequest, UpdateTaskRequest,
  DeleteProjectRequest, DeleteVersionRequest, DeleteTaskRequest, RegisterTemporarySessionRequest, ForgetTemporarySessionRequest,
InspectWorkspaceRequest, WorkspaceInspection, CommitWorkspaceRequest, WorkspaceCommitResult, UpdateWorkspaceRequest, DeleteWorkspaceRequest, ReorderExecutionQueueRequest, RepositoryBranchesRequest, WorkspaceRepositoryChangesRecord,
} from '../types.ts'
import type { Lock } from '../domain/task.ts'
import { ExecutionError, type ExecutionState } from '../domain/execution.ts'
import { resolveCommit, resolveCommitTime } from '../git/workspace.ts'
import type {} from './events.ts'
import type { LoomAgentRegistry } from './events.ts'
import {
  VERSION_CONTEXT_DEFAULTS,
  type VersionContextLimits,
} from '../shared/version-context.ts'

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
  /** Version-context caches and per-Session prompt registrations. */
  private readonly versionContext: VersionContextRegistry
  private readonly execution: ExecutionOwnership
  private readonly operations: RemoteOperations

  constructor(ctx: Context, config: Config) {
    super(ctx, 'loom')
    const admitted = configSchema(config)
    this.workspacesDir = admitted.workspacesDir ?? join(dirname(admitted.catalogFile), 'workspaces')
    this.contextEnabled = admitted.context?.enabled !== false
    this.contextLimits = resolveContextLimits(admitted.context)
    this.versionContext = new VersionContextRegistry({
      isEnabled: () => this.contextEnabled,
      isClosed: () => this.closed,
      snapshot: () => this.current,
      limits: () => this.contextLimits,
      getAgent: sessionId => (this.ctx.get('agents') as LoomAgentRegistry | undefined)?.get(sessionId),
    })
    this.execution = new ExecutionOwnership({
      catalog: () => this.catalog,
      isClosed: () => this.closed,
      snapshot: () => this.current,
      refresh: catalog => this.refreshSnapshot(catalog),
      getAgents: () => this.ctx.get('agents') as LoomAgentRegistry | undefined,
    })
    this.operations = new RemoteOperations(this.workspacesDir, this.versionContext)
    mkdirSync(dirname(admitted.catalogFile), { recursive: true })
    mkdirSync(this.workspacesDir, { recursive: true })
    this.catalog = createCatalog(admitted.catalogFile, resolveCommit, resolveCommitTime)
    // Cache the loaded snapshot for synchronous Session and Agent lifecycle listeners.
    void this.catalog.then(catalog => { this.refreshSnapshot(catalog) }, () => undefined)
    ctx.effect(() => async () => {
      this.closed = true
      // Drop runtime-context registrations on the still-live Agents before the
      // service disappears, so a reloaded Host cannot inherit stale pointers.
      this.versionContext.disposeAll()
      await Promise.allSettled([this.catalog, ...this.pending])
    }, 'loom: settle catalog operations')
  }

  /** Replace the synchronous snapshot cache and invalidate derived version contexts. */
  private refreshSnapshot(catalog: Catalog): void {
    try {
      this.current = catalog.snapshot()
      this.versionContext.clearDerived()
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
      this.versionContext.syncVersionContext(agent.session.id)
      const cwd = agent.session.header.cwd
      if (cwd === undefined) return
      const workspace = this.current?.workspaces.find(candidate => candidate.cleaned !== true && (candidate.rootPath ?? candidate.path) === cwd)
      if (workspace === undefined) return
      const bindings = workspace.repositories ?? fallbackBindings(this.current, workspace)
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
    for (const agent of agents?.list?.() ?? []) this.versionContext.syncVersionContext(agent.session.id)
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
      const decision = await this.execution.admitExecution(exec.agent.session.id, exec.agent.session.header.cwd)
      return decision ?? next()
    })
    // Execution rights are held per Session, not per turn: a running turn
    // claims a free workspace, and only session disposal or an explicit release
    // gives it back. Idling between turns keeps the owner.
    this.ctx.on('agent/status', ({ agent, status }) => {
      if (status === 'running') void this.execution.claimIdleExecution(agent.session.id)
    })
    this.ctx.on('session/disposed', session => {
      this.versionContext.disposeVersionContext(session.id)
      void this.execution.releaseSession(session.id)
    })
    registerAgentTools(this.ctx, catalog, () => this.refreshSnapshot(catalog), sessionId => this.execution.takeoverForAgent(sessionId))
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

  @Remote
  snapshot(): Promise<CatalogSnapshot> { return this.operations.snapshot(operation => this.run(operation)) }

  @Remote
  createProject(request: ProjectConfig): Promise<ProjectRecord> { return this.operations.createProject(operation => this.run(operation), request) }

  @Remote
  updateProject(request: UpdateProjectRequest): Promise<ProjectRecord> { return this.operations.updateProject(operation => this.run(operation), request) }

  @Remote
  deleteProject(request: DeleteProjectRequest): Promise<void> { return this.operations.deleteProject(operation => this.run(operation), request) }

  @Remote
  createVersion(request: CreateVersionRequest): Promise<VersionRecord> { return this.operations.createVersion(operation => this.run(operation), request) }

  @Remote
  updateVersion(request: UpdateVersionRequest): Promise<VersionRecord> { return this.operations.updateVersion(operation => this.run(operation), request) }

  @Remote
  deleteVersion(request: DeleteVersionRequest): Promise<void> { return this.operations.deleteVersion(operation => this.run(operation), request) }

  @Remote
  deleteTask(request: DeleteTaskRequest): Promise<void> { return this.operations.deleteTask(operation => this.run(operation), request) }

  @Remote
  generateLock(request: GenerateLockRequest): Promise<Lock> { return this.operations.generateLock(operation => this.run(operation), request) }

  @Remote
  createTask(request: CreateTaskRequest): Promise<TaskRecord> { return this.operations.createTask(operation => this.run(operation), request) }

  @Remote
  updateTask(request: UpdateTaskRequest): Promise<TaskRecord> { return this.operations.updateTask(operation => this.run(operation), request) }

  @Remote
  prepareWorkspace(request: PrepareWorkspaceRequest): Promise<WorkspaceRecord> { return this.operations.prepareWorkspace(operation => this.run(operation), request) }

  @Remote
  repositoryBranches(request: RepositoryBranchesRequest): Promise<{ topLevel: string; current?: string; branches: readonly string[] }> {
    return this.operations.repositoryBranches(operation => this.run(operation), request)
  }

  @Remote
  workspaceChanges(request: WorkspaceChangesRequest): Promise<{ repositories: WorkspaceRepositoryChangesRecord[] }> {
    return this.operations.workspaceChanges(operation => this.run(operation), request)
  }

  @Remote
  commitWorkspace(request: CommitWorkspaceRequest): Promise<WorkspaceCommitResult> { return this.operations.commitWorkspace(operation => this.run(operation), request) }

  @Remote
  inspectWorkspace(request: InspectWorkspaceRequest): Promise<WorkspaceInspection> { return this.operations.inspectWorkspace(operation => this.run(operation), request) }

  @Remote
  workspaceChangeCount(request: WorkspaceChangesRequest): Promise<number> { return this.operations.workspaceChangeCount(operation => this.run(operation), request) }

  @Remote
  workspaceStatus(request: WorkspaceChangesRequest): Promise<WorkspaceStatusResult> { return this.operations.workspaceStatus(operation => this.run(operation), request) }

  @Remote
  deleteWorkspace(request: DeleteWorkspaceRequest): Promise<void> { return this.operations.deleteWorkspace(operation => this.run(operation), request) }

  @Remote
  updateWorkspace(request: UpdateWorkspaceRequest): Promise<WorkspaceRecord> { return this.operations.updateWorkspace(operation => this.run(operation), request) }

  @Remote
  cleanupWorkspace(request: CleanupWorkspaceRequest): Promise<void> { return this.operations.cleanupWorkspace(operation => this.run(operation), request) }

  @Remote
  registerWorkspace(request: RegisterWorkspaceRequest): Promise<WorkspaceRecord> { return this.operations.registerWorkspace(operation => this.run(operation), request) }

  @Remote
  startAttempt(request: StartAttemptRequest): Promise<TaskRecord> { return this.operations.startAttempt(operation => this.run(operation), request) }

  @Remote
  attachSession(request: AttachSessionRequest): Promise<TaskRecord> { return this.operations.attachSession(operation => this.run(operation), request) }

  @Remote
  registerTemporarySession(request: RegisterTemporarySessionRequest): Promise<TemporarySessionRecord> { return this.operations.registerTemporarySession(operation => this.run(operation), request) }

  @Remote
  forgetTemporarySession(request: ForgetTemporarySessionRequest): Promise<void> { return this.operations.forgetTemporarySession(operation => this.run(operation), request) }

  @Remote
  transitionTask(request: TransitionTaskRequest): Promise<TaskRecord> { return this.operations.transitionTask(operation => this.run(operation), request) }

  @Remote
  acquireExecution(request: ExecutionRequest): Promise<ExecutionState> { return this.operations.acquireExecution(operation => this.run(operation), request) }

  @Remote
  reorderExecutionQueue(request: ReorderExecutionQueueRequest): Promise<ExecutionState> { return this.operations.reorderExecutionQueue(operation => this.run(operation), request) }

  @Remote
  cancelExecution(request: ExecutionRequest): Promise<ExecutionState> { return this.operations.cancelExecution(operation => this.run(operation), request) }

  @Remote
  releaseExecution(request: ReleaseExecutionRequest): Promise<ExecutionState> { return this.operations.releaseExecution(operation => this.run(operation), request) }
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
        const outcome = await this.execution.stopOwner(begun.owner.sessionId)
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
