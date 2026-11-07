/** Onboarding card shown when no task/workbench is selected. */
import { IconPlusOutlineRegular, Button } from '../../ui/primitives.ts'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { GenerateLockRequest, Lock, ProjectRecord, TaskRecord, VersionRecord } from 'dsh-workloom/types'
import { LockButton } from '../version/LockButton.tsx'
import { COLORS } from '../../ui/tokens.ts'
import type { Translate } from '../forms/types.ts'
import { type LoomKey } from '../../shared/locales.ts'

export function NextStepCard({ t, projects, project, versions, version, locks, tasks, onCreateProject, onCreateVersion, onCreateTask, onSelectProject, onSelectVersion, onSelectTask, generateLock, onLockChanged }: {
  t: Translate
  projects: readonly ProjectRecord[]
  project: ProjectRecord | undefined
  versions: readonly VersionRecord[]
  version: VersionRecord | undefined
  locks: readonly Lock[]
  tasks: readonly TaskRecord[]
  onCreateProject: () => void
  onCreateVersion: () => void
  onCreateTask: () => void
  onSelectProject: (record: ProjectRecord) => void
  onSelectVersion: (record: VersionRecord) => void
  onSelectTask: (record: TaskRecord) => void
  generateLock: (request: GenerateLockRequest) => Promise<RemoteResult<Lock>>
  onLockChanged: () => void
}) {
  const stage = project === undefined ? 0 : versions.length === 0 ? 1 : version === undefined ? 1 : locks.length === 0 ? 2 : tasks.length === 0 ? 3 : 4
  const steps: readonly { readonly key: LoomKey; readonly done: boolean }[] = [
    { key: 'project.title', done: project !== undefined },
    { key: 'version.title', done: versions.length > 0 },
    { key: 'lock.title', done: locks.length > 0 },
    { key: 'task.title', done: tasks.length > 0 },
  ]
  return <div style={{ width: '100%', maxWidth: 560, background: COLORS.panel2, border: `0.5px solid ${COLORS.border}`, borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ color: COLORS.accent, fontSize: 'var(--text-stat-size)' }}>🧶</span>
        <strong style={{ fontSize: 'var(--text-h2-size)', fontWeight: 500, color: COLORS.text }}>{t('onboard.title')}</strong>
      </div>
      <p style={{ margin: 0, color: COLORS.dim, fontSize: 'var(--text-compact-size)', lineHeight: 1.6 }}>{t(stage === 0 ? 'onboard.projectHint' : stage === 1 ? 'onboard.versionHint' : stage === 2 ? 'onboard.lockHint' : stage === 3 ? 'onboard.taskHint' : 'onboard.done')}</p>
    </div>
    <ol aria-label={t('onboard.steps')} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', listStyle: 'none', gap: 0, padding: 0, margin: 0 }}>
      {steps.map((step, index) => {
        const current = index === stage
        return <li key={step.key} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 0 }}>
          {index > 0 && <span aria-hidden style={{ position: 'absolute', top: 10, right: '50%', width: '100%', height: 1, background: step.done || current ? COLORS.accent : COLORS.border }} />}
          <span style={{ position: 'relative', zIndex: 1, width: 22, height: 22, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--text-label-size)', fontWeight: 500, background: step.done || current ? COLORS.accent : COLORS.panel3, color: step.done || current ? 'var(--dsw-alias-label-primary-foreground)' : COLORS.dim, border: `1px solid ${step.done || current ? COLORS.accent : COLORS.border}` }}>{step.done ? '✓' : String(index + 1)}</span>
          <span style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: current ? COLORS.text : COLORS.dim, fontSize: 'var(--text-small-size)', fontWeight: current ? 600 : 400 }}>{t(step.key)}</span>
        </li>
      })}
    </ol>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      {project === undefined && projects.length > 0 && <>
        <span style={{ color: COLORS.dim, fontSize: 'var(--text-compact-size)' }}>{t('onboard.selectProject')}</span>
        {projects.slice(0, 4).map(record => <Button key={record.id} size="sm" variant="outline" onClick={() => onSelectProject(record)}>{record.config.name}</Button>)}
        <Button size="sm" variant="ghost" icon={<IconPlusOutlineRegular />} onClick={onCreateProject}>{t('project.new')}</Button>
      </>}
      {project === undefined && projects.length === 0 && <Button variant="primary" className="loom-primary" icon={<IconPlusOutlineRegular />} onClick={onCreateProject}>{t('project.new')}</Button>}
      {project !== undefined && versions.length === 0 && <Button variant="primary" className="loom-primary" icon={<IconPlusOutlineRegular />} onClick={onCreateVersion}>{t('version.new')}</Button>}
      {project !== undefined && versions.length > 0 && version === undefined && <>
        <span style={{ color: COLORS.dim, fontSize: 'var(--text-compact-size)' }}>{t('onboard.selectVersion')}</span>
        {versions.map(record => <Button key={record.id} size="sm" variant="outline" onClick={() => onSelectVersion(record)}>{record.name}</Button>)}
        <Button size="sm" variant="ghost" icon={<IconPlusOutlineRegular />} onClick={onCreateVersion}>{t('version.new')}</Button>
      </>}
      {version !== undefined && locks.length === 0 && <LockButton t={t} version={version} generate={generateLock} onCreated={onLockChanged} />}
      {version !== undefined && locks.length > 0 && tasks.length === 0 && <Button variant="primary" className="loom-primary" icon={<IconPlusOutlineRegular />} onClick={onCreateTask}>{t('task.new')}</Button>}
      {version !== undefined && locks.length > 0 && tasks.length > 0 && <>
        <span style={{ color: COLORS.dim, fontSize: 'var(--text-compact-size)' }}>{t('onboard.chooseTask')}</span>
        {tasks.slice(-3).reverse().map(record => <Button key={record.id} size="sm" variant="outline" onClick={() => onSelectTask(record)}>{record.title}</Button>)}
        <Button size="sm" variant="ghost" icon={<IconPlusOutlineRegular />} onClick={onCreateTask}>{t('task.new')}</Button>
      </>}
    </div>
  </div>
}

