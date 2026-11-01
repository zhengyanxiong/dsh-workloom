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

function mount(active: boolean, readRate: number, writeRate: number): { root: Root; rerender: (active: boolean, readRate: number, writeRate: number) => void } {
  const root = createRoot(container)
  const render = (nextActive: boolean, nextRead: number, nextWrite: number): void => {
    act(() => {
      root.render(createElement(LoomECG, { active: nextActive, readRate: nextRead, writeRate: nextWrite }))
    })
  }
  render(active, readRate, writeRate)
  return { root, rerender: render }
}

it('does not rebuild the drawing context when only the rates change', () => {
  const { root, rerender } = mount(true, 0, 0)
  expect(getContext).toHaveBeenCalledTimes(1)
  rerender(true, 4000, 120)
  expect(getContext).toHaveBeenCalledTimes(1)
  rerender(false, 4000, 120)
  expect(getContext).toHaveBeenCalledTimes(2)
  act(() => {
    root.unmount()
  })
})

it('strokes the trace in batches instead of once per pixel column', () => {
  const { root } = mount(true, 0, 0)
  stroke.mockClear()
  frames.at(-1)!(performance.now())
  // Grid (1) plus both batched traces — far below one stroke per column per trace.
  expect(stroke.mock.calls.length).toBeGreaterThan(2)
  expect(stroke.mock.calls.length).toBeLessThan(90)
  act(() => {
    root.unmount()
  })
})

it('schedules animation frames only while active', () => {
  const idle = mount(false, 0, 0)
  expect(frames.length).toBe(0)
  idle.rerender(false, 0, 0)
  expect(frames.length).toBe(0)
  act(() => {
    idle.root.unmount()
  })
  frames.length = 0
  const live = mount(true, 0, 0)
  expect(frames.length).toBe(1)
  act(() => {
    live.root.unmount()
  })
})
