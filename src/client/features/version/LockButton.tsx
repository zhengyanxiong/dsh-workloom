import { useState } from 'react'
import { Button } from '../../ui/primitives.ts'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { GenerateLockRequest, Lock, VersionRecord } from 'dsh-workloom/types'
import { COLORS } from '../../shell.ts'
import { FailureNotice } from '../forms/FailureNotice.tsx'
import { Translate } from '../forms/types.ts'

interface LockButtonProps {
  t: Translate
  version: VersionRecord
  generate(request: GenerateLockRequest): Promise<RemoteResult<Lock>>
  onCreated(): void
  existing?: boolean
  disabled?: boolean
  /** Keep the existing-Lock explanation under the action; callers with their own one-line note disable it. */
  hint?: boolean
  /** Fixed action size; defaults to compact for an existing Lock and regular for the first one. */
  size?: 'sm' | 'md'
}

/** Pin every repository ref of the selected version into a new immutable Lock. */
export function LockButton({ t, version, generate, onCreated, existing = false, disabled = false, hint = true, size }: LockButtonProps) {
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string>()
  async function run(): Promise<void> {
    setBusy(true); setFailure(undefined)
    try {
      const result = await generate({ versionId: version.id })
      if (!result.ok) { setFailure(result.error.message); return }
      onCreated()
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error))
    } finally { setBusy(false) }
  }
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: size === 'md' ? 0 : 6 }}>
    <Button size={size ?? (existing ? 'sm' : 'md')} variant={existing ? 'outline' : 'primary'} className={existing ? undefined : 'loom-primary'} disabled={busy || disabled} onClick={() => { void run() }}>
      {busy ? t('lock.resolving') : existing ? t('lock.regenerate') : t('lock.new')}
    </Button>
    {existing && hint && <p style={{ margin: 0, color: COLORS.faint, fontSize: 'var(--text-label-size)', lineHeight: 1.5 }}>{t('lock.regenerateHint')}</p>}
    {disabled && <p style={{ margin: 0, color: COLORS.faint, fontSize: 'var(--text-label-size)', lineHeight: 1.5 }}>{t('lock.disabledRunning')}</p>}
    {failure !== undefined && <FailureNotice failure={failure} t={t} />}
  </div>
}
