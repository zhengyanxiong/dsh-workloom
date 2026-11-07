import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Button, IconDownloadOutlineRegular } from '../../ui/primitives.ts'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { ProjectConfig, ProjectRecord } from 'dsh-workloom/types'
import { parseProject, ProjectError } from '../../../domain/project.ts'
import { COLORS } from '../../shell.ts'
import { alert, field, fieldLabel, footer, footerSpacer, formStyle, input } from '../forms/styles.ts'
import { FailureNotice } from '../forms/FailureNotice.tsx'
import { Translate } from '../forms/types.ts'

export type ImportProjectResult =
  | { readonly ok: true; readonly config: ProjectConfig }
  | { readonly ok: false; readonly reason: 'json' | 'invalid'; readonly field?: string }

/**
 * Parse an imported JSON document through the same admission rules as manual creation.
 * @param text - File contents; no repository is fetched and no script runs.
 * @returns normalized project configuration or a JSON/field rejection.
 */
export function parseImport(text: string): ImportProjectResult {
  let value: unknown
  try { value = JSON.parse(text) } catch { return { ok: false, reason: 'json' } }
  try { return { ok: true, config: parseProject(value) } }
  catch (error) {
    if (error instanceof ProjectError) return { ok: false, reason: 'invalid', field: error.field }
    throw error
  }
}

interface ImportProjectFormProps {
  t: Translate
  create(request: ProjectConfig): Promise<RemoteResult<ProjectRecord>>
  onCreated(project: ProjectRecord): void
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onBusyChange?: (busy: boolean) => void
}

/** Validate a JSON project file, preview repositories and modules, then save it explicitly. */
export function ImportProjectForm({ t, create, onCreated, open: controlledOpen, onOpenChange, onBusyChange }: ImportProjectFormProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = (value: boolean): void => { setInternalOpen(value); onOpenChange?.(value) }
  const [fileName, setFileName] = useState('')
  const [result, setResult] = useState<ImportProjectResult>()
  const [busy, setBusy] = useState(false)
  const reportBusy = (value: boolean): void => { setBusy(value); onBusyChange?.(value) }
  const [failed, setFailed] = useState(false)
  if (!open) return <Button variant="outline" icon={<IconDownloadOutlineRegular />} onClick={() => setOpen(true)}>{t('project.import')}</Button>
  async function choose(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    if (file === undefined) return
    setFileName(file.name); setFailed(false)
    setResult(parseImport(await file.text()))
  }
  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (result?.ok !== true) { setFailed(true); return }
    reportBusy(true); setFailed(false)
    try {
      const created = await create(result.config)
      if (!created.ok) { setFailed(true); return }
      reportBusy(false); setResult(undefined); setFileName(''); setOpen(false); onCreated(created.value)
    } catch { setFailed(true); reportBusy(false) }
  }
  return <form style={formStyle} onSubmit={event => { void submit(event) }}>
    <label style={field}><span style={fieldLabel}>{t('project.importFile')}</span>
      <input aria-label={t('project.importFile')} type="file" accept=".json,application/json" onChange={event => { void choose(event) }} style={{ ...input, height: 'auto', padding: '7px 10px' }} />
    </label>
    {fileName !== '' && <p style={alert}>{fileName}</p>}
    {result?.ok === false && <p role="alert" style={alert}>{result.reason === 'json' ? t('project.importJsonInvalid') : `${t('project.importInvalid')}${result.field === undefined ? '' : ` (${result.field})`}`}</p>}
    {result?.ok === true && <>
      <p style={fieldLabel}>{t('project.importHint')}</p>
      <div style={field}><span style={fieldLabel}>{t('project.name')}</span><span>{result.config.name}</span></div>
      <div style={field}><span style={fieldLabel}>{t('project.importSources')}</span>
        {result.config.sources.map(source => <div key={source.id} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 'var(--text-compact-size)' }}>
          <span style={{ color: COLORS.cyan }}>{source.id}</span><span>{source.repo}</span><span style={{ color: COLORS.dim }}>→ {source.path}</span>
        </div>)}
      </div>
      <div style={field}><span style={fieldLabel}>{t('project.importModules')}</span>
        {result.config.modules.length === 0 && <span style={alert}>{t('module.optional')}</span>}
        {result.config.modules.map(module => <div key={module.id} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 'var(--text-compact-size)' }}>
          <span style={{ color: COLORS.cyan }}>{module.id}</span><span>{module.sourceId} / {module.path}</span>
        </div>)}
      </div>
    </>}
    {failed && <FailureNotice failure={t('state.error')} t={t} />}
    <div style={footer}>
      <Button type="button" variant="ghost" disabled={busy} onClick={() => { setOpen(false); setResult(undefined); setFileName(''); setFailed(false) }}>{t('form.cancel')}</Button>
      <span style={footerSpacer} />
      <Button type="submit" variant="primary" className="loom-primary" disabled={busy || result?.ok !== true}>{busy ? t('form.submitPending') : t('project.importConfirm')}</Button>
    </div>
  </form>
}

