/** Acceptance decision area: Agent evidence, real tests, Diff baseline and the human confirmation. */
import { useState, type CSSProperties, type ReactNode } from 'react'
import { Button, IconBranchOutlineRegular, IconCheckOutlineRegular, IconWarningTriangleOutlineRegular, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { CatalogSnapshot, TaskOutcome, TaskRecord, TransitionTaskRequest } from 'dsh-workloom/types'
import { LoomDiff, type LoadWorkspaceChanges } from './LoomDiff.tsx'
import { COLORS, failureReport, formatTimestamp, metaLine, thrownFailureReport, type FailureReport } from './shell.ts'
import type { LoomKey } from './locales.ts'

type Translate = (key: LoomKey) => string

/** Wire transition the decision panel owns; the wider execution panel does not duplicate it. */
export interface LoomOutcomeActions {
  transitionTask(request: TransitionTaskRequest): Promise<RemoteResult<TaskRecord>>
  onChanged(): void
}

/** Inputs for the task acceptance decision area. */
export interface LoomOutcomePanelProps {
  readonly t: Translate
  readonly task: TaskRecord
  readonly snapshot: CatalogSnapshot
  readonly actions: LoomOutcomeActions
  readonly loadChanges: LoadWorkspaceChanges
  /** Whether comparisons wrap wide lines instead of scrolling sideways. */
  readonly wrap: boolean
  readonly onToggleWrap: () => void
  /** Render without the outer card chrome and duplicate heading (page owns the stage title). */
  readonly embedded?: boolean
}

type DecisionTarget = TransitionTaskRequest['target']

const card: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0, padding: '16px 18px', background: COLORS.panel, border: `0.5px solid ${COLORS.border}`, borderRadius: 10 }
const embeddedCard: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }
const heading: CSSProperties = { display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', margin: 0, color: COLORS.text, fontSize: 'var(--text-compact-size)', fontWeight: 500, lineHeight: 1.4 }
const headingSpacer: CSSProperties = { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }
const notice: CSSProperties = { margin: 0, padding: '8px 10px', borderRadius: 7, color: COLORS.dim, background: COLORS.panel2, border: `0.5px solid ${COLORS.border}`, fontSize: 'var(--text-small-size)', lineHeight: 1.6 }
const suggestionNotice: CSSProperties = { ...notice, borderColor: COLORS.warn, color: COLORS.text }
const summary: CSSProperties = { margin: 0, color: COLORS.dim, fontSize: 'var(--text-compact-size)', lineHeight: 1.65, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }
const metaGrid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px 14px', minWidth: 0 }
const field: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }
const fieldLabel: CSSProperties = { ...metaLine, fontFamily: 'ui-monospace, monospace', fontSize: 'var(--text-nano-size)', letterSpacing: '.08em', textTransform: 'uppercase' }
const fieldValue: CSSProperties = { minWidth: 0, overflowWrap: 'anywhere', color: COLORS.text, fontSize: 'var(--text-small-size)', lineHeight: 1.5 }
const monoValue: CSSProperties = { ...fieldValue, fontFamily: 'ui-monospace, monospace', fontSize: 'var(--text-label-size)' }
const list: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3, margin: 0, padding: 0, listStyle: 'none' }
const listItem: CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 6, minWidth: 0, color: COLORS.dim, fontSize: 'var(--text-small-size)', lineHeight: 1.55 }
const listMark: CSSProperties = { flex: 'none', color: COLORS.faint, fontFamily: 'ui-monospace, monospace', fontSize: 'var(--text-label-size)', lineHeight: '17px' }
const muted: CSSProperties = { margin: 0, color: COLORS.faint, fontSize: 'var(--text-small-size)', lineHeight: 1.6 }
const tests: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, margin: 0, padding: 0, listStyle: 'none' }
const testRow: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, padding: '7px 9px', borderRadius: 6, background: COLORS.panel2, border: `0.5px solid ${COLORS.border}` }
const testHead: CSSProperties = { display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', minWidth: 0 }
const testName: CSSProperties = { minWidth: 0, overflowWrap: 'anywhere', color: COLORS.text, fontSize: 'var(--text-small-size)', fontWeight: 500 }
const testDetail: CSSProperties = { margin: 0, color: COLORS.faint, fontSize: 'var(--text-label-size)', lineHeight: 1.5, fontFamily: 'ui-monospace, monospace', overflowWrap: 'anywhere' }
const diffBox: CSSProperties = { display: 'flex', flexDirection: 'column', minHeight: 0, height: 360, marginTop: 2, border: `0.5px solid ${COLORS.border}`, borderRadius: 8, overflow: 'hidden', background: COLORS.panel2 }
const decision: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 10, borderTop: `0.5px solid ${COLORS.border}` }
const textarea: CSSProperties = { width: '100%', minHeight: 62, resize: 'vertical', boxSizing: 'border-box', background: COLORS.panel2, color: COLORS.text, border: `0.5px solid ${COLORS.border}`, borderRadius: 6, padding: '7px 9px', font: 'inherit', fontSize: 'var(--text-compact-size)', lineHeight: 1.5 }
const actionRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }
const danger: CSSProperties = { color: COLORS.error, borderColor: COLORS.error }
const success: CSSProperties = { margin: 0, color: COLORS.green, fontSize: 'var(--text-small-size)', lineHeight: 1.6 }
const alert: CSSProperties = { margin: 0, color: COLORS.error, fontSize: 'var(--text-small-size)', lineHeight: 1.6 }
const pill: CSSProperties = { display: 'inline-flex', alignItems: 'center', height: 19, padding: '0 7px', borderRadius: 5, border: `0.5px solid ${COLORS.border}`, color: COLORS.dim, fontSize: 'var(--text-label-size)', whiteSpace: 'nowrap' }

