/**
 * Inject the design token sheet once for every Loom mount.
 *
 * Theme selection only swaps the `data-theme` attribute on the Loom shell; DSH
 * itself keeps its own theme because the variables are scoped to the Loom tree.
 */
import { cssText } from './tokens.module.css'

/** Global Loom token variables and `.type-*` classes. */
export function LoomThemeStyles(): JSX.Element {
  return <style data-loom-theme>{cssText}</style>
}
