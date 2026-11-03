/**
 * Registration of Loom's Agent-facing reporting tools.
 *
 * The tools service may mount after Loom, so registration is retried when the
 * native tools registry appears.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { Catalog } from '../catalog.ts'
import { registerLoomAgentTools, type LoomToolRegistrar } from '../tools.ts'

/**
 * Register Loom tools once a native tools registry exists.
 * @param ctx - Host service context.
 * @param catalog - Catalog used by the tools.
 * @param refresh - Refresh the service snapshot after a tool mutation.
 * @param takeover - Agent-authorized workspace takeover callback.
 */
export function registerAgentTools(
  ctx: Context,
  catalog: Catalog,
  refresh: () => void,
  takeover: (sessionId: string) => Promise<Record<string, unknown>>,
): void {
  const attach = (registry: LoomToolRegistrar): void => {
    ctx.effect(
      () => registerLoomAgentTools(registry, catalog, refresh, takeover),
      'loom: register Agent tools',
    )
  }
  const tools = ctx.get('tools') as LoomToolRegistrar | undefined
  if (tools !== undefined) {
    attach(tools)
    return
  }
  // The tools service may mount after Loom; register as soon as it appears.
  ctx.inject(['tools'], child => { attach(child.get('tools') as LoomToolRegistrar) })
}
