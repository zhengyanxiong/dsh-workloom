#!/usr/bin/env node
/**
 * Capture the Loom overview from the DSH shell for design handoff.
 *
 * visual-check.mjs can only open a URL and screenshot it. Loom is a DSH main
 * panel, so the raw URL lands on Workbench; this driver opens the panel,
 * dismisses onboarding and selects the requested hash route before capture.
 */
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const argv = process.argv.slice(2)
const arg = (name, fallback) => {
  const index = argv.indexOf(`--${name}`)
  return index === -1 ? fallback : argv[index + 1]
}
const url = arg('url')
if (url === undefined) {
  console.error('usage: node scripts/design-capture.mjs --url <url> [--out design/shots] [--route home] [--widths 1440,768,375] [--height 1000]')
  process.exit(2)
}
const outDir = arg('out', 'design/shots')
const route = arg('route', 'home')
const name = arg('name', route)
const suffix = arg('suffix', '')
const evalExpr = arg('eval')
const widths = arg('widths', '1440,768,375').split(',').map(value => Number(value)).filter(Number.isFinite)
const height = Number(arg('height', '1000'))
const chrome = process.env.CHROME_PATH ?? '/home/bernie/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome'
const port = Number(arg('port', '9333'))
const profile = await mkdtemp(path.join(tmpdir(), 'loom-design-'))
await mkdir(outDir, { recursive: true })

const child = spawn(chrome, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${String(port)}`, `--user-data-dir=${profile}`, '--window-size=1440,1000', 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] })
let stderr = ''
child.stderr.on('data', chunk => { stderr += String(chunk) })
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
const endpoint = async (pathname) => (await fetch(`http://127.0.0.1:${String(port)}${pathname}`)).json()

let page
for (let attempt = 0; attempt < 80; attempt += 1) {
  try {
    const pages = await endpoint('/json/list')
    page = pages.find(target => target.type === 'page')
    if (page !== undefined) break
  } catch { /* browser is still starting */ }
  await sleep(100)
}
if (page === undefined) {
  child.kill('SIGKILL')
  console.error(`design-capture: Chrome did not expose CDP\n${stderr}`)
  process.exit(1)
}
const ws = new WebSocket(page.webSocketDebuggerUrl)
let nextId = 0
const pending = new Map()
ws.onmessage = event => {
  const message = JSON.parse(event.data)
  if (message.id === undefined || !pending.has(message.id)) return
  const entry = pending.get(message.id)
  pending.delete(message.id)
  if (message.error === undefined) entry.resolve(message.result)
  else entry.reject(new Error(JSON.stringify(message.error)))
}
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId
  pending.set(id, { resolve, reject })
  ws.send(JSON.stringify({ id, method, params }))
})
const evaluate = async expression => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.value
const clickText = async text => evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(e => (e.innerText || '').trim() === ${JSON.stringify(text)}); if (!b) return false; b.click(); return true })()`)
const closeOnboarding = async () => evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(e => e.getAttribute('aria-label') === 'Close' || (e.innerText || '').trim() === 'Close'); if (!b) return false; b.click(); return true })()`)

try {
  await send('Runtime.enable')
  await send('Page.enable')
  await send('Page.navigate', { url })
  await sleep(2500)
  await clickText('Workloom')
  await sleep(1200)
  await closeOnboarding()
  await evaluate(`window.location.hash = ${JSON.stringify(`#${route}`)}`)
  await sleep(800)
  if (evalExpr !== undefined) {
    console.log(`eval: ${String(await evaluate(evalExpr))}`)
    await sleep(500)
  }
  for (const width of widths) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
    await sleep(400)
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    const file = path.join(outDir, `loom-${name}${suffix}@${String(width)}.png`)
    await writeFile(file, Buffer.from(shot.data, 'base64'))
    console.log(`captured ${file}`)
  }
} finally {
  ws.close()
  child.kill('SIGKILL')
}
