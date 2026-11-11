import { readdirSync, readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const clientRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../src/client')

function tsxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) return tsxFiles(path)
    return entry.isFile() && path.endsWith('.tsx') ? [path] : []
  })
}

it('keeps the Loom alias bridge on every body-portalled menu', () => {
  const offenders: string[] = []
  for (const path of tsxFiles(clientRoot)) {
    const source = readFileSync(path, 'utf8')
    for (const match of source.matchAll(/<Menu\b/gu)) {
      const anchor = source.indexOf('anchor=', match.index)
      const close = source.indexOf('/>', match.index)
      const end = anchor === -1 ? close : Math.min(anchor, close)
      const opening = source.slice(match.index, end === -1 ? undefined : end)
      if (/\bportal\b/u.test(opening) && !/listClassName=\{[^}]*LOOM_PORTAL_CLASS/u.test(opening)) {
        offenders.push(relative(clientRoot, path))
      }
    }
  }
  expect(offenders).toEqual([])
})
