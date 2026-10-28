import { expect, it } from 'vitest'
import { TABLES, tableSeats } from '../../src/config'
import { canReachTable } from '../../src/features/tableLobby/tableReach'

it('reaches each existing chair on every table while rejecting distant and other-level interactions', () => {
  for (const table of TABLES) {
    for (const seat of tableSeats(table)) expect(canReachTable({ x: table.position[0] + seat.x,
      y: table.position[1] + .8, z: table.position[2] + seat.z }, table.id)).toBe(true)
    expect(canReachTable({ x: table.position[0] + 100, y: table.position[1] + .8, z: table.position[2] }, table.id)).toBe(false)
    expect(canReachTable({ x: table.position[0], y: table.position[1] + 3, z: table.position[2] }, table.id)).toBe(false)
  }
  expect(canReachTable(undefined, TABLES[0]!.id)).toBe(false)
  expect(canReachTable({ x: NaN, y: .8, z: 0 }, TABLES[0]!.id)).toBe(false)
  expect(canReachTable({ x: 0, y: .8, z: 0 }, 'missing')).toBe(false)
})
