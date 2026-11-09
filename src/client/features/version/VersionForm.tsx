import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Button, IconChevronLeftOutlineRegular, IconFolderOpenRegular, IconInfoOutlineRegular, IconPlusOutlineRegular } from '../../ui/primitives.ts'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { CreateVersionRequest, ProjectRecord, SourceConfig, VersionRecord, VersionWorkspaceInput, WorkspaceRecord, UpdateVersionRequest, RepositoryBranches, RepositoryBranchesRequest } from 'dsh-workloom/types'
import { autoWorkspaceRepositoryPath } from '../../../domain/workspace.ts'
import { VERSION_DESCRIPTION_MAX_CHARS } from '../../../shared/version-context.ts'
import { COLORS } from '../../ui/tokens.ts'
import { failureKey, thrownFailureReport } from '../../ui/failure.ts'
import { LoomWizardSteps } from '../forms/LoomWizardSteps.tsx'
import { LoomSelect } from '../../ui/Select.tsx'
import type { LoomKey } from '../../shared/locales.ts'
import { alert, branchCard, branchError, branchPath, branchPathNote, branchPathText, branchTag, branchTagEmpty, branchTop, card, field, fieldLabel, footer, footerSpacer, formStyle, helperStrip, hint, input, mono, previewRow, sectionHeading, sectionHeadingTitle, stack, textarea, workspaceActions, workspaceCard, workspaceConfirm, workspaceConfirmActions, workspaceConfirmText, workspaceCopy, workspaceList, workspaceMeta, workspacePath, workspaceTitle } from '../forms/styles.ts'
import { FailureNotice } from '../forms/FailureNotice.tsx'
import { versionRequest, workspaceDraftInput, type WorkspaceDraft } from '../forms/drafts.ts'
import { Translate } from '../forms/types.ts'
import { BranchPicker } from '../forms/fields.tsx'
import { ReuseWorkspacePicker, type ReuseWorkspaceOption } from './ReuseWorkspacePicker.tsx'

