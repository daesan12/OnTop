import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { avatars, receive, resetWorld, sampleAvatar, type Pose } from '../../src/network/worldClient'
import { localMovement } from '../../src/network/localMovementPrediction'
import { EXPECTED_MAP_VERSION } from '../../src/config/mapVersion'

const carryId = '11111111-1111-4111-8111-111111111111'
const pose = (): Pose => ({ x: 0, y: 0, z: 0, yaw: 0 })
const position = (x: number, y = .84) => ({ x, y, z: 78, yaw: 1,
  lastInputSeq: 0, moving: false, running: false, swimming: false })
const motion = (tick: number) => ({ tick, epoch: 1, appliedInputSeq: 0, inputAgeMs: 0,
  velocityY: 0, grounded: false, inputActive: false })

beforeEach(() => resetWorld())
afterEach(() => vi.restoreAllMocks())

function connect(ownId: string) {
  receive({ type: 'CONNECTED', requestId: null, payload: { userId: ownId } })
  receive({ type: 'CHANNEL_STATE', requestId: null, payload: {
    channelId: 'a', name: '공원', version: 1, currentUsers: 3, capacity: 4, userIds: ['101', '102', '103'],
  } })
}
function world(tick: number, x: number) {
  receive({ type: 'WORLD_STATE', requestId: null, payload: {
    channelId: 'a', version: tick, mapVersion: EXPECTED_MAP_VERSION,
    avatars: [
      { userId: '101', position: position(x), motion: motion(tick), carry: { carryId, partnerId: '102', role: 'CARRIER' } },
      { userId: '102', position: position(x, 2.54), motion: motion(tick), carry: { carryId, partnerId: '101', role: 'CARRIED' } },
      { userId: '103', position: position(10), motion: motion(tick), carry: null },
    ],
  } })
}

it('attaches the held player to local prediction between server packets without changing authoritative coordinates', () => {
  connect('101'); world(3, 0)
  const predicted = pose()
  vi.spyOn(localMovement, 'sample').mockImplementation((_now, out) => { Object.assign(out, predicted); return true })
  for (let frame = 0; frame < 60; frame++) {
    Object.assign(predicted, { x: frame * .15, y: .84, z: 78 - frame * .04, yaw: frame * .03 })
    const held = sampleAvatar(avatars.get('102')!, frame * 16, pose())
    expect(held).toEqual({ ...predicted, y: predicted.y + 1.7 })
  }
  expect(avatars.get('102')!.current.x).toBe(0)
})

it.each(['102', '103'])('shares the remote carrier timeline for carried and observing clients (%s)', ownId => {
  connect(ownId); world(3, 0)
  world(6, .9); world(9, 1.8)
  let lastCarrier = pose()
  for (let frame = 0; frame < 40; frame++) {
    const at = performance.now() + frame * 16
    const carrier = sampleAvatar(avatars.get('101')!, at, pose())
    const held = sampleAvatar(avatars.get('102')!, at, pose())
    expect(held).toEqual({ ...carrier, y: carrier.y + 1.7 })
    lastCarrier = carrier
  }
  expect(lastCarrier.x).toBeCloseTo(1.8)
})

it('stops attaching on throw, release, missing partners and mismatched relationships', () => {
  connect('101'); world(3, 0)
  vi.spyOn(localMovement, 'sample').mockImplementation((_now, out) => {
    Object.assign(out, { x: 20, y: .84, z: 78, yaw: 2 }); return true
  })
  const held = avatars.get('102')!, carrier = avatars.get('101')!
  for (const role of ['THROWN', null] as const) {
    held.carry = role ? { carryId, partnerId: '101', role } : null
    expect(sampleAvatar(held, performance.now() + 1000, pose()).x).toBe(0)
  }
  held.carry = { carryId, partnerId: '101', role: 'CARRIED' }
  carrier.carry = { carryId: '22222222-2222-4222-8222-222222222222', partnerId: '102', role: 'CARRIER' }
  expect(sampleAvatar(held, performance.now() + 1000, pose()).x).toBe(0)
  carrier.carry = { carryId, partnerId: '103', role: 'CARRIER' }
  expect(sampleAvatar(held, performance.now() + 1000, pose()).x).toBe(0)
  carrier.carry = { carryId, partnerId: '102', role: 'CARRIED' }
  expect(sampleAvatar(held, performance.now() + 1000, pose()).x).toBe(0)
  avatars.delete('101')
  expect(sampleAvatar(held, performance.now() + 1000, pose()).x).toBe(0)
})
