/** Rate-shaped ECG trace for the execution-gate owner card. */
import { useEffect, useRef, type CSSProperties } from 'react'
import { COLORS } from '../shell.ts'

const HEIGHT = 38
const BASELINE = HEIGHT * 0.62
const AMPLITUDE = 9
/** Batched stroke groups; one stroke per group keeps the trailing fade cheap. */
const TRACE_CHUNKS = 32
/** Frame rate assumed when seeding the trace so a new beat reads continuously. */
const SEED_FPS = 60
/** Rates that saturate the shape: write is meter-scale, read is prompt-scale. */
const WRITE_FULL_SCALE = 200
const READ_FULL_SCALE = 8000
/** Concrete colors used only when a theme token resolves to nothing. */
// design-allow: 主题 token 缺失时的 SVG 兜底色
const FALLBACK_GREEN = '#22c55e'
// design-allow: 主题 token 缺失时的 SVG 兜底色
const FALLBACK_IDLE = '#b8bec7'
// design-allow: 主题 token 缺失时的 SVG 兜底色
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

/** Read the colors the trace draws on the current palette. */
function resolveColors(element: Element): ECGColors {
  return {
    green: concrete(element, COLORS.green, FALLBACK_GREEN),
    idle: concrete(element, COLORS.faint, FALLBACK_IDLE),
    grid: concrete(element, COLORS.border, FALLBACK_GRID),
  }
}

/** Compress a token rate into 0..1 so small rates stay visible next to bursts. */
function level(rate: number, fullScale: number): number {
  return Math.min(1, Math.sqrt(Math.max(0, rate) / fullScale))
}

/** Beat period in milliseconds: more tokens in flight means a faster heart. */
function beatMs(readLevel: number, writeLevel: number): number {
  return 2400 - 900 * (0.65 * writeLevel + 0.35 * readLevel)
}

/**
 * One ECG beat. The early P wave carries the read rate, the QRS complex and
 * the T wave carry the write rate; both stay visible at a low resting scale.
 * @param progress - phase within the beat, 0..1.
 * @param readScale - P-wave multiplier from the read rate.
 * @param writeScale - QRS/T-wave multiplier from the write rate.
 * @returns signed deflection in units of AMPLITUDE.
 */
function wave(progress: number, readScale: number, writeScale: number): number {
  if (progress < 0.07) return Math.sin(progress / 0.07 * Math.PI) * 0.16 * readScale
  if (progress < 0.10) return 0
  let qrs: number
  if (progress < 0.13) qrs = -(progress - 0.10) / 0.03 * 0.25
  else if (progress < 0.17) qrs = -0.25 + (progress - 0.13) / 0.04 * 1.35
  else if (progress < 0.21) qrs = 1.1 - (progress - 0.17) / 0.04 * 1.45
  else if (progress < 0.27) qrs = -0.35 + (progress - 0.21) / 0.06 * 0.35
  else if (progress < 0.34) qrs = 0
  else if (progress < 0.50) return Math.sin((progress - 0.34) / 0.16 * Math.PI) * 0.28 * writeScale
  else return 0
  return qrs * writeScale
}

/** Inputs for the rate-shaped trace. */
export interface LoomECGProps {
  readonly active: boolean
  /** Tokens per second the model is reading (prompt and cache traffic). */
  readonly readRate: number
  /** Tokens per second the model is writing. */
  readonly writeRate: number
}

/**
 * Draw a left-to-right ECG whose newest sample enters at the left edge.
 * The rhythm and the beat shape follow the live read and write token rates, so
 * a fast-writing turn produces taller, quicker beats and prompt reads lift the
 * P wave; a thinking turn keeps a slow, small resting pulse.
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
    let phase = 0.42
    let last = performance.now()
    let shownRead = 0
    let shownWrite = 0
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
      context.strokeStyle = colors.green
      context.lineWidth = 1.35
      context.lineJoin = 'round'
      context.lineCap = 'round'
      const step = Math.max(1, Math.ceil((history.length - 1) / TRACE_CHUNKS))
      for (let start = 1; start < history.length; start += step) {
        const end = Math.min(history.length - 1, start + step - 1)
        context.globalAlpha = 1 - 0.8 * ((start + end) / 2 / history.length)
        context.beginPath()
        context.moveTo(start - 1, history[start - 1]!)
        for (let index = start; index <= end; index++) context.lineTo(index, history[index]!)
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
    const samples = (): { readLevel: number; writeLevel: number } => ({
      readLevel: level(shownRead, READ_FULL_SCALE),
      writeLevel: level(shownWrite, WRITE_FULL_SCALE),
    })
    const seed = (): void => {
      if (!active || history.length < 2) return
      const { readLevel, writeLevel } = samples()
      const readScale = 0.35 + 0.65 * readLevel
      const writeScale = 0.30 + 0.70 * writeLevel
      const perFrame = 1 / Math.max(1, beatMs(readLevel, writeLevel) / 1000 * SEED_FPS)
      for (let index = 0; index < history.length; index++) {
        const at = ((phase - index * perFrame) % 1 + 1) % 1
        history[index] = BASELINE - wave(at, readScale, writeScale) * AMPLITUDE
      }
    }
    const render = (now: number): void => {
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now
      if (active && !reduced) {
        const attack = Math.min(1, dt * 6)
        shownRead += (rates.current.read - shownRead) * attack
        shownWrite += (rates.current.write - shownWrite) * attack
        const { readLevel, writeLevel } = samples()
        phase = (phase + dt * 1000 / Math.max(beatMs(readLevel, writeLevel), 800)) % 1
        history.unshift(BASELINE - wave(phase, 0.35 + 0.65 * readLevel, 0.30 + 0.70 * writeLevel) * AMPLITUDE)
        history.pop()
      }
      draw()
      if (active && !reduced) frame = requestAnimationFrame(render)
    }
    const resize = (): void => {
      width = Math.max(120, canvas.clientWidth)
      history = new Array(Math.max(1, Math.round(width))).fill(BASELINE)
      seed()
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
