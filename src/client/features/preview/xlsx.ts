/** Minimal read-only XLSX reader: ZIP directory + workbook/shared-string/sheet XML. */

/** One parsed worksheet, limited to the cells a human can reasonably scan. */
export interface SpreadsheetSheet {
  readonly name: string
  /** Row-major cells; empty strings preserve column positions. */
  readonly rows: readonly (readonly string[])[]
  readonly truncated: boolean
}

/** Parsed workbook used by the inline preview. */
export interface SpreadsheetWorkbook {
  readonly sheets: readonly SpreadsheetSheet[]
}

/** Raised for malformed archives or XML; callers fall back to external opening. */
export class SpreadsheetError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SpreadsheetError'
  }
}

interface ZipEntry {
  readonly name: string
  readonly method: number
  readonly compressedSize: number
  readonly localOffset: number
}

const MAX_ROWS = 500
const MAX_COLUMNS = 80

function u16(view: DataView, offset: number): number {
  return view.getUint16(offset, true)
}

function u32(view: DataView, offset: number): number {
  return view.getUint32(offset, true)
}

function findEndOfCentralDirectory(view: DataView): number {
  const start = Math.max(0, view.byteLength - 65_557)
  for (let offset = view.byteLength - 22; offset >= start; offset -= 1) {
    if (u32(view, offset) === 0x0605_4b50) return offset
  }
  throw new SpreadsheetError('xlsx: end of central directory not found')
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') throw new SpreadsheetError('xlsx: decompression is unavailable')
  const decompressor = new DecompressionStream('deflate-raw')
  const writer = decompressor.writable.getWriter()
  const copy = new Uint8Array(data.byteLength)
  copy.set(data)
  void writer.write(copy)
  void writer.close()
  const reader = decompressor.readable.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value !== undefined) { chunks.push(value); length += value.byteLength }
  }
  const result = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength }
  return result
}

async function unzip(data: Uint8Array): Promise<ReadonlyMap<string, Uint8Array>> {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const eocd = findEndOfCentralDirectory(view)
  const count = u16(view, eocd + 10)
  let cursor = u32(view, eocd + 16)
  const entries: ZipEntry[] = []
  for (let index = 0; index < count; index += 1) {
    if (u32(view, cursor) !== 0x0201_4b50) throw new SpreadsheetError('xlsx: invalid central directory')
    const method = u16(view, cursor + 10)
    const compressedSize = u32(view, cursor + 20)
    const nameLength = u16(view, cursor + 28)
    const extraLength = u16(view, cursor + 30)
    const commentLength = u16(view, cursor + 32)
    const localOffset = u32(view, cursor + 42)
    const nameBytes = data.subarray(cursor + 46, cursor + 46 + nameLength)
    entries.push({ name: new TextDecoder().decode(nameBytes), method, compressedSize, localOffset })
    cursor += 46 + nameLength + extraLength + commentLength
  }
  const result = new Map<string, Uint8Array>()
  for (const entry of entries) {
    if (!entry.name.startsWith('xl/')) continue
    if (u32(view, entry.localOffset) !== 0x0403_4b50) throw new SpreadsheetError('xlsx: invalid local header')
    const nameLength = u16(view, entry.localOffset + 26)
    const extraLength = u16(view, entry.localOffset + 28)
    const start = entry.localOffset + 30 + nameLength + extraLength
    const compressed = data.subarray(start, start + entry.compressedSize)
    if (entry.method === 0) result.set(entry.name, compressed)
    else if (entry.method === 8) result.set(entry.name, await inflateRaw(compressed))
    else throw new SpreadsheetError(`xlsx: unsupported compression method ${String(entry.method)}`)
  }
  return result
}

function elements(parent: Document | Element, name: string): Element[] {
  return [...parent.getElementsByTagNameNS('*', name)]
}

function textOf(element: Element): string {
  return elements(element, 't').map(node => node.textContent ?? '').join('')
}

function parseXml(bytes: Uint8Array, path: string): Document {
  const text = new TextDecoder('utf-8').decode(bytes)
  const document = new DOMParser().parseFromString(text, 'application/xml')
  if (document.getElementsByTagName('parsererror').length > 0) throw new SpreadsheetError(`xlsx: invalid XML in ${path}`)
  return document
}

function normalizePart(path: string): string | undefined {
  const normalized = path.replace(/^\/+/u, '')
  if (normalized.includes('..')) return undefined
  return normalized.startsWith('xl/') ? normalized : `xl/${normalized}`
}

function cellColumn(reference: string): number | undefined {
  const match = /^([A-Z]+)\d+$/u.exec(reference)
  if (match === null) return undefined
  let value = 0
  for (const character of match[1] ?? '') value = value * 26 + character.charCodeAt(0) - 64
  return value - 1
}

