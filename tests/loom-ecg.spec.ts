// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { LoomECG } from '../src/client/LoomECG.tsx'

// React 18 only runs effects synchronously inside act() when this flag is set.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function fakeContext(): CanvasRenderingContext2D {
  const context: Record<string, unknown> = {}
  for (const method of ['setTransform', 'clearRect', 'beginPath', 'moveTo', 'lineTo', 'stroke', 'arc', 'fill']) {
    context[method] = vi.fn()
  }
  return context as unknown as CanvasRenderingContext2D
}

let getContext: ReturnType<typeof vi.spyOn>
let container: HTMLDivElement

beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
  vi.stubGlobal('ResizeObserver', class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  })
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fakeContext())
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  container.remove()
})

it('does not rebuild the drawing context when only the beat period changes', () => {
  const root = createRoot(container)
  act(() => {
    root.render(createElement(LoomECG, { active: true, beatMs: 2000 }))
  })
  expect(getContext).toHaveBeenCalledTimes(1)
  act(() => {
    root.render(createElement(LoomECG, { active: true, beatMs: 1500 }))
  })
  expect(getContext).toHaveBeenCalledTimes(1)
  act(() => {
    root.render(createElement(LoomECG, { active: false, beatMs: 1500 }))
  })
  expect(getContext).toHaveBeenCalledTimes(2)
  act(() => {
    root.unmount()
  })
})
