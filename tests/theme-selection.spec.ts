import { expect, it } from 'vitest'
import { resolveLoomTheme } from '../src/client/theme/selection.ts'

it('follows the DSH theme only in auto mode', () => {
  expect(resolveLoomTheme('auto', false)).toBe('blue')
  expect(resolveLoomTheme('auto', true)).toBe('dark')
  expect(resolveLoomTheme('paper', true)).toBe('light')
  expect(resolveLoomTheme('white', true)).toBe('white')
  expect(resolveLoomTheme('blue', true)).toBe('blue')
  expect(resolveLoomTheme('dark', false)).toBe('dark')
})
