/**
 * Latest-published-version lookup for the Settings page.
 *
 * The plugin runs inside DSH and cannot replace its own package, so the page
 * only compares the built-in version with the npm registry and shows the
 * command that upgrades the profile in place.
 */

/** One registry answer compared with the running bundle. */
export interface LatestVersionResult {
  readonly latest: string
  readonly outdated: boolean
}

const REGISTRY_LATEST = 'https://registry.npmjs.org/dsh-workloom/latest'

/**
 * Compare dotted release versions, including a stable release superseding its prerelease.
 * @param candidate - version reported by the registry.
 * @param current - version this bundle was built from.
 * @returns whether the candidate is a newer release than the current one.
 */
export function isNewerVersion(candidate: string, current: string): boolean {
  const parse = (value: string): number[] => value.split('-')[0]!.split('.').map(part => {
    const parsed = Number.parseInt(part, 10)
    return Number.isFinite(parsed) ? parsed : 0
  })
  const candidateRelease = candidate.replace(/^v/u, '').split('+', 1)[0]!
  const currentRelease = current.replace(/^v/u, '').split('+', 1)[0]!
  const next = parse(candidateRelease)
  const currentParts = parse(currentRelease)
  for (let index = 0; index < Math.max(next.length, currentParts.length); index += 1) {
    const left = next[index] ?? 0
    const right = currentParts[index] ?? 0
    if (left !== right) return left > right
  }
  return !candidateRelease.includes('-') && currentRelease.includes('-')
}

/**
 * Read the latest published version and compare it with this bundle.
 * @param current - version this bundle was built from.
 * @param fetchImpl - fetch implementation, replaceable in tests.
 * @returns the latest release and whether it is newer.
 */
export async function fetchLatestVersion(current: string, fetchImpl: typeof fetch = fetch): Promise<LatestVersionResult> {
  const response = await fetchImpl(REGISTRY_LATEST, { headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error(`npm registry responded ${String(response.status)}`)
  const body: unknown = await response.json()
  const version = typeof body === 'object' && body !== null && 'version' in body ? (body as { version?: unknown }).version : undefined
  if (typeof version !== 'string' || version.trim() === '') throw new Error('npm registry returned no version')
  return { latest: version, outdated: isNewerVersion(version, current) }
}
