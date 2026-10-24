import type { TableState } from '../../network/protocol'
import type { StartState } from '../../game/protocol'

export const TABLE_GAMES = [
  { code: 'OMOK', name: '오목', capacity: 2, playable: true },
  { code: 'DICE', name: '주사위 한 판', capacity: 2, playable: true },
  { code: 'ONE_CARD', name: '원카드', capacity: 4, playable: true },
  { code: 'LIAR_BRIDGE', name: '거짓말 다리 건너기', capacity: 4, playable: true },
] as const
export type TableGameCode = typeof TABLE_GAMES[number]['code']
export const TARGET_SCORES = [2000, 4000, 6000] as const
export function gameSelection(code: TableGameCode, targetScore?: number) {
  if (!TABLE_GAMES.some(g => g.code === code)) throw new Error('지원하는 게임을 선택해주세요.')
  if (code === 'DICE') {
    if (!TARGET_SCORES.some(score => score === targetScore)) throw new Error('목표 점수를 선택해주세요.')
    return { gameCode: code, targetScore }
  }
  if (targetScore !== undefined) throw new Error('이 게임은 목표 점수를 사용하지 않습니다.')
  return { gameCode: code }
}
export function lobbyStatus(table: TableState, ownId: string, busy: boolean) {
  const mine = table.seats.find(s => s.userId === ownId)
  const count = table.seats.filter(s => s.userId).length
  return {
    mine, count, host: table.selectorUserId === ownId,
    canLeaveByMovement: !!mine && !mine.ready && !busy,
    canReady: !!mine && !busy && TABLE_GAMES.some(g => g.code === table.gameCode && g.playable),
    message: count < table.minimumPlayers
      ? `최소 ${table.minimumPlayers}명 필요 · 현재 ${count}명`
      : table.allReady ? '전원 준비 완료 · 서버 시작 상태 대기' : '참가자 모두 준비하면 서버가 시작을 확인합니다.',
  }
}
export const waitingForRound = (start: StartState | null, tableId: string) =>
  start?.tableId === tableId && start.phase === 'WAITING' && !start.simulation
