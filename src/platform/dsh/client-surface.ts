/**
 * DSH surface registration for the Workloom page, sidebar entry and notices.
 *
 * The adapter receives a ready host port; it does not construct Remote calls.
 */
import { createElement } from 'react'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ViewTab } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { LoomPanel } from '../../client/LoomPanel.tsx'
import type { LoomHostPort } from '../../ports/loom-host.ts'
import { readPreferences } from '../../client/LoomSettings.tsx'
import { LoomMark } from '../../client/LoomMark.tsx'
import { LoomNoticeHost } from '../../client/LoomNoticeHost.tsx'
import { ConversationEmbed } from '../../client/conversation/ConversationEmbed.tsx'
import { openFilePreview, openReviewPreview, routeLoomResource } from '../../client/preview.ts'
import { NS } from '../../client/locales.ts'
import type { LoomUi, Translate } from './ui.ts'
import './dsh-types.ts'

const PANEL_ID = 'loom' as MainPanelId

/**
 * Forward native file links to the Loom preview while the Loom panel is active.
 * @param ui - Injected client surface with sidebar and layout services.
 */
export function installResourceRouting(ui: LoomUi): void {
  ui.effect(() => {
    const controller = ui.sidebarRight
    const original = controller.openResource
    controller.openResource = function (address, options) {
      if (ui.layout.panelInfo.getSnapshot().activePanelId === PANEL_ID
        && routeLoomResource(address, options, { openFile: openFilePreview, openReview: openReviewPreview })) return
      original.call(controller, address, options)
    }
    return () => { controller.openResource = original }
  }, 'loom: route file links to the workbench preview')
}

/**
 * Register the main panel, notices, conversation slot, sidebar entry and startup
 * preferences against an already bound host port.
 * @param ui - Injected client surface with all Workloom dependencies.
 * @param host - Host capabilities consumed by LoomPanel.
 * @param t - Locale translator bound to the Loom namespace.
 */
export function installLoomSurface(ui: LoomUi, host: LoomHostPort, t: Translate): void {
  ui.slots.inject('main', () => ui.slots.register({
    name: 'main', key: PANEL_ID, locale: NS,
    children: { 'loom.conversation': { kind: 'single', scope: 'session' } },
    inject: (): LoomHostPort => host,
  }, LoomPanel))
  ui.slots.inject('shell.overlay', () => ui.slots.register({
    name: 'shell.overlay', id: 'loom-notice', locale: NS,
  }, LoomNoticeHost))
  const conversationViews = createSnapshotStore<readonly ViewTab[]>([])
  const refreshConversationViews = (): void => {
    conversationViews.set(ui.slots.entries('conversation.view').flatMap(entry => {
      const id = entry.options.id
      if (id === undefined) return []
      return [{ id, label: resolveSlotLabel(entry.options.label) ?? id }]
    }))
  }
  refreshConversationViews()
  ui.effect(() => {
    const disposeViews = ui.slots.subscribe('conversation.view', refreshConversationViews)
    const disposeLocale = ui.locale.subscribe(refreshConversationViews)
    return () => {
      disposeViews()
      disposeLocale()
    }
  }, 'loom: conversation views')
  ui.slots.inject('loom.conversation', () => ui.slots.register({
    name: 'loom.conversation',
    inject: () => ({ hooks: { conversationViews } }),
  }, ConversationEmbed))
  ui.slots.inject('sidebar.panellist', () => ui.slots.register({
    name: 'sidebar.panellist', id: PANEL_ID, order: 6, locale: NS, label: () => t('panel'),
  }, LoomSidebarIcon))
  // Startup preferences from the local settings overlay. Both are read once
  // per page load: selecting the panel needs the main slot to exist, and the
  // sidebar starts at its default width, so a single toggle collapses it.
  ui.effect(() => {
    if (typeof window === 'undefined') {
      return () => {
        /* No startup preferences without a page. */
      }
    }
    let cancelled = false
    let timer = 0
    let attempts = 0
    const selectWorkloom = (): void => {
      if (cancelled) return
      try {
        ui.layout.selectPanel(PANEL_ID)
      } catch {
        if (attempts < 40) { attempts += 1; timer = window.setTimeout(selectWorkloom, 50) }
      }
    }
    timer = window.setTimeout(() => {
      if (cancelled) return
      const preferences = readPreferences()
      const params = new URLSearchParams(window.location.search)
      const requestedRoute = params.get('route')
      if (requestedRoute !== null && ['home', 'board', 'task', 'session', 'project', 'settings'].includes(requestedRoute)) {
        window.location.hash = `#${requestedRoute}`
      }
      // Below this width the native sidebar auto-collapses on its own, and a
      // toggle there would expand it instead.
      if (preferences.collapseSidebar && window.innerWidth >= 1024) ui.layout.toggleSidebar()
      if (preferences.openOnLoad || params.get('panel') === 'loom' || params.get('workloom') === '1') selectWorkloom()
    }, 0)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, 'loom: startup panel and sidebar preferences')
  ui.effect(() => {
    if (typeof window === 'undefined') return () => { /* No DOM to observe. */ }
    let collapsedByLoom = false
    let railHidden = false
    const sidebar = (): HTMLElement | null => document.querySelector<HTMLElement>('[class*="sidebarCol"]')
    const sidebarWidth = (): number => sidebar()?.getBoundingClientRect().width ?? 0
    const hideRail = (): void => {
      const element = sidebar()
      if (element !== null && !railHidden) {
        element.style.display = 'none'
        railHidden = true
      }
    }
    const showRail = (): void => {
      if (!railHidden) return
      const element = sidebar()
      if (element !== null) element.style.display = ''
      railHidden = false
    }
    const sync = (): void => {
      if (window.innerWidth < 1024) return
      const active = document.querySelector('.loom-root') !== null
      if (active) {
        if (!readPreferences().autoCollapseSidebar || collapsedByLoom) {
          if (collapsedByLoom && readPreferences().autoCollapseSidebar) hideRail()
          return
        }
        if (sidebarWidth() > 80) {
          ui.layout.toggleSidebar()
          collapsedByLoom = true
        } else if (sidebarWidth() > 0) {
          collapsedByLoom = true
        }
        if (collapsedByLoom) hideRail()
      } else if (collapsedByLoom) {
        showRail()
        if (sidebarWidth() < 80) ui.layout.toggleSidebar()
        collapsedByLoom = false
      }
    }
    const timer = window.setInterval(sync, 250)
    sync()
    return () => { window.clearInterval(timer); showRail() }
  }, 'loom: collapse the native sidebar while active')
}

/**
 * Sidebar entry mark; the surrounding button owns active color.
 */
function LoomSidebarIcon({ size = 16 }: { readonly size?: number }) {
  return createElement(LoomMark, { size })
}
