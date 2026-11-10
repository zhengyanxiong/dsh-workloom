/**
 * Execution ownership actions for the runtime/context graph.
 *
 * Covers releasing a stale owner, releasing every stale owner in the catalog
 * and taking the current workspace from its existing owner. The Session dock's
 * per-Session actions live in `useLoomSessionExecution`.
 */
import { useState } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { CatalogSnapshot, WorkspaceRecord } from 'dsh-workloom/types'
import type { LoomHostPort } from '../../../ports/loom-host.ts'
import type { LoomKey } from '../../shared/locales.ts'

type Translate = (key: LoomKey, params?: Readonly<Record<string, string>>) => string
type ExecutionRow = CatalogSnapshot['executions'][number]

/** Inputs for {@link useLoomExecutionOwnership}. */
export interface LoomExecutionOwnershipInput {
  readonly t: Translate
  readonly snapshot: CatalogSnapshot | undefined
  readonly workspace: WorkspaceRecord | undefined
  readonly sessionId: SessionId | undefined
  readonly execution: ExecutionRow | undefined
  /** Sessions the runtime reports as running; stale owners are excluded. */
  readonly runningSessionIds: ReadonlySet<string>
  readonly releaseExecution: LoomHostPort['releaseExecution']
  readonly acquireExecution: LoomHostPort['acquireExecution']
  /** Refresh the catalog after a successful mutation. */
  readonly onChanged: () => void
}

/** Execution ownership state and actions. */
export interface LoomExecutionOwnership {
  readonly releasingWorkspace: string | undefined
  readonly releaseError: string | undefined
  readonly releasingAll: boolean
  readonly claiming: boolean
  readonly claimError: string | undefined
  readonly releaseOwner: (workspaceId: string, owner: { readonly sessionId: string; readonly generation: number }) => Promise<void>
  readonly releaseAllStale: () => Promise<void>
  readonly claimWorkspace: () => Promise<void>
}

/**
 * Own execution ownership mutations for the runtime view.
 *
 * @param input - locale, runtime selection, ports and refresh callback.
 * @returns ownership state plus release/claim actions.
 */
export function useLoomExecutionOwnership(input: LoomExecutionOwnershipInput): LoomExecutionOwnership {
  const { t, snapshot, workspace, sessionId, execution, runningSessionIds, releaseExecution, acquireExecution, onChanged } = input
  const [releasingWorkspace, setReleasingWorkspace] = useState<string>()
  const [releaseError, setReleaseError] = useState<string>()
  const [releasingAll, setReleasingAll] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [claimError, setClaimError] = useState<string>()
  const releaseOwner = async (workspaceId: string, owner: { readonly sessionId: string; readonly generation: number }): Promise<void> => {
    setReleasingWorkspace(workspaceId); setReleaseError(undefined)
    try {
      const result = await releaseExecution({ workspaceId, sessionId: owner.sessionId, generation: owner.generation })
      if (!result.ok) { setReleaseError(`${t('graph.releaseFailed')}${result.error.message}`); return }
      onChanged()
    } catch (error) {
      setReleaseError(`${t('graph.releaseFailed')}${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setReleasingWorkspace(undefined)
    }
  }
  const releaseAllStale = async (): Promise<void> => {
    if (snapshot === undefined) return
    const stale = snapshot.executions.filter(row => row.owner !== null && row.owner !== undefined && runningSessionIds.has(row.owner.sessionId) !== true)
    if (stale.length === 0) return
    setReleasingAll(true); setReleaseError(undefined)
    const failures: string[] = []
    try {
      for (const row of stale) {
        const owner = row.owner
        if (owner === null || owner === undefined) continue
        const result = await releaseExecution({ workspaceId: row.workspaceId, sessionId: owner.sessionId, generation: Number(owner.generation) })
        if (!result.ok) failures.push(`${owner.sessionId.slice(0, 8)}: ${result.error.message}`)
      }
      if (failures.length > 0) setReleaseError(`${t('graph.releaseFailed')}${failures.join('; ')}`)
      onChanged()
    } catch (error) {
      setReleaseError(`${t('graph.releaseFailed')}${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setReleasingAll(false)
    }
  }
  const claimWorkspace = async (): Promise<void> => {
    if (workspace === undefined || sessionId === undefined || execution?.owner === null || execution?.owner === undefined) return
    setClaiming(true); setClaimError(undefined)
    try {
      const owner = execution.owner
      const waiting = execution.waiting.includes(sessionId)
      const released = await releaseExecution({ workspaceId: workspace.id, sessionId: owner.sessionId, generation: Number(owner.generation) })
      if (!released.ok) { setClaimError(`${t('runtime.claimFailed')}${released.error.message}`); return }
      if (!waiting) {
        const acquired = await acquireExecution({ workspaceId: workspace.id, sessionId })
        if (!acquired.ok) { setClaimError(`${t('runtime.claimFailed')}${acquired.error.message}`); return }
      }
      onChanged()
    } catch (error) {
      setClaimError(`${t('runtime.claimFailed')}${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setClaiming(false)
    }
  }
  return { releasingWorkspace, releaseError, releasingAll, claiming, claimError, releaseOwner, releaseAllStale, claimWorkspace }
}
