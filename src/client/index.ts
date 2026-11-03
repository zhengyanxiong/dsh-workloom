/** Workloom client entry: exposes the plugin hook, keeps DSH wiring in the platform adapter. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { installLoomClient } from '../platform/dsh/client-plugin.ts'

/** The generated Remote namespace is mounted by the platform adapter. */
export const inject = ['remote']

/**
 * Register the Workloom client plugin.
 * @param ctx - Client registration context.
 */
export function apply(ctx: ClientContext): void {
  installLoomClient(ctx)
}
