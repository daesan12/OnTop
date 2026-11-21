import type { TableState, TableSummary } from '../../network/protocol'
import type { StartState } from '../../game/protocol'
import { tableBusy, type useGame } from '../../game/store'
import { RENEWAL_PARK_ENABLED } from '../../park/mapSelection'

export const ALKKAGI_ENABLED = import.meta.env.VITE_ALKKAGI_ENABLED === 'true'
  || (RENEWAL_PARK_ENABLED && import.meta.env.VITE_ALKKAGI_ENABLED !== 'false')
export const STONE_RUMBLE_ENABLED = import.meta.env.VITE_STONE_RUMBLE_ENABLED === 'true'
  || (import.meta.env.DEV && import.meta.env.MODE === 'park-renewal-integration' && import.meta.env.VITE_STONE_RUMBLE_ENABLED !== 'false')
const GAME_OPTIONS = [
  ...(STONE_RUMBLE_ENABLED ? [{ code: 'STONE_RUMBLE', name: '돌탑 생존전', capacity: 8, playable: true }] as const : []),
  { code: 'ALKKAGI', name: '알까기', capacity: 2, playable: ALKKAGI_ENABLED },
  { code: 'OMOK', name: '오목', capacity: 2, playable: true },
  { code: 'DICE', name: '주사위 한 판', capacity: 4, playable: true },
  { code: 'ONE_CARD', name: '원카드', capacity: 4, playable: true },
  { code: 'LIAR_BRIDGE', name: '거짓말 다리 건너기', capacity: 4, playable: false },
  { code: 'DICE_LEDGER', name: '주사위 장부', capacity: 4, playable: true },
  { code: 'QUORIDOR', name: '쿼리도', capacity: 4, playable: true },
  { code: 'HALLI_GALLI', name: '과일 땡', capacity: 4, playable: true },
] as const
export const TABLE_GAMES = GAME_OPTIONS
export type TableGameCode = typeof GAME_OPTIONS[number]['code']
/** Display only server-approved room terms, including rooms retained after the host leaves. */
export function tableTermsLabel(table: Pick<TableSummary, 'gameCode' | 'betAmountPerPlayer'> | undefined) {
  if (!table) return '방 설정 확인 중'
  const name = TABLE_GAMES.find(game => game.code === table.gameCode)?.name ?? (table.gameCode ? '게임 정보 확인 중' : '게임 선택 중')
  const amount = table.betAmountPerPlayer
  return `${name} · ${amount != null && Number.isSafeInteger(amount) && amount >= 0 ? `1인 판돈 ${amount.toLocaleString('ko-KR')}냥` : '판돈 미정'}`
}
export const GAME_CONSTRUCTION_NOTICE = '공사 중인 게임입니다. 이용 가능한 게임을 선택해주세요.'
export const isTableGamePlayable = (code: string | null | undefined) => TABLE_GAMES.some(game => game.code === code && game.playable)
export const TARGET_SCORES = [2000, 4000, 6000] as const
export function gameSelection(code: TableGameCode, betAmountPerPlayer: number, targetScore?: number) {
  if (!Number.isSafeInteger(betAmountPerPlayer) || betAmountPerPlayer < 0) throw new Error('참가비를 0 이상의 정수로 입력해주세요.')
  if (!TABLE_GAMES.some(g => g.code === code)) throw new Error('지원하는 게임을 선택해주세요.')
  if (!isTableGamePlayable(code)) throw new Error(GAME_CONSTRUCTION_NOTICE)
  const maxPlayers = TABLE_GAMES.find(g => g.code === code)!.capacity
  if (!Number.isSafeInteger(betAmountPerPlayer * maxPlayers)) throw new Error('전체 판돈이 지원 범위를 초과합니다.')
  if (code === 'DICE') {
    if (!TARGET_SCORES.some(score => score === targetScore)) throw new Error('목표 점수를 선택해주세요.')
    return { gameCode: code, targetScore, betAmountPerPlayer }
  }
  if (targetScore !== undefined) throw new Error('이 게임은 목표 점수를 사용하지 않습니다.')
  return { gameCode: code, betAmountPerPlayer }
}
export function lobbyStatus(table: TableState, ownId: string, busy: boolean) {
  const mine = table.seats.find(s => s.userId === ownId)
  const count = table.seats.filter(s => s.userId).length
  return {
    mine, count, host: table.selectorUserId === ownId,
    canLeaveByMovement: !!mine && !mine.ready && !busy,
    canReady: !!mine && !busy && table.betAmountPerPlayer != null && table.betAmountPerPlayer >= 0
      && isTableGamePlayable(table.gameCode),
    message: count < table.minimumPlayers
      ? `최소 ${table.minimumPlayers}명 필요 · 현재 ${count}명`
      : table.allReady ? '전원 준비 완료 · 서버 시작 상태 대기' : '참가자 모두 준비하면 서버가 시작을 확인합니다.',
  }
}
export const waitingForRound = (start: StartState | null, tableId: string) =>
  start?.tableId === tableId && start.phase === 'WAITING' && !start.simulation

/** Missing optional start events must not prevent a normal TABLE_LEAVE request.
 * The server still checks WAITING; no local unseat, resign or next-round fallback.
 */
export function canLeaveByMovement(table: TableState, ownId: string, game: ReturnType<typeof useGame.getState>) {
  return lobbyStatus(table, ownId, tableBusy(game)).canLeaveByMovement
    && !game.pending && !game.uncertain && !game.game && !game.permittedGameId && !game.watchedGameId
    && (!game.start || (game.start.tableId === table.tableId && game.start.phase === 'WAITING'))
    && (!game.lastResult || game.lastResult.settlementStatus === 'SETTLED')
}
