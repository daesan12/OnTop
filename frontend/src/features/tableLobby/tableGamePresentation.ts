import { useSession, type Session } from '../../network/worldClient'

/** 공원의 준비 에셋만 선택하며 착석·관전·경기 상태 접근 권한은 부여하지 않는다. */
export function tableGameCode(s: Pick<Session, 'roomId' | 'bindings' | 'publicTables' | 'tableStates' | 'tables'>, anchorId: string) {
  const id = s.bindings.find(b => b.channelId === s.roomId && b.anchorId === anchorId)?.tableId
  if (!id) return null
  if (s.publicTables !== null) {
    const published = s.publicTables[id]
    if (!published || published.anchorId !== anchorId) return null
    if (published.gameCode !== undefined) return published.gameCode
  }
  return s.tableStates[id]?.gameCode ?? s.tables.find(t => t.tableId === id)?.gameCode ?? null
}
export const useTableGameCode = (anchorId: string) => useSession(s => tableGameCode(s, anchorId))
