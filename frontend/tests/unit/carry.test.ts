import { beforeEach, expect, it, vi } from 'vitest'
import { avatars, receive, resetWorld, useSession } from '../../src/network/worldClient'
import { EXPECTED_MAP_VERSION } from '../../src/config/mapVersion'
import { carryInteraction, carryPlayerAvailable, interactWithAvatar } from '../../src/features/carry/interaction'
import { interactionAim, setInteractionCamera } from '../../src/features/interactions/interactionAim'
import { PerspectiveCamera } from 'three'
import { parkRuntime } from '../../src/park/runtime/runtime'
import { worldState } from '../../src/network/protocol'
import { useFollow } from '../../src/features/follow/state'

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

it('selects a nearby player and sends one pickup or normalized camera-direction throw', () => {
  expect(carryInteraction()).toMatchObject({ kind: 'avatar-pickup', id: '102' })
  interactWithAvatar('avatar-pickup', '102')
  expect(parkRuntime.pickupAvatar).toHaveBeenCalledWith('102')
  avatars.get('101')!.carry = { carryId, partnerId: '102', role: 'CARRIER' }
  expect(carryInteraction()).toMatchObject({ kind: 'avatar-throw' })
  Object.assign(interactionAim, { dx: 0, dy: .6, dz: -.8 })
  interactWithAvatar('avatar-throw', '102')
  expect(parkRuntime.throwAvatar).toHaveBeenCalledWith(carryId, { dx: 0, dy: .6, dz: -.8 })
})

it.each([
  [2.1, 0, true], [2.2, 0, true], [-2.2, 0, true], [0, 2.19, true],
  [2.2001, 0, false], [0, 2.21, false], [1.3, 1.7, true], [1.6, 1.6, false],
] as const)('offers pickup at horizontal offset (%s, %s) only within 2.2m: %s', (x, z, available) => {
  Object.assign(avatars.get('102')!.current, { x, z })
  expect(carryInteraction()?.kind === 'avatar-pickup').toBe(available)
})

it('reads the actual camera on E instead of a stale aim snapshot or the avatar heading', () => {
  const camera = new PerspectiveCamera()
  setInteractionCamera(camera)
  avatars.get('101')!.carry = { carryId, partnerId: '102', role: 'CARRIER' }
  for (const [x, y, z] of [[1, .4, 0], [-1, -.4, 0], [0, .3, 1]]) {
    camera.lookAt(x!, y!, z!)
    interactWithAvatar('avatar-throw', '102')
    const length = Math.hypot(x!, y!, z!)
    const sent = vi.mocked(parkRuntime.throwAvatar!).mock.calls.at(-1)![1]
    expect(sent.dx).toBeCloseTo(x! / length)
    expect(sent.dy).toBeCloseTo(y! / length)
    expect(sent.dz).toBeCloseTo(z! / length)
  }
  expect(interactionAim.dz).toBe(-1)
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

it('never offers pickup for distant, moving, carried or thrown players or while pending', () => {
  const other = avatars.get('102')!
  other.current.x = 3
  expect(carryInteraction()).toBeNull()
  other.current.x = 0
  other.moving = true
  expect(carryInteraction()).toBeNull()
  other.moving = false
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
