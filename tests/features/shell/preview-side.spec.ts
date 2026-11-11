/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import type { JSX } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it } from 'vitest'
import { openReviewPreview, workspacePreview, workspaceReviewPreview } from '../../../src/client/features/preview/preview.ts'
import { useLoomPreviewSide, type LoomPreviewSide } from '../../../src/client/shell/useLoomPreviewSide.ts'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | undefined
let container: HTMLDivElement | undefined
let side: LoomPreviewSide | undefined

function Harness({ taskId }: { readonly taskId: string }): JSX.Element | null {
  side = useLoomPreviewSide(false, taskId)
  return null
}

async function render(taskId: string): Promise<void> {
  await act(async () => { root?.render(createElement(Harness, { taskId })) })
}

async function openFullscreenReview(): Promise<void> {
  await act(async () => { openReviewPreview({ sessionId: 's1', seq: 9, turn: 2 }) })
  await act(async () => { side?.setPreviewFullscreen(true) })
  expect(side?.previewFullscreen).toBe(true)
}

afterEach(async () => {
  await act(async () => {
    workspacePreview.close()
    workspaceReviewPreview.close()
    root?.unmount()
  })
  container?.remove()
  root = undefined
  container = undefined
  side = undefined
})

it('leaves fullscreen when the turn review closes', async () => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await render('task-a')
  await openFullscreenReview()
  await act(async () => { workspaceReviewPreview.close() })
  expect(side?.previewFullscreen).toBe(false)
})

it('does not carry review fullscreen into another task', async () => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await render('task-a')
  await openFullscreenReview()
  await render('task-b')
  expect(side?.review).toBeUndefined()
  expect(side?.previewFullscreen).toBe(false)
})
