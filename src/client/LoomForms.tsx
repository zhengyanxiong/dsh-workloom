/** Inline creation and edit forms for Loom projects, versions and tasks. */
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import {
  Button, IconAgentPresetOutlineRegular, IconChevronDownOutlineRegular, IconChevronLeftOutlineRegular, IconDownloadOutlineRegular, IconFolderOpenRegular, IconInfoOutlineRegular, IconPlusOutlineRegular, IconTrashOutlineRegular, Menu,
  type MenuEntry,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { AgentPresetOption } from '../api/agent.ts'
export type { AgentPresetOption } from '../api/agent.ts'
import type {
  CreateTaskRequest, CreateVersionRequest, GenerateLockRequest, Lock,
  ProjectConfig, ProjectRecord, SourceConfig, TaskRecord, TaskPriority, VersionRecord, VersionWorkspaceInput, WorkspaceRecord,
  UpdateProjectRequest, UpdateTaskRequest, UpdateVersionRequest, RepositoryBranches, RepositoryBranchesRequest,
} from 'dsh-workloom/types'
import { parseProject, ProjectError } from '../domain/project.ts'
import { autoWorkspaceRepositoryPath } from '../domain/workspace.ts'
import { VERSION_DESCRIPTION_MAX_CHARS } from '../shared/version-context.ts'
import { COLORS, failureKey } from './shell.ts'
import { LoomWizardSteps } from './LoomWizardSteps.tsx'
import { LoomSelect } from './ui/Select.tsx'
import type { LoomKey } from './locales.ts'
import {
  alert, branchCard, branchError, branchPath, branchPathNote, branchPathText, branchTag, branchTagEmpty, branchTop,
  card, field, fieldLabel, footer, footerSpacer, formStyle, helperStrip, hint, input, mono, previewRow,
  sectionHeading, sectionHeadingTitle, stack, textarea, workspaceActions, workspaceCard, workspaceConfirm,
  workspaceConfirmActions, workspaceConfirmText, workspaceCopy, workspaceList, workspaceMeta, workspacePath,
  workspaceTitle,
} from './features/forms/styles.ts'
import { FailureNotice } from './features/forms/FailureNotice.tsx'
import {
  emptyModuleRow, emptySourceRow, sourceIds, sourcePathsOverlap, projectRequest, versionRequest, taskRequest, workspaceDraftInput,
  type ModuleDraft, type SourceDraft, type WorkspaceDraft,
} from './features/forms/drafts.ts'
export {
  emptyModuleRow, emptySourceRow, sourceIds, sourcePathsOverlap, projectRequest, versionRequest, taskRequest, workspaceDraftInput,
} from './features/forms/drafts.ts'
export type { ModuleDraft, SourceDraft, TaskMetadataDraft } from './features/forms/drafts.ts'

type Translate = (key: LoomKey, params?: Readonly<Record<string, string>>) => string

function PresetOptionLabel({ name, description }: { readonly name: string; readonly description: string }) {
  return <span style={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 280 }}>
    <span style={{ fontSize: 'var(--text-h3-size)', lineHeight: '20px', color: COLORS.text }}>{name}</span>
    <span style={{ fontSize: 'var(--text-compact-size)', lineHeight: '16px', color: COLORS.faint, whiteSpace: 'normal' }}>{description}</span>
  </span>
}

/** Free-text ref input backed by the repository's local branch list. */
export function BranchPicker({ t, source, value, listBranches, onChange, compact = false }: {
  t: Translate
  source: SourceConfig
  value: string
  listBranches?: ((request: RepositoryBranchesRequest) => Promise<RemoteResult<RepositoryBranches>>) | undefined
  onChange(value: string): void
  /** Hide the per-field label when the enclosing card already identifies the repository. */
  compact?: boolean
}) {
  const [branches, setBranches] = useState<readonly string[]>()
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [failureMessage, setFailureMessage] = useState<string>()
  const [open, setOpen] = useState(false)
  const [filterText, setFilterText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const input = inputRef.current
    if (input === null || typeof ResizeObserver === 'undefined') return
    const apply = (): void => {
      const width = input.offsetWidth
      if (width > 0) document.documentElement.style.setProperty('--loom-branch-menu-width', `${width}px`)
    }
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(input)
    return () => { observer.disconnect() }
  }, [])
  async function load(openAfter = false): Promise<void> {
    if (listBranches === undefined || loading) return
    setLoading(true); setFailed(false); setFailureMessage(undefined)
    try {
      const result = await listBranches({ repo: source.repo })
      if (result.ok) {
        setBranches(result.value.branches)
        if (openAfter) setOpen(true)
      } else {
        setFailed(true); setFailureMessage(result.error.message)
        if (openAfter) setOpen(true)
      }
    } catch (error) {
      setFailed(true); setFailureMessage(error instanceof Error ? error.message : String(error))
      if (openAfter) setOpen(true)
    } finally { setLoading(false) }
  }
  const query = filterText.trim().toLowerCase()
  const filtered = (branches ?? []).filter(branch => query === '' || branch.toLowerCase().includes(query))
  const typed = value.trim()
  const typedOption = typed !== '' && filtered.length === 0
  const branchItems: MenuEntry[] = [
    ...(typedOption ? [{ id: '__typed__', label: t('branch.useTyped').replace('{value}', typed) }] : []),
    ...filtered.map(branch => ({ id: branch, label: branch })),
  ]
  return <div style={field}>
    {!compact && <span style={fieldLabel}>{t('source.branch')}</span>}
    <div style={{ display: 'flex', gap: 6 }}>
      <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
        <input ref={inputRef} aria-label={`${t('source.branch')} ${source.path}`}
          placeholder={t('source.branchPlaceholder')} value={value}
          aria-autocomplete="list" aria-expanded={open}
          onChange={event => {
            const next = event.target.value
            onChange(next); setFilterText(next)
            if (branches === undefined && !failed) void load(true)
            else setOpen(true)
          }}
          onFocus={() => { if (branches === undefined) void load() }}
          onKeyDown={event => {
            if (event.key === 'ArrowDown') { event.preventDefault(); if (branches === undefined) void load(); else setOpen(true); return }
            if (event.key === 'Escape') { if (open) { event.preventDefault(); setOpen(false) } return }
            if (event.key === 'Enter' && open) {
              const exact = filtered.find(branch => branch === typed)
              if (exact !== undefined) { event.preventDefault(); onChange(exact); setFilterText(''); setOpen(false) }
              else if (typed !== '') { event.preventDefault(); setFilterText(''); setOpen(false) }
            }
          }} style={{ ...input, paddingRight: 32 }} />
        {listBranches !== undefined && <span style={{ position: 'absolute', top: 0, right: 2, height: 36, display: 'inline-flex' }}>
          <Menu open={open} onClose={() => setOpen(false)} items={branchItems} selectedId={value === '' ? undefined : value} selection="fill" portal listClassName="loom-branch-menu"
            getAnchorRect={() => inputRef.current?.getBoundingClientRect() ?? null}
            onSelect={branch => { const next = branch === '__typed__' ? typed : branch; if (next !== '') onChange(next); setFilterText(''); setOpen(false) }}
            anchor={<button type="button" aria-label={t('branch.open')} aria-haspopup="listbox" aria-expanded={open}
              onClick={() => {
                if (branches === undefined && !failed) void load()
                const width = inputRef.current?.offsetWidth ?? 0
                if (width > 0) document.documentElement.style.setProperty('--loom-branch-menu-width', `${width}px`)
                setOpen(current => !current)
              }}
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 36, padding: 0, border: 'none', background: 'transparent', color: COLORS.dim, cursor: 'pointer' }}>
              <IconChevronDownOutlineRegular size={16} />
            </button>} />
        </span>}
      </div>
      {listBranches !== undefined && (branches === undefined || failed) && <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => { void load(true) }}>{loading ? t('branch.loading') : t('branch.load')}</Button>}
    </div>
    <p style={hint} title={failureMessage}>
      {failed
        ? /not a git repository|not a git work tree|不是.*git/iu.test(failureMessage ?? '') ? t('branch.notGit') : t('branch.unavailable')
        : branches === undefined
          ? t('branch.chooseOrType')
          : filtered.length === 0
            ? t('branch.noMatch')
            : t('branch.available').replace('{count}', String(branches.length))}
    </p>
  </div>
}

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
        <Menu open={presetOpen} onClose={() => setPresetOpen(false)} items={presetItems} selectedId={agentPreset} portal
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

