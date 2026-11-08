/** Modal confirmation before archiving a Session that is still running. */
import { Button, IconWarningTriangleOutlineRegular, Modal } from '../../ui/primitives.ts'
import { COLORS } from '../../ui/tokens.ts'
import type { FailureReport } from '../../ui/failure.ts'
import type { LoomKey } from '../../shared/locales.ts'

type Translate = (key: LoomKey) => string

const dangerAction = { color: COLORS.error, borderColor: COLORS.error } as const
const body = { display: 'flex', alignItems: 'flex-start', gap: 10 } as const
const subjectLine = { margin: 0, color: COLORS.text, fontSize: 'var(--text-body-size)', lineHeight: 1.5, fontWeight: 500, overflowWrap: 'anywhere' } as const
const warning = { margin: '8px 0 0', color: COLORS.dim, fontSize: 'var(--text-compact-size)', lineHeight: 1.65 } as const
const alertBox = { marginTop: 12, padding: '9px 10px', border: `0.5px solid ${COLORS.error}`, borderRadius: 'var(--dsw-radius-sm)', background: 'var(--dsw-alias-interactive-bg-hover-danger)' } as const
const failureText = { margin: 0, color: COLORS.error, fontSize: 'var(--text-compact-size)', lineHeight: 1.6 } as const
const failureDetail = { display: 'block', marginTop: 6, color: COLORS.dim, fontSize: 'var(--text-small-size)', lineHeight: 1.5, fontFamily: 'ui-monospace, monospace', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } as const

/** Inputs for the running-Session archive confirmation modal. */
export interface LoomArchiveDialogProps {
  readonly t: Translate
  /** Session label while the confirmation is pending; absent hides the modal. */
  readonly subject: string | undefined
  readonly busy: boolean
  readonly failure: FailureReport | undefined
  readonly onCancel: () => void
  readonly onConfirm: () => void
}

/**
 * Confirm archiving a running Session and keep the native failure visible.
 * @param props - session label, request progress and localized helpers.
 * @returns the modal while a running Session archive is pending.
 */
export function LoomArchiveDialog({ t, subject, busy, failure, onCancel, onConfirm }: LoomArchiveDialogProps) {
  if (subject === undefined) return null
  return <Modal
    open
    title={t('session.archiveConfirmTitle')}
    closeLabel={t('form.close')}
    className="loom-modal-delete"
    onClose={() => { if (!busy) onCancel() }}
    footer={<>
      <Button variant="ghost" disabled={busy} data-modal-autofocus onClick={onCancel}>{t('form.cancel')}</Button>
      <Button variant="outline" disabled={busy} style={dangerAction} onClick={onConfirm}>{busy ? t('session.archiveConfirmBusy') : t('session.archiveConfirmAction')}</Button>
    </>}
  >
    <div style={body}>
      <span style={{ flex: 'none', marginTop: 1, color: COLORS.warn }}><IconWarningTriangleOutlineRegular size={16} /></span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={subjectLine}>{subject}</p>
        <p style={warning}>{t('session.archiveConfirmBody')}</p>
        {failure !== undefined && <div role="alert" style={alertBox}>
          <p style={failureText}>{t(failure.message)}</p>
          {failure.detail !== undefined && <code style={failureDetail}>{failure.detail}</code>}
        </div>}
      </div>
    </div>
  </Modal>
}
