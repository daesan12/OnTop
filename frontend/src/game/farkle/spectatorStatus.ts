import type { Farkle } from '../protocol'

/** Public snapshot only. BANK amounts and discarded BUST faces are not inferred. */
export function farkleSpectatorStatus(game: Farkle, names: readonly string[], rolling: boolean) {
  const name = (id: string | null) => names[game.players.indexOf(id ?? '')] ?? '참가자'
  if (game.status === 'FINISHED') return game.winnerUserId ? `${name(game.winnerUserId)} 승리 · 경기 종료` : '경기가 종료되었습니다'
  const player = name(game.turnUserId)
  if (rolling) return `${game.hotDice ? 'HOT DICE · ' : ''}${player}이 주사위를 굴리고 있습니다`
  if (game.stage === 'SELECTING') return `${game.hotDice ? 'HOT DICE · ' : ''}${player}이 득점 주사위를 고르고 있습니다`
  const previous = name(game.players.find(id => id !== game.turnUserId) ?? null)
  const last = game.lastEvent === 'BUST' ? `${previous} BUST · 이번 턴 점수 소멸. `
    : game.lastEvent === 'BANK' ? `${previous} BANK · 점수 저장. `
    : game.lastEvent === 'TURN_TIMEOUT' ? '차례 시간 만료. ' : ''
  return `${last}${player}의 차례 · 굴림 대기`
}
