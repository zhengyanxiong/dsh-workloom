import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const source = (relative: string): Promise<string> =>
  readFile(fileURLToPath(new URL(`../../${relative}`, import.meta.url)), 'utf8')

it('keeps DSH service wiring out of the client entry', async () => {
  const entry = await source('src/client/index.ts')
  expect(entry).toContain('../platform/dsh/client-plugin.ts')
  expect(entry).not.toMatch(/ui\.(remote|sessions|slots|layout)/u)
  expect(entry).not.toContain("from '@deepseek-ai/dsh-api-")
})

it('keeps the public type surface off the Host implementation', async () => {
  const types = await source('src/types.ts')
  expect(types).toContain("./api/index.ts")
  expect(types).not.toContain('host/catalog')
})

it('routes DSH integration through the platform adapter', async () => {
  const entry = await source('src/platform/dsh/client-plugin.ts')
  const adapter = await source('src/platform/dsh/host-adapter.ts')
  expect(entry).toContain('installLoomClient')
  expect(entry).toContain('createLoomHost')
  expect(adapter).toContain('ui.remote.loom')
})
