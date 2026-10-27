import { GOMOKU } from '../config'
import type { Omok } from './protocol'

export const OMOK_SIZE = 15
export const OMOK_SPACING = GOMOKU.boardSpan / (OMOK_SIZE - 1)
export const OMOK_HALF = GOMOKU.boardSpan / 2
export function omokCell(x: number, z: number) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null
  const column = Math.round((x + OMOK_HALF) / OMOK_SPACING)
  const row = Math.round((z + OMOK_HALF) / OMOK_SPACING)
  return column >= 0 && column < OMOK_SIZE && row >= 0 && row < OMOK_SIZE
    ? { x: column, y: row } : null
}
export const stonePoint = (x: number, y: number): [number, number, number] =>
  [x * OMOK_SPACING - OMOK_HALF, 0.019, y * OMOK_SPACING - OMOK_HALF]
export const lastMoveText = (move: Omok['lastMove']) => move
  ? `마지막 수: ${move.stone === 'BLACK' ? '흑' : '백'} · ${move.y + 1}행 ${move.x + 1}열`
  : '아직 놓인 돌이 없습니다.'
const reasons: Record<string, string> = {
  FIVE_IN_ROW: '오목 완성', BOARD_FULL: '빈 교차점 없음', TURN_TIMEOUT: '착수 시간 초과',
  RECONNECT_EXPIRED: '재접속 유예 만료', DISCONNECT_TIMEOUT: '접속 종료 유예 만료',
  FORFEIT: '기권', EXPLICIT_LEAVE: '수동 기권', VOLUNTARY_LEAVE: '참가자 퇴장',
}
export const omokEndReason = (reason: string | null) =>
  reason ? reasons[reason] ?? reason : '서버 결과 확인 중'
export function omokOutcome(omok: Omok, ownId: string, spectator: boolean) {
  if (!omok.winnerUserId) return '경기 종료 · 무승부'
  if (!spectator) return omok.winnerUserId === ownId ? '승리' : '패배'
  return `경기 종료 · ${omok.winnerUserId === omok.blackUserId ? '흑' : '백'} 승리`
}
