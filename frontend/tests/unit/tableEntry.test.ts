import { beforeEach, expect, it } from 'vitest'
import { avatars, resetWorld, useSession, type AvatarSnapshot } from '../../src/network/worldClient'
import { tableEntry } from '../../src/features/tableLobby/tableEntry'
import { TABLES } from '../../src/config'

const anchorId = TABLES[0]!.id, tableId = 'entry-table'
beforeEach(() => {
  resetWorld()
  useSession.setState({ status: 'connected', roomId: 'room',
    bindings: [{ channelId: 'room', tableId, anchorId }],
    tables: [{ tableId, capacity: 4, occupiedSeats: 0, availableSeats: 4,
      joinable: true, gameCode: null, betAmountPerPlayer: null, status: 'WAITING' }],
    publicTables: { [tableId]: { tableId, anchorId, chairCount: 2 } } })
})
const seat = (id: string, seatIndex: number) => avatars.set(id,
  { connected: true, tableId: anchorId, seatIndex } as AvatarSnapshot)

it('오래된 빈자리 HTTP보다 실시간 두 좌석의 만석을 우선한다', () => {
  seat('102', 0)
  expect(tableEntry(anchorId)).toBe('sit')
  seat('103', 1)
  expect(tableEntry(anchorId)).toBe('watch')
})
it('세 명과 네 명 테이블도 마지막 착석과 퇴장을 즉시 반영한다', () => {
  for (const chairCount of [3, 4] as const) {
    avatars.clear()
    useSession.setState({ publicTables: { [tableId]: { tableId, anchorId, chairCount } } })
    for (let i = 0; i < chairCount - 1; i++) seat(String(i), i)
    expect(tableEntry(anchorId)).toBe('sit')
    seat('last', chairCount - 1)
    expect(tableEntry(anchorId)).toBe('watch')
    avatars.delete('last')
    expect(tableEntry(anchorId)).toBe('sit')
  }
})
it('게임 중인 사용자가 있으면 빈자리처럼 보여도 관전 경로를 선택한다', () => {
  seat('102', 0); useSession.setState({ activities: { '102': 'GAME' } })
  expect(tableEntry(anchorId)).toBe('watch')
})
it('퇴장 후 최신 월드가 빈자리를 확정하면 오래된 HTTP 만석을 무시한다', () => {
  useSession.setState({ tables: [{ ...useSession.getState().tables[0]!, joinable: false,
    status: 'PLAYING', occupiedSeats: 4, availableSeats: 0 }] })
  expect(tableEntry(anchorId)).toBe('sit')
  useSession.setState({ publicTables: null })
  expect(tableEntry(anchorId)).toBe('watch')
})
