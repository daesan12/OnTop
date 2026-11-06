import { describe, expect, it, vi, afterEach } from 'vitest'
import { searchCoopRooms } from '../../src/features/skewer/coop/roomSearch'
import type { CoopRoom } from '../../src/features/skewer/coop/contracts'

const rooms: CoopRoom[] = [
  { gameId: 'one', roomName: '달빛 꼬치집', hostNickname: '푸른하늘', locked: true, players: 1, mine: false },
  { gameId: 'two', roomName: 'OnTop 친구 가게', hostNickname: '밤톨', locked: false, players: 1, mine: false },
]
describe('가게 검색', () => {
  it('이름과 닉네임의 일부로 찾고 여러 검색어를 함께 적용한다', () => {
    expect(searchCoopRooms(rooms, '달빛')).toEqual([rooms[0]])
    expect(searchCoopRooms(rooms, '하늘')).toEqual([rooms[0]])
    expect(searchCoopRooms(rooms, '달빛 푸른')).toEqual([rooms[0]])
    expect(searchCoopRooms(rooms, '달빛 밤톨')).toEqual([])
  })
  it('띄어쓰기와 영문 대소문자 및 호환 문자를 정규화한다', () => {
    expect(searchCoopRooms(rooms, ' 달빛꼬치집  ')).toEqual([rooms[0]])
    expect(searchCoopRooms(rooms, 'ＯＮＴＯＰ')).toEqual([rooms[1]])
    expect(searchCoopRooms(rooms, '   ')).toEqual(rooms)
  })
  it('빈 결과를 구분하고 원본 목록의 잠금·정원 정보를 보존한다', () => {
    expect(searchCoopRooms(rooms, '없는가게')).toEqual([])
    expect(searchCoopRooms([], '달빛')).toEqual([])
    expect(searchCoopRooms(rooms, '달빛')[0]).toBe(rooms[0])
    expect(rooms).toHaveLength(2)
  })
})
describe('꼬치왕 공개 범위', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })
  it('기본 공원 입장은 열되 요리사 VR 선택은 잠근다', async () => {
    vi.stubEnv('VITE_SKEWER_COOP_ENABLED', undefined)
    const policy = await import('../../src/features/skewer/coop/availability')
    expect(policy.SKEWER_COOP_ENABLED).toBe(true)
    expect(policy.SKEWER_CHEF_VR_ENABLED).toBe(false)
  })
  it('명시적인 긴급 점검 설정은 존중한다', async () => {
    vi.stubEnv('VITE_SKEWER_COOP_ENABLED', 'false')
    expect((await import('../../src/features/skewer/coop/availability')).SKEWER_COOP_ENABLED).toBe(false)
  })
})
