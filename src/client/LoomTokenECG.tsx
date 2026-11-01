/** Token-activity ECG for the execution-gate owner card. */
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TokenUsageView } from './projection.ts'
import { COLORS } from './shell.ts'
import { LoomECG } from './LoomECG.tsx'
import type { LoomKey } from './locales.ts'

type Translate = (key: LoomKey) => string

const SAMPLE_MS = 900
const IDLE_BEAT_MS = 2100
const MIN_BEAT_MS = 1250
const GENERATING_RATE = 0.5
const MAX_SAMPLED_RATE = 900

const card: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5, border: '0.5px solid #a7d9b8', background: 'linear-gradient(180deg, rgba(21,128,61,.06), transparent)', borderRadius: 7, padding: '8px 9px 7px' }
const top: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, fontSize: 10.5, color: COLORS.text }
const name: CSSProperties = { minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const state: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, color: COLORS.faint, fontSize: 9.5, lineHeight: 1.4 }
const dot = (active: boolean): CSSProperties => ({ width: 6, height: 6, borderRadius: '50%', flex: 'none', background: active ? COLORS.green : COLORS.faint, transition: 'background 250ms' })

/**
 * Sum every token bucket reported by the projection.
 * @param usage - token-meter projection for one Session.
 * @returns cumulative tokens, or undefined when the projection reported none.
 */
export function totalTokens(usage: TokenUsageView | undefined): number | undefined {
  if (usage === undefined) return undefined
  return usage.uncachedInputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
}

/**
 * Whether the Session is running with tokens still arriving fast enough to draw a beat.
 * @param running - native Session status.
 * @param rate - smoothed tokens per second.
 */
export function isGenerating(running: boolean, rate: number): boolean {
  return running && rate > GENERATING_RATE
}

/**
 * Beat period for the activity trace: a higher rate speeds the rhythm up, and
 * the floor keeps the trace from strobing when the projection reports a burst.
 * @param rate - smoothed tokens per second.
 * @returns milliseconds between beats.
 */
export function beatPeriodMs(rate: number): number {
  return Math.max(MIN_BEAT_MS, IDLE_BEAT_MS - Math.min(rate, MAX_SAMPLED_RATE) * 0.55)
}

/** Inputs for the owner activity card. */
export interface LoomTokenECGProps {
  readonly t: Translate
  readonly label: string
  readonly usage?: TokenUsageView | undefined
  readonly running: boolean
}

/**
 * Show the Session's activity as a token-rate-driven ECG trace.
 * Token counts stay in the projection (the card shows only activity), and the
 * trace is a visualization of recent usage change, not a per-token sample.
 * @param props - owner Session label, usage projection and native running state.
 * @returns the execution owner card.
 */
export function LoomTokenECG({ t, label, usage, running }: LoomTokenECGProps) {
  const total = totalTokens(usage)
  const [rate, setRate] = useState(0)
  const sampled = useRef(total)
  const last = useRef({ total, at: performance.now() })
  useEffect(() => {
    sampled.current = total
  }, [total])
  const reported = total !== undefined
  useEffect(() => {
    if (!running || !reported) {
      setRate(0)
      last.current = { total: sampled.current, at: performance.now() }
      return
    }
    const timer = setInterval(() => {
      const now = performance.now()
      const sample = sampled.current
      const previous = last.current.total
      const delta = previous === undefined || sample === undefined ? 0 : Math.max(0, sample - previous)
      const instant = delta / Math.max((now - last.current.at) / 1000, 0.001)
      setRate(current => current * 0.65 + instant * 0.35)
      last.current = { total: sample, at: now }
    }, SAMPLE_MS)
    return () => clearInterval(timer)
  }, [running, reported])
  const generating = isGenerating(running, rate)
  const stateKey: LoomKey = !running ? 'tokenECG.idle' : generating ? 'tokenECG.generating' : 'tokenECG.thinking'
  return <div style={card}>
    <div style={top}>
      <span style={dot(generating)} aria-hidden />
      <span style={name} title={label}>{label}</span>
      <Tag tone="success">{t('bottom.sessionOwner')}</Tag>
    </div>
    <LoomECG active={generating} beatMs={beatPeriodMs(rate)} />
    <div style={state}>
      <span>{t(stateKey)}</span>
      <span aria-hidden>·</span>
      <span>{t('tokenECG.activityNote')}</span>
    </div>
  </div>
}
