/**
 * Build, test, stage and exercise Workloom on an isolated 3090 profile.
 *
 * The smoke tries the real Web UI in headless Chrome when a Chromium binary is
 * available; otherwise it still verifies startup, authentication and the remote
 * plugin bundle over HTTP. It never touches the user's 3080/3099 instances.
 */
import { execFile, spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { createWriteStream } from 'node:fs'
import { cp, mkdir, readFile, rm, symlink } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const harness = process.env.DSH_HARNESS ?? resolve(root, '..', 'deepseek-harness')
const templateHome = process.env.SMOKE_TEMPLATE_HOME ?? resolve(root, '..', '.verify-dsh/home')
const templateProfile = resolve(templateHome, 'profiles/loom-verify')
const smokeHome = process.env.SMOKE_HOME ?? resolve(root, '.smoke-dsh/home')
const smokeProfile = 'loom-smoke'
const port = Number(process.env.SMOKE_PORT ?? 3090)
const cdpPort = Number(process.env.SMOKE_CDP_PORT ?? 9225)
const dist = resolve(root, 'dist-smoke')
const logPath = resolve(root, '.smoke-3090.log')
const chromePath = process.env.CHROME_PATH ?? '/home/bernie/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome'

/** Run one command and inherit output. */
async function run(command, args) {
  await exec(command, args, { cwd: root, env: process.env, maxBuffer: 16 * 1024 * 1024 })
}

/** Wait for a free port without binding it for long. */
async function assertPortFree() {
  await new Promise((resolvePromise, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => server.close(resolvePromise))
  })
}

/** Prepare an isolated profile from the known verify profile. */
async function prepareProfile() {
  await rm(smokeHome, { recursive: true, force: true })
  await mkdir(join(smokeHome, 'profiles'), { recursive: true })
  await mkdir(join(smokeHome, 'loom'), { recursive: true })
  await cp(templateProfile, join(smokeHome, 'profiles', smokeProfile), { recursive: true })
  const profileDir = join(smokeHome, 'profiles', smokeProfile)
  const link = join(profileDir, 'node_modules', 'dsh-workloom')
  await rm(link, { recursive: true, force: true })
  await symlink(dist, link, 'dir')
  try {
    await cp(join(templateHome, 'loom', 'catalog.json'), join(smokeHome, 'loom', 'catalog.json'))
  } catch {
    /* The plugin creates an empty catalog when the template has none. */
  }
}

