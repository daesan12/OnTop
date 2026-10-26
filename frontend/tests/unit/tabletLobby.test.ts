import { describe, expect, it } from 'vitest'
import { approvedChairCount, manualStartAllowed, readyWouldAutoStart } from '../../src/features/tableLobby/tabletModel'
import { screenTransform, TABLET } from '../../src/features/tableLobby/tabletProjection'
import type { TableState } from '../../src/network/protocol'

const table: TableState = { tableId: 'a', version: 2, capacity: 4, minimumPlayers: 2, gameCode: 'ONE_CARD', targetScore: null,
  betAmountPerPlayer: 20, selectorUserId: 'a', allReady: true,
  seats: [{ seatNumber: 1, userId: 'a', ready: true }, { seatNumber: 2, userId: 'b', ready: true },
    { seatNumber: 3, userId: null, ready: false }, { seatNumber: 4, userId: null, ready: false }] }
describe('tablet lobby authority', () => {
  it('requires host, exact selected attendance, all ready and a valid approved selection', () => {
    expect(manualStartAllowed(table, 'a', 2)).toBe(true)
    expect(manualStartAllowed(table, 'b', 2)).toBe(false)
    for (const count of [null, 1, 3, 4, 5]) expect(manualStartAllowed(table, 'a', count)).toBe(false)
    expect(manualStartAllowed({ ...table, allReady: false }, 'a', 2)).toBe(false)
    expect(manualStartAllowed({ ...table, seats: table.seats.map(s => ({ ...s, ready: false })) }, 'a', 2)).toBe(false)
    expect(manualStartAllowed({ ...table, betAmountPerPlayer: null }, 'a', 2)).toBe(false)
  })
  it('blocks the legacy last ready to avoid silently auto-starting', () => {
    expect(readyWouldAutoStart(table, 'a')).toBe(true)
    expect(readyWouldAutoStart({ ...table, seats: table.seats.map(s => s.userId === 'b' ? { ...s, ready: false } : s) }, 'a')).toBe(false)
    expect(readyWouldAutoStart({ ...table, seats: [table.seats[0]!] }, 'a')).toBe(false)
  })
  it('starts with two chairs and never hides an approved occupant', () => {
    expect(approvedChairCount(undefined, null)).toBe(2)
    expect(approvedChairCount({ ...table, gameCode: null }, null)).toBe(2)
    expect(approvedChairCount(table, 3)).toBe(3)
    expect(approvedChairCount({ ...table, seats: table.seats.map(s => s.seatNumber === 4 ? { ...s, userId: 'c' } : s) }, 2)).toBe(4)
  })
  it('projects screen points without mixing device pixels with CSS pixels', () => {
    const matrix = screenTransform([{ x: 10, y: 20 }, { x: 10 + TABLET.pixelsX, y: 20 },
      { x: 10, y: 20 + TABLET.pixelsY }, { x: 10 + TABLET.pixelsX, y: 20 + TABLET.pixelsY }])
    const values = matrix.slice(9, -1).split(',').map(Number)
    expect(values[0]).toBeCloseTo(1); expect(values[5]).toBeCloseTo(1)
    expect(values[12]).toBeCloseTo(10); expect(values[13]).toBeCloseTo(20)
  })
})
