/**
 * Workloom's only DSH client entry: mounts the Remote namespace and composes
 * the resource router, host adapter and surface registration.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import contribution from 'dsh-workloom/remote'
import { createLoomHost } from './host-adapter.ts'
import { installLoomSurface, installResourceRouting } from './client-surface.ts'
import { NS, en, zh } from '../../client/shared/locales.ts'

/**
 * Register an isolated Loom page without changing the current panel selection.
 * @param ctx - Client registration context.
 */
export function installLoomClient(ctx: ClientContext): void {
  // Mount the generated namespace so the page fiber below can require `remote.loom`.
  ctx.effect(() => {
    const mounting = ctx.remote.$mount(contribution)
    return async () => { await (await mounting)() }
  }, 'loom: remote namespace')
  ctx.inject(['sidebarRight', 'layout'], (ui) => installResourceRouting(ui))
  // `remote.session` is a separate native service: the main slot fails with
  // "without inject" when it is omitted, even though api-remotes mounts it.
  ctx.inject([
    'slots', 'locale', 'sessions', 'workspaces', 'sidebarRight', 'layout',
    'remote.loom', 'remote.session', 'remote.workspaceFiles', 'remote.agentPresets', 'remote.directoryPicker',
  ], (ui) => {
    ui.effect(() => ui.locale.register(NS, { en, zh }), 'loom: dictionary')
    const t = ui.locale.bind(NS)
    installLoomSurface(ui, createLoomHost(ui, t), t)
  })
}
