import { afterEach, expect, it } from 'vitest'
import { CABIN_WALK_RADIUS, availableCabinSeat, cabinRider, cabinSeats, idleCabin, toggleCabinSeat, walkCabin } from '../../src/features/balloon/cabin'
import { clearRemoteBalloons, receiveRemoteBalloon, remoteBalloonRider } from '../../src/features/balloon/remoteRide'

afterEach(clearRemoteBalloons)

it('keeps the rider on the basket floor when holding a direction and the altitude key', () => {
  let rider = idleCabin
  for (let frame = 0; frame < 100; frame++) rider = walkCabin(rider, { x: 1, z: 1, lift: 1 }, .1)
  const position = { x: 0, y: 30, z: 0 }
  expect(Math.hypot(rider.x, rider.z)).toBeLessThanOrEqual(CABIN_WALK_RADIUS)
  expect(Math.hypot(rider.x, rider.z)).toBeGreaterThan(CABIN_WALK_RADIUS - .15)
  expect(cabinRider(position, rider).y).toBe(cabinRider(position, idleCabin).y)
})

it('requires a nearby seat and releases the rider into the aisle when they stand', () => {
  expect(toggleCabinSeat(idleCabin)).toBe(idleCabin)
  let rider = idleCabin
  for (let frame = 0; frame < 30; frame++) rider = walkCabin(rider, { x: 0, z: -1, lift: 0 }, .1)
  expect(availableCabinSeat(rider)).toBe(0)
  const seated = toggleCabinSeat(rider)
  expect(seated).toMatchObject({ ...cabinSeats[0], seatIndex: 0, moving: false })
  expect(walkCabin(seated, { x: 0, z: 1, lift: 1 }, .1)).toBe(seated)
  const standing = toggleCabinSeat(seated)
  expect(standing.seatIndex).toBe(-1)
  expect(walkCabin(standing, { x: 0, z: 1, lift: 0 }, .1).z).toBeGreaterThan(standing.z)
})

it('renders a remote rider at the chair anchor and releases the pose on landing', () => {
  const position = { x: -35, y: 30, z: -76 }
  const cabin = { ...cabinSeats[2], seatIndex: 2, moving: false }
  const envelope = { channelId: 'one', pilotId: '102', flight: { position, aboard: true, cabin } }
  receiveRemoteBalloon(envelope, 'one', '101', 100)
  expect(remoteBalloonRider('102', 100)).toEqual(cabinRider(position, cabin))
  receiveRemoteBalloon({ ...envelope, flight: { position, aboard: false } }, 'one', '101', 200)
  expect(remoteBalloonRider('102', 200)).toBeNull()
})
