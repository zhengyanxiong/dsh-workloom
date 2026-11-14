import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { archiveWorkspaceTemp } from '../../src/host/service/artifacts.ts'

const roots: string[] = []
async function fixture(): Promise<{ root: string; archive: string }> {
  const base = await mkdtemp(join(tmpdir(), 'loom-artifacts-test-'))
  roots.push(base)
  return { root: join(base, 'workspace'), archive: join(base, 'artifacts', 'p1', 'w1') }
}
afterEach(async () => {
  for (const base of roots.splice(0)) {
    if (!resolve(base).startsWith(join(tmpdir(), 'loom-artifacts-test-'))) throw new Error('unsafe test cleanup')
    await rm(base, { recursive: true, force: true })
  }
})

it('copies .loomtmp into the project archive and keeps the source files', async () => {
  const f = await fixture()
  await mkdir(join(f.root, '.loomtmp', 'nested'), { recursive: true })
  await writeFile(join(f.root, '.loomtmp', 'nested', 'result.txt'), 'temporary output')
  const archived = await archiveWorkspaceTemp(f.root, f.archive)
  expect(archived).toBeDefined()
  expect(await readFile(join(archived!, 'nested', 'result.txt'), 'utf8')).toBe('temporary output')
  expect(await readFile(join(f.root, '.loomtmp', 'nested', 'result.txt'), 'utf8')).toBe('temporary output')
})

it('does not create an archive when .loomtmp is missing or empty', async () => {
  const f = await fixture()
  await mkdir(f.root, { recursive: true })
  expect(await archiveWorkspaceTemp(f.root, f.archive)).toBeUndefined()
  await mkdir(join(f.root, '.loomtmp'), { recursive: true })
  expect(await archiveWorkspaceTemp(f.root, f.archive)).toBeUndefined()
})
