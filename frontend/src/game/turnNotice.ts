import { gameState, type Game } from './protocol'
import { openingActive } from './onecard/opening'

export interface TurnCue { key: string; own: boolean; text: string; hint: string }

/** Public state only. A snapshot/version update is not necessarily a new turn. */
export function gameTurnCue(game: Game | null, viewer: string, names: Record<string, { nickname: string }>, now: number): TurnCue | null {
  if (!game || gameState(game).status !== 'PLAYING' || game.alkkagi) return null // Alkkagi also sequences card award animations.
  const state = gameState(game), deadline = 'flipDeadline' in state ? state.flipDeadline : state.turnDeadline
  if (typeof deadline === 'string' && Date.parse(deadline) <= now) return null
  let actor: string | null = null, turn = '', judging = false
  if (game.omok) {
    if (game.omok.coinTossEndsAt && Date.parse(game.omok.coinTossEndsAt) > now) return null
    actor = game.omok.turnUserId; turn = `${game.omok.moveCount}/${game.omok.turnDeadline}`
  } else if (game.onecard) {
    if (openingActive(game.onecard, game.version, now)) return null
    actor = game.onecard.turnUserId; turn = String(game.onecard.turnCount)
  } else if (game.dice) {
    actor = game.dice.turnUserId; turn = game.dice.turnDeadline ?? ''
  } else if (game.bridge) {
    if (game.bridge.stage === 'RESOLVING') return null
    judging = game.bridge.stage === 'RESPONDING'
    actor = judging ? game.bridge.responderUserId : game.bridge.turnUserId
    turn = `${game.bridge.turnId}/${judging ? 'respond' : 'declare'}`
  } else if (game.ledger) {
    actor = game.ledger.turnUserId; turn = String(game.ledger.turnId)
  } else if (game.halli) {
    if (game.halli.resultUntil && Date.parse(game.halli.resultUntil) > now) return null
    actor = game.halli.turnUserId; turn = String(game.halli.flipSeq)
  }
  if (!actor || !turn) return null
  const own = game.role === 'PLAYER' && actor === viewer
  const name = names[actor]?.nickname ?? '참가자'
  return {
    key: `${game.gameId}/${game.role}/${viewer}/${turn}/${actor}`, own,
    text: own ? judging ? '내 판단 차례!' : '내 차례!' : game.role === 'SPECTATOR'
      ? `${name}님 ${judging ? '판단 차례' : '차례'}` : judging ? `${name}님 판단 차례` : '상대 차례',
    hint: game.role === 'SPECTATOR' ? '관전 중 · 서버에서 확인한 차례' : own
      ? judging ? '믿음 또는 의심을 선택하세요' : game.halli ? '카드를 공개하세요 · 종은 누구나!' : '준비됐나요?'
      : `${name}님의 행동을 기다려요`,
  }
}

/** Kept while temporarily disconnected/hidden: the same turn must not replay on every restore. */
export class TurnNoticeMemory {
  private seen = ''
  consume(cue: TurnCue) { if (cue.key === this.seen) return false; this.seen = cue.key; return true }
}

// One visible game per browser. A bounded module lifetime survives resetGame/unmount during reconnect.
export const sharedTurnNoticeMemory = new TurnNoticeMemory()
