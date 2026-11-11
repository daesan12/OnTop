import { afterEach, beforeEach, expect, it } from 'vitest'
import { receive, resetWorld, useSession } from '../../src/network/worldClient'
import { worldState } from '../../src/network/protocol'
import { EXPECTED_MAP_VERSION } from '../../src/config/mapVersion'

const snapshot = (version: number, myRoomOpen?: unknown, activity: string | null = null) => ({
  channelId: 'a', version, mapVersion: EXPECTED_MAP_VERSION,
  avatars: [{ userId: '101', position: { x: 0, y: .8, z: 0, yaw: 0, lastInputSeq: 0, moving: false, running: false, swimming: false },
    activity, ...(myRoomOpen === undefined ? {} : { myRoomOpen }) }],
})
beforeEach(() => {
  resetWorld()
  receive({ type: 'CONNECTED', requestId: null, payload: { userId: '101' } })
  receive({ type: 'CHANNEL_STATE', requestId: null, payload: { channelId: 'a', name: '공원', version: 1, currentUsers: 1, capacity: 4, userIds: ['101'] } })
})
afterEach(() => resetWorld())
it('마이룸 선택 필드는 이전 서버 생략과 boolean만 허용한다', () => {
  expect(() => worldState(snapshot(1))).not.toThrow()
  expect(worldState(snapshot(1, true)).avatars[0]!.activity).toBeNull()
  expect(() => worldState(snapshot(1, 'true'))).toThrow()
  expect(() => worldState(snapshot(1, null))).toThrow()
})
it('표시만 투영하고 최신 해제·이전 버전·경기 우선순위를 지킨다', () => {
  const apply = (v: ReturnType<typeof snapshot>) => receive({ type: 'WORLD_STATE', requestId: null, payload: v })
  apply(snapshot(1, true)); expect(useSession.getState().activities['101']).toBe('MYROOM')
  apply(snapshot(2, false)); expect(useSession.getState().activities['101']).toBeUndefined()
  apply(snapshot(1, true)); expect(useSession.getState().activities['101']).toBeUndefined()
  apply(snapshot(3, true, 'GAME')); expect(useSession.getState().activities['101']).toBe('GAME')
  apply(snapshot(4)); expect(useSession.getState().activities['101']).toBeUndefined()
})
