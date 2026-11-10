import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { inputState, panelBlocksCarry, panelOwnsKeys, panelOwnsMovement } from '../../src/world/inputOwnership'

beforeEach(() => {
  for (const key of Object.keys(inputState) as (keyof typeof inputState)[]) inputState[key] = false
})
afterEach(() => { vi.unstubAllGlobals() })

it('keeps chat keyboard and movement ownership without requesting carry release', () => {
  inputState.chatOpen = true
  expect(panelOwnsKeys()).toBe(true)
  expect(panelOwnsMovement()).toBe(true)
  expect(panelBlocksCarry(true)).toBe(false)
  expect(panelBlocksCarry(false)).toBe(true)
})

it.each(['notesOpen', 'mapOpen', 'minigameOpen', 'blocked'] as const)(
  'still releases carry when %s overlaps chat', panel => {
    inputState.chatOpen = inputState[panel] = true
    expect(panelBlocksCarry(true)).toBe(true)
  },
)

it('still releases carry for an open dialog even when chat is the only flagged panel', () => {
  inputState.chatOpen = true
  vi.stubGlobal('document', { querySelector: () => ({ role: 'dialog' }) })
  expect(panelBlocksCarry(true)).toBe(true)
})
