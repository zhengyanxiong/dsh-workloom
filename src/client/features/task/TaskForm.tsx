import { useState, type FormEvent } from 'react'
import { Button, IconChevronLeftOutlineRegular, IconPlusOutlineRegular } from '../../ui/primitives.ts'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { CreateTaskRequest, ProjectRecord, TaskRecord, TaskPriority, VersionRecord, UpdateTaskRequest } from 'dsh-workloom/types'
import { COLORS } from '../../ui/tokens.ts'
import { LoomWizardSteps } from '../forms/LoomWizardSteps.tsx'
import { LoomSelect } from '../../ui/Select.tsx'
import type { LoomKey } from '../../shared/locales.ts'
import { alert, card, field, fieldLabel, footer, footerSpacer, formStyle, hint, input, previewRow, stack, textarea } from '../forms/styles.ts'
import { FailureNotice } from '../forms/FailureNotice.tsx'
import { taskRequest } from '../forms/drafts.ts'
import { Translate } from '../forms/types.ts'

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