interface VersionFormProps {
  t: Translate
  project: ProjectRecord
  listBranches?: (request: RepositoryBranchesRequest) => Promise<RemoteResult<RepositoryBranches>>
  /** Optional native directory picker used by workspace inputs. */
  pickDirectory?: (startPath?: string) => Promise<string | null>
  /** Workspaces already bound to the version; shown read-only while editing. */
  boundWorkspaces?: readonly { readonly id: string; readonly label?: string | undefined; readonly mode?: string | undefined; readonly rootPath?: string | undefined; readonly path: string; readonly cleaned?: boolean | undefined; readonly taskCount?: number | undefined; readonly ownerSessionId?: string | undefined; readonly preparation?: { readonly status: string } | undefined }[] | undefined
  create(request: CreateVersionRequest): Promise<RemoteResult<VersionRecord>>
  update?(request: UpdateVersionRequest): Promise<RemoteResult<VersionRecord>>
  /** Add one auto-created workspace while editing an existing version. */
  addWorkspace?: (input: VersionWorkspaceInput) => Promise<RemoteResult<WorkspaceRecord>>
  renameWorkspace?: (workspaceId: string, label: string) => Promise<RemoteResult<WorkspaceRecord>>
  deleteWorkspace?: (workspaceId: string, deleteFiles: boolean, confirmPath?: string) => Promise<RemoteResult<void>>
  cleanupWorkspace?: (workspaceId: string) => Promise<RemoteResult<void>>
  otherWorkspaces?: readonly { readonly id: string; readonly label?: string | undefined; readonly rootPath?: string | undefined; readonly path: string; readonly mode?: string | undefined; readonly versionId: string; readonly versionName: string }[] | undefined
  onWorkspaceAdded?: () => void
  version?: VersionRecord
  onCreated(version: VersionRecord): void
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onBusyChange?: (busy: boolean) => void
  /** Notify the modal shell when the wizard advances, for its step subtitle. */
  onStepChange?: (step: VersionStep) => void
}

/** One version-creation step. */
export type VersionStep = 'name' | 'refs' | 'workspace' | 'preview'

const VERSION_STEPS: readonly { readonly key: VersionStep; readonly label: LoomKey }[] = [
  { key: 'name', label: 'version.step.name' },
  { key: 'refs', label: 'version.step.refs' },
  { key: 'workspace', label: 'version.step.workspace' },
  { key: 'preview', label: 'version.step.preview' },
]