interface VersionFormProps {
  t: Translate
  project: ProjectRecord
  listBranches?: (request: RepositoryBranchesRequest) => Promise<RemoteResult<RepositoryBranches>>
  /** Optional native directory picker used by workspace inputs. */
  pickDirectory?: (startPath?: string) => Promise<string | null>
  /** Finished direct workspaces of this project that another version can adopt. */
  readonly reuseCandidates?: readonly ReuseWorkspaceOption[] | undefined
  /** Retire an old workspace and bind its directories to this version. */
  readonly reuseWorkspace?: ((workspaceId: string) => Promise<RemoteResult<WorkspaceRecord>>) | undefined
  /** Create the version and bind one reused workspace to its first Lock. */
  readonly createReusingWorkspace?: ((request: CreateVersionRequest, workspaceId: string) => Promise<RemoteResult<VersionRecord>>) | undefined
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
export function VersionForm({ t, project, listBranches, pickDirectory, boundWorkspaces, otherWorkspaces, reuseCandidates, reuseWorkspace, createReusingWorkspace, create, update, version, onCreated, addWorkspace, renameWorkspace, deleteWorkspace, cleanupWorkspace, onWorkspaceAdded, open: controlledOpen, onOpenChange, onBusyChange, onStepChange }: VersionFormProps) {
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
  const [workspaceSourceMode, setWorkspaceSourceMode] = useState<'new' | 'copy' | 'reuse'>('new')
  const [workspaceSourceId, setWorkspaceSourceId] = useState('')
  const [reuseWorkspaceId, setReuseWorkspaceId] = useState('')
  const [reuseFailure, setReuseFailure] = useState<string>()
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
  // Reuse targets must cover the sub-projects this wizard currently selects.
  const eligibleReuseCandidates = (reuseCandidates ?? []).filter(candidate => candidate.sourceIds === undefined
    || selectedSources.every(source => candidate.sourceIds!.includes(source.id)))
  const workspaces = workspaceInput === undefined ? [] : [workspaceInput]
  const request = versionRequest(project, name, refs, description, workspaces, selectedSubProjects)
  const stepIndex = VERSION_STEPS.findIndex(candidate => candidate.key === step)
  const nameReady = name.trim() !== '' && !descriptionTooLong
  function canVisit(candidate: VersionStep): boolean {
    if (candidate === 'name') return true
    if (candidate === 'refs') return nameReady
    if (candidate === 'workspace') return versionRequest(project, name, refs, description, [], selectedSubProjects) !== undefined
    // Creating a version binds at least one workspace (the copy says so), and
    // an empty workspace draft would leave the version with no place to run.
    if (candidate === 'preview') {
      if (editing) return request !== undefined
      if (workspace.mode === 'reuse') return request !== undefined && createReusingWorkspace !== undefined && reuseWorkspaceId !== ''
      return request !== undefined && workspaceInput !== undefined
    }
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
        : workspace.mode === 'reuse' && createReusingWorkspace !== undefined
          ? await createReusingWorkspace(request, reuseWorkspaceId)
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
  function localizedFailure(code: string, message: string): string {
    const key = failureKey(code) ?? failureKey(message)
    return key === undefined ? (code === '' ? message : `${code}: ${message}`) : t(key)
  }
  async function submitReuse(): Promise<void> {
    if (reuseWorkspace === undefined || reuseWorkspaceId === '') return
    setAddingWorkspace(true); setReuseFailure(undefined)
    try {
      const result = await reuseWorkspace(reuseWorkspaceId)
      if (!result.ok) { setReuseFailure(localizedFailure(result.error.code, result.error.message)); return }
      setShowAddWorkspace(false); setReuseWorkspaceId(''); onWorkspaceAdded?.()
    } catch (error) {
      setReuseFailure(localizedFailure('', thrownFailureReport(error).detail ?? (error instanceof Error ? error.message : String(error))))
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
              if (workspaceSourceMode === 'reuse') void submitReuse()
              else void submitWorkspace()
            }
          }}>
            {workspaceFailureLabel !== undefined && <div role="alert" aria-live="polite" ref={workspaceErrorRef} style={{ ...branchError, flexDirection: 'column', alignItems: 'flex-start' }}>
              <span>{workspaceFailureLabel}</span>
              {workspaceFailure !== workspaceFailureLabel && <code style={{ ...mono, color: COLORS.faint, overflowWrap: 'anywhere' }}>{workspaceFailure}</code>}
            </div>}
            <div style={{ display: 'flex', gap: 4, padding: 3, background: COLORS.panel2, border: `0.5px solid ${COLORS.border}`, borderRadius: 7, marginBottom: 2 }}>
              <Button type="button" variant={workspaceSourceMode === 'new' ? 'primary' : 'ghost'} style={{ flex: 1 }} onClick={() => setWorkspaceSourceMode('new')}>{t('version.workspaceNew')}</Button>
              <Button type="button" variant={workspaceSourceMode === 'copy' ? 'primary' : 'ghost'} style={{ flex: 1 }} disabled={(otherWorkspaces ?? []).length === 0} onClick={() => setWorkspaceSourceMode('copy')}>{t('version.workspaceFromVersion')}</Button>
              <Button type="button" variant={workspaceSourceMode === 'reuse' ? 'primary' : 'ghost'} style={{ flex: 1 }} disabled={reuseWorkspace === undefined || (reuseCandidates ?? []).length === 0} onClick={() => { setWorkspaceSourceMode('reuse'); setReuseFailure(undefined) }}>{t('version.workspaceReuse')}</Button>
            </div>
            {workspaceSourceMode === 'reuse' && (reuseCandidates ?? []).length === 0 && <p style={hint}>{t('version.workspaceReuseEmpty')}</p>}
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
            {workspaceSourceMode === 'reuse'
              ? <ReuseWorkspacePicker t={t} options={reuseCandidates ?? []} value={reuseWorkspaceId} onChange={value => { setReuseWorkspaceId(value); setReuseFailure(undefined) }} failure={reuseFailure} />
              : <>
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
            </>}
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <Button type="button" variant="ghost" onClick={() => { setShowAddWorkspace(false); setWorkspaceFailure(undefined); setReuseFailure(undefined) }}>{t('form.cancel')}</Button>
              {workspaceSourceMode === 'reuse'
                ? <Button type="button" variant="primary" disabled={addingWorkspace || reuseWorkspaceId === ''} onClick={() => { void submitReuse() }}>{addingWorkspace ? t('form.submitPending') : t('version.workspaceReuseAction')}</Button>
                : <Button type="button" variant="primary" disabled={addingWorkspace || workspaceInput === undefined} onClick={() => { void submitWorkspace() }}>{addingWorkspace ? t('form.submitPending') : t('version.workspaceAdd')}</Button>}
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
        <Button type="button" variant={workspace.mode === 'reuse' ? 'primary' : 'outline'} disabled={createReusingWorkspace === undefined || eligibleReuseCandidates.length === 0} onClick={() => setWorkspace(current => ({ ...current, mode: 'reuse' }))}>{t('version.workspaceReuse')}</Button>
      </div>
      {createReusingWorkspace !== undefined && (reuseCandidates ?? []).length === 0 && <p style={hint}>{t('version.workspaceReuseEmpty')}</p>}
      {createReusingWorkspace !== undefined && (reuseCandidates ?? []).length > 0 && eligibleReuseCandidates.length === 0 && <p style={hint}>{t('version.workspaceReuseIncomplete')}</p>}
      {workspace.mode === 'reuse'
        ? <ReuseWorkspacePicker t={t} options={eligibleReuseCandidates} value={reuseWorkspaceId} onChange={value => setReuseWorkspaceId(value)} failure={reuseFailure} />
        : workspace.mode === 'auto' ? <div style={card}>
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
          {workspace.mode === 'reuse' && <div style={previewRow}>
            <span style={{ color: COLORS.text }}>{eligibleReuseCandidates.find(candidate => candidate.id === reuseWorkspaceId)?.label ?? reuseWorkspaceId}</span>
            <span style={{ color: COLORS.faint }}>{t('version.workspaceReusePreview')}</span>
          </div>}
          {(request.workspaces ?? []).map((workspaceDraft, index) => <div key={index} style={previewRow}>
            <span style={{ color: COLORS.text }}>{workspaceDraft.mode === 'auto' ? `${workspaceDraft.parentPath}/${workspaceDraft.name}` : workspaceDraft.rootPath}</span>
            <span style={{ color: COLORS.faint, fontFamily: 'ui-monospace, monospace' }}>{workspaceDraft.mode === 'auto' ? `${workspaceDraft.branchPrefix ?? 'loom'}/${workspaceDraft.name}` : `${String(workspaceDraft.repositories.length)} repos`}</span>
          </div>)}
          {(request.workspaces ?? []).length === 0 && workspace.mode !== 'reuse' && <span style={hint}>{t('version.workspaceRequired')}</span>}
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

