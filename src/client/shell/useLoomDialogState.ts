/** Create/edit dialog state shared by the Loom shell and dialog layer. */
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import type { CreateKind, EditKind } from '../features/dialogs/LoomFormDialogs.tsx'
import type { VersionStep } from '../features/version/VersionForm.tsx'

/** Dialog visibility and progress state. */
export interface LoomDialogState {
  readonly create: CreateKind | undefined
  readonly setCreate: Dispatch<SetStateAction<CreateKind | undefined>>
  readonly edit: EditKind | undefined
  readonly setEdit: Dispatch<SetStateAction<EditKind | undefined>>
  readonly versionStep: VersionStep
  readonly setVersionStep: Dispatch<SetStateAction<VersionStep>>
  readonly modalBusy: boolean
  readonly setModalBusy: Dispatch<SetStateAction<boolean>>
}

/**
 * Own the create/edit dialog state and its Escape dismissal.
 * @returns dialog state and setters.
 */
export function useLoomDialogState(): LoomDialogState {
  const [create, setCreate] = useState<CreateKind>()
  const [edit, setEdit] = useState<EditKind>()
  const [versionStep, setVersionStep] = useState<VersionStep>('name')
  const [modalBusy, setModalBusy] = useState(false)
  useEffect(() => { setModalBusy(false) }, [create, edit])
  useEffect(() => {
    if (create === undefined && edit === undefined) return
    const close = (event: KeyboardEvent): void => { if (event.key === 'Escape' && !modalBusy) { setCreate(undefined); setEdit(undefined) } }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [create, edit, modalBusy])
  return { create, setCreate, edit, setEdit, versionStep, setVersionStep, modalBusy, setModalBusy }
}
