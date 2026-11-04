import { expect, it } from 'vitest'
import { LOOM_ROUTES, loomHash, parseLoomHash } from '../src/client/shell/router.ts'

it('parses every fixed Loom route', () => {
  for (const route of LOOM_ROUTES) expect(parseLoomHash(`#${route}`)).toEqual({ route, params: {} })
})

it('falls back to home for absent or unknown hashes', () => {
  expect(parseLoomHash('')).toEqual({ route: 'home', params: {} })
  expect(parseLoomHash('#unknown')).toEqual({ route: 'home', params: {} })
})

it('round-trips query parameters and omits empty values', () => {
  const hash = loomHash('task', { task: 't1', session: undefined, q: '' })
  expect(hash).toBe('#task?task=t1')
  expect(parseLoomHash(hash)).toEqual({ route: 'task', params: { task: 't1' } })
})
