import { afterEach, expect, it, vi } from 'vitest'
import { EXPECTED_MAP_VERSION } from '../../src/config/mapVersion'
import { COURSE } from '../../src/features/jumpmap/course'
import { avatars, receive, resetWorld, sampleAvatar, useSession } from '../../src/network/worldClient'

afterEach(() => { resetWorld(); vi.restoreAllMocks() })

it('keeps both remote positions updating while overlapping on the same jump pad', () => {
  resetWorld('connected')
  useSession.setState({ sessionId: 'observer', roomId: 'one', mapCompatible: true })
  const clock = vi.spyOn(performance, 'now').mockReturnValue(0), pad = COURSE[0]!
  const pose = { x: pad.x, y: pad.top + .8, z: pad.z, yaw: 0 }
  const shown = { ...pose }
  for (let frame = 0; frame <= 20; frame++) {
    clock.mockReturnValue(frame * 100)
    receive({ type: 'WORLD_STATE', requestId: null, payload: {
      channelId: 'one', version: frame + 1, mapVersion: EXPECTED_MAP_VERSION,
      avatars: ['7', '8'].map((userId, index) => ({ userId,
        position: { ...pose, x: pad.x + (index ? -1 : 1) * frame * .01,
          lastInputSeq: frame, moving: true, running: false, swimming: false },
        motion: { tick: frame * 3, epoch: index + 1, appliedInputSeq: frame, inputAgeMs: 0,
          velocityY: 0, grounded: true, inputActive: true, authority: 'CLIENT_VALIDATED', profile: 'PARK_V1' },
      })),
    } })
    for (let display = 0; display < 6; display++)
      for (const user of ['7', '8']) sampleAvatar(avatars.get(user)!, frame * 100 + display * 1000 / 60, shown)
  }
  for (const [user, direction] of [['7', 1], ['8', -1]] as const) {
    expect(avatars.get(user)!.current.x).toBeCloseTo(pad.x + direction * .2)
    sampleAvatar(avatars.get(user)!, 2200, shown)
    expect(shown.x).toBeCloseTo(pad.x + direction * .2)
  }
})
