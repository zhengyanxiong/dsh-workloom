/** The Loom shell must leave the desktop window chrome visible. */
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

const shellCss = readFileSync(new URL('../src/client/shell/LoomShell.module.css', import.meta.url), 'utf8')

it('reserves the macOS titlebar clearance for in-frame content', () => {
  const rule = shellCss.slice(shellCss.indexOf(":global(html[data-platform='darwin']) .root"))
  expect(rule).toContain('padding-top: var(--dsh-frame-top-clearance, 48px)')
})

it('offsets the full-bleed root below the Windows caption and macOS traffic lights', () => {
  const rule = shellCss.slice(shellCss.indexOf(':global(body.loom-fullwidth) .root'))
  expect(rule).toContain('position: fixed')
  expect(rule).toContain('top: var(--dsh-frame-top-clearance, 0px)')
  expect(rule).toContain('height: calc(100vh - var(--dsh-frame-top-clearance, 0px))')
  // The offset already reserves the band, so the fixed root must not pad twice.
  expect(rule).toContain('padding-top: 0')
  expect(rule).not.toContain('inset: 0')
})
