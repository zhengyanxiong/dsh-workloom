/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { LoomECG } from '../src/client/LoomECG.tsx'

// React 18 only runs effects synchronously inside act() when this flag is set.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const CONTEXT_METHODS = ['setTransform', 'clearRect', 'beginPath', 'moveTo', 'lineTo', 'arc', 'fill'] as const

let stroke: ReturnType<typeof vi.fn>
let frames: FrameRequestCallback[]
let getContext: ReturnType<typeof vi.spyOn>
let container: HTMLDivElement

function fakeContext(): CanvasRenderingContext2D {
  const context: Record<string, unknown> = {}
  for (const method of CONTEXT_METHODS) context[method] = vi.fn()
  context.stroke = stroke
  return context as unknown as CanvasRenderingContext2D
}

beforeEach(() => {
  stroke = vi.fn()
  frames = []
  container = document.createElement('div')
  document.body.append(container)
  vi.stubGlobal('ResizeObserver', class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  })
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    frames.push(callback)
    return frames.length
  }))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fakeContext())
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  container.remove()
})

function mount(active: boolean, beatMs: number): { root: Root; rerender: (active: boolean, beatMs: number) => void } {
  const root = createRoot(container)
  const render = (nextActive: boolean, nextBeat: number): void => {
    act(() => {
      root.render(createElement(LoomECG, { active: nextActive, beatMs: nextBeat }))
    })
  }
  render(active, beatMs)
  return { root, rerender: render }
}

it('does not rebuild the drawing context when only the beat period changes', () => {
  const { root, rerender } = mount(true, 2000)
  expect(getContext).toHaveBeenCalledTimes(1)
  rerender(true, 1500)
  expect(getContext).toHaveBeenCalledTimes(1)
  rerender(false, 1500)
  expect(getContext).toHaveBeenCalledTimes(2)
  act(() => {
    root.unmount()
  })
})

it('strokes the trace in batches instead of once per pixel column', () => {
  const { root } = mount(true, 2000)
  stroke.mockClear()
  frames.at(-1)!(performance.now())
  // Grid (1) plus TRACE_CHUNKS trace groups — far below one stroke per column.
  expect(stroke.mock.calls.length).toBeGreaterThan(2)
  expect(stroke.mock.calls.length).toBeLessThan(40)
  act(() => {
    root.unmount()
  })
})
