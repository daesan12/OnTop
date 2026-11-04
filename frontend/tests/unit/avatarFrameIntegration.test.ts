import { afterEach, expect, it, vi } from 'vitest'
import { AvatarFrame } from '../../src/network/avatarFrame'
import { EXPECTED_MAP_VERSION } from '../../src/config/mapVersion'
import { authoritativePose, avatars, receive, resetWorld, sampleAvatar, useSession } from '../../src/network/worldClient'
import { remoteMovement } from '../../src/network/remoteMovement'
import { localMovement } from '../../src/network/localMovementPrediction'

afterEach(() => { resetWorld(); vi.restoreAllMocks() })
const point = (x = 0) => ({ x, y: .8, z: 34, yaw: 0 })
const frame = () => new AvatarFrame(sampleAvatar, avatar => avatar === avatars.get(useSession.getState().sessionId))
function setup() {
  resetWorld('connected')
  useSession.setState({ sessionId: '101', roomId: 'one', mapCompatible: true })
  return vi.spyOn(performance, 'now').mockReturnValue(0)
}
function state(version: number, x: number, epoch = 0, swimming = false, own = false) {
  receive({ type: 'WORLD_STATE', requestId: null, payload: { channelId: 'one', version, mapVersion: EXPECTED_MAP_VERSION,
    avatars: [{ userId: own ? '101' : '102', position: { ...point(x), lastInputSeq: 0, moving: true, running: true, swimming },
      motion: { epoch, tick: version * 3, appliedInputSeq: 0, inputAgeMs: 0, velocityY: 0, grounded: true, inputActive: true } }],
  } })
}

it('shares the displayed remote pose and swimming flags without changing authoritative coordinates', () => {
  const clock = setup()
  state(1, 0); clock.mockReturnValue(100); state(2, .9, 0, true)
  const cache = frame(), body = point(), water = point(), source = avatars.get('102')!
  const sample = vi.spyOn(remoteMovement, 'sample')
  cache.begin(); cache.sample(source, 290, body)
  const flags = remoteMovement.flags('102')
  cache.sample(source, 295, water)
  expect(sample).toHaveBeenCalledTimes(1)
  expect(water).toEqual(body)
  expect(remoteMovement.flags('102')).toBe(flags)
  expect(authoritativePose('102')!.x).toBe(.9)
  expect(source.current.x).toBe(.9)
})

it('keeps packet processing uncached and immediately displays a new movement epoch or reconnected user', () => {
  const clock = setup()
  state(1, 0); clock.mockReturnValue(100); state(2, .9)
  const cache = frame(), p = point(), sample = vi.spyOn(remoteMovement, 'sample')
  cache.begin(); cache.sample(avatars.get('102')!, 290, p)
  sample.mockClear(); clock.mockReturnValue(300); state(3, 50, 1)
  expect(sample).toHaveBeenCalled() // receive computes continuity through the unchanged raw API.
  cache.sample(avatars.get('102')!, 300, p)
  expect(p.x).toBe(50)
  resetWorld('connected'); useSession.setState({ sessionId: '101', roomId: 'one', mapCompatible: true })
  clock.mockReturnValue(400); state(1, -40, 2)
  cache.sample(avatars.get('102')!, 400, p)
  expect(p.x).toBe(-40)
})

it('reads local prediction again for every visual consumer at its current input time', () => {
  const clock = setup()
  state(1, 0, 0, false, true)
  const prediction = vi.spyOn(localMovement, 'sample').mockImplementation((now, p) => {
    Object.assign(p, point(now)); return true
  })
  const cache = frame(), source = avatars.get('101')!, p = point()
  cache.begin(); clock.mockReturnValue(10); cache.sample(source, 10, p)
  expect(p.x).toBe(10)
  cache.sample(source, 11, p)
  expect(p.x).toBe(11)
  expect(prediction).toHaveBeenCalledTimes(2)
  expect(authoritativePose('101')!.x).toBe(0)
})
