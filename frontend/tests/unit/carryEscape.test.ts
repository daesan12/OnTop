import { expect, it } from 'vitest'
import { createCarryEscape } from '../../src/features/carry/escape'

it.each(['KeyA', 'KeyD'] as const)('escapes once after six alternating presses starting with %s', first => {
  const escape = createCarryEscape()
  const opposite = first === 'KeyA' ? 'KeyD' : 'KeyA'
  for (let i = 0; i < 12; i++) {
    expect(escape.press('one', i % 2 ? opposite : first, i * 100)).toBe(i === 5)
  }
})

it('repeated same keys restart the sequence rather than adding progress', () => {
  const escape = createCarryEscape()
  for (let i = 0; i < 12; i++) expect(escape.press('one', 'KeyA', i * 100)).toBe(false)
  for (let i = 0; i < 5; i++) expect(escape.press('one', i % 2 ? 'KeyA' : 'KeyD', 1200 + i * 100)).toBe(i === 4)
})

it.each(['pause', 'new carry', 'reset'] as const)('does not reuse partial progress after %s', interruption => {
  const escape = createCarryEscape()
  for (let i = 0; i < 5; i++) escape.press('one', i % 2 ? 'KeyD' : 'KeyA', i * 100)
  if (interruption === 'reset') escape.reset()
  const id = interruption === 'new carry' ? 'two' : 'one', at = interruption === 'pause' ? 1400 : 500
  for (let i = 0; i < 6; i++) expect(escape.press(id, i % 2 ? 'KeyA' : 'KeyD', at + i * 100)).toBe(i === 5)
})
