/** Top bar New-menu open state with outside-click and Escape dismissal. */
import { useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react'

/** Menu state used by the top bar create menu. */
export interface LoomMenuState {
  readonly menuOpen: boolean
  readonly setMenuOpen: Dispatch<SetStateAction<boolean>>
  readonly newMenuRef: RefObject<HTMLDivElement>
}

/**
 * Own the create-menu state and its dismissal listeners.
 * @returns menu state plus the wrapper ref.
 */
export function useLoomMenu(): LoomMenuState {
  const [menuOpen, setMenuOpen] = useState(false)
  const newMenuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menuOpen) return
    const closeOnOutside = (event: PointerEvent): void => {
      if (event.target instanceof Node && newMenuRef.current?.contains(event.target) === true) return
      setMenuOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent): void => { if (event.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('pointerdown', closeOnOutside, true)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside, true)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [menuOpen])
  return { menuOpen, setMenuOpen, newMenuRef }
}
