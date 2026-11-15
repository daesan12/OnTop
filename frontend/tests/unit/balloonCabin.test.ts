import { afterEach, expect, it } from 'vitest'
import { CABIN_BENCH_INNER, CABIN_WALK_RADIUS, availableCabinSeat, cabinRider, cabinSeats, idleCabin, toggleCabinSeat, walkCabin } from '../../src/features/balloon/cabin'
import { clearRemoteBalloons, receiveRemoteBalloon, remoteBalloonRider, useRemoteBalloons } from '../../src/features/balloon/remoteRide'
import { stepUncrewedFlight, type Flight, type FlightMap } from '../../src/features/balloon/flight'
import { combineFlightInput, inputForRole, type BalloonControls } from '../../src/features/balloon/controls'

afterEach(clearRemoteBalloons)

it('holds altitude during the warning, then falls until touching the ground', () => {
  const dock = { x: 0, y: 0, z: 0 }
  const map: FlightMap = { dock, dockExit: dock, inside: () => true, floor: () => 0, landing: () => null }
  const flight: Flight = { position: { x: 10, y: 2, z: 20 }, phase: 'flying', seconds: 90, atBoundary: false }
  expect(stepUncrewedFlight(flight, true, .1, map)).toBe(flight)
  const falling = stepUncrewedFlight(flight, false, .1, map)
  expect(falling.position).toEqual({ x: 10, y: 1.95, z: 20 })
  let next = falling
  for (let i = 0; i < 15 && next.phase === 'flying'; i++) next = stepUncrewedFlight(next, false, .1, map)
  expect(next).toMatchObject({ phase: 'landed', landing: 'field', exit: dock })
})

it('combines the co-pilot input with the host input using the occupied seats', () => {
  const controls: BalloonControls = { mode: 'split', direction: '101', altitude: '102',
    emptyMillis: null, offer: null, input: { x: -1, z: 1, lift: 1 }, returning: false }
  const input = { x: 1, z: -1, lift: -1 }
  expect(inputForRole('split', 'altitude', input)).toEqual({ x: 0, z: 0, lift: -1 })
  expect(combineFlightInput(controls, '101', input)).toEqual({ x: 1, z: -1, lift: 1 })
  expect(combineFlightInput({ ...controls, altitude: null }, '101', input)).toEqual({ x: 1, z: -1, lift: 0 })
  expect(combineFlightInput({ ...controls, mode: 'solo', altitude: null }, '101', input)).toEqual(input)
})

it('keeps the rider on the basket floor when holding a direction and the altitude key', () => {
  let rider = idleCabin
  for (let frame = 0; frame < 100; frame++) rider = walkCabin(rider, { x: 1, z: 1, lift: 1 }, .1)
  const position = { x: 0, y: 30, z: 0 }
  expect(Math.hypot(rider.x, rider.z)).toBeLessThanOrEqual(CABIN_WALK_RADIUS)
  expect(Math.hypot(rider.x, rider.z)).toBeLessThan(CABIN_BENCH_INNER)
  expect(cabinRider(position, rider).y).toBe(cabinRider(position, idleCabin).y)
})

it('leaves both side gaps walkable up to the basket boundary', () => {
  for (const x of [-1, 1]) {
    let rider = idleCabin
    for (let frame = 0; frame < 30; frame++) rider = walkCabin(rider, { x, z: 0, lift: 0 }, .1)
    expect(x * rider.x).toBeGreaterThan(CABIN_BENCH_INNER)
    expect(x * rider.x).toBeLessThanOrEqual(CABIN_WALK_RADIUS)
  }
})

it('requires a nearby seat and releases the rider into the aisle when they stand', () => {
  expect(toggleCabinSeat(idleCabin)).toBe(idleCabin)
  let rider = { ...idleCabin, x: cabinSeats[0].x }
  for (let frame = 0; frame < 30; frame++) rider = walkCabin(rider, { x: 0, z: -1, lift: 0 }, .1)
  expect(availableCabinSeat(rider)).toBe(0)
  expect(rider.z).toBeGreaterThan(-CABIN_BENCH_INNER)
  expect(availableCabinSeat(rider, [0])).toBe(-1)
  const seated = toggleCabinSeat(rider)
  expect(seated).toMatchObject({ ...cabinSeats[0], seatIndex: 0, moving: false })
  expect(walkCabin(seated, { x: 0, z: 1, lift: 1 }, .1)).toBe(seated)
  const standing = toggleCabinSeat(seated)
  expect(standing.seatIndex).toBe(-1)
  expect(walkCabin(standing, { x: 0, z: 1, lift: 0 }, .1).z).toBeGreaterThan(standing.z)
})

it('renders a remote rider at the bench seat and releases the pose on landing', () => {
  const position = { x: -35, y: 30, z: -76 }
  const cabin = { ...cabinSeats[2], seatIndex: 2, moving: false }
  const envelope = { channelId: 'one', pilotId: '102', flight: { position, aboard: true, cabin } }
  receiveRemoteBalloon(envelope, 'one', '101', 100)
  expect(remoteBalloonRider('102', 100)).toEqual(cabinRider(position, cabin))
  receiveRemoteBalloon({ ...envelope, flight: { position, aboard: false } }, 'one', '101', 200)
  expect(remoteBalloonRider('102', 200)).toBeNull()
})

it('places three passengers on the same balloon for the pilot and releases them on landing', () => {
  const position = { x: -35, y: 30, z: -76 }
  const moved = { ...position, y: 32 }
  const passengers = {
    '102': { ...cabinSeats[0], seatIndex: 0, moving: false },
    '103': { ...cabinSeats[1], seatIndex: 1, moving: false },
    '104': { ...cabinSeats[2], seatIndex: 2, moving: false },
  }
  const envelope = { channelId: 'one', pilotId: '101', flight: { position, aboard: true },
    party: { capacity: 4, boarding: false, passengers } }
  receiveRemoteBalloon(envelope, 'one', '101', 100)
  expect(Object.keys(useRemoteBalloons.getState().flights)).toEqual(['101'])
  expect(remoteBalloonRider('102', 100, { id: '101', position: moved })).toEqual(cabinRider(moved, passengers['102']))
  expect(remoteBalloonRider('104', 100)).toEqual(cabinRider(position, passengers['104']))
  receiveRemoteBalloon({ ...envelope, flight: null }, 'one', '101', 200)
  expect(remoteBalloonRider('102', 200)).toBeNull()
})
