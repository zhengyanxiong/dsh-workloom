/**
 * Hash routes for the Loom workbench.
 *
 * Hash navigation keeps the plugin independent of the DSH shell's own URL
 * handling; the route is derived only from `location.hash`.
 */
export type LoomRoute = 'home' | 'board' | 'task' | 'session' | 'project' | 'settings'

/** Fixed route order used by navigation and tests. */
export const LOOM_ROUTES: readonly LoomRoute[] = ['home', 'board', 'task', 'session', 'project', 'settings']

/** One parsed hash route with optional query parameters. */
export interface LoomRouteState {
  readonly route: LoomRoute
  readonly params: Readonly<Record<string, string>>
}

const ROUTE_SET = new Set<string>(LOOM_ROUTES)

/**
 * Parse a location hash into a known Loom route.
 * Unknown or empty hashes fall back to `home`.
 * @param hash - value such as `#task?task=t1&session=s1`.
 * @returns the route and decoded query parameters.
 */
export function parseLoomHash(hash: string): LoomRouteState {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  const [path = '', query = ''] = raw.split('?', 2)
  const candidate = path === '' ? 'home' : path
  const route = ROUTE_SET.has(candidate) ? candidate as LoomRoute : 'home'
  const params: Record<string, string> = {}
  for (const [key, value] of new URLSearchParams(query)) params[key] = value
  return { route, params }
}

/**
 * Build a hash URL for a route and optional parameters.
 * @param route - known Loom route.
 * @param params - optional query values.
 * @returns a hash beginning with `#`.
 */
export function loomHash(route: LoomRoute, params: Readonly<Record<string, string | undefined>> = {}): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') query.set(key, value)
  const suffix = query.toString()
  return `#${route}${suffix === '' ? '' : `?${suffix}`}`
}
