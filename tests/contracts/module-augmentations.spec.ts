import { readdir, readFile } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const root = fileURLToPath(new URL('../..', import.meta.url))

/** Collect source files that contain module augmentations. */
async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await sourceFiles(path))
    else if (['.ts', '.tsx'].includes(extname(entry.name))) files.push(path)
  }
  return files
}

it('imports every module it augments', async () => {
  const files = [
    ...await sourceFiles(join(root, 'src')),
    ...await sourceFiles(join(root, 'tests')),
  ]
  const failures: string[] = []
  for (const file of files) {
    const source = await readFile(file, 'utf8')
    for (const match of source.matchAll(/^declare module ['"]([^'"]+)['"]/gmu)) {
      const moduleName = match[1]
      if (!new RegExp(`from ['"]${moduleName.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}['"]`, 'u').test(source)) {
        failures.push(`${relative(root, file)}: ${moduleName}`)
      }
    }
  }
  expect(failures).toEqual([])
})
