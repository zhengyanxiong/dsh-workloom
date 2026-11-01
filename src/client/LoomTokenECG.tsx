/** Token counter plus a lightweight ECG of recent token consumption for the execution gate. */
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TokenUsageView } from './projection.ts'
import { COLORS } from './shell.ts'
import { LoomECG } from './LoomECG.tsx'
import type { LoomKey } from './locales.ts'

type Translate = (key: LoomKey) => string

const card: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5, border: '0.5px solid #a7d9b8', background: 'linear-gradient(180deg, rgba(21,128,61,.06), transparent)', borderRadius: 7, padding: '8px 9px 7px' }
const top: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, fontSize: 10.5, color: COLORS.text }
const name: CSSProperties = { minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const tokenRow: CSSProperties = { display: 'flex', alignItems: 'baseline', gap: 5, color: COLORS.dim, fontSize: 10 }
const tokenNum: CSSProperties = { color: COLORS.text, fontFamily: 'ui-monospace, monospace', fontSize: 16, fontWeight: 500, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }
const state: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, color: COLORS.faint, fontSize: 9.5, lineHeight: 1.4 }
const dot = (active: boolean): CSSProperties => ({ width: 6, height: 6, borderRadius: '50%', flex: 'none', background: active ? COLORS.green : COLORS.faint, transition: 'background 250ms' })

function totalOf(usage: TokenUsageView | undefined): number | undefined {
  if (usage === undefined) return undefined
  return usage.uncachedInputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
}

function formatTokens(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(Math.round(value))
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
    <LoomECG active={generating} beatMs={beatMs} />
    <div style={state}>
      <span>{t(stateKey)}</span>
      <span aria-hidden>·</span>
      <span>{t('tokenECG.activityNote')}</span>
    </div>
  </div>
}
