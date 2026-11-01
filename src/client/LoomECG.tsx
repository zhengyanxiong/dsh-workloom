/** Scrolling read/write token-rate trace for the execution-gate owner card. */
import { useEffect, useRef, type CSSProperties } from 'react'
import { COLORS } from './shell.ts'

const HEIGHT = 38
const BASELINE = HEIGHT * 0.74
const TRACE_RISE = 22
/** Batched stroke groups; one stroke per group keeps the trailing fade cheap. */
const TRACE_CHUNKS = 32
/** Rate that fills the trace height; square-root compression keeps small rates visible. */
const READ_FULL_SCALE = 8000
const WRITE_FULL_SCALE = 200
/** Concrete colors used only when a theme token resolves to nothing. */
const FALLBACK_READ = '#4176e6'
const FALLBACK_WRITE = '#22c55e'
const FALLBACK_IDLE = '#b8bec7'
const FALLBACK_GRID = '#e8f5ef'

const style: CSSProperties = { display: 'block', width: '100%', height: HEIGHT }

interface TraceColors {
  readonly read: string
  readonly write: string
  readonly idle: string
  readonly grid: string
}

/**
 * Resolve a CSS variable on an element that inherits the document palette.
 * Canvas `strokeStyle` does not parse `var()`, and DSH alias tokens are
 * declared on `body`, so the root element cannot see them.
 * @param element - element whose inherited custom properties are read.
 * @param value - color token, either a `var(--name)` reference or a literal.
 * @param fallback - concrete color used when the token resolves to nothing.
 * @returns a concrete CSS color string.
 */
function concrete(element: Element, value: string, fallback: string): string {
  if (!value.startsWith('var(')) return value
  if (typeof getComputedStyle !== 'function') return fallback
  const name = value.slice(4, -1).trim()
  const resolved = getComputedStyle(element).getPropertyValue(name).trim()
  return resolved === '' ? fallback : resolved
}

/** Read the colors the trace draws on the current palette. */
function resolveColors(element: Element): TraceColors {
  return {
    read: concrete(element, COLORS.business, FALLBACK_READ),
    write: concrete(element, COLORS.green, FALLBACK_WRITE),
    idle: concrete(element, COLORS.faint, FALLBACK_IDLE),
    grid: concrete(element, COLORS.border, FALLBACK_GRID),
  }
}

/** Compress a token rate into the 0..1 height the trace uses. */
function level(rate: number, fullScale: number): number {
  return Math.min(1, Math.sqrt(Math.max(0, rate) / fullScale))
}

/** Inputs for the rate trace. */
export interface LoomECGProps {
  readonly active: boolean
  /** Tokens per second the model is reading (prompt and cache traffic). */
  readonly readRate: number
  /** Tokens per second the model is writing. */
  readonly writeRate: number
}

/**
 * Draw a left-to-right trace whose newest sample enters at the left edge:
 * green is the write rate, blue is the read rate. Height is compressed with a
 * square root so small rates stay visible next to prompt bursts.
 * @param props - activity flag plus the current read and write token rates.
 * @returns the canvas element.
 */
