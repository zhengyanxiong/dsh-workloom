/** Choose one ready workspace or create an independent one in the same control. */
import { useState, type CSSProperties } from 'react'
import type { WorkspaceRecord } from 'dsh-workloom/types'
import type { LoomKey } from '../../shared/locales.ts'
import { Button } from '../../ui/primitives.ts'
import { COLORS } from '../../ui/tokens.ts'
import { failureReport, type FailureReport } from '../../ui/failure.ts'
import { LoomSelect } from '../../ui/Select.tsx'
import { LoomSegmented } from '../../ui/Segmented.tsx'

type Translate = (key: LoomKey) => string

/** One workspace row offered by the choice control. */
export interface WorkspaceChoiceOption {
  readonly id: string
  readonly label?: string | undefined
  readonly rootPath?: string | undefined
  readonly path: string
}

/** Input for creating one managed workspace. */
export interface WorkspaceCreationInput {
  readonly parentPath: string
  readonly name: string
  readonly branchPrefix: string
}

/** Result of creating one workspace from the choice control. */
export type WorkspaceCreateOutcome =
  | { readonly ok: true; readonly workspace: WorkspaceRecord }
  | { readonly ok: false; readonly error: FailureReport }

/** Props for the shared choose-or-create workspace control. */
export interface WorkspaceChoiceProps {
  readonly t: Translate
  readonly ariaLabel: string
  readonly workspaces: readonly WorkspaceChoiceOption[]
  readonly value: string | undefined
  readonly onChange: (workspaceId: string) => void
  readonly create?: ((input: WorkspaceCreationInput) => Promise<WorkspaceCreateOutcome>) | undefined
  readonly pickDirectory?: ((startPath?: string) => Promise<string | null>) | undefined
  readonly onCreated?: ((workspace: WorkspaceRecord) => void) | undefined
  readonly defaultName?: string | undefined
  /** Version refs used to create the worktree, shown in create mode. */
  readonly sourceRefs?: readonly { readonly name: string; readonly ref: string }[] | undefined
}

const stack: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 }
const field: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--text-compact-size)', color: 'var(--dsw-alias-label-secondary)' }
const inputStyle: CSSProperties = { flex: 1, minWidth: 0, padding: '6px 8px', borderRadius: 6, border: `0.5px solid ${COLORS.border}`, background: COLORS.panel, color: COLORS.text, font: 'inherit' }
const alert: CSSProperties = { margin: 0, color: COLORS.dim, fontSize: 'var(--text-compact-size)' }
const hint: CSSProperties = { margin: 0, color: COLORS.faint, fontSize: 'var(--text-label-size)', lineHeight: 1.5 }
const createBox: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 2, padding: '10px 12px', border: `0.5px dashed ${COLORS.border}`, borderRadius: 8, background: COLORS.panel2 }
const monoText: CSSProperties = { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'ui-monospace, monospace', fontSize: 'var(--text-small-size)', color: COLORS.text }

/**
 * Render a two-mode workspace picker: reuse an existing workspace or create one.
 * @param props - options, selection, creation callback and locale.
 * @returns the picker.
 */
