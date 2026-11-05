import type { Farkle } from '../protocol'

/** Public snapshot only. BANK amounts and discarded BUST faces are not inferred. */
export function farkleSpectatorStatus(game: Farkle, names: readonly string[], rolling: boolean) {
  const name = (id: string | null) => names[game.players.indexOf(id ?? '')] ?? '참가자'
  if (game.status === 'FINISHED') return game.winnerUserId ? `${name(game.winnerUserId)} 승리 · 경기 종료` : '경기가 종료되었습니다'
  const player = name(game.turnUserId)
  if (rolling) return `${game.hotDice ? '싹쓸이! · ' : ''}${player}이 주사위를 굴리고 있습니다`
  if (game.stage === 'SELECTING') return `${game.hotDice ? '싹쓸이! · ' : ''}${player}이 득점 주사위를 고르고 있습니다`
  const active = game.players.filter(id => !game.forfeitedUserIds?.includes(id))
  const previous = game.lastRoll?.actorUserId ?? active[(active.indexOf(game.turnUserId!) + active.length - 1) % active.length]
  const last = game.lastEvent === 'BUST' ? `${name(previous ?? null)} 허탕! · 이번 턴 점수 소멸. `
    : game.lastEvent === 'BANK' ? `${name(previous ?? null)} 점수 챙기기 · 점수 저장. `
    : game.lastEvent === 'TURN_TIMEOUT' ? '차례 시간 만료. '
    : game.lastEvent === 'PLAYER_LEFT' ? '참가자 기권 · 경기를 이어갑니다. ' : ''
  return `${last}${player}의 차례 · 굴림 대기`
}
