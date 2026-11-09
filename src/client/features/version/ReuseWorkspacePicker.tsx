/** Pick a finished direct workspace to bind to the version being edited. */
import type { JSX } from 'react'
import { LoomSelect } from '../../ui/Select.tsx'
import type { LoomKey } from '../../shared/locales.ts'
import { branchError, card, field, fieldLabel, hint } from '../forms/styles.ts'

type Translate = (key: LoomKey) => string

/** One reusable workspace offered in the picker. */
export interface ReuseWorkspaceOption {
  readonly id: string
  readonly label: string
  readonly detail: string
  /** Repository ids the workspace maps; absent means unknown, so it is offered. */
  readonly sourceIds?: readonly string[] | undefined
}

/** Inputs for the reuse picker. */
export interface ReuseWorkspacePickerProps {
  readonly t: Translate
  readonly options: readonly ReuseWorkspaceOption[]
  readonly value: string
  readonly onChange: (workspaceId: string) => void
  readonly failure?: string | undefined
}

/**
 * Render the reuse target picker and its safety note.
 * @param props - locale copy, candidate workspaces and the selected identity.
 * @returns the picker card.
 */
export function ReuseWorkspacePicker({ t, options, value, onChange, failure }: ReuseWorkspacePickerProps): JSX.Element {
  return <div style={card}>
    <label style={field}>
      <span style={fieldLabel}>{t('version.workspaceReusePick')}</span>
      <LoomSelect
        block
        ariaLabel={t('version.workspaceReusePick')}
        value={value}
        options={[{ value: '', label: t('version.workspaceReusePlaceholder') }, ...options.map(option => ({ value: option.id, label: `${option.label} · ${option.detail}` }))]}
        onChange={onChange}
      />
    </label>
    <p style={hint}>{t('version.workspaceReuseNote')}</p>
    {failure !== undefined && <p role="alert" style={branchError}>{failure}</p>}
  </div>
}
