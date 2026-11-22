import { expect, it } from 'vitest'
import { balloonCollisionWarning, MAX_ALTITUDE, returnToDock, stepFlight, type Flight, type FlightMap } from '../../src/features/balloon/flight'

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

it('상승 중에도 현재 3m 위험 구간을 벗어나기 전에는 경고를 유지한다', () => {
  const ascending = { x: 0, z: 0, lift: 1 }
  expect(balloonCollisionWarning({ ...flight, position: { x: 0, y: 3, z: 0 } }, ascending, map)).toBe(true)
  expect(balloonCollisionWarning({ ...flight, position: { x: 0, y: 3.01, z: 0 } }, ascending, map)).toBe(false)
})

it.each([undefined, MAX_ALTITUDE + 10])('복귀 높이는 고도 상한을 넘지 않는다: cached=%s', returnHeight => {
  const highMap = { ...map, floor: () => MAX_ALTITUDE - 1 }
  let current: Flight = { ...flight, phase: 'returning', position: { x: 24, y: 70, z: 0 }, returnHeight }
  for (let tick = 0; tick < 50 && current.phase !== 'landed'; tick++) {
    const next = stepFlight(current, { x: 0, z: 0, lift: 0 }, .1, highMap)
    expect(next.returnHeight).toBe(MAX_ALTITUDE)
    expect(next.position.y).toBeLessThanOrEqual(MAX_ALTITUDE)
    expect(Math.abs(next.position.y - current.position.y)).toBeLessThanOrEqual(1.001)
    current = next
  }
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
