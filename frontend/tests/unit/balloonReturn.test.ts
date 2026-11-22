import { expect, it } from 'vitest'
import { returnToDock, stepFlight, type Flight, type FlightMap } from '../../src/features/balloon/flight'

it('returns the desktop balloon within server pose limits and clears the dock after one second', () => {
  const map: FlightMap = {
    dock: { x: 0, y: 24, z: 0 },
    dockExit: { x: 0, y: 24, z: 4 },
    inside: () => true,
    floor: () => 24,
    landing: () => null,
  }
  const flying: Flight = { phase: 'flying', position: { x: 60, y: 34, z: 0 }, seconds: 90, atBoundary: false }
  let flight = returnToDock(flying, 'manual')
  const dt = .125
  const idle = { x: 0, z: 0, lift: 0 }
  let elapsed = 0
  while (flight.phase !== 'landed' && elapsed < 10) {
    const next = stepFlight(flight, idle, dt, map)
    expect(Math.hypot(next.position.x - flight.position.x, next.position.z - flight.position.z)).toBeLessThanOrEqual(20 * dt)
    expect(Math.abs(next.position.y - flight.position.y)).toBeLessThanOrEqual(10 * dt)
    flight = next
    elapsed += dt
  }
  expect(elapsed).toBe(4)
  expect(flight).toMatchObject({ phase: 'landed', landing: 'dock', position: map.dock, seconds: 1 })
  expect(stepFlight(flight, idle, dt, map, 1).phase).toBe('removed')
})
