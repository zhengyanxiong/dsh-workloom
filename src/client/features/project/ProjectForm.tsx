import { useState, type FormEvent } from 'react'
import { Button, IconAgentPresetOutlineRegular, IconChevronDownOutlineRegular, IconChevronLeftOutlineRegular, IconFolderOpenRegular, IconPlusOutlineRegular, IconTrashOutlineRegular, Menu, type MenuEntry } from '../../ui/primitives.ts'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { AgentPresetOption } from '../../../api/agent.ts'
import type { ProjectConfig, ProjectRecord, UpdateProjectRequest } from 'dsh-workloom/types'
import { COLORS } from '../../ui/tokens.ts'
import { LoomWizardSteps } from '../forms/LoomWizardSteps.tsx'
import { LoomSelect } from '../../ui/Select.tsx'
import type { LoomKey } from '../../shared/locales.ts'
import { alert, card, field, fieldLabel, footer, footerSpacer, formStyle, hint, input, previewRow, stack } from '../forms/styles.ts'
import { FailureNotice } from '../forms/FailureNotice.tsx'
import { emptyModuleRow, emptySourceRow, sourceIds, sourcePathsOverlap, projectRequest, type ModuleDraft, type SourceDraft } from '../forms/drafts.ts'
import { Translate } from '../forms/types.ts'
import { PresetOptionLabel } from '../forms/fields.tsx'
import { LOOM_PORTAL_CLASS } from '../../theme/LoomTheme.tsx'

interface ProjectFormProps {
  t: Translate
  create(request: ProjectConfig): Promise<RemoteResult<ProjectRecord>>
  update?(request: UpdateProjectRequest): Promise<RemoteResult<ProjectRecord>>
  project?: ProjectRecord
  agentPresets?: readonly AgentPresetOption[]
  pickDirectory?: (startPath?: string) => Promise<string | null>
  onCreated(project: ProjectRecord): void
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onBusyChange?: (busy: boolean) => void
}

type ProjectStep = 'name' | 'sources' | 'modules' | 'preview'

const PROJECT_STEPS: readonly { readonly key: ProjectStep; readonly label: LoomKey }[] = [
  { key: 'name', label: 'project.step.name' },
  { key: 'sources', label: 'project.step.sources' },
  { key: 'modules', label: 'project.step.modules' },
  { key: 'preview', label: 'project.step.preview' },
]

