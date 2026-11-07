/** Task status dot: only a Session that is actually running may animate. */
import type { CSSProperties, ReactNode } from 'react'
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TaskStatus } from '../../domain/task.ts'
import { COLORS, STATUS_DOT } from '../shell.ts'

const staticRunning: CSSProperties = {
  flex: 'none',
  width: 12,
  height: 12,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
}
const staticRunningCore: CSSProperties = { width: 6, height: 6, borderRadius: 999, background: COLORS.accent }

/**
 * Render a task-level status indicator without turning a business state into motion.
 * The spinner is reserved for a bound native Session whose runtime says it is running.
 * @param props - task business status and whether its Session is live.
 * @returns the status dot.
 */
export function TaskStatusDot({ status, live }: { readonly status: TaskStatus; readonly live: boolean }): ReactNode {
  if (live) return <StateDot state="ongoing" size={12} />
  if (status === 'running') return <span aria-hidden style={staticRunning}><span style={staticRunningCore} /></span>
  return <StateDot state={STATUS_DOT[status]} size={12} />
}
