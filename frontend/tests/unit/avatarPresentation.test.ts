import { expect, it } from 'vitest'
import { AvatarPresentation } from '../../src/world/avatarPresentation'
import { AvatarPoseCadence } from '../../src/performance/avatarPoseCadence'
import { avatarPoseActive, avatarPoseAmbient, avatarPoseKey } from '../../src/world/avatarMotion'
import type { AvatarSnapshot } from '../../src/network/worldClient'

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
