import { afterEach, expect, it } from 'vitest'
import { receive, resetWorld, useSession } from '../../src/network/worldClient'
import { EXPECTED_MAP_VERSION } from '../../src/config/mapVersion'
import { tableGameCode } from '../../src/features/tableLobby/tableGamePresentation'
import { worldState } from '../../src/network/protocol'
const position = { x: 0, y: .8, z: 0, yaw: 0, lastInputSeq: 0, moving: false, running: false, swimming: false }
const frame = (version: number, gameCode: unknown) => ({ channelId: 'park', version, mapVersion: EXPECTED_MAP_VERSION,
  avatars: [{ userId: '101', position }], tables: [{ tableId: 't', anchorId: 'table-1', chairCount: 2, gameCode }] })
afterEach(() => resetWorld())
it('같은 의자 수에서도 게임 선택·변경·초기화와 오래된 상태를 정확히 반영한다', () => {
  resetWorld()
  receive({ type: 'CONNECTED', requestId: null, payload: { userId: '101' } })
  receive({ type: 'CHANNEL_STATE', requestId: null, payload: { channelId: 'park', name: '공원', version: 1, capacity: 16, currentUsers: 1, userIds: ['101'] } })
  useSession.setState({ bindings: [{ channelId: 'park', tableId: 't', anchorId: 'table-1' }] })
  let version = 1
  for (const game of ['OMOK', 'ONE_CARD', 'DICE_LEDGER', null]) {
    receive({ type: 'WORLD_STATE', requestId: null, payload: frame(version++, game) })
    expect(tableGameCode(useSession.getState(), 'table-1')).toBe(game)
    expect(useSession.getState().tableId).toBe('')
    expect(useSession.getState().watchedTableId).toBe('')
  }
  receive({ type: 'WORLD_STATE', requestId: null, payload: frame(1, 'OMOK') })
  expect(tableGameCode(useSession.getState(), 'table-1')).toBeNull()
})
it.each([12, {}, '', ' '.repeat(3), 'X'.repeat(65)])('잘못된 공개 게임 코드는 거절한다: %j', game => {
  expect(() => worldState(frame(1, game))).toThrow()
})
