/**
 * Stable read-only face for the native background-jobs service.
 */
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/**
 * The subset of a background job the workbench renders.
 */
export interface LoomJobView {
  readonly id: string
  readonly label: string
  readonly status: 'running' | 'stopping' | 'completed' | 'killed' | 'failed'
  readonly progress?: string
  readonly detail?: string
  readonly startedAt: number
  readonly finishedAt?: number
}

/**
 * Native jobs service face; absent when that client plugin is not installed.
 */
export interface LoomJobsFace {
  readonly state: {
    getSnapshot(): { readonly rows: Readonly<Record<string, readonly LoomJobView[]>> }
    subscribe(listener: () => void): () => void
  }
  watchRows(sessionId: SessionId): () => void
}
