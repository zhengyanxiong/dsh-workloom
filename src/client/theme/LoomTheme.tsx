/**
 * Inject the design token sheet once for every Loom mount.
 *
 * Theme selection only swaps the `data-theme` attribute on the Loom shell; DSH
 * itself keeps its own theme because the variables are scoped to the Loom tree.
 */
import { cssText } from './tokens.module.css'
import classes from './LoomTheme.module.css'

/** Class that bridges DSH component aliases onto Loom design tokens. */
export const LOOM_ROOT_CLASS = classes.loomRoot

/** Global Loom token variables and `.type-*` classes. */
export function LoomThemeStyles(): JSX.Element {
  return <style data-loom-theme>{cssText}</style>
}
