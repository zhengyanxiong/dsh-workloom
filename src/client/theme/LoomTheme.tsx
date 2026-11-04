/**
 * Inject the design token sheet once for every Loom mount.
 *
 * Theme selection only swaps the `data-theme` attribute on the Loom shell; DSH
 * itself keeps its own theme because the variables are scoped to the Loom tree.
 */
import { cssText as themeCss } from './tokens.module.css'
import { cssText as bridgeCss } from './LoomTheme.module.css'
import { cssText as topbarCss } from '../shell/LoomTopbar.module.css'
import { cssText as sidebarCss } from '../shell/LoomSidebarParts.module.css'
import { cssText as buttonCss } from '../ui/Button.module.css'
import classes from './LoomTheme.module.css'

/** Class that bridges DSH component aliases onto Loom design tokens. */
export const LOOM_ROOT_CLASS = classes.loomRoot

/** Global Loom token variables and `.type-*` classes. */
export function LoomThemeStyles(): JSX.Element {
  return <>
    <style data-loom-theme>{themeCss}</style>
    <style data-loom-bridge>{bridgeCss}</style>
    <style data-loom-topbar>{topbarCss}</style>
    <style data-loom-sidebar>{sidebarCss}</style>
    <style data-loom-button>{buttonCss}</style>
  </>
}
