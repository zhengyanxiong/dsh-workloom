/** Per-repository workspace preparation progress with a failure-only retry. */
import { type CSSProperties, type ReactNode } from 'react'
import { Button, Tag } from '../../ui/primitives.ts'
import type { WorkspacePreparation } from 'dsh-workloom/types'
import { COLORS } from '../../ui/tokens.ts'
import { metaLine } from '../../ui/styles.ts'
import type { LoomKey } from '../../shared/locales.ts'

type Translate = (key: LoomKey) => string

/** Inputs for the preparation progress list. */
export interface LoomPreparationPanelProps {
  readonly t: Translate
  /** Latest persisted preparation record, absent when the Host has not published one yet. */
  readonly preparation: WorkspacePreparation | undefined
  readonly busy: boolean
  /** Retry only the repositories that are not done; the Host keeps completed ones. */
  readonly onRetry: () => void
}

const box: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, padding: '11px 12px', border: `0.5px solid ${COLORS.border}`, borderRadius: 8, background: COLORS.panel2 }
const head: CSSProperties = { display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', minWidth: 0 }
const title: CSSProperties = { margin: 0, fontSize: 'var(--text-small-size)', fontWeight: 500, color: COLORS.text }
const progress: CSSProperties = { marginLeft: 'auto', color: COLORS.faint, fontSize: 'var(--text-label-size)', fontFamily: 'ui-monospace, monospace' }
const hint: CSSProperties = { margin: 0, color: COLORS.faint, fontSize: 'var(--text-label-size)', lineHeight: 1.55 }
const list: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5, margin: 0, padding: 0, listStyle: 'none' }
const row: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, padding: '7px 9px', borderRadius: 6, background: COLORS.panel, border: `0.5px solid ${COLORS.border}` }
const rowHead: CSSProperties = { display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', minWidth: 0 }
const repo: CSSProperties = { minWidth: 0, overflowWrap: 'anywhere', fontFamily: 'ui-monospace, monospace', fontSize: 'var(--text-small-size)' }
const pathText: CSSProperties = { margin: 0, minWidth: 0, overflowWrap: 'anywhere', color: COLORS.dim, fontFamily: 'ui-monospace, monospace', fontSize: 'var(--text-label-size)', lineHeight: 1.5 }
const diagnostic: CSSProperties = { margin: 0, minWidth: 0, overflowWrap: 'anywhere', color: COLORS.error, fontFamily: 'ui-monospace, monospace', fontSize: 'var(--text-label-size)', lineHeight: 1.5 }
const rollback: CSSProperties = { margin: 0, minWidth: 0, overflowWrap: 'anywhere', color: COLORS.warn, fontFamily: 'ui-monospace, monospace', fontSize: 'var(--text-label-size)', lineHeight: 1.5 }
const failedNotice: CSSProperties = { margin: 0, color: COLORS.warn, fontSize: 'var(--text-small-size)', lineHeight: 1.6 }

const STATUS_KEY = {
  pending: 'prepare.repoStatus.waiting',
  waiting: 'prepare.repoStatus.waiting',
  preparing: 'prepare.repoStatus.preparing',
  done: 'prepare.repoStatus.done',
  failed: 'prepare.repoStatus.failed',
} as const

/**
 * Render every repository's real preparation step so a partial failure names the
 * repository, its path, the Git/filesystem diagnostic and what was rolled back.
 * @param props - latest preparation record and the retry command.
 * @returns the progress list, or the explicit "no progress yet" state.
 */
export function LoomPreparationPanel({ t, preparation, busy, onRetry }: LoomPreparationPanelProps): ReactNode {
  if (preparation === undefined) {
    return <div style={box}>
      <p style={hint} role="status">{t('prepare.progressUnknown')}</p>
    </div>
  }
  const done = preparation.repositories.filter(entry => entry.status === 'done').length
  const failed = preparation.repositories.filter(entry => entry.status === 'failed')
  const aggregateKey: LoomKey = preparation.status === 'ready'
    ? 'prepare.ready'
    : preparation.status === 'failed'
      ? 'prepare.failedSummary'
      : preparation.status === 'preparing'
        ? 'prepare.pending'
        : 'prepare.waitingHost'
  return <div style={box} role="status" aria-busy={busy}>
    <div style={head}>
      <h5 style={title}>{t('prepare.progressTitle')}</h5>
      <span style={progress}>{String(done)}/{String(preparation.repositories.length)}</span>
    </div>
    <p style={aggregateKey === 'prepare.failedSummary' ? failedNotice : hint}>
      {aggregateKey === 'prepare.pending'
        ? t('prepare.pending').replace('{count}', String(preparation.repositories.length))
        : aggregateKey === 'prepare.failedSummary' ? t('prepare.failedSummary').replace('{count}', String(failed.length)) : t(aggregateKey)}
    </p>
    <ul style={list}>
      {preparation.repositories.map(entry => <li key={entry.sourceId} style={row}>
        <span style={rowHead}>
          <span style={repo}>{entry.sourceId}</span>
          <Tag tone={entry.status === 'done' ? 'success' : entry.status === 'failed' ? 'danger' : entry.status === 'preparing' ? 'info' : 'neutral'}>{t(STATUS_KEY[entry.status])}</Tag>
        </span>
        {entry.path !== undefined && <p style={pathText}>{entry.path}</p>}
        {entry.error !== undefined && <p style={diagnostic}>{t('prepare.diagnostic')}: {entry.error}</p>}
        {entry.rollback !== undefined && <p style={rollback}>{t('prepare.rollback')}: {entry.rollback}</p>}
      </li>)}
    </ul>
    {failed.length > 0 && <div>
      <Button variant="outline" disabled={busy} onClick={onRetry}>{busy ? t('prepare.retrying') : t('prepare.retryFailed')}</Button>
    </div>}
    <p style={{ ...hint, ...metaLine }}>{t('prepare.hint')}</p>
  </div>
}
