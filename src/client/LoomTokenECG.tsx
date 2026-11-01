/** Token-activity trace for the execution-gate owner card. */
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TokenUsageView } from './projection.ts'
import { COLORS } from './shell.ts'
import { LoomECG } from './LoomECG.tsx'
import type { LoomKey } from './locales.ts'

type Translate = (key: LoomKey) => string

/** Projection sampling cadence in milliseconds. */
const SAMPLE_MS = 500
/** Window the rate averages over; settlements arrive in bursts, not streams. */
const RATE_WINDOW_MS = 6000
/** Write rate (tokens/s) above which the Session reads as generating. */
const GENERATING_WRITE_RATE = 5

const card: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5, border: '0.5px solid #a7d9b8', background: 'linear-gradient(180deg, rgba(21,128,61,.06), transparent)', borderRadius: 7, padding: '8px 9px 7px' }
const top: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, fontSize: 10.5, color: COLORS.text }
const name: CSSProperties = { minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const state: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, color: COLORS.faint, fontSize: 9.5, lineHeight: 1.4 }
const legend: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 3, flex: 'none', fontSize: 9, color: COLORS.faint }
const legendDot = (color: string): CSSProperties => ({ width: 5, height: 5, borderRadius: '50%', flex: 'none', background: color })
const dot = (active: boolean): CSSProperties => ({ width: 6, height: 6, borderRadius: '50%', flex: 'none', background: active ? COLORS.green : COLORS.faint, transition: 'background 250ms' })

/**
 * Tokens the model read from one usage projection: prompt plus cache traffic.
 * @param usage - token-meter projection for one Session.
 * @returns cumulative read tokens, or undefined when the projection reported none.
 */
export function readTokens(usage: TokenUsageView | undefined): number | undefined {
  if (usage === undefined) return undefined
  return usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
}

/**
 * Tokens the model wrote from one usage projection.
 * @param usage - token-meter projection for one Session.
 * @returns cumulative output tokens, or undefined when the projection reported none.
 */
export function writeTokens(usage: TokenUsageView | undefined): number | undefined {
  return usage?.outputTokens
}

/**
 * Whether the Session is running and writing tokens fast enough to show output activity.
 * @param running - native Session status.
 * @param writeRate - smoothed output tokens per second.
 */
export function isGenerating(running: boolean, writeRate: number): boolean {
  return running && writeRate > GENERATING_WRITE_RATE
}

/** Inputs for the owner activity card. */
export interface LoomTokenECGProps {
  readonly t: Translate
  readonly label: string
  readonly usage?: TokenUsageView | undefined
  readonly running: boolean
}

/**
 * Show the Session's current read and write token rates as a scrolling trace.
 * The projection only reports usage at model settlements, so the rates are
 * smoothed deltas rather than per-token samples.
 * @param props - owner Session label, usage projection and native running state.
 * @returns the execution owner card.
 */
export function LoomTokenECG({ t, label, usage, running }: LoomTokenECGProps) {
  const usageRef = useRef(usage)
  const [rates, setRates] = useState({ read: 0, write: 0 })
  useEffect(() => {
    usageRef.current = usage
  }, [usage])
  useEffect(() => {
    const samples: { at: number; read: number; write: number }[] = []
    let started = false
    const timer = setInterval(() => {
      const now = performance.now()
      const totals = {
        read: readTokens(usageRef.current) ?? samples.at(-1)?.read ?? 0,
        write: writeTokens(usageRef.current) ?? samples.at(-1)?.write ?? 0,
      }
      samples.push({ at: now, ...totals })
      while (samples.length > 1 && now - samples[0]!.at > RATE_WINDOW_MS) samples.shift()
      if (!started) {
        // The first sample only establishes the baseline; reporting a rate
        // against it would count every prior token as a burst.
        started = true
        return
      }
      const oldest = samples[0]!
      const span = Math.max((now - oldest.at) / 1000, SAMPLE_MS / 1000)
      setRates({
        read: Math.max(0, totals.read - oldest.read) / span,
        write: Math.max(0, totals.write - oldest.write) / span,
      })
    }, SAMPLE_MS)
    return () => clearInterval(timer)
  }, [])
  const active = running || rates.read > 0.5 || rates.write > 0.5
  const generating = isGenerating(running, rates.write)
  const stateKey: LoomKey = !running ? 'tokenECG.idle' : generating ? 'tokenECG.generating' : 'tokenECG.thinking'
  return <div style={card}>
    <div style={top}>
      <span style={dot(active)} aria-hidden />
      <span style={name} title={label}>{label}</span>
      <span style={legend}><span style={legendDot(COLORS.green)} aria-hidden />{t('tokenECG.write')}</span>
      <span style={legend}><span style={legendDot(COLORS.business)} aria-hidden />{t('tokenECG.read')}</span>
      <Tag tone="success">{t('bottom.sessionOwner')}</Tag>
    </div>
    <LoomECG active={active} readRate={rates.read} writeRate={rates.write} />
    <div style={state}>
      <span>{t(stateKey)}</span>
      <span aria-hidden>·</span>
      <span>{t('tokenECG.activityNote')}</span>
    </div>
  </div>
}
