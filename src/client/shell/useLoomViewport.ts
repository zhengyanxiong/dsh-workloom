/** Observe the Loom panel width and viewport height for container-driven layout. */
import { useEffect, useRef, useState, type RefObject } from 'react'

/** Measured shell sizes used by responsive layout and resize handles. */
export interface LoomViewportState {
  readonly rootRef: RefObject<HTMLDivElement>
  readonly loomWidth: number
  readonly viewport: { readonly width: number; readonly height: number }
}

/**
 * Track the rendered Loom width and the window height.
 * @returns the root ref plus measured sizes.
 */
export function useLoomViewport(): LoomViewportState {
  const rootRef = useRef<HTMLDivElement>(null)
  const [loomWidth, setLoomWidth] = useState(() => typeof window === 'undefined' ? 1440 : window.innerWidth)
  const [viewport, setViewport] = useState(() => ({ width: typeof window === 'undefined' ? 1440 : window.innerWidth, height: typeof window === 'undefined' ? 900 : window.innerHeight }))
  useEffect(() => {
    if (typeof window === 'undefined') return
    const element = rootRef.current
    const measure = (): void => {
      if (element === null) return
      const width = element.getBoundingClientRect().width
      if (width > 0) setLoomWidth(width)
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure)
    if (observer !== undefined && element !== null) observer.observe(element)
    const resize = (): void => setViewport(current => ({ ...current, height: window.innerHeight }))
    window.addEventListener('resize', resize)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', resize)
    }
  }, [])
  return { rootRef, loomWidth, viewport }
}