export function LoomECG({ active, readRate, writeRate }: LoomECGProps) {
  const ref = useRef<HTMLCanvasElement>(null)
  const rates = useRef({ read: readRate, write: writeRate })
  useEffect(() => {
    rates.current = { read: readRate, write: writeRate }
  }, [readRate, writeRate])
  useEffect(() => {
    const canvas = ref.current
    if (canvas === null) return
    const context = canvas.getContext('2d')
    if (context === null) return
    let colors = resolveColors(canvas)
    let frame = 0
    let width = 0
    let last = performance.now()
    let shownRead = 0
    let shownWrite = 0
    let readHistory: number[] = []
    let writeHistory: number[] = []
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const trace = (history: number[], color: string, lineWidth: number): void => {
      if (history.length < 2) return
      context.strokeStyle = color
      context.lineWidth = lineWidth
      context.lineJoin = 'round'
      context.lineCap = 'round'
      const step = Math.max(1, Math.ceil((history.length - 1) / TRACE_CHUNKS))
      for (let start = 1; start < history.length; start += step) {
        const end = Math.min(history.length - 1, start + step - 1)
        context.globalAlpha = 1 - 0.8 * ((start + end) / 2 / history.length)
        context.beginPath()
        context.moveTo(start - 1, BASELINE - history[start - 1]! * TRACE_RISE)
        for (let index = start; index <= end; index++) context.lineTo(index, BASELINE - history[index]! * TRACE_RISE)
        context.stroke()
      }
      context.globalAlpha = 1
    }
    const draw = (): void => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(HEIGHT * dpr)) {
        canvas.width = Math.round(width * dpr)
        canvas.height = Math.round(HEIGHT * dpr)
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      context.clearRect(0, 0, width, HEIGHT)
      context.strokeStyle = colors.grid
      context.lineWidth = 1
      context.globalAlpha = 0.6
      context.beginPath()
      for (let x = 0; x <= width; x += 24) { context.moveTo(x + 0.5, 0); context.lineTo(x + 0.5, HEIGHT) }
      for (let y = 0; y <= HEIGHT; y += 12) { context.moveTo(0, y + 0.5); context.lineTo(width, y + 0.5) }
      context.stroke()
      context.globalAlpha = 1
      if (!active) {
        context.strokeStyle = colors.idle
        context.lineWidth = 1.2
        context.beginPath()
        context.moveTo(0, BASELINE)
        context.lineTo(width, BASELINE)
        context.stroke()
        return
      }
      trace(readHistory, colors.read, 1.1)
      trace(writeHistory, colors.write, 1.35)
      const dot = (history: number[], color: string, radius: number): void => {
        context.fillStyle = color
        context.shadowColor = color
        context.shadowBlur = 7
        context.beginPath()
        context.arc(0, BASELINE - (history[0] ?? 0) * TRACE_RISE, radius, 0, Math.PI * 2)
        context.fill()
        context.shadowBlur = 0
      }
      dot(readHistory, colors.read, 1.7)
      dot(writeHistory, colors.write, 2.1)
    }
    const render = (now: number): void => {
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now
      if (active && !reduced) {
        const attack = Math.min(1, dt * 8)
        shownRead += (rates.current.read - shownRead) * attack
        shownWrite += (rates.current.write - shownWrite) * attack
        readHistory.unshift(level(shownRead, READ_FULL_SCALE))
        readHistory.pop()
        writeHistory.unshift(level(shownWrite, WRITE_FULL_SCALE))
        writeHistory.pop()
      }
      draw()
      if (active && !reduced) frame = requestAnimationFrame(render)
    }
    const resize = (): void => {
      width = Math.max(120, canvas.clientWidth)
      readHistory = new Array(Math.max(1, Math.round(width))).fill(0)
      writeHistory = new Array(Math.max(1, Math.round(width))).fill(0)
      draw()
    }
    const refreshColors = (): void => {
      colors = resolveColors(canvas)
      draw()
    }
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : undefined
    observer?.observe(canvas)
    const media = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : undefined
    media?.addEventListener('change', refreshColors)
    const palette = typeof MutationObserver === 'function' ? new MutationObserver(refreshColors) : undefined
    palette?.observe(document.documentElement, { attributes: true })
    if (document.body !== null) palette?.observe(document.body, { attributes: true })
    resize()
    if (active && !reduced) frame = requestAnimationFrame(render)
    return () => {
      if (frame !== 0) cancelAnimationFrame(frame)
      observer?.disconnect()
      palette?.disconnect()
      media?.removeEventListener('change', refreshColors)
    }
  }, [active])
  return <canvas ref={ref} style={style} aria-hidden />
}
