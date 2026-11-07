import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { LoomFilePreview } from '../../../src/client/features/preview/LoomFilePreview.tsx'
import { en, type LoomKey } from '../../../src/client/locales.ts'

const t = (key: LoomKey) => en[key]

it('offers Diff and File tabs before any workspace is selected', () => {
  const html = renderToStaticMarkup(createElement(LoomFilePreview, {
    t, workspaceId: undefined, sessionId: undefined, filePath: 'src/a.ts',
    loadChanges: () => Promise.reject(new Error('unused')),
    readFile: () => Promise.reject(new Error('unused')), wrap: false, onToggleWrap: () => {},
  }))
  expect(html).toContain(en['diff.tabDiff'])
  expect(html).toContain(en['diff.tabFile'])
  expect(html).toContain(en['diff.workspace'])
})

it('offers native open, reveal and inline workbook preview', () => {
  const html = renderToStaticMarkup(createElement(LoomFilePreview, {
    t, workspaceId: 'w1', workspaceRoot: '/repo', sessionId: 's1' as never, filePath: 'out/report.xlsx', initialMode: 'file',
    loadChanges: () => Promise.reject(new Error('unused')),
    readFile: () => Promise.reject(new Error('unused')),
    readBytes: () => Promise.reject(new Error('unused')),
    openPath: () => Promise.resolve(true),
    applications: () => Promise.resolve({ ok: true, value: [] }),
    openWith: () => Promise.resolve(true),
    wrap: false, onToggleWrap: () => {},
  }))
  expect(html).toContain('report.xlsx')
  expect(html).toContain(en['diff.spreadsheetLoading'])
  expect(html).toContain(en['diff.openExternal'])
  expect(html).toContain(en['diff.openWith'])
})