/** Start the isolated server and resolve its tokenized URL. */
async function startServer() {
  const log = createWriteStream(logPath, { flags: 'w' })
  const child = spawn(process.execPath, [
    '--import', 'tsx/esm', 'apps/cli/src/bin.ts',
    '--profile', smokeProfile, '--port', String(port), '--no-open',
  ], {
    cwd: harness,
    env: { ...process.env, DSH_HOME: smokeHome, DSH_PROFILE: smokeProfile },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  const onData = (chunk) => {
    const text = String(chunk)
    output += text
    log.write(text)
  }
  child.stdout.on('data', onData)
  child.stderr.on('data', onData)
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    const match = /http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+/u.exec(output)
    if (match !== null) return { child, url: match[0] }
    if (child.exitCode !== null) throw new Error(`server exited ${String(child.exitCode)}\n${output.slice(-2000)}`)
    await new Promise(resolvePromise => setTimeout(resolvePromise, 200))
  }
  child.kill('SIGTERM')
  throw new Error(`server did not print a token within 30s\n${output.slice(-2000)}`)
}

/** Basic HTTP checks before the browser-level check. */
async function checkHttp(url) {
  const rootResponse = await fetch(`http://127.0.0.1:${String(port)}/`, { redirect: 'manual' })
  if (rootResponse.status !== 401) throw new Error(`unauthenticated page returned ${String(rootResponse.status)}`)
  const tokenResponse = await fetch(url, { redirect: 'manual' })
  if (tokenResponse.status !== 303 && tokenResponse.status !== 302) throw new Error(`token login returned ${String(tokenResponse.status)}`)
}

class Cdp {
  constructor(socketUrl) {
    this.socket = new WebSocket(socketUrl)
    this.nextId = 0
    this.pending = new Map()
    this.events = []
    this.socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data))
      if (message.id !== undefined && this.pending.has(message.id)) {
        const pending = this.pending.get(message.id)
        this.pending.delete(message.id)
        if (message.error !== undefined) pending.reject(new Error(JSON.stringify(message.error)))
        else pending.resolve(message.result)
      } else if (message.method !== undefined) {
        this.events.push(message)
      }
    }
  }

  async open() {
    await new Promise((resolvePromise, reject) => {
      this.socket.onopen = resolvePromise
      this.socket.onerror = reject
    })
  }

  send(method, params = {}) {
    const id = ++this.nextId
    return new Promise((resolvePromise, reject) => {
      this.pending.set(id, { resolve: resolvePromise, reject })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    return result.result?.value
  }

  close() { this.socket.close() }
}

/** Exercise the real Workloom panel when Chrome is available. */
async function checkBrowser(url) {
  let chrome
  try {
    chrome = spawn(chromePath, [
      '--headless=new', '--no-sandbox', '--disable-gpu',
      `--remote-debugging-port=${String(cdpPort)}`,
      `--user-data-dir=${join(root, '.smoke-chrome')}`,
      '--window-size=1400,857', url,
    ], { stdio: 'ignore' })
    const deadline = Date.now() + 15_000
    let target
    while (Date.now() < deadline) {
      try {
        const targets = await (await fetch(`http://127.0.0.1:${String(cdpPort)}/json/list`)).json()
        target = targets.find(entry => entry.type === 'page')
        if (target !== undefined) break
      } catch { /* Chrome is still starting. */ }
      await new Promise(resolvePromise => setTimeout(resolvePromise, 250))
    }
    if (target === undefined) throw new Error('Chrome DevTools target did not appear')
    const cdp = new Cdp(target.webSocketDebuggerUrl)
    await cdp.open()
    await cdp.send('Runtime.enable')
    await cdp.send('Page.enable')
    await new Promise(resolvePromise => setTimeout(resolvePromise, 3000))
    const clicked = await cdp.evaluate(`(() => {
      const button = [...document.querySelectorAll('button')].find((candidate) => (candidate.innerText || '').trim() === 'Workloom')
      button?.click()
      return button !== undefined
    })()`)
    if (!clicked) throw new Error('Workloom entry was not found')
    await new Promise(resolvePromise => setTimeout(resolvePromise, 1200))
    if (!(await cdp.evaluate(`document.querySelector('.loom-topbar') !== null`))) throw new Error('Workloom topbar did not render')
    await cdp.evaluate(`document.querySelector('.loom-top-new')?.click()`)
    await new Promise(resolvePromise => setTimeout(resolvePromise, 250))
    if (!(await cdp.evaluate(`document.querySelector('[role="menu"]') !== null`))) throw new Error('New menu did not open')
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 900, y: 650, button: 'left', clickCount: 1 })
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 900, y: 650, button: 'left', clickCount: 1 })
    await new Promise(resolvePromise => setTimeout(resolvePromise, 250))
    if (await cdp.evaluate(`document.querySelector('[role="menu"]') !== null`)) throw new Error('New menu did not close on outside click')
    const exceptions = cdp.events.filter(event => event.method === 'Runtime.exceptionThrown')
    if (exceptions.length > 0) throw new Error(`page exception: ${JSON.stringify(exceptions[0])}`)
    cdp.close()
    console.log('browser: Workloom rendered, New menu opened and closed')
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') {
      console.log('browser: skipped (set CHROME_PATH to enable UI smoke)')
      return false
    }
    throw error
  } finally {
    chrome?.kill('SIGTERM')
  }
}

async function main() {
  await assertPortFree()
  console.log('1/6 typecheck')
  await run('pnpm', ['run', 'typecheck'])
  console.log('2/6 tests')
  await run('pnpm', ['test'])
  console.log('3/6 build')
  await run('pnpm', ['run', 'build'])
  console.log('4/6 stage')
  await run(process.execPath, ['scripts/stage.mjs', harness, dist])
  console.log('5/6 prepare profile')
  await prepareProfile()
  console.log('6/6 start and verify 3090')
  const { child, url } = await startServer()
  try {
    await checkHttp(url)
    await checkBrowser(url)
    console.log('smoke passed')
    console.log(url)
  } finally {
    child.kill('SIGTERM')
    await new Promise(resolvePromise => setTimeout(resolvePromise, 500))
    if (child.exitCode === null) child.kill('SIGKILL')
  }
}

main().catch((error) => {
  console.error(`smoke failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
