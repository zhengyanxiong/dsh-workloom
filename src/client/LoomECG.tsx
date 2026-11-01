/** Canvas ECG trace used by the execution-gate owner card. */
import { useEffect, useRef, type CSSProperties } from 'react'
import { COLORS } from './shell.ts'

const HEIGHT = 38
const BASELINE = HEIGHT * 0.62
const AMPLITUDE = 9
/** Batched stroke groups; one stroke per group keeps the trailing fade cheap. */
const TRACE_CHUNKS = 32
/** Concrete colors used only when a theme token resolves to nothing. */
const FALLBACK_GREEN = '#22c55e'
const FALLBACK_IDLE = '#b8bec7'
const FALLBACK_GRID = '#e8f5ef'

const style: CSSProperties = { display: 'block', width: '100%', height: HEIGHT }

interface ECGColors {
  readonly green: string
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

/** Read the three colors the trace draws on the current palette. */
function resolveColors(element: Element): ECGColors {
  return {
    green: concrete(element, COLORS.green, FALLBACK_GREEN),
    idle: concrete(element, COLORS.faint, FALLBACK_IDLE),
    grid: concrete(element, COLORS.border, FALLBACK_GRID),
  }
}

function wave(progress: number): number {
  if (progress < 0.07) return Math.sin(progress / 0.07 * Math.PI) * 0.16
  if (progress < 0.10) return 0
  if (progress < 0.13) return -(progress - 0.10) / 0.03 * 0.25
  if (progress < 0.17) return -0.25 + (progress - 0.13) / 0.04 * 1.35
  if (progress < 0.21) return 1.1 - (progress - 0.17) / 0.04 * 1.45
  if (progress < 0.27) return -0.35 + (progress - 0.21) / 0.06 * 0.35
  if (progress < 0.34) return 0
  if (progress < 0.50) return Math.sin((progress - 0.34) / 0.16 * Math.PI) * 0.28
  return 0
}

/** Inputs for the ECG component. */
export interface LoomECGProps {
  readonly active: boolean
  /** Milliseconds per heartbeat; a new value changes the rhythm without restarting the trace. */
  readonly beatMs: number
}

/**
 * Draw a left-to-right ECG whose newest sample enters at the left edge.
 * The trace owns its canvas history, so a rate-driven beat period only
 * changes the rhythm; palette changes re-resolve the colors and repaint.
 * @param props - activity flag and heartbeat period.
 * @returns the canvas element.
 */
export function LoomECG({ active, beatMs }: LoomECGProps) {
  const ref = useRef<HTMLCanvasElement>(null)
  const beat = useRef(beatMs)
  useEffect(() => {
    beat.current = beatMs
  }, [beatMs])
  useEffect(() => {
    const canvas = ref.current
    if (canvas === null) return
    const context = canvas.getContext('2d')
    if (context === null) return
    let colors = resolveColors(canvas)
    let frame = 0
    let width = 0
    let phase = 0.42
    let last = performance.now()
    let history: number[] = []
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
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
      if (history.length !== Math.max(1, Math.round(width))) history = new Array(Math.max(1, Math.round(width))).fill(BASELINE)
      context.strokeStyle = colors.green
      context.lineJoin = 'round'
      context.lineCap = 'round'
      context.lineWidth = 1.35
      // One stroke per chunk instead of per pixel: the trailing fade is
      // quantized into TRACE_CHUNKS alpha steps, so the whole trace costs a
      // handful of draw calls per frame rather than one per pixel column.
      const step = Math.max(1, Math.ceil((history.length - 1) / TRACE_CHUNKS))
      for (let start = 1; start < history.length; start += step) {
        const end = Math.min(history.length - 1, start + step - 1)
        context.globalAlpha = 1 - 0.85 * ((start + end) / 2 / history.length)
        context.beginPath()
        context.moveTo(start - 1, history[start - 1]!)
        for (let i = start; i <= end; i++) context.lineTo(i, history[i]!)
        context.stroke()
      }
      context.globalAlpha = 1
      context.fillStyle = colors.green
      context.shadowColor = colors.green
      context.shadowBlur = 7
      context.beginPath()
      context.arc(0, history[0] ?? BASELINE, 2.1, 0, Math.PI * 2)
      context.fill()
      context.shadowBlur = 0
    }
    const render = (now: number): void => {
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now
      if (active && !reduced) {
        phase = (phase + dt * 1000 / Math.max(beat.current, 500)) % 1
        history.unshift(BASELINE - wave(phase) * AMPLITUDE)
        history.pop()
      }
      draw()
      if (active && !reduced) frame = requestAnimationFrame(render)
    }
    const resize = (): void => {
      width = Math.max(120, canvas.clientWidth)
      history = new Array(Math.max(1, Math.round(width))).fill(BASELINE)
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
