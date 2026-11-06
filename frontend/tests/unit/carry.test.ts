import { beforeEach, expect, it, vi } from 'vitest'
import { avatars, receive, resetWorld, useSession } from '../../src/network/worldClient'
import { EXPECTED_MAP_VERSION } from '../../src/config/mapVersion'
import { carryInteraction, carryPlayerAvailable, interactWithAvatar } from '../../src/features/carry/interaction'
import { interactionAim, setInteractionCamera } from '../../src/features/interactions/interactionAim'
import { PerspectiveCamera } from 'three'
import { parkRuntime } from '../../src/park/runtime/runtime'
import { worldState } from '../../src/network/protocol'
import { useFollow } from '../../src/features/follow/state'
import { localMovement } from '../../src/network/localMovementPrediction'

vi.mock('../../src/park/runtime/runtime', () => ({ parkRuntime: { pickupAvatar: vi.fn(), throwAvatar: vi.fn() } }))
const carryId = '11111111-1111-4111-8111-111111111111'
beforeEach(() => {
  vi.clearAllMocks()
  setInteractionCamera(null)
  resetWorld()
  receive({ type: 'CONNECTED', requestId: null, payload: { userId: '101' } })
  receive({ type: 'CHANNEL_STATE', requestId: null, payload: {
    channelId: 'a', name: '공원', version: 1, currentUsers: 2, capacity: 4, userIds: ['101', '102'],
  } })
  receive({ type: 'WORLD_STATE', requestId: null, payload: { channelId: 'a', version: 1, mapVersion: EXPECTED_MAP_VERSION,
    avatars: ['101', '102'].map((userId, i) => ({ userId, carry: null, position: {
      x: 0, y: .84, z: -i, yaw: 0, lastInputSeq: 0, moving: false, running: false, swimming: false,
    } })),
  } })
  Object.assign(interactionAim, { ready: true, x: 0, y: 1, z: 5, dx: 0, dy: 0, dz: -1 })
})

it('selects a nearby player and throws along the character front even when the camera faces backwards', () => {
  expect(carryInteraction()).toMatchObject({ kind: 'avatar-pickup', id: '102' })
  interactWithAvatar('avatar-pickup', '102')
  expect(parkRuntime.pickupAvatar).toHaveBeenCalledWith('102')
  avatars.get('101')!.carry = { carryId, partnerId: '102', role: 'CARRIER' }
  expect(carryInteraction()).toMatchObject({ kind: 'avatar-throw' })
  Object.assign(interactionAim, { dx: 0, dy: .6, dz: -.8 })
  interactWithAvatar('avatar-throw', '102')
  expect(parkRuntime.throwAvatar).toHaveBeenCalledWith(carryId, { dx: 0, dy: 0, dz: 1 })
})

it.each([
  [2.5, 0, true], [2.6, 0, true], [-2.6, 0, true], [0, 2.59, true],
  [2.6001, 0, false], [0, 2.61, false], [1.8, 1.8, true], [1.9, 1.9, false],
] as const)('offers pickup at horizontal offset (%s, %s) only within 2.6m: %s', (x, z, available) => {
  Object.assign(avatars.get('102')!.current, { x, z })
  expect(carryInteraction()?.kind === 'avatar-pickup').toBe(available)
})

it('uses the displayed predicted heading on E independently of camera yaw and pitch or stale server yaw', () => {
  const camera = new PerspectiveCamera()
  setInteractionCamera(camera)
  avatars.get('101')!.carry = { carryId, partnerId: '102', role: 'CARRIER' }
  let yaw = 0
  vi.spyOn(localMovement, 'sample').mockImplementation((_now, pose) => {
    Object.assign(pose, { x: 0, y: .84, z: 0, yaw }); return true
  })
  for (const heading of [0, Math.PI / 2, -Math.PI / 2, Math.PI]) {
    yaw = heading
    camera.lookAt(-Math.sin(yaw), .6, -Math.cos(yaw))
    interactWithAvatar('avatar-throw', '102')
    const sent = vi.mocked(parkRuntime.throwAvatar!).mock.calls.at(-1)![1]
    expect(sent.dx).toBeCloseTo(Math.sin(yaw))
    expect(sent.dy).toBe(0)
    expect(sent.dz).toBeCloseTo(Math.cos(yaw))
  }
  expect(interactionAim.dz).toBe(-1)
  expect(avatars.get('101')!.current.yaw).toBe(0)
  setInteractionCamera(null)
})

it('excludes both participants during games, facilities, swimming, emotes and following', () => {
  for (const id of ['101', '102']) {
    const avatar = avatars.get(id)!
    for (const activity of ['GAME', 'BUNGEOPPANG', 'WATCHING', 'SHOP'] as const) {
      useSession.setState({ activities: { [id]: activity } })
      expect(carryPlayerAvailable(id, avatar)).toBe(false)
      expect(carryInteraction()).toBeNull()
    }
    useSession.setState({ activities: {} })
    for (const patch of [{ interactionBusy: true }, { tableId: 'table' }, { seatIndex: 0 }, { fitnessId: 'walker' }, { telescopeId: 'scope' },
      { swimming: true }, { emote: 'EMOTE_WAVE', emoteAt: Date.now() }]) {
      expect(carryPlayerAvailable(id, { ...avatar, ...patch }, Date.now())).toBe(false)
    }
  }
  useFollow.setState({ links: [{ followerId: '102', targetId: '101' }] })
  expect(carryInteraction()).toBeNull()
})

it.each([false, true])('offers pickup while both players move or jump (running=%s)', running => {
  const own = avatars.get('101')!, other = avatars.get('102')!
  own.moving = other.moving = true
  own.running = other.running = running
  for (const id of ['101', '102']) {
    Object.assign(avatars.get(id)!.current, { y: 1.84 })
    expect(carryInteraction()).toMatchObject({ kind: 'avatar-pickup', id: '102' })
    avatars.get(id)!.current.y = .84
  }
})

it.each([1, 2, 2.0001])('keeps a bounded vertical pickup reach while allowing jumping height %s', height => {
  avatars.get('101')!.current.y = .84
  avatars.get('102')!.current.y = .84 + height
  expect(carryInteraction()?.kind === 'avatar-pickup').toBe(height <= 2)
})

it('never offers pickup for distant, carried or thrown players or while pending', () => {
  const other = avatars.get('102')!
  other.current.x = 3
  expect(carryInteraction()).toBeNull()
  other.current.x = 0
  for (const role of ['CARRIED', 'THROWN'] as const) {
    other.carry = { carryId, partnerId: '101', role }
    expect(carryInteraction()).toBeNull()
  }
  other.carry = null
  useSession.setState({ pending: true })
  expect(carryInteraction()).toBeNull()
})

it('rejects malformed carry wire states before presenting a player', () => {
  const state = { channelId: 'a', version: 1, mapVersion: EXPECTED_MAP_VERSION, avatars: [{ userId: '101',
    position: { ...avatars.get('101')!.current, lastInputSeq: 0, moving: false, running: false, swimming: false },
    carry: { carryId, partnerId: '101', role: 'CARRIER' },
  }] }
  expect(() => worldState(state)).toThrow()
  state.avatars[0]!.carry.partnerId = '102'
  expect(worldState(state).avatars[0]!.carry?.role).toBe('CARRIER')
})
