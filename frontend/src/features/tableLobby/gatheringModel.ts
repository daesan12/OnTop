import type { TableState } from '../../network/protocol'
import { gameState, type Game, type Result, type StartState } from '../../game/protocol'
import { TABLE_GAMES } from './model'
import { omokEndReason } from '../../game/omokPresentation'
import { LEDGER_END_REASON } from '../../game/ledger/protocol'

export const GAME_MANUAL = { OMOK: 'gomoku', DICE: 'farkle', ONE_CARD: 'onecard', LIAR_BRIDGE: 'bridge', DICE_LEDGER: 'ledger' } as const

interface Context {
  table: TableState; ownId: string; game: Game | null; result: Result | null
  start: StartState | null; nickname: (id: string) => string
}
export function participantResultLabel(status: Result['status'], outcome: string | null) {
  if (status === 'INVALID') return outcome === null ? '판정 없음' : '무효'
  return ({ WIN: '승리', LOSE: '패배', DRAW: '무승부', FORFEIT: '기권', ELIMINATED: '탈락' } as Record<string, string>)[outcome ?? ''] ?? '경기 종료'
}
export function resultSettlement(result: Result) {
  if (result.status === 'INVALID') return result.settlementStatus === 'SETTLED'
    ? `예약 해제 완료 · 참가비 ${result.betAmountPerPlayer} 코인 · 잔액 변화 0`
    : `무효 경기 · 참가비 ${result.betAmountPerPlayer} 코인 예약금 반환 대기`
  return result.settlementStatus === 'SETTLED'
    ? typeof result.myCoinDelta === 'number' ? `내 엽전 ${result.myCoinDelta > 0 ? '+' : ''}${result.myCoinDelta}냥` : '엽전 확인 중'
    : '정산 대기 중'
}
/** Public presentation only. Never infer rankings, payouts or next-round permission. */
export function gatheringModel({ table, ownId, game, result, start, nickname }: Context) {
  const publicState = game && gameState(game), finished = publicState?.status === 'FINISHED' || !!result
  const invalid = result?.status === 'INVALID'
  const draw = !invalid && (!!result?.participants.some(p => p.result === 'DRAW') || (!result && !!game?.omok && finished && !game.omok.winnerUserId))
  const score = (id: string) => {
    const value = game?.dice ? game.dice.scores[game.dice.players.indexOf(id)] : game?.bridge?.players.find(p => p.userId === id)?.score
      ?? game?.ledger?.players.find(p => p.userId === id)?.total
    return typeof value === 'number' ? `${value.toLocaleString('ko-KR')}점` : ''
  }
  const winners = !finished || invalid ? [] : result
    ? result.participants.filter(p => p.result === 'WIN').map(p => p.userId)
    : game?.onecard?.winnerUserIds ?? game?.bridge?.winnerUserIds ?? game?.ledger?.winnerUserIds ?? (game?.omok?.winnerUserId || game?.dice?.winnerUserId ? [game.omok?.winnerUserId ?? game.dice?.winnerUserId ?? ''] : [])
  const rows = result ? result.participants.map((p, i) => ({
    playerId: p.userId, nickname: nickname(p.userId), seat: i, winner: !invalid && p.result === 'WIN', ready: false,
    label: participantResultLabel(result.status, p.result), score: invalid ? '' : score(p.userId),
  })) : table.seats.map((s, i) => ({ playerId: s.userId ?? '', nickname: s.userId ? nickname(s.userId) : `${s.seatNumber}번 빈자리`, seat: i,
    winner: !!s.userId && winners.includes(s.userId), ready: s.ready,
    label: finished ? draw ? '무승부' : s.userId && winners.includes(s.userId) ? '승리' : '경기 종료' : !s.userId ? '참가 대기' : s.ready ? '준비 완료' : '준비 중',
    score: finished && s.userId ? score(s.userId) : '',
  }))
  const own = table.seats.find(s => s.userId === ownId), code = result?.gameCode ?? publicState?.gameCode ?? table.gameCode
  const endReason = result?.endReason ?? publicState?.endReason
  const settled = result?.settlementStatus === 'SETTLED'
  return {
    finished, invalid, tableId: table.tableId, gameCode: code, playable: TABLE_GAMES.some(g => g.code === code && g.playable),
    scope: `${table.tableId}/${game?.gameId ?? result?.gameSessionId ?? 'lobby'}/${finished ? 'result' : start?.phase ?? 'WAITING'}`,
    title: finished ? '경기 결과' : '함께 한 판', gameName: TABLE_GAMES.find(g => g.code === code)?.name ?? '게임을 선택해 주세요',
    headline: !finished ? `준비 ${table.seats.filter(s => s.userId && s.ready).length} / ${table.seats.filter(s => s.userId).length}명`
      : invalid ? '무효 경기' : winners.length ? `${winners.map(nickname).join(' · ')} ${winners.length > 1 ? '공동 승리' : '승리'}`
      : draw ? '무승부입니다' : '경기가 종료되었어요',
    rows, own, settled,
    reason: !finished ? '' : code === 'OMOK' && !invalid ? `종료 사유: ${omokEndReason(endReason ?? null)}`
      : code === 'ONE_CARD' && endReason === 'EMPTY_HAND' && !invalid ? '손패를 모두 비웠습니다.'
      : code === 'DICE_LEDGER' && endReason && LEDGER_END_REASON[endReason] && !invalid ? `종료 사유: ${LEDGER_END_REASON[endReason]}`
      : endReason ? `종료 사유: ${endReason}` : '',
    canReturn: !!result && settled && start?.tableId === table.tableId && start.phase === 'WAITING' && !start.simulation,
    settlement: finished ? result ? resultSettlement(result) : '결과·정산 확인 전입니다.' : '',
  }
}
export type GatheringModel = ReturnType<typeof gatheringModel>
