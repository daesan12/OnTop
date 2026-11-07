import { expect, it } from 'vitest'
import { AvatarPresentation } from '../../src/world/avatarPresentation'
import { AvatarPoseCadence } from '../../src/performance/avatarPoseCadence'
import { avatarPoseActive, avatarPoseAmbient, avatarPoseKey } from '../../src/world/avatarMotion'
import type { AvatarSnapshot } from '../../src/network/worldClient'
import { RemoteMovement } from '../../src/network/remoteMovement'

const pose = { x: 0, y: .8, z: 0, yaw: 0 }
const source = (): AvatarSnapshot => ({ userId: '102', previous: { ...pose }, current: { ...pose }, at: 0,
  nickname: '', color: 0, connected: true, moving: false, running: false, swimming: false,
  tableId: '', seatIndex: -1, benchId: '', fitnessId: '', fitnessStartedAt: 0, telescopeId: '', telescopeYaw: 0,
  telescopePitch: 0, followTargetId: '', emote: '', emoteAt: 0 })

it.each([false, true])('keeps animation cadence identical through pose transitions (own=%s)', own => {
  const a = source(), frame = new AvatarPresentation(), legacy = new AvatarPoseCadence(), candidate = new AvatarPoseCadence()
  for (let n = 0; n < 1400; n++) {
    const patch: Partial<AvatarSnapshot> | undefined = ({
      80: { moving: true }, 160: { running: true }, 240: { moving: false, running: false },
      360: { emote: 'EMOTE_WAVE', emoteAt: 6000 }, 540: { telescopeId: 'scope', telescopePitch: .4 },
      600: { telescopePitch: -.3 }, 660: { telescopeId: '', tableId: 'one-card', seatIndex: 2 },
      750: { tableId: '', seatIndex: -1, fitnessId: 'walker-1', fitnessStartedAt: 12500 },
      840: { fitnessId: '', swimming: true, moving: true }, 930: { swimming: false, moving: false, emote: '' },
      1100: { connected: false }, 1200: { connected: true },
    } as Record<number, Partial<AvatarSnapshot>>)[n]
    if (patch) Object.assign(a, patch)
    if (n === 1150) a.current.x = 8
    const now = n * 1000 / 60, active = avatarPoseActive(a, now), ambient = avatarPoseAmbient(a)
    const reaction = n >= 500 && n < 530 ? 'defeat' : '', held = n >= 680 && n < 720
    const key = `${avatarPoseKey(a)}|${reaction}|${held}|${active ? '' : `${a.current.x}|${a.current.y}|${a.current.z}`}`
    const distance = n % 200 < 100 ? 8 : 30
    expect(candidate.advance(1 / 60, distance, own, active, frame.key(a, reaction, held, active), ambient))
      .toBe(legacy.advance(1 / 60, distance, own, active, key, ambient))
  }
})

it('keeps local flags immediate and leaves source flags untouched across swimming and reconnect transitions', () => {
  const a = source(), presentation = new AvatarPresentation()
  a.swimming = true
  expect(presentation.sample(a, { moving: true, running: true })).toMatchObject({ moving: true, running: true, swimming: true })
  expect(a.moving).toBe(false)
  expect(presentation.sample(a, { moving: false, running: false, swimming: false }).swimming).toBe(false)
  expect(presentation.sample(source())).toMatchObject({ connected: true, moving: false, swimming: false, telescopeId: '' })
})

for (const running of [false, true]) for (const fps of [30, 60, 120]) {
  it(`stops a stationary remote ${running ? 'run' : 'walk'} without waiting for stale flags at ${fps}fps`, () => {
    const a = source(), presentation = new AvatarPresentation(), p = { ...pose }
    a.moving = true; a.running = running
    presentation.sample(a, undefined, p, 0)
    p.x = .1
    expect(presentation.sample(a, undefined, p, 1000 / fps)).toMatchObject({ moving: true, running })
    const stoppedAt = 2000 / fps
    expect(presentation.sample(a, undefined, p, stoppedAt)).toMatchObject({ moving: false, running: false })
    // Sampling the same instant must not turn the old server stride back on.
    expect(presentation.sample(a, undefined, p, stoppedAt)).toMatchObject({ moving: false, running: false })
    for (let n = 3; n < fps; n++)
      expect(presentation.sample(a, undefined, p, n * 1000 / fps)).toMatchObject({ moving: false, running: false })
    p.x += .1
    expect(presentation.sample(a, undefined, p, 1000)).toMatchObject({ moving: true, running })
    expect(a).toMatchObject({ moving: true, running, current: pose, previous: pose })
  })
}

it('keeps a buffered remote avatar idle when the displayed endpoint stops while its last packet still says moving', () => {
  const a = source(), presentation = new AvatarPresentation(), buffer = new RemoteMovement(), p = { ...pose }
  a.moving = a.running = true
  const snapshot = (tick: number) => ({ tick, epoch: 1, appliedInputSeq: tick, inputAgeMs: 0,
    velocityY: 0, grounded: true, inputActive: true })
  buffer.push('102', { ...pose, moving: true, running: true, swimming: false }, snapshot(0), 0)
  buffer.push('102', { ...pose, x: .8, moving: true, running: true, swimming: false }, snapshot(3), 100)
  for (let at = 180; at <= 400; at += 10) {
    buffer.sample('102', at, p)
    presentation.sample(a, buffer.flags('102'), p, at)
  }
  expect(p.x).toBeCloseTo(.8)
  expect(buffer.flags('102')?.moving).toBe(true)
  expect(presentation.sample(a, buffer.flags('102'), p, 410)).toMatchObject({ moving: false, running: false })
})

it('ignores sub-threshold ground drift and preserves local input flags, swimming and facility animations', () => {
  const a = source(), presentation = new AvatarPresentation(), p = { ...pose }
  a.moving = a.running = true
  presentation.sample(a, undefined, p, 0)
  p.x += .001
  expect(presentation.sample(a, undefined, p, 100)).toMatchObject({ moving: false, running: false })
  expect(presentation.sample(a, { moving: true, running: true })).toMatchObject({ moving: true, running: true })
  for (const patch of [{ swimming: true }, { tableId: 'table' }, { benchId: 'bench' },
    { fitnessId: 'fitness' }, { telescopeId: 'scope' }]) {
    const special = { ...a, ...patch }
    presentation.sample(special, undefined, p, 200)
    expect(presentation.sample(special, undefined, p, 300)).toMatchObject({ moving: true, running: true })
  }
})
