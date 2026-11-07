/** Pinned project ids persisted in local storage. */
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import type { ProjectRecord } from 'dsh-workloom/types'

const STORAGE_KEY = 'loom.pinnedProjects'

/** Read pinned project ids, ignoring malformed or unavailable storage. */
function readPinnedProjects(): ProjectRecord['id'][] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((value): value is ProjectRecord['id'] => typeof value === 'string') : []
  } catch { return [] }
}

/**
 * Track and persist the pinned project ids.
 * @returns the pinned ids and their setter.
 */
export function useLoomPinnedProjects(): readonly [ProjectRecord['id'][], Dispatch<SetStateAction<ProjectRecord['id'][]>>] {
  const [pinnedProjects, setPinnedProjects] = useState<ProjectRecord['id'][]>(readPinnedProjects)
  useEffect(() => {
    if (typeof localStorage === 'undefined') return
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pinnedProjects)) } catch { /* Storage can be unavailable in private browsing; pins remain in memory. */ }
  }, [pinnedProjects])
  return [pinnedProjects, setPinnedProjects] as const
}
