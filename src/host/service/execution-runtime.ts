/**
 * Session execution ownership: admission, idle claim, release, takeover and stop.
 *
 * The runtime supplies the catalog, live snapshot and native Agent registry;
 * the class owns the ordering of the ownership transitions.
 */
import { brandString, type Branded } from '@deepseek-ai/dsh-brand'
import type { Catalog } from '../catalog.ts'
import { findSessionAttempt, findWorkspaceByPath } from '../catalog.ts'
import type { CatalogSnapshot, WorkspaceRecord } from '../../api/records.ts'
import type { StopOutcome } from '../../domain/execution.ts'
import type { LoomAgent, LoomAgentRegistry } from '../events.ts'
import { serviceError } from './errors.ts'

/**
 * The service surface required by execution ownership.
 */
export interface ExecutionOwnershipRuntime {
  catalog(): Promise<Catalog>
  isClosed(): boolean
  snapshot(): CatalogSnapshot | undefined
  refresh(catalog: Catalog): void
  getAgents(): LoomAgentRegistry | undefined
}

/**
 * Owns execution admission and takeover for Loom Sessions.
 */
export class ExecutionOwnership {
  constructor(private readonly runtime: ExecutionOwnershipRuntime) {}

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
  async admitExecution(sessionId: Branded<'SessionId'>, cwd: string | undefined): Promise<{ readonly kind: 'deny'; readonly reason: string } | undefined> {
    try {
      const catalog = await this.runtime.catalog()
      if (this.runtime.isClosed()) return undefined
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

  /**
   * Apply the workspace owner/waiting rule for one already-authorized Session.
   */
  private async admitWorkspaceExecution(catalog: Catalog, workspace: WorkspaceRecord, sessionId: Branded<'SessionId'>): Promise<{ readonly kind: 'deny'; readonly reason: string } | undefined> {
    const current = catalog.snapshot().executions.find(execution => execution.workspaceId === workspace.id)
    if (current?.owner?.sessionId === sessionId) return undefined
    if (current?.waiting.includes(sessionId) === true) return { kind: 'deny', reason: 'Loom workspace execution is queued behind another session.' }
    const state = await catalog.acquireExecution(workspace.id, sessionId)
    if (state.owner?.sessionId === sessionId) return undefined
    return { kind: 'deny', reason: 'Loom workspace execution is held by another session. Wait for handoff or request takeover.' }
  }

  /**
   * Claim a free workspace as soon as its bound Session starts a running turn,
   * so the execution gate shows the owner before the first tool call.
   * An owned, waiting or takeover-pending workspace is left to the tool gate.
   * @param sessionId - Session whose Agent just transitioned to running.
   */
  async claimIdleExecution(sessionId: Branded<'SessionId'>): Promise<void> {
    try {
      const catalog = await this.runtime.catalog()
      if (this.runtime.isClosed()) return
      const snapshot = catalog.snapshot()
      const binding = findSessionAttempt(snapshot, sessionId)
      if (binding === undefined) return
      const workspace = snapshot.workspaces.find(candidate => candidate.id === binding.attempt.workspaceId && candidate.cleaned !== true)
      if (workspace === undefined) return
      const execution = snapshot.executions.find(candidate => candidate.workspaceId === workspace.id)
      if (execution?.owner !== null && execution?.owner !== undefined) return
      if (execution?.takeover !== null && execution?.takeover !== undefined) return
      const state = await catalog.acquireExecution(workspace.id, sessionId)
      if (state.owner?.sessionId === sessionId) this.runtime.refresh(catalog)
    } catch {
      // The tool gate still enforces ownership; an early claim is best effort.
    }
  }

  async releaseSession(sessionId: Branded<'SessionId'>): Promise<void> {
    try {
      const catalog = await this.runtime.catalog()
      if (this.runtime.isClosed()) return
      await catalog.releaseSession(sessionId)
    } catch {
      // Teardown cleanup is best effort; the tool gate still refuses a non-owner.
    }
  }

  /**
   * Stop the owning Agent turn, cancel live descendants, and wait for observable idleness.
   * Descendant ownership is read from the live Agent registry; a child that disappears
   * during cancellation no longer contributes stop evidence.
   * @param sessionId - Session holding the current workspace execution token.
   * @returns the trusted stop outcome used to confirm or block handoff.
   */
  /**
   * Take over for an Agent tool after the human approved the native confirmation prompt.
   */
  async takeoverForAgent(sessionIdValue: string): Promise<Record<string, unknown>> {
    const catalog = await this.runtime.catalog()
    if (this.runtime.isClosed()) throw serviceError('loom_disposed')
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
      this.runtime.refresh(catalog)
    }
  }

  async stopOwner(sessionId: Branded<'SessionId'>): Promise<StopOutcome> {
    const agents = this.runtime.getAgents()
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

}
