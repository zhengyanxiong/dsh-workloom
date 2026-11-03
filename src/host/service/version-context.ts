/**
 * Per-Session version-context registration and pointer rendering.
 *
 * The registry owns the caches and lifecycle of prompt-context registrations;
 * the service supplies the snapshot, limits and live Agent lookup.
 */
import { brandString, type Branded } from '@deepseek-ai/dsh-brand'
import type { CatalogSnapshot } from '../../api/records.ts'
import type { LoomAgent } from '../events.ts'
import {
  deriveVersionContext, renderVersionContext, withCurrentTask,
  type VersionContext, type VersionContextLimits,
} from '../../shared/version-context.ts'
import { sameHostPath } from './inspection.ts'

/**
 * Native prompt-context registrar subset used by Loom.
 */
interface PromptContextRegistrar {
  context(entry: {
    readonly name: string
    readonly order: number
    readonly required?: boolean | undefined
    readonly interpolate?: boolean | undefined
    readonly text: string | (() => string)
  }): () => void
}

/**
 * One Session's live version-context registration.
 */
interface VersionContextRegistration {
  readonly taskId: string
  readonly versionId: string
  readonly dispose: () => void
}

/**
 * Runtime-context name registered on each Agent bound to a Loom task.
 */
const VERSION_CONTEXT_NAME = 'loom:version-context'
/**
 * Ordering above workspace repository hints, below identity sections.
 */
const VERSION_CONTEXT_ORDER = 40

/**
 * The service surface required by the version-context registry.
 */
export interface VersionContextRuntime {
  isEnabled(): boolean
  isClosed(): boolean
  snapshot(): CatalogSnapshot | undefined
  limits(): VersionContextLimits
  getAgent(sessionId: Branded<'SessionId'>): LoomAgent | undefined
}

/**
 * Caches and prompt-context registrations for attached Loom Sessions.
 */
export class VersionContextRegistry {
  private readonly versionContexts = new Map<string, VersionContext>()
  private readonly sessionRegistrations = new Map<string, VersionContextRegistration>()
  /**
   * Last pointer text per Session, returned when derivation temporarily cannot read the
   * snapshot.
   */
  private readonly sessionPointerText = new Map<string, string>()

  constructor(private readonly runtime: VersionContextRuntime) {}

  /**
   * Derive (or reuse) the version-level context for the current snapshot.
   */
  versionContextFor(versionId: string): VersionContext | undefined {
    const cached = this.versionContexts.get(versionId)
    if (cached !== undefined) return cached
    const snapshot = this.runtime.snapshot()
    if (snapshot === undefined) return undefined
    const context = deriveVersionContext(snapshot, versionId, { limits: this.runtime.limits() })
    if (context !== undefined) this.versionContexts.set(versionId, context)
    return context
  }

  /**
   * Resolve the task a Session is attached to, as recorded by the Host catalog.
   * Temporary Sessions and Sessions without a live workspace have no binding.
   */
  findSessionBinding(sessionId: Branded<'SessionId'>): { taskId: string; versionId: string; workspacePath: string } | undefined {
    const snapshot = this.runtime.snapshot()
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

  /**
   * Synchronous model-request provider; returns the last pointer when the snapshot cannot be
   * read.
   */
  versionContextPointer(sessionId: Branded<'SessionId'>): string {
    try {
      if (!this.runtime.isEnabled() || this.runtime.isClosed()) return ''
      const binding = this.findSessionBinding(sessionId)
      if (binding === undefined) {
        this.sessionPointerText.delete(sessionId)
        return ''
      }
      const base = this.versionContextFor(binding.versionId)
      if (base === undefined) return this.sessionPointerText.get(sessionId) ?? ''
      const context = withCurrentTask(base, binding.taskId, { limits: this.runtime.limits() })
      const text = renderVersionContext(context, { limits: this.runtime.limits() })
      this.sessionPointerText.set(sessionId, text)
      return text
    } catch {
      return this.sessionPointerText.get(sessionId) ?? ''
    }
  }

  /**
   * Register, refresh or remove one Session's Agent-scoped version context.
   */
  syncVersionContext(sessionId: Branded<'SessionId'>): void {
    try {
      if (!this.runtime.isEnabled() || this.runtime.isClosed()) return
      const binding = this.findSessionBinding(sessionId)
      if (binding === undefined || this.versionContextFor(binding.versionId) === undefined) {
        this.disposeVersionContext(sessionId)
        return
      }
      const agent = this.runtime.getAgent(sessionId)
      // An Agent created before the task attachment registers on `agent/created`.
      if (agent === undefined) return
      if (!sameHostPath(agent.session.header.cwd, binding.workspacePath)) {
        this.disposeVersionContext(sessionId)
        return
      }
      const existing = this.sessionRegistrations.get(sessionId)
      if (existing !== undefined && existing.taskId === binding.taskId && existing.versionId === binding.versionId) return
      const prompt = agent.ctx.get('systemPrompt') as PromptContextRegistrar | undefined
      if (prompt === undefined || typeof prompt.context !== 'function') return
      existing?.dispose()
      this.sessionRegistrations.delete(sessionId)
      this.sessionPointerText.delete(sessionId)
      const dispose = prompt.context({
        name: VERSION_CONTEXT_NAME,
        order: VERSION_CONTEXT_ORDER,
        required: true,
        interpolate: false,
        text: () => this.versionContextPointer(sessionId),
      })
      this.sessionRegistrations.set(sessionId, { taskId: binding.taskId, versionId: binding.versionId, dispose })
    } catch {
      // Agent creation and Remote replies must never fail because context registration did.
    }
  }

  /**
   * Drop one Session's registration and cached pointer after teardown or a lost binding.
   */
  disposeVersionContext(sessionId: Branded<'SessionId'>): void {
    const existing = this.sessionRegistrations.get(sessionId)
    this.sessionRegistrations.delete(sessionId)
    this.sessionPointerText.delete(sessionId)
    if (existing === undefined) return
    try {
      existing.dispose()
    } catch {
      // The Agent scope may already be disposed; its registration disappeared with it.
    }
  }

  /**
   * Drop all derived version contexts after the snapshot refreshes.
   */
  clearDerived(): void {
    this.versionContexts.clear()
  }

  /**
   * Drop every live registration during service disposal.
   */
  disposeAll(): void {
    for (const sessionId of [...this.sessionRegistrations.keys()]) this.disposeVersionContext(brandString<Branded<'SessionId'>>(sessionId))
  }
}
