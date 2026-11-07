/** Business-state presentation shared by the board, cards and header. */
import type { StateDotState } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TaskPriority } from 'dsh-workloom/types'
import type { TaskStatus } from '../../domain/task.ts'
import type { LoomKey } from '../shared/locales.ts'
import { COLORS } from './tokens.ts'

/** Business-state presentation shared by the board, cards and header. */
export const STATUS_META: Readonly<Record<TaskStatus, { readonly key: LoomKey; readonly color: string }>> = {
  pending: { key: 'task.status.pending', color: COLORS.faint },
  running: { key: 'task.status.running', color: COLORS.accent },
  review: { key: 'task.status.review', color: COLORS.purple },
  completed: { key: 'task.status.completed', color: COLORS.green },
  failed: { key: 'task.status.failed', color: COLORS.error },
}

/** Native state-dot semantic for each business status; colour is never the only signal. */
export const STATUS_DOT: Readonly<Record<TaskStatus, StateDotState>> = {
  pending: 'idle',
  running: 'ongoing',
  review: 'warning',
  completed: 'done',
  failed: 'error',
}

/** Status order shown by the board and tree. */
export const STATUS_ORDER: readonly TaskStatus[] = ['pending', 'running', 'review', 'completed', 'failed']

/** Board display order: active work opens the board, archived failures trail it. */
export const BOARD_STATUS_ORDER: readonly TaskStatus[] = ['running', 'pending', 'review', 'completed', 'failed']

/**
 * Whether a human may move a card between business states without starting a new round.
 * @param from - current status.
 * @param to - target status.
 * @returns whether the transition is allowed.
 */
export function canMoveTask(from: TaskStatus, to: TaskStatus): boolean {
  return (from === 'running' && (to === 'review' || to === 'failed'))
    || (from === 'review' && (to === 'running' || to === 'completed' || to === 'failed'))
}

/** Task priority presentation; priority never changes execution rights. */
export const PRIORITY_META: Readonly<Record<TaskPriority, { readonly key: LoomKey; readonly color: string }>> = {
  low: { key: 'task.priority.low', color: COLORS.faint },
  normal: { key: 'task.priority.normal', color: COLORS.cyan },
  high: { key: 'task.priority.high', color: COLORS.warn },
}
