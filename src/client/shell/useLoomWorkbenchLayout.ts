/**
 * Derived widths for the preview rail and bottom dock.
 *
 * Called on every render because the shell can be resized; the values are pure
 * functions of the Loom width, viewport, user preferences and whether a preview
 * currently occupies the right rail.
 */
import type { LoomPreferences } from '../features/settings/LoomSettings.tsx'

/** Inputs for {@link useLoomWorkbenchLayout}. */
export interface LoomWorkbenchLayoutInput {
  readonly loomWidth: number
  readonly viewportHeight: number
  readonly preferences: LoomPreferences
  readonly previewOpen: boolean
  readonly setPreferences: (update: (current: LoomPreferences) => LoomPreferences) => void
}

/** Derived layout dimensions used by the shell. */
export interface LoomWorkbenchLayout {
  readonly narrow: boolean
  readonly asideMin: number
  readonly asideMax: number
  readonly asideWidth: number
  readonly setAsideWidth: (width: number) => void
  readonly bottomMax: number
  readonly bottomHeight: number
}

/**
 * Compute preview rail and bottom dock dimensions.
 *
 * @param input - Loom width, viewport height, preferences and preview state.
 * @returns clamped widths/heights and the rail resize callback.
 */
export function useLoomWorkbenchLayout(input: LoomWorkbenchLayoutInput): LoomWorkbenchLayout {
  const { loomWidth, viewportHeight, preferences, previewOpen, setPreferences } = input
  const narrow = loomWidth <= 940
  const asideMin = previewOpen ? 300 : 320
  const asideCssMax = loomWidth <= 940 ? (previewOpen ? 380 : 300) : 460
  const asideMax = Math.min(asideCssMax, Math.max(asideMin, loomWidth - (narrow ? 180 : 460)))
  const asideWidth = Math.min(Math.max(previewOpen ? preferences.previewWidth : preferences.asideWidth, asideMin), asideMax)
  const setAsideWidth = (width: number): void => {
    setPreferences(current => ({ ...current, [previewOpen ? 'previewWidth' : 'asideWidth']: width }))
  }
  const bottomMax = Math.max(120, Math.min(320, viewportHeight - 220))
  const bottomHeight = Math.min(Math.max(preferences.bottomHeight, 80), bottomMax)
  return { narrow, asideMin, asideMax, asideWidth, setAsideWidth, bottomMax, bottomHeight }
}
