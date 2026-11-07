// @vitest-environment jsdom
import { readFile } from 'node:fs/promises'
import { expect, it } from 'vitest'
import { readSpreadsheet } from '../../../src/client/features/preview/xlsx.ts'

it('reads Chinese text, numeric amounts and every worksheet from a real xlsx', async () => {
  const bytes = await readFile('tests/fixtures/sales-preview.xlsx')
  const workbook = await readSpreadsheet(new Uint8Array(bytes))
  expect(workbook.sheets.map(sheet => sheet.name)).toEqual(['销售数据', '分类汇总'])
  const detail = workbook.sheets[0]!
  expect(detail.rows[0]?.[0]).toContain('销售数据')
  expect(detail.rows[3]?.[1]).toBe('无线蓝牙耳机 Pro')
  expect(detail.rows[3]?.[3]).toBe('399')
  expect(detail.rows[3]?.[4]).toBe('1,520')
  expect(detail.rows[3]?.[5]).toBe('606,480')
  expect(workbook.sheets[1]?.rows[2]?.[1]).toBe('2,508,230')
})
