/**
 * Tree delete actions shared by the project tree, context panel and confirm
 * dialog. Deleting a project also clears its pinned/filter/selection state.
 */
import { useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { ProjectRecord, TaskRecord, VersionRecord } from 'dsh-workloom/types'
import type { LoomHostPort } from '../../ports/loom-host.ts'
import type { FailureReport } from '../ui/failure.ts'
import { failureReport, thrownFailureReport } from '../ui/failure.ts'

/** Inputs for {@link useLoomTreeDelete}. */
export interface LoomTreeDeleteInput {
  readonly deleteProject: LoomHostPort['deleteProject']
  readonly deleteVersion: LoomHostPort['deleteVersion']
  readonly deleteTask: LoomHostPort['deleteTask']
  readonly filterProject: string
  readonly filterVersion: string
  readonly setFilterProject: (value: string) => void
  readonly setFilterVersion: (value: string) => void
  readonly setPinnedProjects: Dispatch<SetStateAction<ProjectRecord['id'][]>>
  readonly setProject: (value: ProjectRecord['id'] | undefined) => void
  readonly setVersion: (value: VersionRecord['id'] | undefined) => void
  readonly setTask: (value: TaskRecord | undefined) => void
  readonly setSelected: (value: undefined) => void
  readonly onChanged: () => void
}

/** Tree delete state and actions. */
export interface LoomTreeDelete {
  readonly treeDelete: ProjectRecord | undefined
  readonly treeDeleting: boolean
  readonly treeDeleteFailure: FailureReport | undefined
  readonly requestDelete: (project: ProjectRecord) => void
  readonly clearDelete: () => void
  readonly clearDeleteFailure: () => void
  readonly confirmDelete: () => Promise<void>
  readonly removeProject: (target: ProjectRecord) => Promise<RemoteResult<void>>
  readonly removeVersion: (target: VersionRecord) => Promise<RemoteResult<void>>
  readonly removeTask: (target: TaskRecord) => Promise<RemoteResult<void>>
}

/**
 * Own the tree deletion dialog and its remote mutations.
 *
 * @param input - delete ports, selection/filter setters and refresh callback.
 * @returns dialog state plus deletion actions.
 */
export function useLoomTreeDelete(input: LoomTreeDeleteInput): LoomTreeDelete {
  const {
    deleteProject, deleteVersion, deleteTask, filterProject, filterVersion,
    setFilterProject, setFilterVersion, setPinnedProjects,
    setProject, setVersion, setTask, setSelected, onChanged,
  } = input
  const [treeDelete, setTreeDelete] = useState<ProjectRecord>()
  const [treeDeleting, setTreeDeleting] = useState(false)
  const [treeDeleteFailure, setTreeDeleteFailure] = useState<FailureReport>()
  const removeProject = async (target: ProjectRecord): Promise<RemoteResult<void>> => {
    const result = await deleteProject({ projectId: target.id })
    if (result.ok) {
      setPinnedProjects(current => current.filter(id => id !== target.id))
      if (filterProject === target.id) setFilterProject('')
      setFilterVersion('')
      setProject(undefined); setVersion(undefined); setTask(undefined); setSelected(undefined)
      onChanged()
    }
    return result
  }
  const removeVersion = async (target: VersionRecord): Promise<RemoteResult<void>> => {
    const result = await deleteVersion({ versionId: target.id })
    if (result.ok) {
      if (filterVersion === target.id) setFilterVersion('')
      setVersion(undefined); setTask(undefined); setSelected(undefined)
      onChanged()
    }
    return result
  }
  const removeTask = async (target: TaskRecord): Promise<RemoteResult<void>> => {
    const result = await deleteTask({ taskId: target.id })
    if (result.ok) {
      setTask(undefined); setSelected(undefined)
      onChanged()
    }
    return result
  }
  const requestDelete = (project: ProjectRecord): void => {
    setTreeDelete(project)
    setTreeDeleteFailure(undefined)
  }
  const clearDelete = (): void => { setTreeDelete(undefined) }
  const clearDeleteFailure = (): void => { setTreeDeleteFailure(undefined) }
  const confirmDelete = async (): Promise<void> => {
    if (treeDelete === undefined) return
    setTreeDeleting(true); setTreeDeleteFailure(undefined)
    try {
      const result = await removeProject(treeDelete)
      if (result.ok) setTreeDelete(undefined)
      else setTreeDeleteFailure(failureReport(result.error.code, result.error.message))
    } catch (error) {
      setTreeDeleteFailure(thrownFailureReport(error))
    } finally {
      setTreeDeleting(false)
    }
  }
  return { treeDelete, treeDeleting, treeDeleteFailure, requestDelete, clearDelete, clearDeleteFailure, confirmDelete, removeProject, removeVersion, removeTask }
}
