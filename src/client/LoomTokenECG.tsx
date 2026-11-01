/** Token counter plus a lightweight ECG of recent token consumption for the execution gate. */
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TokenUsageView } from './projection.ts'
import { COLORS } from './shell.ts'
import type { LoomKey } from './locales.ts'

type Translate = (key: LoomKey) => string

const H = 38
const BASE = H * 0.62
const AMP = 9

const card: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5, border: '0.5px solid #a7d9b8', background: 'linear-gradient(180deg, rgba(21,128,61,.06), transparent)', borderRadius: 7, padding: '8px 9px 7px' }
const top: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, fontSize: 10.5, color: COLORS.text }
const name: CSSProperties = { minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const tokenRow: CSSProperties = { display: 'flex', alignItems: 'baseline', gap: 5, color: COLORS.dim, fontSize: 10 }
const tokenNum: CSSProperties = { color: COLORS.text, fontFamily: 'ui-monospace, monospace', fontSize: 16, fontWeight: 500, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }
const state: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, color: COLORS.faint, fontSize: 9.5, lineHeight: 1.4 }
const canvas: CSSProperties = { display: 'block', width: '100%', height: H }
const dot = (active: boolean): CSSProperties => ({ width: 6, height: 6, borderRadius: '50%', flex: 'none', background: active ? COLORS.green : COLORS.faint, transition: 'background 250ms' })

function totalOf(usage: TokenUsageView | undefined): number | undefined {
  if (usage === undefined) return undefined
  return usage.uncachedInputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
}

function formatTokens(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(Math.round(value))
}

function wave(p: number): number {
  if (p < 0.07) return Math.sin(p / 0.07 * Math.PI) * 0.16
  if (p < 0.10) return 0
  if (p < 0.13) return -(p - 0.10) / 0.03 * 0.25
  if (p < 0.17) return -0.25 + (p - 0.13) / 0.04 * 1.35
  if (p < 0.21) return 1.1 - (p - 0.17) / 0.04 * 1.45
  if (p < 0.27) return -0.35 + (p - 0.21) / 0.06 * 0.35
  if (p < 0.34) return 0
  if (p < 0.50) return Math.sin((p - 0.34) / 0.16 * Math.PI) * 0.28
  return 0
}

function TokenECG({ active, beatMs }: { readonly active: boolean; readonly beatMs: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (canvas === null) return
    const context = canvas.getContext('2d')
    if (context === null) return
    let frame = 0
    let width = 0
    let phase = 0.42
    let last = performance.now()
    let history: number[] = []
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const draw = (): void => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(H * dpr)) {
        canvas.width = Math.round(width * dpr)
        canvas.height = Math.round(H * dpr)
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      context.clearRect(0, 0, width, H)
      context.strokeStyle = '#e8f5ef'
      context.lineWidth = 1
      context.globalAlpha = 0.6
      context.beginPath()
      for (let x = 0; x <= width; x += 24) { context.moveTo(x + 0.5, 0); context.lineTo(x + 0.5, H) }
      for (let y = 0; y <= H; y += 12) { context.moveTo(0, y + 0.5); context.lineTo(width, y + 0.5) }
      context.stroke()
      context.globalAlpha = 1
      if (!active) {
        context.strokeStyle = COLORS.faint
        context.lineWidth = 1.2
        context.beginPath()
        context.moveTo(0, BASE)
        context.lineTo(width, BASE)
        context.stroke()
        return
      }
      if (history.length !== Math.max(1, Math.round(width))) history = new Array(Math.max(1, Math.round(width))).fill(BASE)
      context.strokeStyle = COLORS.green
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
      context.fillStyle = COLORS.green
      context.shadowColor = COLORS.green
      context.shadowBlur = 7
      context.beginPath()
      context.arc(0, history[0] ?? BASE, 2.1, 0, Math.PI * 2)
      context.fill()
      context.shadowBlur = 0
    }
    const render = (now: number): void => {
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now
      if (active && !reduced) {
        phase = (phase + dt * 1000 / Math.max(beatMs, 500)) % 1
        const next = BASE - wave(phase) * AMP
        history.unshift(next)
        history.pop()
      }
      draw()
      if (active && !reduced) frame = requestAnimationFrame(render)
    }
    const resize = (): void => {
      width = Math.max(120, canvas.parentElement?.clientWidth ?? 300)
      history = new Array(Math.max(1, Math.round(width))).fill(BASE)
      draw()
    }
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : undefined
    observer?.observe(canvas.parentElement ?? canvas)
    resize()
    if (active && !reduced) frame = requestAnimationFrame(render)
    return () => { if (frame !== 0) cancelAnimationFrame(frame); observer?.disconnect() }
  }, [active, beatMs])
  return <canvas ref={ref} style={canvas} aria-hidden />
}

/** Inputs for the owner token/activity card. */
export interface LoomTokenECGProps {
  readonly t: Translate
  readonly label: string
  readonly usage?: TokenUsageView | undefined
  readonly running: boolean
}

/**
 * Show real cumulative tokens and a token-rate-driven activity trace.
 * The trace is a visualization of recent usage change, not a per-token sample.
 * @param props - owner Session label, usage projection and native running state.
 * @returns the execution owner card.
 */
export function LoomTokenECG({ t, label, usage, running }: LoomTokenECGProps) {
  const total = totalOf(usage)
  const [rate, setRate] = useState(0)
  const last = useRef({ total, at: performance.now() })
  useEffect(() => {
    if (!running || total === undefined) {
      setRate(0)
      last.current = { total, at: performance.now() }
      return
    }
    const timer = setInterval(() => {
      const now = performance.now()
      const delta = Math.max(0, total - (last.current.total ?? total))
      const instant = delta / Math.max((now - last.current.at) / 1000, 0.001)
      setRate(current => current * 0.65 + instant * 0.35)
      last.current = { total, at: now }
    }, 900)
    return () => clearInterval(timer)
  }, [running, total])
  const generating = running && rate > 0.5
  // Keep the trace legible: rate changes the rhythm, but it never becomes a
  // fast strobe when the projection reports a large delta.
  const beatMs = Math.max(1250, 2100 - Math.min(rate, 900) * 0.55)
  const stateKey: LoomKey = !running ? 'tokenECG.idle' : generating ? 'tokenECG.generating' : 'tokenECG.thinking'
  return <div style={card}>
    <div style={top}>
      <span style={dot(generating)} aria-hidden />
      <span style={name} title={label}>{label}</span>
      <Tag tone="success">{t('bottom.sessionOwner')}</Tag>
    </div>
    <div style={tokenRow}>
      <span>{t('tokenECG.used')}</span>
      <span style={tokenNum}>{total === undefined ? '—' : formatTokens(total)}</span>
      <span>{t('tokenECG.tokens')}</span>
    </div>
    <TokenECG active={generating} beatMs={beatMs} />
    <div style={state}>
      <span>{t(stateKey)}</span>
      <span aria-hidden>·</span>
      <span>{t('tokenECG.activityNote')}</span>
    </div>
  </div>
}
