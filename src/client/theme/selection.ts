/** Theme preference resolution shared by the shell and the settings page. */

/** Theme choices persisted with the workbench; `auto` follows the DSH light/dark state. */
export type LoomThemePreference = 'auto' | 'paper' | 'white' | 'blue' | 'dark'

/** `data-theme` values the generated token sheets understand. */
export type LoomThemeAttribute = 'light' | 'white' | 'blue' | 'dark'

/**
 * Resolve the attribute applied to the Loom root.
 *
 * @param preference - persisted theme choice.
 * @param dshDark - whether DSH currently reports its dark theme.
 * @returns the matching token-sheet theme name; `paper` maps to the generated `light` sheet.
 */
export function resolveLoomTheme(preference: LoomThemePreference, dshDark: boolean): LoomThemeAttribute {
  switch (preference) {
    case 'auto':
      return dshDark ? 'dark' : 'blue'
    case 'paper':
      return 'light'
    case 'white':
      return 'white'
    case 'blue':
      return 'blue'
    case 'dark':
      return 'dark'
  }
}