/** One workspace draft created together with a version. */
export function VersionForm({ t, project, listBranches, pickDirectory, boundWorkspaces, otherWorkspaces, create, update, version, onCreated, addWorkspace, renameWorkspace, deleteWorkspace, cleanupWorkspace, onWorkspaceAdded, open: controlledOpen, onOpenChange, onBusyChange, onStepChange }: VersionFormProps) {
  const editing = version !== undefined
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = (value: boolean): void => { setInternalOpen(value); onOpenChange?.(value) }
  const [step, setStep] = useState<VersionStep>('name')
  const [name, setName] = useState(version?.name ?? '')
  const [description, setDescription] = useState(version?.description ?? '')
  const [refs, setRefs] = useState<Record<string, string>>(version === undefined ? {} : Object.fromEntries(version.sources.map(source => [source.sourceId, source.ref])))
  const [workspace, setWorkspace] = useState<WorkspaceDraft>({ mode: 'auto', parentPath: '', name: '', branchPrefix: 'loom', rootPath: '', targets: {} })
  const [selectedSubProjects, setSelectedSubProjects] = useState<string[]>(version?.targets?.map(target => String(target.subProjectId)) ?? project.config.subProjects?.map(sub => String(sub.id)) ?? [])
  const [busy, setBusy] = useState(false)
  const reportBusy = (value: boolean): void => { setBusy(value); onBusyChange?.(value) }
  const [failure, setFailure] = useState<string>()
  const failureRef = useRef<HTMLDivElement>(null)
  const [showAddWorkspace, setShowAddWorkspace] = useState(false)
  const [addingWorkspace, setAddingWorkspace] = useState(false)
  const [workspaceFailure, setWorkspaceFailure] = useState<string>()
  const [workspaceActionId, setWorkspaceActionId] = useState<string>()
  const [workspaceActionDraft, setWorkspaceActionDraft] = useState('')
  const [workspaceActionFailure, setWorkspaceActionFailure] = useState<string>()
  const [workspaceActionBusy, setWorkspaceActionBusy] = useState(false)
  const [pendingWorkspaceDelete, setPendingWorkspaceDelete] = useState<string>()
  const [pendingWorkspaceDeleteFiles, setPendingWorkspaceDeleteFiles] = useState(false)
  const [workspaceSourceMode, setWorkspaceSourceMode] = useState<'new' | 'copy'>('new')
  const [workspaceSourceId, setWorkspaceSourceId] = useState('')
  const [pendingWorkspaceCleanup, setPendingWorkspaceCleanup] = useState<string>()
  const workspaceErrorRef = useRef<HTMLParagraphElement>(null)
  if (!open) return editing ? null : <Button variant="outline" icon={<IconPlusOutlineRegular />} onClick={() => setOpen(true)}>{t('version.new')}</Button>
  const descriptionTooLong = description.length > VERSION_DESCRIPTION_MAX_CHARS
  const selectedSources = project.config.subProjects === undefined
    ? project.config.sources
    : project.config.subProjects.filter(sub => selectedSubProjects.includes(String(sub.id))).flatMap(sub => sub.sources)
  const workspaceInput = workspaceDraftInput(workspace, selectedSources)
  const workspacePreviewRoot = workspace.parentPath.trim() === '' || workspace.name.trim() === ''
    ? undefined
    : `${workspace.parentPath.replace(/[\\/]+$/u, '')}/${workspace.name}`
  const workspacePreviewRepos = workspacePreviewRoot === undefined ? [] : selectedSources.map(source => {
    const subProject = project.config.subProjects?.find(sub => sub.sources.some(item => item.id === source.id))
    return { source, path: `${workspacePreviewRoot}/${autoWorkspaceRepositoryPath(String(subProject?.id ?? 'default'), source)}` }
  })
  const workspaces = workspaceInput === undefined ? [] : [workspaceInput]
  const request = versionRequest(project, name, refs, description, workspaces, selectedSubProjects)
  const stepIndex = VERSION_STEPS.findIndex(candidate => candidate.key === step)
  const nameReady = name.trim() !== '' && !descriptionTooLong
  function canVisit(candidate: VersionStep): boolean {
    if (candidate === 'name') return true
    if (candidate === 'refs') return nameReady
    if (candidate === 'workspace') return versionRequest(project, name, refs, description, [], selectedSubProjects) !== undefined
    return request !== undefined
  }
  function goTo(candidate: VersionStep): void {
    if (!canVisit(candidate)) return
    setStep(candidate); setFailure(undefined); onStepChange?.(candidate)
  }
  function advance(): boolean {
    const candidate = VERSION_STEPS[stepIndex + 1]
    if (candidate === undefined || !canVisit(candidate.key)) return false
    goTo(candidate.key)
    return true
  }
  function back(): void {
    const candidate = VERSION_STEPS[stepIndex - 1]
    if (candidate !== undefined) setStep(candidate.key)
  }
  function close(): void { setOpen(false); setFailure(undefined) }
  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    // A failed add-workspace attempt must not be silently discarded by Save.
    if (workspaceFailure !== undefined) { setFailure(workspaceFailure); return }
    if (!editing && step !== 'preview') {
      if (!advance()) setFailure('invalid_form')
      return
    }
    if (request === undefined) { setFailure('invalid_form'); return }
    reportBusy(true); setFailure(undefined)
    try {
      const result = editing
        // An explicit empty string clears the stored description; omitting it would preserve the old one.
        ? update === undefined ? undefined : await update({ versionId: version.id, name: request.name, sources: request.sources, description: description.trim(), ...(request.targets === undefined ? {} : { targets: request.targets }) })
        : await create(request)
      if (result === undefined || !result.ok) { setFailure(result === undefined ? t('state.error') : result.error.message); return }
      close(); onCreated(result.value)
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error))
    } finally { reportBusy(false) }
  }
  async function chooseWorkspaceDirectory(field: 'parentPath' | 'rootPath', sourceId?: string): Promise<void> {
    if (pickDirectory === undefined) return
    const current = field === 'parentPath' ? workspace.parentPath : field === 'rootPath' ? workspace.rootPath : (workspace.targets[sourceId ?? ''] ?? '')
    const picked = await pickDirectory(current === '' ? undefined : current)
    if (picked === null) return
    if (sourceId === undefined) setWorkspace(currentDraft => ({ ...currentDraft, [field]: picked }))
    else setWorkspace(currentDraft => ({ ...currentDraft, targets: { ...currentDraft.targets, [sourceId]: picked } }))
  }
  async function submitWorkspace(): Promise<void> {
    if (addWorkspace === undefined || workspaceInput === undefined) return
    setAddingWorkspace(true); setWorkspaceFailure(undefined)
    try {
      const result = await addWorkspace(workspaceInput)
      if (!result.ok) { setWorkspaceFailure(result.error.message); return }
      setShowAddWorkspace(false); onWorkspaceAdded?.()
    } catch (error) {
      setWorkspaceFailure(error instanceof Error ? error.message : String(error))
    } finally { setAddingWorkspace(false) }
  }
  useEffect(() => {
    if (failure !== undefined) failureRef.current?.scrollIntoView({ block: 'nearest' })
  }, [failure])
  const workspaceFailureLabel = workspaceFailure === undefined
    ? undefined
    : (() => {
        const key = failureKey(workspaceFailure)
        return key === undefined ? workspaceFailure : t(key)
      })()
  useEffect(() => {
    if (workspaceFailure !== undefined) workspaceErrorRef.current?.scrollIntoView({ block: 'nearest' })
  }, [workspaceFailure])
  async function saveWorkspaceLabel(): Promise<void> {
    if (workspaceActionId === undefined || renameWorkspace === undefined) return
    setWorkspaceActionBusy(true); setWorkspaceActionFailure(undefined)
    try {
      const result = await renameWorkspace(workspaceActionId, workspaceActionDraft)
      if (!result.ok) { setWorkspaceActionFailure(result.error.message); return }
      setWorkspaceActionId(undefined); onWorkspaceAdded?.()
    } finally { setWorkspaceActionBusy(false) }
  }
  function applyWorkspaceSource(id: string): void {
    setWorkspaceSourceId(id)
    const source = otherWorkspaces?.find(item => item.id === id)
    if (source === undefined) return
    const root = (source.rootPath ?? source.path).replace(/[\\/]+$/u, '')
    const slash = root.lastIndexOf('/')
    const parent = slash > 0 ? root.slice(0, slash) : root
    const name = root.slice(slash + 1)
    setWorkspace(current => ({ ...current, parentPath: parent, name: `${name}-copy`, branchPrefix: 'loom' }))
  }
  async function removeWorkspace(id: string, cleanup: boolean, deleteFiles = false): Promise<void> {
    const action = cleanup ? cleanupWorkspace : deleteWorkspace
    if (action === undefined) return
    setWorkspaceActionBusy(true); setWorkspaceActionFailure(undefined)
    try {
      const result = cleanup
        ? await (action as (workspaceId: string) => Promise<RemoteResult<void>>)(id)
        : await (action as (workspaceId: string, deleteFiles: boolean, confirmPath?: string) => Promise<RemoteResult<void>>)(id, deleteFiles, deleteFiles ? (boundWorkspaces ?? []).find(item => item.id === id)?.rootPath ?? undefined : undefined)
      if (!result.ok) { setWorkspaceActionFailure(result.error.message); return }
      setPendingWorkspaceDelete(undefined); setPendingWorkspaceCleanup(undefined); onWorkspaceAdded?.()
    } finally { setWorkspaceActionBusy(false) }
  }
  const primaryLabel = busy ? t('form.submitPending') : !editing && step !== 'preview' ? t('form.next') : editing ? t('form.save') : t('form.create')
  const sourceFor = (id: string) => project.config.sources.find(source => source.id === id)
  const renderSourceRef = (source: SourceConfig): ReactNode => {
        const ref = refs[source.id] ?? ''
        const missing = ref.trim() === ''
        return <div key={source.id} style={branchCard}>
          <div style={branchTop}>
            <div style={branchPath}>
              <div style={branchPathText} title={source.path}>{source.path}</div>
              <div style={branchPathNote}>{source.repo}</div>
            </div>
            <span style={missing ? branchTagEmpty : branchTag} title={missing ? undefined : ref}>{missing ? t('version.unselected') : ref}</span>
          </div>
          <BranchPicker t={t} source={source} value={ref} listBranches={listBranches} compact
            onChange={value => setRefs(current => ({ ...current, [source.id]: value }))} />
          {missing && <p style={branchError} role="alert"><IconInfoOutlineRegular size={13} />{t('version.branchRequired')}</p>}
        </div>
  }
  return <form style={formStyle} onSubmit={event => { void submit(event) }}>
    {!editing && <LoomWizardSteps t={t} steps={VERSION_STEPS} current={step} ariaLabel="version.steps" canVisit={canVisit} onSelect={goTo} />}
    {failure !== undefined && <div ref={failureRef}><FailureNotice failure={failure} t={t} /></div>}
    {(editing || step === 'name') && <section style={stack}>
      <label style={field}><span style={fieldLabel}>{t('version.name')}</span>
        <input aria-label={t('version.name')} placeholder={t('version.name')} value={name} onChange={event => setName(event.target.value)} style={input} />
      </label>
      <label style={field}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={fieldLabel}>{t('version.description')}</span>
          <span aria-hidden style={{ marginLeft: 'auto', color: descriptionTooLong ? COLORS.error : COLORS.faint, fontSize: 'var(--text-label-size)', fontFamily: 'ui-monospace, monospace' }}>{String(description.length)} / {String(VERSION_DESCRIPTION_MAX_CHARS)}</span>
        </span>
        <textarea aria-label={t('version.description')} aria-invalid={descriptionTooLong} placeholder={t('version.description')} value={description} rows={4}
          onChange={event => setDescription(event.target.value)} style={descriptionTooLong ? { ...textarea, borderColor: COLORS.error } : textarea} />
      </label>
      {descriptionTooLong
        ? <p role="alert" style={{ margin: 0, color: COLORS.error, fontSize: 'var(--text-small-size)', lineHeight: 1.5 }}>{t('version.descriptionTooLong', { max: String(VERSION_DESCRIPTION_MAX_CHARS) })}</p>
        : <p style={hint}>{t('version.descriptionHint')}</p>}
      {editing && <p style={hint}>{t('version.refHint')}</p>}
    </section>}
    {editing && <section style={stack}>
      <div style={sectionHeading}><h3 style={sectionHeadingTitle}>{t('version.workspaces')}</h3><span style={hint}>{t('version.workspaceEditHint')}</span></div>
      {(boundWorkspaces ?? []).length === 0
        ? <p style={hint}>{t('version.workspaceEmpty')}</p>
        : <div style={workspaceList}>
            {(boundWorkspaces ?? []).map(item => {
              const used = (item.taskCount ?? 0) > 0
              const owned = item.ownerSessionId !== undefined
              const label = item.label ?? item.rootPath ?? item.path
              return <div key={item.id} style={workspaceCard}>
                <div style={workspaceCopy}>
                  <span style={workspaceTitle}>{label}</span>
                  {item.label !== undefined && <span style={workspacePath}>{item.rootPath ?? item.path}</span>}
                  <span style={workspaceMeta}>{item.mode ?? 'direct'} · {item.preparation?.status ?? (item.cleaned === true ? 'cleaned' : 'ready')}{used ? ` · ${t('version.workspaceUsed', { count: String(item.taskCount ?? 0) })}` : ''}{owned ? ` · ${t('version.workspaceOwned')}` : ''}</span>
                </div>
                <div style={workspaceActions}>
                  <Button type="button" variant="ghost" disabled={workspaceActionBusy || renameWorkspace === undefined} onClick={() => { setWorkspaceActionId(item.id); setWorkspaceActionDraft(item.label ?? ''); setWorkspaceActionFailure(undefined) }}>{t('version.workspaceRename')}</Button>
                  {used
                    ? <Button type="button" variant="ghost" disabled={workspaceActionBusy || owned || cleanupWorkspace === undefined} onClick={() => { setPendingWorkspaceCleanup(item.id); setWorkspaceActionFailure(undefined) }}>{t('version.workspaceCleanup')}</Button>
                    : <Button type="button" variant="ghost" disabled={workspaceActionBusy || owned || deleteWorkspace === undefined} onClick={() => { setPendingWorkspaceDelete(item.id); setPendingWorkspaceDeleteFiles((item.mode ?? 'direct') === 'managed'); setWorkspaceActionFailure(undefined) }}>{t('version.workspaceDelete')}</Button>}
                </div>
                {workspaceActionId === item.id && <div style={{ ...workspaceConfirm, borderTop: 'none', paddingTop: 6, flexDirection: 'row', alignItems: 'center' }}>
                  <input aria-label={t('version.workspaceLabel')} placeholder={t('version.workspaceLabel')} value={workspaceActionDraft} onChange={event => setWorkspaceActionDraft(event.target.value)} style={{ ...input, flex: '1 1 220px' }} />
                  <Button type="button" variant="primary" disabled={workspaceActionBusy} onClick={() => { void saveWorkspaceLabel() }}>{t('form.save')}</Button>
                  <Button type="button" variant="ghost" disabled={workspaceActionBusy} onClick={() => { setWorkspaceActionId(undefined); setWorkspaceActionFailure(undefined) }}>{t('form.cancel')}</Button>
                </div>}
                {pendingWorkspaceDelete === item.id && <div role="alert" style={workspaceConfirm}>
                  <p style={workspaceConfirmText}>{t('version.workspaceDeleteConfirm')}</p>
                  {item.mode !== 'managed' && <label style={{ display: 'flex', alignItems: 'center', gap: 7, color: COLORS.error, fontSize: 'var(--text-small-size)', lineHeight: 1.5 }}>
                    <input type="checkbox" checked={pendingWorkspaceDeleteFiles} onChange={event => setPendingWorkspaceDeleteFiles(event.target.checked)} />
                    {t('version.workspaceDeleteFiles')}
                  </label>}
                  <div style={workspaceConfirmActions}>
                    <Button type="button" variant="primary" disabled={workspaceActionBusy} onClick={() => { void removeWorkspace(item.id, false, pendingWorkspaceDeleteFiles) }}>{t('version.workspaceDelete')}</Button>
                    <Button type="button" variant="ghost" disabled={workspaceActionBusy} onClick={() => setPendingWorkspaceDelete(undefined)}>{t('form.cancel')}</Button>
                  </div>
                </div>}
                {pendingWorkspaceCleanup === item.id && <div role="alert" style={workspaceConfirm}>
                  <p style={workspaceConfirmText}>{t('version.workspaceCleanupConfirm')}</p>
                  <div style={workspaceConfirmActions}>
                    <Button type="button" variant="primary" disabled={workspaceActionBusy} onClick={() => { void removeWorkspace(item.id, true) }}>{t('version.workspaceCleanup')}</Button>
                    <Button type="button" variant="ghost" disabled={workspaceActionBusy} onClick={() => setPendingWorkspaceCleanup(undefined)}>{t('form.cancel')}</Button>
                  </div>
                </div>}
              </div>
            })}
            {workspaceActionFailure !== undefined && <p role="alert" style={{ ...branchError, marginTop: 2, lineHeight: 1.6 }}>{workspaceActionFailure}</p>}
          </div>}
      <p style={hint}>{t('version.workspaceEditNote')}</p>
      {addWorkspace !== undefined && (showAddWorkspace
        ? <div style={card} onKeyDown={event => {
            // The add form lives inside the version form; Enter must add the
            // workspace instead of submitting the outer Version update.
            if (event.key === 'Enter' && !event.shiftKey && !(event.target instanceof HTMLButtonElement)) {
              event.preventDefault()
              void submitWorkspace()
            }
          }}>
            {workspaceFailureLabel !== undefined && <div role="alert" aria-live="polite" ref={workspaceErrorRef} style={{ ...branchError, flexDirection: 'column', alignItems: 'flex-start' }}>
              <span>{workspaceFailureLabel}</span>
              {workspaceFailure !== workspaceFailureLabel && <code style={{ ...mono, color: COLORS.faint, overflowWrap: 'anywhere' }}>{workspaceFailure}</code>}
            </div>}
            <div style={{ display: 'flex', gap: 4, padding: 3, background: COLORS.panel2, border: `0.5px solid ${COLORS.border}`, borderRadius: 7, marginBottom: 2 }}>
              <Button type="button" variant={workspaceSourceMode === 'new' ? 'primary' : 'ghost'} style={{ flex: 1 }} onClick={() => setWorkspaceSourceMode('new')}>{t('version.workspaceNew')}</Button>
              <Button type="button" variant={workspaceSourceMode === 'copy' ? 'primary' : 'ghost'} style={{ flex: 1 }} disabled={(otherWorkspaces ?? []).length === 0} onClick={() => setWorkspaceSourceMode('copy')}>{t('version.workspaceFromVersion')}</Button>
            </div>
            {workspaceSourceMode === 'copy' && <label style={field}><span style={fieldLabel}>{t('version.workspaceSource')}</span>
              <LoomSelect
                block
                ariaLabel={t('version.workspaceSource')}
                value={workspaceSourceId}
                options={[{ value: '', label: t('version.workspaceSourcePlaceholder') }, ...(otherWorkspaces ?? []).map(source => ({ value: source.id, label: `${source.versionName} · ${source.label ?? source.rootPath ?? source.path}` }))]}
                onChange={value => applyWorkspaceSource(value)}
              />
            </label>}
            {workspaceSourceMode === 'copy' && workspaceSourceId !== '' && <p style={hint}>{t('version.workspaceCopyNote')}</p>}
            <label style={field}><span style={fieldLabel}>{t('version.workspaceParentPath')}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <input aria-label={t('version.workspaceParentPath')} placeholder="/home/me/work" value={workspace.parentPath} onChange={event => setWorkspace(current => ({ ...current, parentPath: event.target.value }))} style={{ ...input, flex: 1 }} />
                {pickDirectory !== undefined && <Button type="button" variant="outline" icon={<IconFolderOpenRegular />} onClick={() => { void chooseWorkspaceDirectory('parentPath') }}>{t('workspace.browse')}</Button>}
              </div>
            </label>
            <label style={field}><span style={fieldLabel}>{t('version.workspaceName')}</span>
              <input aria-label={t('version.workspaceName')} placeholder="v0.1-auto" value={workspace.name} onChange={event => setWorkspace(current => ({ ...current, name: event.target.value }))} style={input} />
            </label>
            <label style={field}><span style={fieldLabel}>{t('version.workspaceBranchPrefix')}</span>
              <input aria-label={t('version.workspaceBranchPrefix')} placeholder="loom" value={workspace.branchPrefix} onChange={event => setWorkspace(current => ({ ...current, branchPrefix: event.target.value }))} style={input} />
            </label>
            {workspacePreviewRoot !== undefined && <div style={{ ...card, gap: 5, background: COLORS.panel }}>
              <span style={fieldLabel}>{t('version.workspacePreview')}</span>
              <code style={{ ...mono, color: COLORS.text, overflowWrap: 'anywhere' }}>{workspacePreviewRoot}</code>
              {workspacePreviewRepos.map(({ source, path }) => <code key={source.id} style={{ ...mono, color: COLORS.faint, overflowWrap: 'anywhere' }}>{path}</code>)}
              <span style={hint}>{t('version.workspacePreviewBranch', { branch: `${workspace.branchPrefix}/${workspace.name}` })}</span>
            </div>}
            {workspaceInput === undefined && <p role="alert" style={branchError}><IconInfoOutlineRegular size={13} />{t('version.workspaceInvalid')}</p>}
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <Button type="button" variant="ghost" onClick={() => { setShowAddWorkspace(false); setWorkspaceFailure(undefined) }}>{t('form.cancel')}</Button>
              <Button type="button" variant="primary" disabled={addingWorkspace || workspaceInput === undefined} onClick={() => { void submitWorkspace() }}>{addingWorkspace ? t('form.submitPending') : t('version.workspaceAdd')}</Button>
            </div>
          </div>
        : <Button type="button" variant="outline" icon={<IconPlusOutlineRegular />} style={{ alignSelf: 'flex-start' }} onClick={() => { setShowAddWorkspace(true); setWorkspaceFailure(undefined) }}>{t('version.workspaceAdd')}</Button>)}
    </section>}
    {(editing || step === 'refs') && <section style={stack}>
      {!editing && <div style={sectionHeading}><h3 style={sectionHeadingTitle}>{t('version.references')}</h3><span style={hint}>{t('version.allRequired')}</span></div>}
      {(project.config.subProjects === undefined ? [{ id: 'default', name: project.config.name, sources: project.config.sources }] : project.config.subProjects).map(sub => {
        const subId = String(sub.id)
        const selected = project.config.subProjects === undefined || selectedSubProjects.includes(subId)
        return <div key={subId} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {project.config.subProjects !== undefined && <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0', color: COLORS.text, fontSize: 'var(--text-compact-size)' }}>
            <input type="checkbox" checked={selected} onChange={event => setSelectedSubProjects(current => event.target.checked ? [...current, subId] : current.filter(id => id !== subId))} />
            <span style={{ fontWeight: 500 }}>{sub.name}</span>
            <span style={hint}>{String(sub.sources.length)} repos</span>
          </label>}
          {selected && sub.sources.map(source => renderSourceRef(source))}
        </div>
      })}
      <div style={helperStrip}><span style={{ flex: 'none', marginTop: 1, display: 'inline-flex' }}><IconInfoOutlineRegular size={14} /></span><span><b style={{ fontWeight: 500, color: COLORS.text }}>{t('version.lockHelperTitle')}</b> {t('version.lockHelperBody')}</span></div>
    </section>}
    {!editing && step === 'workspace' && <section style={stack}>
      <div style={sectionHeading}><h3 style={sectionHeadingTitle}>{t('version.workspaces')}</h3><span style={hint}>{t('version.workspaceRequired')}</span></div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Button type="button" variant={workspace.mode === 'auto' ? 'primary' : 'outline'} onClick={() => setWorkspace(current => ({ ...current, mode: 'auto' }))}>{t('version.workspaceAuto')}</Button>
        <Button type="button" variant={workspace.mode === 'linked' ? 'primary' : 'outline'} onClick={() => setWorkspace(current => ({ ...current, mode: 'linked' }))}>{t('version.workspaceLinked')}</Button>
      </div>
      {workspace.mode === 'auto' ? <div style={card}>
        <p style={hint}>{t('version.workspaceAutoHint')}</p>
        <label style={field}><span style={fieldLabel}>{t('version.workspaceParentPath')}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <input aria-label={t('version.workspaceParentPath')} placeholder="/home/me/work" value={workspace.parentPath} onChange={event => setWorkspace(current => ({ ...current, parentPath: event.target.value }))} style={{ ...input, flex: 1 }} />
            {pickDirectory !== undefined && <Button type="button" variant="outline" icon={<IconFolderOpenRegular />} onClick={() => { void chooseWorkspaceDirectory('parentPath') }}>{t('workspace.browse')}</Button>}
          </div>
        </label>
        <label style={field}><span style={fieldLabel}>{t('version.workspaceName')}</span>
          <input aria-label={t('version.workspaceName')} placeholder="v0.1-auto" value={workspace.name} onChange={event => setWorkspace(current => ({ ...current, name: event.target.value }))} style={input} />
        </label>
        <label style={field}><span style={fieldLabel}>{t('version.workspaceBranchPrefix')}</span>
          <input aria-label={t('version.workspaceBranchPrefix')} placeholder="loom" value={workspace.branchPrefix} onChange={event => setWorkspace(current => ({ ...current, branchPrefix: event.target.value }))} style={input} />
        </label>
        <p style={hint}>{t('version.workspaceAutoPreview', { root: `${workspace.parentPath === '' ? '<parent>' : workspace.parentPath}/${workspace.name === '' ? '<name>' : workspace.name}`, branch: `${workspace.branchPrefix}/${workspace.name === '' ? '<name>' : workspace.name}` })}</p>
        {workspacePreviewRoot !== undefined && <div style={{ ...card, gap: 5, background: COLORS.panel }}>
          <span style={fieldLabel}>{t('version.workspacePreview')}</span>
          <code style={{ ...mono, color: COLORS.text, overflowWrap: 'anywhere' }}>{workspacePreviewRoot}</code>
          {workspacePreviewRepos.map(({ source, path }) => <code key={source.id} style={{ ...mono, color: COLORS.faint, overflowWrap: 'anywhere' }}>{path}</code>)}
          <span style={hint}>{t('version.workspacePreviewBranch', { branch: `${workspace.branchPrefix}/${workspace.name}` })}</span>
        </div>}
        {workspaceInput === undefined && <p role="alert" style={branchError}><IconInfoOutlineRegular size={13} />{t('version.workspaceInvalid')}</p>}
      </div> : <div style={card}>
        <p style={hint}>{t('version.workspaceLinkedHint')}</p>
        <label style={field}><span style={fieldLabel}>{t('version.workspaceRootPath')}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <input aria-label={t('version.workspaceRootPath')} placeholder="/home/me/existing" value={workspace.rootPath} onChange={event => setWorkspace(current => ({ ...current, rootPath: event.target.value }))} style={{ ...input, flex: 1 }} />
            {pickDirectory !== undefined && <Button type="button" variant="outline" icon={<IconFolderOpenRegular />} onClick={() => { void chooseWorkspaceDirectory('rootPath') }}>{t('workspace.browse')}</Button>}
          </div>
        </label>
        {project.config.sources.map(source => <label key={source.id} style={field}>
          <span style={fieldLabel}>{source.path === '.' ? source.id : source.path} · {source.repo}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <input aria-label={source.id} placeholder={t('version.workspaceRepoPath')} value={workspace.targets[source.id] ?? ''} onChange={event => setWorkspace(current => ({ ...current, targets: { ...current.targets, [source.id]: event.target.value } }))} style={{ ...input, flex: 1 }} />
            {pickDirectory !== undefined && <Button type="button" variant="outline" icon={<IconFolderOpenRegular />} onClick={() => { void chooseWorkspaceDirectory('rootPath', source.id) }}>{t('workspace.browse')}</Button>}
          </div>
        </label>)}
        {workspaceInput === undefined && <p role="alert" style={branchError}><IconInfoOutlineRegular size={13} />{t('version.workspaceInvalid')}</p>}
        <p style={hint}>{t('version.workspaceDetachedHint')}</p>
      </div>}
      <div style={helperStrip}><span style={{ flex: 'none', marginTop: 1, display: 'inline-flex' }}><IconInfoOutlineRegular size={14} /></span><span>{t('version.workspaceLockNote')}</span></div>
    </section>}
    {!editing && step === 'preview' && <section style={stack}>
      <p style={hint}>{t('version.previewHint')}</p>
      {request === undefined ? <p role="alert" style={alert}>{t('form.required')}</p> : <div style={card}>
        <div style={field}><span style={fieldLabel}>{t('version.name')}</span><span>{request.name}</span></div>
        {request.description !== undefined && <div style={field}><span style={fieldLabel}>{t('version.description')}</span><span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{request.description}</span></div>}
        <div style={field}><span style={fieldLabel}>{t('version.repositories')}</span>
          {request.sources.map(entry => <div key={entry.sourceId} style={previewRow}>
            <span style={{ color: COLORS.text, overflowWrap: 'anywhere' }}>{sourceFor(entry.sourceId)?.path ?? entry.sourceId}</span>
            <span style={{ color: COLORS.faint, fontFamily: 'ui-monospace, monospace' }}>{entry.ref}</span>
          </div>)}
        </div>
        <div style={field}><span style={fieldLabel}>{t('version.workspaces')}</span>
          {(request.workspaces ?? []).map((workspace, index) => <div key={index} style={previewRow}>
            <span style={{ color: COLORS.text }}>{workspace.mode === 'auto' ? `${workspace.parentPath}/${workspace.name}` : workspace.rootPath}</span>
            <span style={{ color: COLORS.faint, fontFamily: 'ui-monospace, monospace' }}>{workspace.mode === 'auto' ? `${workspace.branchPrefix ?? 'loom'}/${workspace.name}` : `${String(workspace.repositories.length)} repos`}</span>
          </div>)}
          {(request.workspaces ?? []).length === 0 && <span style={hint}>{t('version.workspaceRequired')}</span>}
        </div>
        <div style={field}><span style={fieldLabel}>{t('lock.title')}</span><span style={hint}>{t('version.previewHint')}</span></div>
      </div>}
    </section>}
    <div style={footer}>
      <Button type="button" variant="ghost" disabled={busy} onClick={close}>{t('form.cancel')}</Button>
      <span style={footerSpacer} />
      {!editing && stepIndex > 0 && <Button type="button" variant="outline" icon={<IconChevronLeftOutlineRegular />} onClick={back}>{t('form.back')}</Button>}
      <Button type="submit" variant="primary" className="loom-primary" disabled={busy || workspaceFailure !== undefined || (!editing && step !== 'preview' && !canVisit(VERSION_STEPS[stepIndex + 1]?.key ?? 'preview'))}>{primaryLabel}</Button>
    </div>
  </form>
}

