/** @vitest-environment node */
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, it } from 'vitest'

const ROOT = path.resolve(import.meta.dirname, '..')

/** Collect every TypeScript source under a client directory. */
async function sources(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...await sources(full))
    else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) files.push(full)
  }
  return files
}

it('feature modules use the ui/primitives boundary instead of the DSH package', async () => {
  const files = await sources(path.join(ROOT, 'src/client/features'))
  const offenders: string[] = []
  for (const file of files) {
    const source = await readFile(file, 'utf8')
    if (source.includes('@deepseek-ai/dsh-client-ui-primitives')) offenders.push(path.relative(ROOT, file))
  }
  expect(offenders).toEqual([])
})

it('feature modules keep DSH runtime imports out and only keep type-only shared types', async () => {
  const files = await sources(path.join(ROOT, 'src/client/features'))
  const offenders: string[] = []
  for (const file of files) {
    const source = await readFile(file, 'utf8')
    const runtime = /import\s+(?!type\b)[^;]*?from\s+['"]@deepseek-ai\/dsh-(?!session\/types)/gu
    if (runtime.test(source)) offenders.push(path.relative(ROOT, file))
  }
  expect(offenders).toEqual([])
})
