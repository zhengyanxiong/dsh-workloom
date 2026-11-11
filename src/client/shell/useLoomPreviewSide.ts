/** Preview, review and bottom-dock visibility for the Loom shell. */
import { useEffect, useState, useSyncExternalStore, type Dispatch, type SetStateAction } from 'react'
import type { LoomBottomPane } from './LoomBottomPanel.tsx'
import { workspacePreview, workspaceReviewPreview } from '../features/preview/preview.ts'

/** Preview side state and setters used by the shell render. */
export interface LoomPreviewSide {
  readonly preview: ReturnType<typeof workspacePreview.getSnapshot>
  readonly review: ReturnType<typeof workspaceReviewPreview.getSnapshot>
  readonly asideOpen: boolean
  readonly setAsideOpen: Dispatch<SetStateAction<boolean>>
  readonly previewFullscreen: boolean
  readonly setPreviewFullscreen: Dispatch<SetStateAction<boolean>>
  readonly bottomCollapsed: boolean
  readonly setBottomCollapsed: Dispatch<SetStateAction<boolean>>
  readonly pane: LoomBottomPane
  readonly setPane: Dispatch<SetStateAction<LoomBottomPane>>
}

/**
 * Own the preview/review subscriptions and dock visibility effects.
 * @param initialAsideOpen - context-panel preference at mount.
 * @param taskId - selected task id; previews close when it changes.
 * @returns preview side state.
 */
export function useLoomPreviewSide(initialAsideOpen: boolean, taskId: string | undefined): LoomPreviewSide {
  const [asideOpen, setAsideOpen] = useState(initialAsideOpen)
  const [previewFullscreen, setPreviewFullscreen] = useState(false)
  const [bottomCollapsed, setBottomCollapsed] = useState(true)
  const [pane, setPane] = useState<LoomBottomPane>('diff')
  const preview = useSyncExternalStore(workspacePreview.subscribe, workspacePreview.getSnapshot, workspacePreview.getSnapshot)
  const review = useSyncExternalStore(workspaceReviewPreview.subscribe, workspaceReviewPreview.getSnapshot, workspaceReviewPreview.getSnapshot)
  useEffect(() => { if (preview !== undefined || review !== undefined) setAsideOpen(true) }, [preview, review])
  useEffect(() => { if (preview === undefined && review === undefined) setPreviewFullscreen(false) }, [preview, review])
  useEffect(() => {
    if (!previewFullscreen) return
    const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') setPreviewFullscreen(false) }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [previewFullscreen])
  useEffect(() => { workspacePreview.close(); workspaceReviewPreview.close() }, [taskId])
  return { preview, review, asideOpen, setAsideOpen, previewFullscreen, setPreviewFullscreen, bottomCollapsed, setBottomCollapsed, pane, setPane }
}