interface TaskFormProps {
  t: Translate
  version: VersionRecord
  project: ProjectRecord
  /** Ready workspaces bound to the version; required for V2 task creation. */
  workspaces?: readonly { readonly id: string; readonly label?: string | undefined; readonly rootPath?: string | undefined; readonly path: string }[] | undefined
  create(request: CreateTaskRequest): Promise<RemoteResult<TaskRecord>>
  update?(request: UpdateTaskRequest): Promise<RemoteResult<TaskRecord>>
  task?: TaskRecord
  onCreated(task: TaskRecord): void
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onBusyChange?: (busy: boolean) => void
}

/** One task-creation step. */
type TaskStep = 'content' | 'scope' | 'preview'

const TASK_STEPS: readonly { readonly key: TaskStep; readonly label: LoomKey }[] = [
  { key: 'content', label: 'task.step.content' },
  { key: 'scope', label: 'task.step.scope' },
  { key: 'preview', label: 'task.step.preview' },
]
const PRIORITY_LABEL: Readonly<Record<TaskPriority, LoomKey>> = { low: 'task.priority.low', normal: 'task.priority.normal', high: 'task.priority.high' }

/** Create or edit one task under the selected version. */
export function TaskForm({ t, version, project, workspaces, create, update, task, onCreated, open: controlledOpen, onOpenChange, onBusyChange }: TaskFormProps) {
  const editing = task !== undefined
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = (value: boolean): void => { setInternalOpen(value); onOpenChange?.(value) }
  const [step, setStep] = useState<TaskStep>('content')
  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'normal')
  const [moduleIds, setModuleIds] = useState<string[]>([...(task?.moduleIds ?? [])])
  const [workspaceId, setWorkspaceId] = useState<string>(workspaces?.[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const reportBusy = (value: boolean): void => { setBusy(value); onBusyChange?.(value) }
  const [failure, setFailure] = useState<string>()
  if (!open) return editing ? null : <Button variant="outline" icon={<IconPlusOutlineRegular />} onClick={() => setOpen(true)}>{t('task.new')}</Button>
  const request = taskRequest(version, title, { description, priority, moduleIds }, workspaceId)
  const stepIndex = TASK_STEPS.findIndex(candidate => candidate.key === step)
  const titleReady = title.trim() !== ''
  function canVisit(candidate: TaskStep): boolean {
    if (candidate === 'content') return true
    if (candidate === 'scope') return titleReady && (workspaces === undefined || workspaces.length > 0)
    return request !== undefined
  }
  function goTo(candidate: TaskStep): void {
    if (!canVisit(candidate)) return
    setStep(candidate); setFailure(undefined)
  }
  function advance(): boolean {
    const candidate = TASK_STEPS[stepIndex + 1]
    if (candidate === undefined || !canVisit(candidate.key)) return false
    goTo(candidate.key)
    return true
  }
  function back(): void {
    const candidate = TASK_STEPS[stepIndex - 1]
    if (candidate !== undefined) setStep(candidate.key)
  }
  function close(): void { setOpen(false); setFailure(undefined) }
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
        ? update === undefined ? undefined : await update({
          taskId: task.id,
          title: request.title,
          ...(request.description === undefined ? {} : { description: request.description }),
          ...(request.moduleIds === undefined ? {} : { moduleIds: request.moduleIds }),
          ...(request.priority === undefined ? {} : { priority: request.priority }),
        })
        : await create(request)
      if (result === undefined || !result.ok) { setFailure(result === undefined ? t('state.error') : result.error.message); return }
      close(); onCreated(result.value)
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error))
    } finally { reportBusy(false) }
  }
  const primaryLabel = busy ? t('form.submitPending') : !editing && step !== 'preview' ? t('form.next') : editing ? t('form.save') : t('form.create')
  const selectedModules = project.config.modules.filter(module => moduleIds.includes(module.id))
  return <form style={formStyle} onSubmit={event => { void submit(event) }}>
    {!editing && <LoomWizardSteps t={t} steps={TASK_STEPS} current={step} ariaLabel="task.steps" canVisit={canVisit} onSelect={goTo} />}
    {(editing || step === 'content') && <section style={stack}>
      <label style={field}><span style={fieldLabel}>{t('task.name')}</span>
        <input aria-label={t('task.name')} placeholder={t('task.name')} value={title} onChange={event => setTitle(event.target.value)} style={input} />
      </label>
      <label style={field}><span style={fieldLabel}>{t('task.description')}</span>
        <textarea aria-label={t('task.description')} placeholder={t('task.description')} value={description} maxLength={4000} rows={6} onChange={event => setDescription(event.target.value)} style={textarea} />
      </label>
    </section>}
    {(editing || step === 'scope') && <section style={stack}>
      <p style={hint}>{t('task.draftHint')}</p>
      {!editing && <label style={field}><span style={fieldLabel}>{t('task.workspace')}</span>
        {workspaces === undefined || workspaces.length === 0
          ? <p role="alert" style={alert}>{t('task.workspaceRequired')}</p>
          : <LoomSelect
            block
            ariaLabel={t('task.workspace')}
            value={workspaceId}
            options={workspaces.map(workspace => ({ value: workspace.id, label: workspace.label ?? workspace.rootPath ?? workspace.path }))}
            onChange={value => setWorkspaceId(value)}
          />}
      </label>}
      <label style={field}><span style={fieldLabel}>{t('task.priority')}</span>
        <LoomSelect
          block
          ariaLabel={t('task.priority')}
          value={priority}
          options={[{ value: 'low', label: t('task.priority.low') }, { value: 'normal', label: t('task.priority.normal') }, { value: 'high', label: t('task.priority.high') }]}
          onChange={value => setPriority(value as TaskPriority)}
        />
      </label>
      <div style={field}>
        <span style={fieldLabel}>{t('task.modules')}</span>
        {project.config.modules.length === 0 && <p style={hint}>{t('task.noModules')}</p>}
        {project.config.modules.map(module => <label key={module.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 'var(--dsw-radius-sm)', border: `0.5px solid ${COLORS.border}`, background: COLORS.panel2, color: COLORS.dim, fontSize: 'var(--text-compact-size)' }}>
          <input type="checkbox" checked={moduleIds.includes(module.id)} onChange={event => setModuleIds(current => event.target.checked ? [...current, module.id] : current.filter(id => id !== module.id))} />
          <span style={{ color: COLORS.text }}>{module.path}</span>
          <span style={{ marginLeft: 'auto', color: COLORS.faint, fontFamily: 'ui-monospace, monospace', fontSize: 'var(--text-small-size)' }}>{module.id}</span>
        </label>)}
      </div>
    </section>}
    {!editing && step === 'preview' && <section style={stack}>
      <p style={hint}>{t('task.draftHint')}</p>
      {request === undefined ? <p role="alert" style={alert}>{t('form.required')}</p> : <div style={card}>
        <div style={field}><span style={fieldLabel}>{t('task.name')}</span><span>{request.title}</span></div>
        <div style={field}><span style={fieldLabel}>{t('task.version')}</span><span>{version.name}</span></div>
        <div style={field}><span style={fieldLabel}>{t('task.priority')}</span><span>{t(PRIORITY_LABEL[request.priority ?? 'normal'])}</span></div>
        <div style={field}><span style={fieldLabel}>{t('task.modules')}</span>
          {selectedModules.length === 0 ? <span style={hint}>{t('task.noModules')}</span> : selectedModules.map(module => <div key={module.id} style={previewRow}>
            <span style={{ color: COLORS.text, overflowWrap: 'anywhere' }}>{module.path}</span>
            <span style={{ color: COLORS.faint, fontFamily: 'ui-monospace, monospace' }}>{module.id}</span>
          </div>)}
        </div>
        {request.description !== undefined && <div style={field}><span style={fieldLabel}>{t('task.description')}</span><span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{request.description}</span></div>}
      </div>}
    </section>}
    {failure !== undefined && <FailureNotice failure={failure} t={t} />}
    <div style={footer}>
      <Button type="button" variant="ghost" disabled={busy} onClick={close}>{t('form.cancel')}</Button>
      <span style={footerSpacer} />
      {!editing && stepIndex > 0 && <Button type="button" variant="outline" icon={<IconChevronLeftOutlineRegular />} onClick={back}>{t('form.back')}</Button>}
      {!editing && step === 'scope' && <Button type="button" variant="ghost" onClick={() => goTo('preview')}>{t('form.skip')}</Button>}
      <Button type="submit" variant="primary" className="loom-primary" disabled={busy || (!editing && step !== 'preview' && !canVisit(TASK_STEPS[stepIndex + 1]?.key ?? 'preview'))}>{primaryLabel}</Button>
    </div>
  </form>
}

/** One imported project file's admitted configuration or a structured rejection. */
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