/** Create or edit one project with its repositories, optional modules and a preview before saving. */
export function ProjectForm({ t, create, update, project, agentPresets = [], pickDirectory, onCreated, open: controlledOpen, onOpenChange, onBusyChange }: ProjectFormProps) {
  const editing = project !== undefined
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = (value: boolean): void => { setInternalOpen(value); onOpenChange?.(value) }
  const [step, setStep] = useState<ProjectStep>(editing ? 'preview' : 'name')
  const [name, setName] = useState(project?.config.name ?? '')
  const [sources, setSources] = useState<SourceDraft[]>(project === undefined ? [emptySourceRow()] : project.config.sources.map(source => {
    const sub = project.config.subProjects?.find(candidate => candidate.sources.some(item => item.id === source.id))
    return { id: source.id, repo: source.repo, path: source.path, ...(sub === undefined ? {} : { subProject: sub.name, subProjectId: String(sub.id) }) }
  }))
  const [modules, setModules] = useState<ModuleDraft[]>(project === undefined ? [] : project.config.modules.map(module => ({ id: module.id, source: module.sourceId, path: module.path })))
  const [agentPreset, setAgentPreset] = useState(project?.config.agentPreset ?? '')
  const [presetOpen, setPresetOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const reportBusy = (value: boolean): void => { setBusy(value); onBusyChange?.(value) }
  const [failure, setFailure] = useState<string>()
  if (!open) return editing ? null : <Button variant="outline" icon={<IconPlusOutlineRegular />} onClick={() => setOpen(true)}>{t('project.new')}</Button>
  const ids = sourceIds(sources)
  const request = projectRequest(name, sources, modules, agentPreset)
  const selectedPreset = agentPresets.find(candidate => candidate.id === agentPreset)
  const presetLabel = agentPreset === '' ? t('project.agentPresetDefault') : selectedPreset?.name ?? agentPreset
  const presetItems: MenuEntry[] = [
    { id: '', label: <PresetOptionLabel name={t('project.agentPresetDefault')} description={t('project.agentPresetDefaultHint')} /> },
    ...(agentPreset !== '' && selectedPreset === undefined
      ? [{ id: agentPreset, label: <PresetOptionLabel name={agentPreset} description={t('project.agentPresetUnavailable')} /> }]
      : []),
    ...agentPresets.map(candidate => ({
      id: candidate.id,
      disabled: candidate.broken !== undefined,
      label: <PresetOptionLabel name={candidate.name ?? candidate.id} description={candidate.broken === undefined ? candidate.description ?? t('preset.noDescription') : t('project.agentPresetBroken')} />,
    })),
  ]
  const nameReady = name.trim() !== ''
  const sourcesReady = projectRequest(name, sources, []) !== undefined
  const stepIndex = PROJECT_STEPS.findIndex(candidate => candidate.key === step)
  function canVisit(candidate: ProjectStep): boolean {
    if (candidate === 'name') return true
    if (candidate === 'sources') return nameReady
    if (candidate === 'modules') return sourcesReady
    return request !== undefined
  }
  function goTo(candidate: ProjectStep): void {
    if (canVisit(candidate)) { setStep(candidate); setFailure(undefined); setPresetOpen(false) }
  }
  function advance(): boolean {
    const candidate = PROJECT_STEPS[stepIndex + 1]
    if (candidate === undefined || !canVisit(candidate.key)) return false
    goTo(candidate.key)
    return true
  }
  function back(): void {
    const candidate = PROJECT_STEPS[stepIndex - 1]
    if (candidate !== undefined) setStep(candidate.key)
  }
  function reset(): void {
    if (editing) { setOpen(false); setFailure(undefined); setPresetOpen(false); return }
    setName(''); setSources([emptySourceRow()]); setModules([]); setAgentPreset(''); setPresetOpen(false); setStep('name'); setOpen(false); setFailure(undefined)
  }
  function updateSource(index: number, patch: Partial<SourceDraft>): void {
    setSources(current => current.map((source, at) => at === index ? { ...source, ...patch } : source))
  }
  function updateModule(index: number, patch: Partial<ModuleDraft>): void {
    setModules(current => current.map((module, at) => at === index ? { ...module, ...patch } : module))
  }
  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (!editing && step !== 'preview') {
      if (!advance()) setFailure('invalid_form')
      return
    }
    if (request === undefined) { setFailure('invalid_form'); return }
    reportBusy(true); setFailure(undefined)
    try {
      const result = editing
        ? update === undefined ? undefined : await update({ projectId: project.id, config: request })
        : await create(request)
      if (result === undefined || !result.ok) { setFailure(result === undefined ? t('state.error') : result.error.message); return }
      reset(); onCreated(result.value)
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error))
    } finally { reportBusy(false) }
  }

  const primaryLabel = busy ? t('form.submitPending') : step === 'preview' ? (editing ? t('form.save') : t('form.create')) : t('form.next')
  const nameFields = <section style={stack}>
      <label style={field}><span style={fieldLabel}>{t('project.name')}</span>
        <input aria-label={t('project.name')} placeholder={t('project.name')} value={name} onChange={event => setName(event.target.value)} style={input} />
      </label>
      <p style={hint}>{t('project.nameHint')}</p>
      <label style={field}><span style={fieldLabel}>{t('project.agentPreset')}</span>
        <Menu open={presetOpen} onClose={() => setPresetOpen(false)} items={presetItems} selectedId={agentPreset} portal listClassName={LOOM_PORTAL_CLASS}
          onSelect={id => { setAgentPreset(id); setPresetOpen(false) }}
          anchor={<button type="button" title={presetLabel} aria-label={t('project.agentPreset')} aria-haspopup="menu" aria-expanded={presetOpen} onClick={() => setPresetOpen(value => !value)}
            style={{ ...input, display: 'flex', alignItems: 'center', gap: 7, padding: '0 10px', textAlign: 'left', cursor: 'pointer' }}>
            <IconAgentPresetOutlineRegular size={14} />
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{presetLabel}</span>
            <IconChevronDownOutlineRegular size={12} />
          </button>} />
      </label>
      <p style={hint}>{t('project.agentPresetHint')}</p>
    </section>;
  const sourcePathConflict = sourcePathsOverlap(sources)
  const sourceFields = <section style={stack}>
      <p style={hint}>{t('source.hint')}</p>
      {sources.map((source, index) => <div key={index} style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ ...fieldLabel, flex: 1 }}>{t('source.item')} {index + 1}</span>
          {sources.length > 1 && <Button type="button" size="sm" variant="ghost" icon={<IconTrashOutlineRegular />} onClick={() => setSources(current => current.filter((_source, at) => at !== index))}>{t('source.remove')}</Button>}
        </div>
        <label style={field}><span style={fieldLabel}>{t('source.subProject')}</span>
          <input aria-label={t('source.subProject')} placeholder="default" value={source.subProject ?? ''} onChange={event => updateSource(index, { subProject: event.target.value })} style={input} />
          <p style={hint}>{t('source.subProjectHint')}</p>
        </label>
        <div style={field}><span style={fieldLabel}>{t('source.repo')}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <input aria-label={t('source.repo')} placeholder={t('source.repoHint')} value={source.repo} onChange={event => updateSource(index, { repo: event.target.value })} style={{ ...input, flex: 1 }} />
            {pickDirectory !== undefined && <Button type="button" variant="outline" icon={<IconFolderOpenRegular />} onClick={() => {
              void pickDirectory(source.repo.trim() === '' ? undefined : source.repo.trim()).then(picked => {
                if (picked === null) return
                updateSource(index, { repo: picked, ...(source.path.trim() === '' ? { path: picked.split(/[\\/]/u).filter(Boolean).at(-1) ?? '' } : {}) })
              })
            }}>{t('source.browse')}</Button>}
          </div>
          <p style={hint}>{t('source.repoHint')}</p>
        </div>
        <label style={field}><span style={fieldLabel}>{t('source.path')}</span>
          <input aria-label={t('source.path')} placeholder={t('source.path')} value={source.path} onChange={event => updateSource(index, { path: event.target.value })} style={input} />
          <p style={hint}>{t('source.pathHint')}</p>
        </label>
      </div>)}
      {sourcePathConflict && <p role="alert" style={{ ...hint, color: COLORS.error }}>{t('source.rootConflict')}</p>}
      <Button type="button" variant="outline" icon={<IconPlusOutlineRegular />} style={{ alignSelf: 'flex-start' }} onClick={() => setSources(current => [...current, emptySourceRow()])}>{t('source.add')}</Button>
    </section>;
  const moduleFields = <section style={stack}>
      <p style={hint}>{t('module.optional')}</p>
      {modules.map((module, index) => <div key={index} style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ ...fieldLabel, flex: 1 }}>{t('module.item')} {index + 1}</span>
          <Button type="button" size="sm" variant="ghost" icon={<IconTrashOutlineRegular />} onClick={() => setModules(current => current.filter((_module, at) => at !== index))}>{t('module.remove')}</Button>
        </div>
        <label style={field}><span style={fieldLabel}>{t('module.source')}</span>
          <LoomSelect
            block
            ariaLabel={t('module.source')}
            value={module.source}
            options={[{ value: '', label: t('module.source') }, ...sources.flatMap((source, at) => {
              const id = ids[at]
              return id === undefined ? [] : [{ value: id, label: source.path }]
            })]}
            onChange={value => updateModule(index, { source: value })}
          />
        </label>
        <label style={field}><span style={fieldLabel}>{t('module.path')}</span>
          <input aria-label={t('module.path')} placeholder={t('module.path')} value={module.path} onChange={event => updateModule(index, { path: event.target.value })} style={input} />
        </label>
      </div>)}
      <Button type="button" variant="outline" icon={<IconPlusOutlineRegular />} style={{ alignSelf: 'flex-start' }} onClick={() => setModules(current => [...current, emptyModuleRow()])}>{t('module.add')}</Button>
    </section>;
  return <form style={formStyle} onSubmit={event => { void submit(event) }}>
    {!editing && <LoomWizardSteps t={t} steps={PROJECT_STEPS} current={step} ariaLabel="project.steps" canVisit={canVisit} onSelect={goTo} />}
    {(editing || step === 'name') && nameFields}
    {(editing || step === 'sources') && sourceFields}
    {(editing || step === 'modules') && moduleFields}
    {!editing && step === 'preview' && <section style={stack}>
      <p style={hint}>{t('project.previewHint')}</p>
      {request === undefined ? <p role="alert" style={alert}>{t('form.required')}</p> : <div style={card}>
        <div style={field}><span style={fieldLabel}>{t('project.name')}</span><span>{request.name}</span></div>
        <div style={field}><span style={fieldLabel}>{t('project.agentPreset')}</span><span>{presetLabel}</span></div>
        <div style={field}><span style={fieldLabel}>{t('source.title')}</span>
          {request.sources.map(source => <div key={source.id} style={previewRow}>
            <span style={{ color: COLORS.dim, fontFamily: 'ui-monospace, monospace', fontSize: 'var(--text-small-size)' }}>{source.id}</span>
            <span style={{ color: COLORS.text, overflowWrap: 'anywhere' }}>{source.repo}</span>
            <span style={{ color: COLORS.faint }}>→ {source.path}</span>
          </div>)}
        </div>
        {request.subProjects !== undefined && <div style={field}><span style={fieldLabel}>{t('project.subProjects')}</span>
          {request.subProjects.map(sub => <div key={sub.id} style={previewRow}>
            <span style={{ color: COLORS.dim, fontFamily: 'ui-monospace, monospace', fontSize: 'var(--text-small-size)' }}>{sub.id}</span>
            <span style={{ color: COLORS.text }}>{sub.name}</span>
            <span style={{ color: COLORS.faint }}>{sub.sources.length} repos</span>
          </div>)}
        </div>}
        <div style={field}><span style={fieldLabel}>{t('module.title')}</span>
          {request.modules.length === 0 ? <span style={hint}>{t('module.optional')}</span> : request.modules.map(module => <div key={module.id} style={previewRow}>
            <span style={{ color: COLORS.dim, fontFamily: 'ui-monospace, monospace', fontSize: 'var(--text-small-size)' }}>{module.id}</span>
            <span style={{ color: COLORS.text, overflowWrap: 'anywhere' }}>{module.sourceId} / {module.path}</span>
          </div>)}
        </div>
      </div>}
    </section>}
    {failure !== undefined && <FailureNotice failure={failure} t={t} />}
    <div style={footer}>
      <Button type="button" variant="ghost" disabled={busy} onClick={reset}>{t('form.cancel')}</Button>
      <span style={footerSpacer} />
      {!editing && stepIndex > 0 && <Button type="button" variant="outline" icon={<IconChevronLeftOutlineRegular />} onClick={back}>{t('form.back')}</Button>}
      {!editing && step === 'modules' && <Button type="button" variant="ghost" onClick={() => goTo('preview')}>{t('form.skip')}</Button>}
      <Button type="submit" variant="primary" className="loom-primary" disabled={busy || (step === 'preview' ? request === undefined : !canVisit(PROJECT_STEPS[stepIndex + 1]?.key ?? 'preview'))}>{primaryLabel}</Button>
    </div>
  </form>
}

