/** Canvas ECG trace used by the execution-gate owner card. */
import { useEffect, useRef, type CSSProperties } from 'react'
import { COLORS } from './shell.ts'

const HEIGHT = 38
const BASELINE = HEIGHT * 0.62
const AMPLITUDE = 9

const style: CSSProperties = { display: 'block', width: '100%', height: HEIGHT }

/** Resolve a CSS variable into a concrete color; canvas does not accept `var()`. */
function concrete(value: string, fallback: string): string {
  if (!value.startsWith('var(')) return value
  const name = value.slice(4, -1).trim()
  if (typeof window === 'undefined' || typeof getComputedStyle !== 'function') return fallback
  const resolved = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return resolved === '' ? fallback : resolved
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
  /** Milliseconds per heartbeat; ignored while idle. */
  readonly beatMs: number
}

/**
 * Draw a left-to-right ECG whose newest sample is at the left edge.
 * The canvas resolves theme tokens to concrete colors because `strokeStyle`
 * does not resolve CSS variables.
 * @param props - activity flag and heartbeat period.
 * @returns the canvas element.
 */
export function LoomECG({ active, beatMs }: LoomECGProps) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (canvas === null) return
    const context = canvas.getContext('2d')
    if (context === null) return
    const green = concrete(COLORS.green, '#2fbf71')
    const idle = concrete(COLORS.faint, '#b8bec7')
    const grid = concrete(COLORS.border, '#e8f5ef')
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
      context.strokeStyle = grid
      context.lineWidth = 1
      context.globalAlpha = 0.6
      context.beginPath()
      for (let x = 0; x <= width; x += 24) { context.moveTo(x + 0.5, 0); context.lineTo(x + 0.5, HEIGHT) }
      for (let y = 0; y <= HEIGHT; y += 12) { context.moveTo(0, y + 0.5); context.lineTo(width, y + 0.5) }
      context.stroke()
      context.globalAlpha = 1
      if (!active) {
        context.strokeStyle = idle
        context.lineWidth = 1.2
        context.beginPath()
        context.moveTo(0, BASELINE)
        context.lineTo(width, BASELINE)
        context.stroke()
        return
      }
      if (history.length !== Math.max(1, Math.round(width))) history = new Array(Math.max(1, Math.round(width))).fill(BASELINE)
      context.strokeStyle = green
      context.lineJoin = 'round'
      context.lineCap = 'round'
      for (let i = 1; i < history.length; i++) {
        context.globalAlpha = 1 - 0.85 * (i / history.length)
        context.lineWidth = 1.35
        context.beginPath()
        context.moveTo(i - 1, history[i - 1]!)
        context.lineTo(i, history[i]!)
        context.stroke()
      }
      context.globalAlpha = 1
      context.fillStyle = green
      context.shadowColor = green
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
        phase = (phase + dt * 1000 / Math.max(beatMs, 500)) % 1
        history.unshift(BASELINE - wave(phase) * AMPLITUDE)
        history.pop()
      }
      draw()
      if (active && !reduced) frame = requestAnimationFrame(render)
    }
    const resize = (): void => {
      width = Math.max(120, canvas.parentElement?.clientWidth ?? 300)
      history = new Array(Math.max(1, Math.round(width))).fill(BASELINE)
      draw()
    }
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : undefined
    observer?.observe(canvas.parentElement ?? canvas)
    resize()
    if (active && !reduced) frame = requestAnimationFrame(render)
    return () => { if (frame !== 0) cancelAnimationFrame(frame); observer?.disconnect() }
  }, [active, beatMs])
  return <canvas ref={ref} style={style} aria-hidden />
}
