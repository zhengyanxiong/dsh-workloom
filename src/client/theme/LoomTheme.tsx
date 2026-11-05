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
import { cssText as selectCss } from '../ui/Select.module.css'
import { cssText as segmentedCss } from '../ui/Segmented.module.css'
import { cssText as emptyCss } from '../ui/EmptyState.module.css'
import { cssText as shellCss } from '../shell/LoomShell.module.css'
import { cssText as bottomCss } from '../LoomBottomPanel.module.css'
import { cssText as overviewCss } from '../shell/LoomOverview.module.css'
import { cssText as projectCss } from '../shell/LoomProjectPage.module.css'
import { cssText as kanbanCss } from '../LoomKanban.module.css'
import { cssText as boardListCss } from '../LoomBoardList.module.css'
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
    <style data-loom-select>{selectCss}</style>
    <style data-loom-segmented>{segmentedCss}</style>
    <style data-loom-empty>{emptyCss}</style>
    <style data-loom-shell>{shellCss}</style>
    <style data-loom-bottom>{bottomCss}</style>
    <style data-loom-overview>{overviewCss}</style>
    <style data-loom-project>{projectCss}</style>
    <style data-loom-kanban>{kanbanCss}</style>
    <style data-loom-board-list>{boardListCss}</style>
  </>
}
