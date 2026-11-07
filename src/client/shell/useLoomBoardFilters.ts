/** Filter state for the board and list views. */
import { useState, type Dispatch, type SetStateAction } from 'react'
import type { TaskPriority, TaskRecord } from 'dsh-workloom/types'

/** Board filter values and their setters. */
export interface LoomBoardFilters {
  readonly filterProject: string
  readonly filterVersion: string
  readonly filterStatus: TaskRecord['status'] | ''
  readonly filterPriority: TaskPriority | ''
  readonly filterModule: string
  readonly kbSearch: string
  readonly setFilterProject: Dispatch<SetStateAction<string>>
  readonly setFilterVersion: Dispatch<SetStateAction<string>>
  readonly setFilterStatus: Dispatch<SetStateAction<TaskRecord['status'] | ''>>
  readonly setFilterPriority: Dispatch<SetStateAction<TaskPriority | ''>>
  readonly setFilterModule: Dispatch<SetStateAction<string>>
  readonly setKbSearch: Dispatch<SetStateAction<string>>
}

/**
 * Own the board filter inputs.
 * @returns filter values and setters.
 */
export function useLoomBoardFilters(): LoomBoardFilters {
  const [filterProject, setFilterProject] = useState('')
  const [filterVersion, setFilterVersion] = useState('')
  const [filterStatus, setFilterStatus] = useState<TaskRecord['status'] | ''>('')
  const [filterPriority, setFilterPriority] = useState<TaskPriority | ''>('')
  const [filterModule, setFilterModule] = useState('')
  const [kbSearch, setKbSearch] = useState('')
  return { filterProject, filterVersion, filterStatus, filterPriority, filterModule, kbSearch, setFilterProject, setFilterVersion, setFilterStatus, setFilterPriority, setFilterModule, setKbSearch }
}
