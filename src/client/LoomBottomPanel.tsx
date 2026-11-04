/** Collapsible bottom panel: native Diff, attempt activity and unwired integrations. */
import { useEffect, useState, type ReactNode } from 'react'
import { IconFullscreenOutlineRegular, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { AuditEntry } from 'dsh-workloom/types'
import { LoomDiff, type LoadWorkspaceChanges } from './LoomDiff.tsx'
import { ACTOR_LABEL, AUDIT_LABEL, metaLine } from './shell.ts'
import type { TokenUsageView } from './projection.ts'
import type { LoomKey } from './locales.ts'
import classes from './LoomBottomPanel.module.css'

type Translate = (key: LoomKey) => string

export type LoomBottomPane = 'diff' | 'sessions' | 'runtime' | 'graph' | 'audit' | 'costs'
type Pane = LoomBottomPane

/** Bottom panel inputs; pane content never invents measurements. */
export interface LoomBottomPanelProps {
  readonly t: Translate
  readonly collapsed: boolean
  /** Expanded pane body height in pixels. */
  readonly height: number
  readonly pane: Pane
  readonly audit: readonly AuditEntry[]
  /** Active task/session context for the bottom tabs. */
  readonly sessionsContent?: ReactNode | undefined
  readonly runtimeContent?: ReactNode | undefined
  readonly graphContent?: ReactNode | undefined
  readonly sessionCount?: number | undefined
  readonly runningCount?: number | undefined
  readonly diffCount: number
  readonly usage: TokenUsageView | undefined
  readonly workspaceId: string | undefined
  /** Attempt whose start HEAD is the comparison baseline. */
  readonly attemptId?: string | undefined
  readonly loadChanges: LoadWorkspaceChanges
  /** Reports the changed-file count only when the Diff pane reads its changes. */
  readonly onChangesCount?: (count: number) => void
  /** Whether comparisons wrap wide lines instead of scrolling sideways. */
  readonly wrap: boolean
  readonly onToggleWrap: () => void
  readonly onOpenInRight?: (path: string) => void
  readonly onToggle: () => void
  readonly onPane: (pane: Pane) => void
}

/** Read-only count capsule for a bottom tab; hides itself at zero. */
function CountBadge({ count }: { count: number }): ReactNode {
  return count > 0 ? <Tag tone="info">{String(count)}</Tag> : null
}

const PANES: readonly { id: Pane; key: LoomKey }[] = [
  { id: 'diff', key: 'diff' },
  { id: 'sessions', key: 'bottom.sessions' },
  { id: 'runtime', key: 'bottom.runtime' },
  { id: 'graph', key: 'bottom.graph' },
  { id: 'audit', key: 'bottom.activity' },
  { id: 'costs', key: 'costs' },
]

/**
 * Render the collapsed tab bar and the selected pane.
 * @param props - current pane, task context and native Diff wiring.
 * @returns the bottom region of the Loom page.
 */
export function LoomBottomPanel(props: LoomBottomPanelProps): ReactNode {
  const { t, collapsed, height, pane, audit, sessionsContent, runtimeContent, graphContent, sessionCount, runningCount, diffCount, usage, workspaceId, attemptId, loadChanges, onChangesCount, wrap, onToggleWrap, onOpenInRight, onToggle, onPane } = props
  const [diffFullscreen, setDiffFullscreen] = useState(false)
  // The sessions pane used to force a 420px body while the splitter clamps to
  // the panel maximum, so dragging that tab changed state but nothing moved.
  // Every pane now follows the shared height; the body scrolls when content is
  // taller than the panel.
  const bodyHeight = height
  useEffect(() => { if (pane !== 'diff') setDiffFullscreen(false) }, [pane])
  useEffect(() => {
    if (!diffFullscreen) return
    const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') setDiffFullscreen(false) }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [diffFullscreen])
  const diffBody = <LoomDiff t={t} workspaceId={workspaceId} {...(attemptId === undefined ? {} : { attemptId })} loadChanges={loadChanges} wrap={wrap} onToggleWrap={onToggleWrap} {...onOpenInRight === undefined ? {} : { onOpenInRight }} {...onChangesCount === undefined ? {} : { onChangesCount }} />
  return <section className={classes.panel}>
    <div className={`${classes.tabbar} ${collapsed ? classes.tabbarCollapsed : ''}`}>
      {PANES.map(item => <button key={item.id} type="button" className={`${classes.tab} ${pane === item.id && !collapsed ? classes.tabActive : ''}`} onClick={() => { onPane(item.id); if (collapsed) onToggle() }}>{t(item.key)}{item.id === 'diff' ? <CountBadge count={diffCount} /> : item.id === 'sessions' ? <CountBadge count={sessionCount ?? 0} /> : item.id === 'runtime' ? <CountBadge count={runningCount ?? 0} /> : item.id === 'audit' ? <CountBadge count={audit.length} /> : null}</button>)}
      {!collapsed && pane === 'diff' && <button type="button" className={classes.fullscreenButton} title={t('diff.fullscreen')} aria-label={t('diff.fullscreen')} onClick={() => setDiffFullscreen(true)}><IconFullscreenOutlineRegular size={13} />{t('diff.fullscreen')}</button>}
      <button type="button" onClick={onToggle} className={`${classes.toggleButton} ${!collapsed && pane === 'diff' ? classes.toggleButtonWithFullscreen : ''}`}>{collapsed ? `▴ ${t('bottom.expand')}` : `▾ ${t('bottom.collapse')}`}</button>
    </div>
    {!collapsed && <div className={`${classes.body} ${pane === 'sessions' || pane === 'runtime' || pane === 'graph' ? classes.bodyText : classes.bodyMono}`} style={{ height: bodyHeight }}>
      {pane === 'diff' && diffBody}
      {pane === 'sessions' && sessionsContent}
      {pane === 'runtime' && runtimeContent}
      {pane === 'graph' && graphContent}
      {pane === 'audit' && (audit.length === 0
        ? <p style={{ ...metaLine, margin: 0 }}>{t('bottom.activityEmpty')}</p>
        : audit.map(entry => <div key={entry.id} className={classes.auditRow}>
            <span className={classes.auditTime}>{new Date(entry.at).toLocaleTimeString([], { hour12: false })}</span>
            <span className={classes.auditEvent}>{t(AUDIT_LABEL[entry.event])}</span>
            <span className={classes.auditDetail}>{entry.detail ?? entry.sessionId ?? entry.taskId ?? entry.workspaceId ?? '—'}</span>
            <span className={classes.auditActor}>{t(ACTOR_LABEL[entry.actor])}</span>
          </div>))}
      {pane === 'costs' && (usage === undefined
        ? <p style={{ ...metaLine, margin: 0 }}>{t('ctx.notTracked')}</p>
        : <div className={classes.usage}>
            <span>{t('ctx.usageInput')}: {String(usage.uncachedInputTokens)}</span>
            <span>{t('ctx.usageOutput')}: {String(usage.outputTokens)}</span>
            <span>{t('ctx.usageCached')}: {String(usage.cacheReadTokens + usage.cacheWriteTokens)}</span>
            <span>{t('ctx.usageTotal')}: {String(usage.uncachedInputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens)}</span>
            <span style={metaLine}>{t('ctx.usageNote')}</span>
          </div>)}
    </div>}
    {diffFullscreen && pane === 'diff' && <section aria-label={t('diff.title')} className={classes.fullscreen}>
      <div className={classes.fullscreenHead}>
        <strong className={classes.fullscreenTitle}>{t('diff.title')}</strong>
        <span style={{ ...metaLine, marginLeft: 'auto' }}>{t('diff.files')}</span>
        <button type="button" className={classes.exitButton} title={t('diff.exitFullscreen')} aria-label={t('diff.exitFullscreen')} onClick={() => setDiffFullscreen(false)}><IconFullscreenOutlineRegular size={13} />{t('diff.exitFullscreen')}</button>
      </div>
      <div className={classes.fullscreenBody}>{diffBody}</div>
    </section>}
  </section>
}
