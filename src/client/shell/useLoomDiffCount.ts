/** Count workspace changes for the current task workbench. */
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import type { LoomPanelProps } from '../LoomPanel.tsx'

/**
 * Load the visible change count and keep it across attempts.
 * @param workspaceId - current workspace id, when selected.
 * @param cleaned - whether the workspace was cleaned.
 * @param attemptId - current attempt id, when selected.
 * @param attempt - retry counter bumped after mutations.
 * @param changeCount - host change counter.
 * @returns the current count and its setter for the bottom panel.
 */
export function useLoomDiffCount(workspaceId: string | undefined, cleaned: boolean | undefined, attemptId: string | undefined, attempt: number, changeCount: LoomPanelProps['workspaceChangeCount']): readonly [number, Dispatch<SetStateAction<number>>] {
  const [diffCount, setDiffCount] = useState(0)
  useEffect(() => {
    if (workspaceId === undefined || cleaned === true) { setDiffCount(0); return }
    let active = true
    changeCount({ workspaceId, ...(attemptId === undefined ? {} : { attemptId }) }).then((result) => {
      if (active) setDiffCount(result.ok ? result.value : 0)
    }, () => { if (active) setDiffCount(0) })
    return () => { active = false }
  }, [workspaceId, cleaned, attemptId, attempt, changeCount])
  return [diffCount, setDiffCount] as const
}
