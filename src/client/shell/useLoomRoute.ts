/** Hash-route state shared by the Loom shell. */
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { parseLoomHash, type LoomRoute } from './router.ts'

/** Loom's two workbench views inside the task/session routes. */
export type LoomView = 'workbench' | 'kanban'

/** Route and view state kept in sync with the browser hash. */
export interface LoomRouteState {
  readonly route: LoomRoute
  readonly setRoute: Dispatch<SetStateAction<LoomRoute>>
  readonly view: LoomView
  readonly setView: Dispatch<SetStateAction<LoomView>>
}

/**
 * Own the Loom route/view pair and follow browser hash changes.
 * @param initialView - view preference applied before the first navigation.
 * @returns route state and setters.
 */
export function useLoomRoute(initialView: LoomView): LoomRouteState {
  const [route, setRoute] = useState<LoomRoute>(() => typeof window === 'undefined' ? 'task' : parseLoomHash(window.location.hash).route)
  const [view, setView] = useState<LoomView>(initialView)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const apply = (): void => {
      const next = parseLoomHash(window.location.hash).route
      setRoute(next)
      if (next === 'board') setView('kanban')
      else if (next === 'task' || next === 'session' || next === 'project') setView('workbench')
    }
    apply()
    window.addEventListener('hashchange', apply)
    return () => { window.removeEventListener('hashchange', apply) }
  }, [])
  return { route, setRoute, view, setView }
}