const OUTCOME_STATE_KEY: Readonly<Record<TaskOutcome['state'], LoomKey>> = {
  suggested: 'outcome.state.suggested',
  accepted: 'outcome.state.accepted',
  rejected: 'outcome.state.rejected',
}
const TEST_STATUS_KEY = { passed: 'outcome.test.passed', failed: 'outcome.test.failed', skipped: 'outcome.test.skipped' } as const

function EvidenceList({ label, items }: { label: string; items: readonly string[] | undefined }): ReactNode {
  if (items === undefined || items.length === 0) return null
  return <div style={field}>
    <span style={fieldLabel}>{label}</span>
    <ul style={list}>{items.map((item, index) => <li key={`${String(index)}:${item}`} style={listItem}>
      <span aria-hidden style={listMark}>{String(index + 1).padStart(2, '0')}</span>
      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{item}</span>
    </li>)}</ul>
  </div>
}

/**
 * Render the single place where a human accepts or rejects a round, with all evidence
 * (Agent summary, real test results, Diff baseline) visible before the decision.
 * Agent suggestions stay advisory here and are never auto-confirmed.
 * @param props - selected task, catalog snapshot, transition wire and Diff reader.
 * @returns the acceptance decision card.
 */
export function LoomOutcomePanel({ t, task, snapshot, actions, loadChanges, wrap, onToggleWrap, embedded = false }: LoomOutcomePanelProps): ReactNode {
  const [basis, setBasis] = useState('')
  const [basisMissing, setBasisMissing] = useState(false)
  const [showDiff, setShowDiff] = useState(false)
  const [pending, setPending] = useState<DecisionTarget>()
  const [failure, setFailure] = useState<{ readonly operation: string; readonly report: FailureReport }>()
  const [confirmed, setConfirmed] = useState<{ readonly state: TaskOutcome['state']; readonly at: string | undefined; readonly basis: string | undefined }>()
  const outcome = task.outcome
  const attempt = task.attempts.at(-1)
  const workspace = attempt === undefined ? undefined : snapshot.workspaces.find(candidate => candidate.id === attempt.workspaceId)
  const lock = attempt?.lock
  const state = confirmed?.state ?? outcome?.state
  const final = task.status === 'completed' || task.status === 'failed'
  const canDecide = !final && task.status === 'review'
  if (outcome === undefined && (task.status === 'pending' || task.status === 'failed')) return null
  const canRequestReview = task.status === 'running'
  const canRejectFromRunning = task.status === 'running'

  async function decide(target: DecisionTarget, requiresBasis: boolean): Promise<void> {
    const trimmed = basis.trim()
    if (requiresBasis && trimmed === '') { setBasisMissing(true); return }
    setBasisMissing(false)
    setFailure(undefined)
    setPending(target)
    try {
      const result = await actions.transitionTask({ taskId: task.id, target, actor: 'human', ...(trimmed === '' ? {} : { basis: trimmed }) })
      if (!result.ok) {
        setFailure({ operation: t('op.decide'), report: failureReport(result.error.code, result.error.message) })
        return
      }
      const next = result.value.outcome
      if (next !== undefined) setConfirmed({ state: next.state, at: next.confirmedAt ?? formatTimestamp(next.at), basis: next.confirmationBasis })
      setBasis('')
      actions.onChanged()
    } catch (error) {
      setFailure({ operation: t('op.decide'), report: thrownFailureReport(error) })
    } finally {
      setPending(undefined)
    }
  }

  const badges = <>
    {state !== undefined && <Tag tone={state === 'accepted' ? 'success' : state === 'rejected' ? 'danger' : 'info'}>{t(OUTCOME_STATE_KEY[state])}</Tag>}
    {outcome?.testResults === undefined && <span style={pill}>{t('outcome.noTestsBadge')}</span>}
  </>
  return <section style={embedded ? embeddedCard : card} aria-label={t('outcome.title')}>
    {embedded
      ? <div style={headingSpacer}>{badges}</div>
      : <h4 style={heading}>
        <IconCheckOutlineRegular size={12} />
        {t('outcome.title')}
        <span style={headingSpacer}>{badges}</span>
      </h4>}

    {outcome === undefined
      ? <p style={notice}>{t('outcome.noOutcome')}</p>
      : <>
        {outcome.state === 'suggested' && <p style={suggestionNotice}>
          <strong>{t('outcome.referenceOnly')}</strong> {t('outcome.suggestionPending')}
        </p>}
        <div style={metaGrid}>
          <div style={field}><span style={fieldLabel}>{t('outcome.author')}</span><span style={fieldValue}>{outcome.suggestedBy ?? '—'}</span></div>
          {outcome.suggestedStatus !== undefined && <div style={field}><span style={fieldLabel}>{t('outcome.suggestedTarget')}</span><span style={fieldValue}>{t(outcome.suggestedStatus === 'review' ? 'outcome.target.review' : 'outcome.target.failed')}</span></div>}
          <div style={field}><span style={fieldLabel}>{t('outcome.suggestedAt')}</span><span style={monoValue}>{formatTimestamp(outcome.at) ?? '—'}</span></div>
          {outcome.confirmedAt !== undefined && <div style={field}><span style={fieldLabel}>{t('outcome.confirmedAt')}</span><span style={monoValue}>{formatTimestamp(outcome.confirmedAt) ?? outcome.confirmedAt}</span></div>}
          {outcome.confirmedBy !== undefined && <div style={field}><span style={fieldLabel}>{t('outcome.confirmedBy')}</span><span style={fieldValue}>{outcome.confirmedBy === 'human' ? t('outcome.actor.human') : outcome.confirmedBy}</span></div>}
          {outcome.basis !== undefined && <div style={field}><span style={fieldLabel}>{t('outcome.basis')}</span><span style={fieldValue}>{outcome.basis}</span></div>}
          {outcome.confirmationBasis !== undefined && <div style={field}><span style={fieldLabel}>{t('outcome.confirmationBasis')}</span><span style={fieldValue}>{outcome.confirmationBasis}</span></div>}
        </div>
        <div style={field}><span style={fieldLabel}>{t('outcome.agentSummary')}</span><p style={summary}>{outcome.agentSummary === undefined || outcome.agentSummary.trim() === '' ? t('outcome.noSummaryText') : outcome.agentSummary}</p></div>
        <EvidenceList label={t('outcome.completed')} items={outcome.completed} />
        <EvidenceList label={t('outcome.notDone')} items={outcome.notDone} />
        <EvidenceList label={t('outcome.risks')} items={outcome.risks} />
        <EvidenceList label={t('outcome.impact')} items={outcome.impact} />
      </>}

    <div style={field}>
      <span style={fieldLabel}>{t('outcome.tests')}</span>
      {outcome?.testResults === undefined || outcome.testResults.length === 0
        ? <><p style={notice}>{t('outcome.testsNone')}</p><p style={muted}>{t('outcome.testsNoneHint')}</p></>
        : <ul style={tests}>{outcome.testResults.map((result, index) => <li key={`${String(index)}:${result.name}`} style={testRow}>
          <span style={testHead}>
            <span style={testName}>{result.name}</span>
            <Tag tone={result.status === 'passed' ? 'success' : result.status === 'failed' ? 'danger' : 'info'}>{t(TEST_STATUS_KEY[result.status])}</Tag>
          </span>
          {result.command !== undefined && <p style={testDetail}>{result.command}</p>}
          {result.detail !== undefined && <p style={testDetail}>{result.detail}</p>}
        </li>)}</ul>}
    </div>

    <div style={field}>
      <span style={fieldLabel}>{t('outcome.baseline')}</span>
      {lock === undefined
        ? <p style={muted}>{t('outcome.baselineNone')}</p>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <span style={monoValue}>{lock.id}{lock.createdAt === undefined ? '' : ` · ${formatTimestamp(lock.createdAt) ?? lock.createdAt}`}</span>
          {lock.repositories.map(repository => <span key={repository.sourceId} style={monoValue}>{repository.sourceId} @ {repository.commit.slice(0, 7)}</span>)}
        </div>}
    </div>

    <div style={field}>
      <span style={fieldLabel}>{t('outcome.diff')}</span>
      {workspace === undefined
        ? <p style={notice}>{t('outcome.diffMissing')}</p>
        : <>
          <div style={actionRow}>
            <Button size="sm" variant="outline" icon={<IconBranchOutlineRegular />} onClick={() => setShowDiff(value => !value)}>{showDiff ? t('outcome.diffHide') : t('outcome.diffOpen')}</Button>
            <span style={{ ...muted, fontFamily: 'ui-monospace, monospace', fontSize: 'var(--text-label-size)', minWidth: 0, overflowWrap: 'anywhere' }}>{workspace.path}</span>
          </div>
          {showDiff && <div style={diffBox}><LoomDiff t={t} workspaceId={workspace.id} {...attempt === undefined ? {} : { attemptId: attempt.id }} loadChanges={loadChanges} wrap={wrap} onToggleWrap={onToggleWrap} /></div>}
        </>}
    </div>

    <div style={decision}>
      <span style={fieldLabel}>{t('outcome.decision')}</span>
      {final
        ? state !== undefined
          ? <p style={success}>{t(state === 'accepted' ? 'outcome.submittedAccepted' : 'outcome.submittedRejected')}</p>
          : <p style={muted}>{t('outcome.noOutcome')}</p>
        : <>
          <p style={muted}>{t('outcome.decisionHint')}</p>
          <label style={field}>
            <span style={{ ...muted, fontSize: 'var(--text-small-size)' }}>{t('outcome.confirmationBasis')}</span>
            <textarea aria-label={t('outcome.confirmationBasis')} placeholder={t('outcome.basisPlaceholder')} value={basis} onChange={(event) => { setBasis(event.target.value); setBasisMissing(false) }} style={textarea} />
          </label>
          {basisMissing && <p role="alert" style={alert}><IconWarningTriangleOutlineRegular size={12} /> {t('outcome.basisRequired')}</p>}
          <div style={actionRow}>
            {canRequestReview && <Button size="sm" variant="outline" disabled={pending !== undefined} onClick={() => { void decide('review', false) }}>{pending === 'review' ? t('outcome.submitting') : t('task.review')}</Button>}
            {canDecide && <Button size="sm" variant="primary" className="loom-primary" disabled={pending !== undefined} onClick={() => { void decide('completed', true) }}>{pending === 'completed' ? t('outcome.submitting') : t('outcome.accept')}</Button>}
            {(canDecide || canRejectFromRunning) && <Button size="sm" variant="outline" style={danger} disabled={pending !== undefined} onClick={() => { void decide('failed', true) }}>{pending === 'failed' ? t('outcome.submitting') : t('outcome.reject')}</Button>}
            {canDecide && <Button size="sm" variant="ghost" disabled={pending !== undefined} onClick={() => { void decide('running', false) }}>{t('task.continue')}</Button>}
          </div>
          {failure !== undefined && <p role="alert" style={alert}>{failure.operation} · {t(failure.report.message)}{failure.report.detail === undefined ? '' : ` · ${failure.report.detail}`}</p>}
          {confirmed !== undefined && <p role="status" style={success}>{t(confirmed.state === 'accepted' ? 'outcome.submittedAccepted' : 'outcome.submittedRejected')}</p>}
        </>}
      {state === 'suggested' && <p style={muted}>{t('outcome.suggestionPending')}</p>}
    </div>
  </section>
}