function numberText(value: string): string {
  const number = Number(value)
  if (!Number.isFinite(number)) return value
  return Number.isInteger(number) ? number.toLocaleString('zh-CN') : number.toLocaleString('zh-CN', { maximumFractionDigits: 6 })
}

function sharedStrings(document: Document | undefined): string[] {
  if (document === undefined) return []
  return elements(document, 'si').map(entry => textOf(entry))
}

function sheetPath(target: string, partNames: ReadonlySet<string>): string | undefined {
  const normalized = normalizePart(target)
  if (normalized !== undefined && partNames.has(normalized)) return normalized
  const basename = target.replace(/^.*\//u, '')
  return [...partNames].find(name => name.endsWith(`/${basename}`) || name === `xl/${basename}`)
}

interface SheetReference {
  readonly name: string
  readonly path: string
}

function parseWorkbook(parts: ReadonlyMap<string, Uint8Array>): SheetReference[] {
  const workbookBytes = parts.get('xl/workbook.xml')
  if (workbookBytes === undefined) throw new SpreadsheetError('xlsx: workbook.xml is missing')
  const workbook = parseXml(workbookBytes, 'xl/workbook.xml')
  const relsBytes = parts.get('xl/_rels/workbook.xml.rels')
  const relationships = new Map<string, string>()
  if (relsBytes !== undefined) {
    const rels = parseXml(relsBytes, 'xl/_rels/workbook.xml.rels')
    for (const relationship of elements(rels, 'Relationship')) {
      const id = relationship.getAttribute('Id')
      const target = relationship.getAttribute('Target')
      if (id !== null && target !== null) relationships.set(id, target)
    }
  }
  const names = new Set(parts.keys())
  return elements(workbook, 'sheet').flatMap((sheet) => {
    const name = sheet.getAttribute('name') ?? 'Sheet'
    const relation = sheet.getAttribute('r:id') ?? sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')
    const target = relation === null ? undefined : relationships.get(relation)
    const path = target === undefined ? undefined : sheetPath(target, names)
    return path === undefined ? [] : [{ name, path }]
  })
}

function parseSheet(document: Document, strings: readonly string[]): Omit<SpreadsheetSheet, 'name'> {
  const rows = elements(document, 'row').slice(0, MAX_ROWS)
  let truncated = elements(document, 'row').length > MAX_ROWS
  let maxColumn = 0
  const parsed = rows.map(row => {
    const cells = elements(row, 'c')
    const values: string[] = []
    for (const cell of cells) {
      const column = cellColumn(cell.getAttribute('r') ?? '')
      if (column === undefined || column >= MAX_COLUMNS) { truncated = true; continue }
      const type = cell.getAttribute('t')
      const valueNode = elements(cell, 'v')[0]
      const formula = elements(cell, 'f')[0]?.textContent ?? undefined
      const raw = valueNode?.textContent ?? ''
      let value: string
      if (type === 's') value = strings[Number(raw)] ?? ''
      else if (type === 'inlineStr') value = textOf(cell)
      else if (type === 'b') value = raw === '1' ? 'TRUE' : 'FALSE'
      else if (type === 'str' || type === 'e') value = raw
      else value = raw === '' ? '' : numberText(raw)
      if (formula !== undefined && value === '') value = `=${formula}`
      values[column] = value
      if (column > maxColumn) maxColumn = column
    }
    return values
  })
  const width = Math.min(MAX_COLUMNS, maxColumn + 1)
  return {
    rows: parsed.map(row => Array.from({ length: width }, (_, index) => row[index] ?? '')),
    truncated,
  }
}

/**
 * Parse a modern XLSX workbook into sheet names and display rows.
 * @param bytes - complete .xlsx file bytes.
 * @returns sheets in workbook order.
 * @throws {SpreadsheetError} for malformed or unsupported files.
 */
export async function readSpreadsheet(bytes: Uint8Array): Promise<SpreadsheetWorkbook> {
  if (bytes.byteLength < 22) throw new SpreadsheetError('xlsx: file is too small')
  const parts = await unzip(bytes)
  const strings = sharedStrings(parts.get('xl/sharedStrings.xml') === undefined ? undefined : parseXml(parts.get('xl/sharedStrings.xml')!, 'xl/sharedStrings.xml'))
  const references = parseWorkbook(parts)
  if (references.length === 0) throw new SpreadsheetError('xlsx: workbook has no sheets')
  const sheets: SpreadsheetSheet[] = []
  for (const reference of references) {
    const bytesForSheet = parts.get(reference.path)
    if (bytesForSheet === undefined) continue
    const parsed = parseSheet(parseXml(bytesForSheet, reference.path), strings)
    sheets.push({ name: reference.name, ...parsed })
  }
  if (sheets.length === 0) throw new SpreadsheetError('xlsx: no readable worksheets')
  return { sheets }
}
