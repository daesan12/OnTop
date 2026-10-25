import { afterEach, expect, it } from 'vitest'
import { BENCH_PAVILIONS, CHARACTER, GOMOKU, PARK_PAVILIONS, PAVILION_LANTERN } from '../../src/config'
import { benchAnchors } from '../../src/features/interactions/benchAnchors'
import { benchBoardLook, benchLook, benchTable, benchViewScope, resetBenchSpectator, spectatorClearHeight, turnBenchLook, useBenchSpectator } from '../../src/features/interactions/benchSpectator'

afterEach(resetBenchSpectator)
it('aims every pavilion bench seat at its own board, even when the avatar faces away', () => {
  const benches = benchAnchors.filter(b => BENCH_PAVILIONS[Number(b.id.slice(6))])
  expect(new Set(benches.map(b => benchTable(b.id)?.pavilionId)).size).toBe(9)
  for (const bench of benches) for (const seat of bench.seats) {
    const table = benchTable(bench.id)!, target = [table.position[0], table.position[1] + GOMOKU.boardY, table.position[2]]
    const pose = { ...seat, yaw: 99 }, look = benchBoardLook(pose, target)
    const dx = target[0]! - pose.x, dz = target[2]! - pose.z, length = Math.hypot(dx, dz)
    expect((-Math.sin(look.yaw) * dx - Math.cos(look.yaw) * dz) / length).toBeCloseTo(1)
    const eyeY = pose.y - .8 + CHARACTER.height - .2 + CHARACTER.seatedHipHeight - CHARACTER.hipHeight
    expect(eyeY - Math.tan(look.pitch) * length).toBeCloseTo(target[1]!)
    expect(pose.yaw).toBe(99)
  }
})
it('never maps an outdoor bench or invalid ID to a game table', () => {
  expect(benchTable('bench-0')).toBeUndefined(); expect(benchTable('table-5')).toBeUndefined(); expect(benchTable('bench-99999')).toBeUndefined()
})
it('scopes close viewing to an owner, channel, connected bench and seat', () => {
  const s = { status: 'connected' as const, sessionId: '101', roomId: 'a', benchId: 'bench-10', seatIndex: 0 }
  expect(benchViewScope(s, 0)).not.toBe(benchViewScope({ ...s, roomId: 'b' }, 0))
  expect(benchViewScope(s, 0)).not.toBe(benchViewScope(s, 1))
  expect(benchViewScope({ ...s, status: 'reconnecting' }, 0)).toBe('')
  expect(benchViewScope(s, -1)).toBe('')
})
it('resets participant orbit and keeps close cameras below each hanging lantern', () => {
  turnBenchLook(100); const rotated = benchLook.yaw; turnBenchLook(NaN); expect(benchLook.yaw).toBe(rotated)
  turnBenchLook(100000); expect(Math.abs(benchLook.yaw)).toBeLessThanOrEqual(Math.PI)
  useBenchSpectator.setState({ scope: 'old', view: 'board' }); resetBenchSpectator()
  expect(useBenchSpectator.getState()).toEqual({ scope: '', view: 'seated' }); expect(benchLook.yaw).toBe(Math.PI / 4)
  for (const p of PARK_PAVILIONS) expect(spectatorClearHeight(p.id)).toBeLessThan(p.floor + PAVILION_LANTERN.heightFactor * p.scale - PAVILION_LANTERN.bottomOffset)
})
