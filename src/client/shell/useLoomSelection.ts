/**
 * Route/selection transitions shared by the tree, palette, board and Session
 * lists. Selecting a task or Session also aligns project/version context.
 */
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { CatalogSnapshot, ProjectRecord, TaskRecord, VersionRecord } from 'dsh-workloom/types'
import type { ActiveSession } from '../shared/projection.ts'
import type { LoomPaletteItem } from '../features/palette/palette.ts'
import type { LoomRoute } from './router.ts'
import type { CreateKind } from '../features/dialogs/LoomFormDialogs.tsx'

/** Inputs for {@link useLoomSelection}. */
export interface LoomSelectionInput {
  readonly snapshot: CatalogSnapshot | undefined
  readonly boundRows: readonly ActiveSession[]
  readonly selected: SessionId | undefined
  readonly displayVersion: VersionRecord | undefined
  readonly displayVersionProject: ProjectRecord | undefined
  readonly setProject: (id: CatalogSnapshot['projects'][number]['id'] | undefined) => void
  readonly setVersion: (id: CatalogSnapshot['versions'][number]['id'] | undefined) => void
  readonly setTask: (task: TaskRecord | undefined) => void
  readonly setSelected: (id: SessionId | undefined) => void
  readonly setExecutionSession: (id: SessionId | undefined) => void
  readonly setView: (view: 'workbench' | 'kanban') => void
  readonly setPaletteOpen: (open: boolean) => void
  readonly navigate: (route: LoomRoute) => void
  readonly retrySession: () => void
  readonly openCreate: (kind: CreateKind) => void
}

/** Selection actions consumed by the shell. */
export interface LoomSelection {
  readonly selectTask: (record: TaskRecord) => void
  readonly selectSession: (id: SessionId, owner?: TaskRecord) => void
  readonly activatePaletteItem: (item: LoomPaletteItem) => void
  readonly openAttemptSession: (id: string) => void
  readonly createTaskForVersion: () => void
}

/**
 * Own cross-route selection transitions.
 *
 * @param input - catalog, current selection, setters and navigation callbacks.
 * @returns selection actions.
 */
export function useLoomSelection(input: LoomSelectionInput): LoomSelection {
  const {
    snapshot, boundRows, selected, displayVersion, displayVersionProject,
    setProject, setVersion, setTask, setSelected, setExecutionSession,
    setView, setPaletteOpen, navigate, retrySession, openCreate,
  } = input
  const selectTask = (record: TaskRecord): void => {
    if (snapshot !== undefined) {
      const owner = snapshot.versions.find(candidate => candidate.id === record.versionId)
      if (owner !== undefined) { setProject(owner.projectId); setVersion(owner.id) }
    }
    setTask(record)
    setSelected(undefined)
    setExecutionSession(undefined)
    setView('workbench')
    navigate('task')
  }
  const selectSession = (id: SessionId, owner?: TaskRecord): void => {
    const bound = boundRows.find(row => row.sessionId === id)
    const nextTask = owner ?? bound?.task
    if (nextTask !== undefined) {
      setTask(nextTask)
      const nextVersion = snapshot?.versions.find(candidate => candidate.id === nextTask.versionId)
      if (nextVersion !== undefined) { setProject(nextVersion.projectId); setVersion(nextVersion.id) }
    }
    setSelected(id); setView('workbench')
    navigate('session')
  }
  const activatePaletteItem = (item: LoomPaletteItem): void => {
    setPaletteOpen(false)
    const target = item.target
    if (target.kind === 'page') { navigate(target.route); return }
    if (target.kind === 'project') { setProject(target.projectId); setVersion(undefined); setTask(undefined); setSelected(undefined); navigate('project'); return }
    if (target.kind === 'version') { setProject(target.projectId); setVersion(target.versionId); setTask(undefined); setSelected(undefined); navigate('project'); return }
    if (target.kind === 'task') {
      const record = snapshot?.tasks.find(task => task.id === target.taskId)
      if (record !== undefined) { selectTask(record); navigate('task') }
      return
    }
    const owner = snapshot?.tasks.find(task => task.attempts.some(attempt => attempt.sessionIds.includes(target.sessionId)))
    selectSession(target.sessionId, owner)
    navigate('session')
  }
  const openAttemptSession = (id: string): void => {
    if (id === selected) retrySession()
    else setSelected(id as SessionId)
    setView('workbench')
  }
  const createTaskForVersion = (): void => {
    if (displayVersionProject !== undefined) setProject(displayVersionProject.id)
    if (displayVersion !== undefined) setVersion(displayVersion.id)
    openCreate('task')
  }
  return { selectTask, selectSession, activatePaletteItem, openAttemptSession, createTaskForVersion }
}
