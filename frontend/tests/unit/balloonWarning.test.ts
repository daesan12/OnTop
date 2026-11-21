import { expect, it } from 'vitest'
import { balloonCollisionWarning, returnToDock, stepFlight, type Flight, type FlightMap } from '../../src/features/balloon/flight'

const map: FlightMap = {
  dock: { x: 0, y: 4, z: 0 }, dockExit: { x: 0, y: 4, z: 4 }, inside: () => true,
  floor: x => x >= 8 && x <= 16 ? 25 : 0, landing: () => null,
}
const flight: Flight = { phase: 'flying', position: { x: 0, y: 22, z: 0 }, seconds: 60, atBoundary: false }

it('warns before reaching a building in the direction of travel and before descending to ground', () => {
  expect(balloonCollisionWarning(flight, { x: 1, z: 0, lift: 0 }, map)).toBe(true)
  expect(balloonCollisionWarning(flight, { x: -1, z: 0, lift: 0 }, map)).toBe(false)
  expect(balloonCollisionWarning({ ...flight, position: { x: 0, y: 6, z: 0 } }, { x: 0, z: 0, lift: -1 }, map)).toBe(true)
  expect(balloonCollisionWarning({ ...flight, phase: 'boarding' }, { x: 1, z: 0, lift: 0 }, map)).toBe(false)
})

it('clears buildings on a faster return without exceeding server movement limits', () => {
  let current = returnToDock({ ...flight, position: { x: 24, y: 22, z: 0 } }, 'manual')
  let elapsed = 0
  while (current.phase !== 'landed' && elapsed < 20) {
    const next = stepFlight(current, { x: 0, z: 0, lift: 0 }, .1, map)
    expect(Math.hypot(next.position.x - current.position.x, next.position.z - current.position.z)).toBeLessThanOrEqual(2.001)
    expect(Math.abs(next.position.y - current.position.y)).toBeLessThanOrEqual(1.001)
    if (next.position.x > 0 && next.position.x < 24) expect(next.position.y).toBeGreaterThanOrEqual(29)
    current = next
    elapsed += .1
  }
  expect(current.phase).toBe('landed')
  expect(elapsed).toBeLessThan(6)
})
