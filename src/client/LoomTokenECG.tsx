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

function TokenECG({ active }: { readonly active: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (canvas === null) return
    const context = canvas.getContext('2d')
    if (context === null) return
    let frame = 0
    let phase = 0
    let width = 0
    let last = performance.now()
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const render = (now: number): void => {
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now
      phase = (phase + dt * 1.2) % 1
      draw()
      if (active && !reduced) frame = requestAnimationFrame(render)
    }
    const draw = (): void => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(H * dpr)) {
        canvas.width = Math.round(width * dpr)
        canvas.height = Math.round(H * dpr)
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      context.clearRect(0, 0, width, H)
      context.strokeStyle = COLORS.border
      context.lineWidth = 1
      context.globalAlpha = 0.55
      context.beginPath()
      for (let x = 0; x <= width; x += 24) { context.moveTo(x + 0.5, 0); context.lineTo(x + 0.5, H) }
      for (let y = 0; y <= H; y += 12) { context.moveTo(0, y + 0.5); context.lineTo(width, y + 0.5) }
      context.stroke()
      context.globalAlpha = 1
      context.strokeStyle = active ? COLORS.green : COLORS.faint
      context.lineWidth = 1.35
      context.lineJoin = 'round'
      context.lineCap = 'round'
      context.beginPath()
      for (let x = 0; x <= width; x += 1) {
        const y = active ? BASE - wave(phase - x / Math.max(width, 1) * 2.2) * AMP : BASE
        if (x === 0) context.moveTo(x, y)
        else context.lineTo(x, y)
      }
      context.stroke()
      if (active) {
        context.fillStyle = COLORS.green
        context.beginPath()
        context.arc(width, BASE - wave(phase) * AMP, 2, 0, Math.PI * 2)
        context.fill()
      }
    }
    const resize = (): void => { width = Math.max(120, canvas.parentElement?.clientWidth ?? 300); draw() }
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : undefined
    observer?.observe(canvas.parentElement ?? canvas)
    resize()
    if (active && !reduced) frame = requestAnimationFrame(render)
    return () => { if (frame !== 0) cancelAnimationFrame(frame); observer?.disconnect() }
  }, [active])
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
    <TokenECG active={generating} />
    <div style={state}>
      <span>{t(stateKey)}</span>
      <span aria-hidden>·</span>
      <span>{t('tokenECG.activityNote')}</span>
    </div>
  </div>
}
