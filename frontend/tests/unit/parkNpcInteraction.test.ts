import { afterEach, expect, it, vi } from 'vitest'
vi.mock('../../src/park/mapSelection', () => ({ RENEWAL_PARK_ENABLED: false }))
vi.mock('../../src/park/renewalMap', () => ({ renewalGroundHeight: () => 4.085 }))
import { nearbyParkNpcs } from '../../src/features/ai/parkNpcInteraction'
import { resetCompanions, useCompanions, type CompanionActor } from '../../src/features/ai/companions'

afterEach(resetCompanions)
const resident: CompanionActor = { id: 'elder', name: '박영감', role: 'GUIDE', channelId: 'channel-1',
  x: 1, y: 4.085, z: 0, moving: false, seated: false }

it('같은 채널의 가까운 주민만 선택하며 대국 중 상대 NPC는 보존한다', () => {
  useCompanions.setState({ actorReceivedAt: 1000, actors: [resident,
    { ...resident, id: 'other-room', channelId: 'channel-2' },
    { ...resident, id: 'opponent', role: 'OPPONENT' },
    { ...resident, id: 'upstairs', y: 10 }, { ...resident, id: 'far', x: 10 }] })
  expect(nearbyParkNpcs({ x: 0, y: 4.845, z: 0 }, 'channel-1', 1100).map(n => n.id)).toEqual(['elder'])
})

it('오래된 수신 좌표로 상호작용하지 않고 새 주민 좌표를 사용한다', () => {
  useCompanions.setState({ actorReceivedAt: 1000, actors: [resident] })
  expect(nearbyParkNpcs({ x: 0, y: 4.845, z: 0 }, 'channel-1', 6100)).toEqual([])
  useCompanions.setState({ actorReceivedAt: 6200, actors: [{ ...resident, x: 20 }] })
  expect(nearbyParkNpcs({ x: 0, y: 4.845, z: 0 }, 'channel-1', 6300)).toEqual([])
  expect(nearbyParkNpcs({ x: 19, y: 4.845, z: 0 }, 'channel-1', 6300)[0]?.speaker).toBe('elder')
})
