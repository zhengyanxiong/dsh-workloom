import { expect, it } from 'vitest'
import { fetchLatestVersion, isNewerVersion } from '../../../src/client/features/settings/update-check.ts'

it('compares dotted release versions', () => {
  expect(isNewerVersion('0.3.2', '0.3.1')).toBe(true)
  expect(isNewerVersion('0.4.0', '0.3.9')).toBe(true)
  expect(isNewerVersion('1.0.0', '0.99.99')).toBe(true)
  expect(isNewerVersion('0.3.1', '0.3.1')).toBe(false)
  expect(isNewerVersion('0.3.0', '0.3.1')).toBe(false)
  expect(isNewerVersion('v0.3.2', '0.3.1')).toBe(true)
  expect(isNewerVersion('0.3.1-rc.1', '0.3.1')).toBe(false)
})

it('reads the latest version from the npm registry and flags an upgrade', async () => {
  const calls: string[] = []
  const fetchImpl = async (input: string | URL | Request): Promise<Response> => {
    calls.push(String(input))
    return new Response(JSON.stringify({ version: '0.4.0' }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  await expect(fetchLatestVersion('0.3.1', fetchImpl as typeof fetch)).resolves.toEqual({ latest: '0.4.0', outdated: true })
  expect(calls).toEqual(['https://registry.npmjs.org/dsh-workloom/latest'])
  const current = await fetchLatestVersion('0.4.0', fetchImpl as typeof fetch)
  expect(current).toEqual({ latest: '0.4.0', outdated: false })
})

it('surfaces registry failures instead of pretending the bundle is current', async () => {
  const failing = async (): Promise<Response> => new Response('nope', { status: 503 })
  await expect(fetchLatestVersion('0.3.1', failing as typeof fetch)).rejects.toThrow('503')
  const malformed = async (): Promise<Response> => new Response(JSON.stringify({}), { status: 200 })
  await expect(fetchLatestVersion('0.3.1', malformed as typeof fetch)).rejects.toThrow('no version')
})
