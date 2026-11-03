import { readFile } from 'node:fs/promises'
import { expect, it } from 'vitest'

it('declares the independent remote services used by the main panel', async () => {
  const source = await readFile(new URL('../src/platform/dsh/client-plugin.ts', import.meta.url), 'utf8')
  const injections = [...source.matchAll(/ctx\.inject\(\[([^\]]*)\]/gsu)].map(match => match[1] ?? '')
  expect(injections.some(services => services.includes("'remote.skills'"))).toBe(false)
  expect(injections.some(services => services.includes("'remote.session'"))).toBe(true)
})

it('wires the existing Host workspace reads instead of leaving them idle', async () => {
  const source = await readFile(new URL('../src/platform/dsh/client-plugin.ts', import.meta.url), 'utf8')
  expect(source).toContain('ui.remote.loom.workspaceStatus(request)')
  expect(source).toContain('ui.remote.loom.registerWorkspace(request)')
  expect(source).toContain('WorkspaceStatusResult')
})

it('routes native file addresses to the Loom preview while Loom is active', async () => {
  const source = await readFile(new URL('../src/platform/dsh/client-plugin.ts', import.meta.url), 'utf8')
  expect(source).toContain('routeLoomResource')
  expect(source).toContain('activePanelId === PANEL_ID')
})