export function WorkspaceChoice({ t, ariaLabel, workspaces, value, onChange, create, pickDirectory, onCreated, defaultName, sourceRefs }: WorkspaceChoiceProps): JSX.Element {
  const [created, setCreated] = useState<readonly WorkspaceRecord[]>([])
  const options = [...workspaces, ...created.filter(workspace => !workspaces.some(candidate => candidate.id === workspace.id))]
  const [mode, setMode] = useState<'existing' | 'create'>(options.length === 0 && create !== undefined ? 'create' : 'existing')
  const [parentPath, setParentPath] = useState('')
  const [name, setName] = useState(defaultName ?? '')
  const [branchPrefix, setBranchPrefix] = useState('loom')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<FailureReport>()
  const refs = sourceRefs?.map(source => `${source.name}@${source.ref}`).join(t('task.workspaceBaseRefSeparator')) ?? ''
  const createBaseHint = refs === ''
    ? t('task.workspaceBaseHintLock').replace('{prefix}', branchPrefix === '' ? 'loom' : branchPrefix).replace('{name}', name === '' ? '…' : name)
    : t('task.workspaceBaseHint').replace('{refs}', refs).replace('{prefix}', branchPrefix === '' ? 'loom' : branchPrefix).replace('{name}', name === '' ? '…' : name)
  const selected = options.find(workspace => workspace.id === value)
  async function browse(): Promise<void> {
    if (pickDirectory === undefined) return
    try {
      const picked = await pickDirectory(parentPath === '' ? undefined : parentPath)
      if (picked !== null) setParentPath(picked)
    } catch { /* the text field stays editable when the picker is unavailable */ }
  }
  async function submit(): Promise<void> {
    if (create === undefined) return
    setBusy(true); setFailure(undefined)
    try {
      const outcome = await create({ parentPath, name, branchPrefix })
      if (!outcome.ok) { setFailure(outcome.error); return }
      setCreated(current => [...current, outcome.workspace])
      onCreated?.(outcome.workspace)
      onChange(outcome.workspace.id)
      setMode('existing')
    } catch (error) {
      setFailure(failureReport('unknown', error instanceof Error ? error.message : String(error)))
    } finally { setBusy(false) }
  }
  if (options.length === 0 && create === undefined) return <p style={alert}>{t('task.workspaceRequired')}</p>
  return <div style={stack}>
    {create !== undefined && options.length > 0 && <LoomSegmented
      ariaLabel={ariaLabel}
      value={mode}
      options={[{ value: 'existing', label: t('task.workspaceChoiceExisting') }, { value: 'create', label: t('task.workspaceChoiceCreate') }]}
      onChange={next => setMode(next === 'create' ? 'create' : 'existing')}
      variant="choice"
    />}
    {mode === 'existing'
      ? options.length === 0
        ? <p style={alert}>{t('task.workspaceRequired')}</p>
        : options.length === 1
          ? <span style={monoText}>{selected?.rootPath ?? selected?.path}</span>
          : <LoomSelect
              block
              ariaLabel={ariaLabel}
              value={value ?? ''}
              options={options.map(workspace => ({ value: workspace.id, label: workspace.label ?? workspace.rootPath ?? workspace.path }))}
              onChange={onChange}
            />
      : <div style={createBox}>
          {options.length === 0 && <p role="alert" style={alert}>{t('task.workspaceRequired')}</p>}
          <p style={hint}>{t('task.workspaceCreateHint')}</p>
          <p style={hint}>{createBaseHint}</p>
          <label style={field}><span>{t('task.workspaceParent')}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <input aria-label={t('task.workspaceParent')} value={parentPath} placeholder="/home/me/work" onChange={event => setParentPath(event.target.value)} style={inputStyle} />
              {pickDirectory !== undefined && <Button type="button" size="sm" variant="outline" onClick={() => { void browse() }}>{t('workspace.browse')}</Button>}
            </div>
          </label>
          <label style={field}><span>{t('task.workspaceName')}</span>
            <input aria-label={t('task.workspaceName')} value={name} onChange={event => setName(event.target.value)} style={inputStyle} />
          </label>
          <label style={field}><span>{t('task.workspaceBranchPrefix')}</span>
            <input aria-label={t('task.workspaceBranchPrefix')} value={branchPrefix} onChange={event => setBranchPrefix(event.target.value)} style={inputStyle} />
          </label>
          {failure !== undefined && <p role="alert" style={alert}>{t(failure.message)}{failure.detail === undefined ? '' : ` · ${failure.detail}`}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <Button type="button" variant="primary" disabled={busy || parentPath.trim() === '' || name.trim() === ''} onClick={() => { void submit() }}>
              {busy ? t('task.workspaceCreating') : t('task.workspaceCreateSubmit')}
            </Button>
            {options.length > 0 && <Button type="button" variant="ghost" disabled={busy} onClick={() => setMode('existing')}>{t('form.cancel')}</Button>}
          </div>
        </div>}
  </div>
}
