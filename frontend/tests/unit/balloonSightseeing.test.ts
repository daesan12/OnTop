import { expect, it } from 'vitest'
import { createFlight, stepSightseeingFlight, takeOff, type FlightMap } from '../../src/features/balloon/flight'

it('automatically climbs, crosses the park and lands back at the dock before the server expiry', () => {
  const map: FlightMap = {
    dock: { x: -34, y: 23, z: -76 },
    dockExit: { x: -40, y: 23, z: -62 },
    inside: (x, z, margin) => Math.max(Math.abs(x), Math.abs(z)) <= 110 - margin,
    floor: () => 23,
    landing: () => null,
  }
  let flight = takeOff(createFlight(map))
  let nearestToCenter = Infinity
  let highest = 0
  let elapsed = 0
  const dt = .05
  while (flight.phase !== 'removed' && elapsed < 180) {
    flight = stepSightseeingFlight(flight, dt, map)
    elapsed += dt
    nearestToCenter = Math.min(nearestToCenter, Math.hypot(flight.position.x, flight.position.z))
    highest = Math.max(highest, flight.position.y)
  }
  expect(nearestToCenter).toBeLessThan(4)
  expect(highest).toBeCloseTo(43)
  expect(flight).toMatchObject({ phase: 'removed', returnReason: 'time',
    landing: 'dock', position: map.dock, exit: map.dockExit })
  expect(elapsed).toBeLessThan(180)
})
