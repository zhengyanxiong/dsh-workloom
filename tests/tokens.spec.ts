import { expect, it } from 'vitest'
import { COLORS, colorVar, radiusVar, shadowVar, spaceVar, textVar } from '../src/client/ui/tokens.ts'

it('maps semantic roles to CSS custom properties', () => {
  expect(colorVar('accent')).toBe('var(--color-accent)')
  expect(colorVar('danger-soft')).toBe('var(--color-danger-soft)')
  expect(textVar('body')).toBe('var(--text-body-size)')
  expect(textVar('h2', 'lh')).toBe('var(--text-h2-lh)')
  expect(spaceVar(8)).toBe('var(--space-8)')
  expect(radiusVar('pill')).toBe('var(--radius-pill)')
  expect(shadowVar('popover')).toBe('var(--shadow-popover)')
})

it('keeps the semantic COLORS aliases on design tokens only', () => {
  expect(COLORS.business).toBe('var(--color-accent)')
  expect(COLORS.selected).toBe('var(--loom-selected)')
  for (const value of Object.values(COLORS)) expect(value.startsWith('var(--')).toBe(true)
})
