import { avatars, useSession } from '../../network/worldClient'
import { bindAnchor } from '../../network/tableBindings'

/** 표시/입력의 공통 선택 기준. 실제 참가·관전 권한은 서버 응답만 확정한다. */
export function tableEntry(anchorId: string): 'sit' | 'watch' {
  const s = useSession.getState()
  const tableId = bindAnchor(s.bindings, s.roomId, anchorId, s.tables.map(t => t.tableId))
  if (!tableId) return 'sit'
  const summary = s.tables.find(t => t.tableId === tableId), detail = s.tableStates[tableId]
  const published = s.publicTables?.[tableId]
  const seats = [...avatars.entries()].filter(([, avatar]) => avatar.connected
    && avatar.tableId === anchorId && avatar.seatIndex >= 0)
  const playing = seats.some(([id]) => s.activities[id] === 'GAME')
  if (s.publicTables !== null) {
    // 최신 전체 월드 스냅샷은 오래된 HTTP 만석/빈자리 정보보다 우선한다.
    const count = published?.anchorId === anchorId ? published.chairCount : 2
    return playing || seats.length >= count ? 'watch' : 'sit'
  }
  if (playing || detail?.gameId) return 'watch'
  if (detail) {
    const count = detail.startMode === 'MANUAL' ? detail.selectedPlayers ?? detail.capacity : detail.capacity
    return detail.seats.filter(seat => seat.userId).length >= count ? 'watch' : 'sit'
  }
  return summary?.joinable === false || summary?.availableSeats === 0 ? 'watch' : 'sit'
}
