/**
 * Checkpoint-and-fork action for an attached Session.
 *
 * Forking first commits the workbench so the child Session starts from a known
 * state, then forks the native Session and attaches it to the same task.
 */
import { useState } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { TaskRecord, WorkspaceRecord } from 'dsh-workloom/types'
import type { LoomHostPort } from '../../../ports/loom-host.ts'
import type { LoomKey } from '../../shared/locales.ts'

type Translate = (key: LoomKey, params?: Readonly<Record<string, string>>) => string

/** Inputs for {@link useLoomForkSession}. */
export interface LoomForkSessionInput {
  readonly t: Translate
  readonly sessionId: SessionId | undefined
  readonly task: TaskRecord | undefined
  readonly workspace: WorkspaceRecord | undefined
  readonly commitWorkspace: LoomHostPort['commitWorkspace']
  readonly forkSession: LoomHostPort['forkSession']
  readonly attachSession: LoomHostPort['attachSession']
  /** Show the forked child Session in the conversation. */
  readonly onForked: (sessionId: SessionId) => void
  /** Refresh the catalog after attaching the child. */
  readonly onChanged: () => void
}

/** Fork state and action. */
export interface LoomForkSession {
  readonly forking: boolean
  readonly forkError: string | undefined
  readonly forkSessionAction: () => Promise<void>
}

/**
 * Own the checkpoint-and-fork workflow.
 *
 * @param input - locale, Session/task/workspace selection and Host ports.
 * @returns fork state and the fork action.
 */
export function useLoomForkSession(input: LoomForkSessionInput): LoomForkSession {
  const { t, sessionId, task, workspace, commitWorkspace, forkSession, attachSession, onForked, onChanged } = input
  const [forking, setForking] = useState(false)
  const [forkError, setForkError] = useState<string>()
  const forkSessionAction = async (): Promise<void> => {
    if (sessionId === undefined || task === undefined || workspace === undefined) return
    setForking(true); setForkError(undefined)
    try {
      const committed = await commitWorkspace({ workspaceId: workspace.id, message: 'Loom: checkpoint before fork' })
      if (!committed.ok) { setForkError(`${t('runtime.forkFailed')}${committed.error.message}`); return }
      const failed = committed.value.repositories.find(repository => repository.error !== undefined)
      if (failed !== undefined) { setForkError(`${t('runtime.forkFailed')}${failed.sourceId}: ${failed.error ?? ''}`); return }
      const child = await forkSession({ sessionId, increaseTitle: true })
      const attached = await attachSession({ taskId: task.id, sessionId: child })
      if (!attached.ok) { setForkError(`${t('runtime.forkFailed')}${attached.error.message}`); return }
      onForked(child)
      onChanged()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setForkError(/no completed turn/iu.test(message) ? t('runtime.forkNoTurn') : `${t('runtime.forkFailed')}${message}`)
    } finally {
      setForking(false)
    }
  }
  return { forking, forkError, forkSessionAction }
}
