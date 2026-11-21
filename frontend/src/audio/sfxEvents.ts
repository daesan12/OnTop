import type { CharacterId } from '../config/avatar'
import { gameState, type Game } from '../game/protocol'
import { eventKey, FLIGHT } from '../game/halligalli/flights'
import type { AlkkagiFeedbackEvent } from '../game/alkkagi/feedback'
import type { SfxName } from './sfx'

/** Who must act now: the bridge responder answers a declaration, otherwise the turn holder. */
export function turnOwner(g: Game): string | null {
  if (g.bang) return g.bang.actorUserId
  if (g.stone) return null
  if (g.alkkagi) return g.alkkagi.turnUserId
  if (g.omok) return g.omok.turnUserId
  if (g.dice) return g.dice.turnUserId
  if (g.onecard) return g.onecard.turnUserId
  if (g.ledger) return g.ledger.turnUserId
  if (g.halli) return g.halli.turnUserId
  return g.bridge.stage === 'RESPONDING' ? g.bridge.responderUserId : g.bridge.turnUserId
}

/**
 * 서버가 새로 인정한 할리갈리 종 판정(정상 종·벌칙 종 모두 카드 이동)만 true. 같은 경기의 이전 상태가 있어야 하므로
 * 첫 수신·재접속·관전 시작의 과거 상태는 제외한다. 이벤트 키와 900ms 기준은 카드 이동 연출(flights)과 같다.
 * 거절·중복 종은 상태가 바뀌지 않고, 이벤트 없이 버전만 오른 상태는 키가 같아 재생하지 않는다.
 */
function halliBellRung(before: Game | null, next: Game, serverNow: number) {
  const event = next.halli?.lastEvent
  if (!event || !before?.halli || (event.type !== 'RING_SUCCESS' && event.type !== 'RING_PENALTY')
    || eventKey(before.halli.lastEvent) === eventKey(event)) return false
  const age = serverNow - Date.parse(event.at)
  return age > -FLIGHT.maxAge && age < FLIGHT.maxAge
}

/** Cues for one game update compared with the previous state of the same game. `serverNow` is server time. */
export function gameSfx(prev: Game | null, next: Game | null, ownId: string, serverNow = Date.now()): SfxName[] {
  if (!next) return []
  const out: SfxName[] = []
  const before = prev?.gameId === next.gameId ? prev : null
  const move = next.omok?.lastMove
  const omokPlaced = next.omok && before?.omok && move && next.version > before.version
    && next.omok.moveCount === before.omok.moveCount + 1
    && before.omok.board[move.y]?.[move.x] === 0 && next.omok.board[move.y]?.[move.x] !== 0
  if (omokPlaced) out.push('omok-place')
  // 경기를 끝낸 마지막 종도 울린다. 참가자·관전자 모두 같은 공개 상태로 판정한다.
  const bell = halliBellRung(before, next, serverNow)
  if (bell) out.push('halli-bell')
  // 마지막 승리 착수도 소리가 나며, 상태 복구·중복 스냅샷·거절 입력은 재생하지 않는다.
  if (gameState(next).status !== 'PLAYING') return out
  if (!before && next.role === 'PLAYER') out.push('game-start')
  // 승인 착수에는 '탁'만, 인정된 종에는 종소리만 재생한다. 차례 알림의 전자음이 동시에 겹치지 않게 한다.
  // 알까기는 누구 차례로 넘어가든 차례 전환음(alkkagiCues)을 내므로 내 차례 알림을 겹치지 않는다.
  if (!omokPlaced && !bell && !next.alkkagi && next.role === 'PLAYER' && turnOwner(next) === ownId && (!before || turnOwner(before) !== ownId)) out.push('game-turn')
  if (!before) return out
  // 비책 선택이 끝나 손에 새 카드가 들어온 순간. 처음 받은 손패·재접속 손패는 비교할 이전 손이 없어 제외된다.
  const hand = before.alkkagiHand
  if (hand && next.alkkagiHand?.cards.some(card => !hand.cards.some(old => old.id === card.id))) out.push('alkkagi-item')
  if (next.dice && before.dice && next.dice.rollId !== before.dice.rollId) out.push('dice-roll')
  if (next.onecard && before.onecard) {
    const cards = (g: Game) => g.onecard!.players.reduce((n, p) => n + p.cardCount, 0)
    if (cards(next) > cards(before)) out.push('card-draw')
    if (next.onecard.players.some(p => p.oneCardStatus === 'declared'
      && before.onecard!.players.find(q => q.userId === p.userId)?.oneCardStatus !== 'declared')) out.push('card-one')
  }
  return out
}

const IMPACT_LEVEL = { weak: 0.45, medium: 0.75, strong: 1 } as const

/**
 * 서버가 승인한 알까기 상태에서 나온 피드백 이벤트(AlkkagiFeedback)를 효과음으로 바꾼다. 경기 결과는 결과 음악(resultSting)이 맡는다.
 * 한 갱신에 같은 소리가 여러 번 나와도(동시 충돌·연속 탈락) 가장 큰 세기로 한 번만 재생한다.
 */
export function alkkagiCues(events: readonly AlkkagiFeedbackEvent[]): [SfxName, number][] {
  const out = new Map<SfxName, number>()
  for (const event of events) {
    const cue: SfxName | null = event.type === 'SHOT' ? 'alkkagi-shot'
      : event.type === 'PIECE_HIT' || event.type === 'WALL_HIT' ? 'alkkagi-collision'
      : event.type === 'PIECE_FALL' ? 'alkkagi-fall'
      : event.type === 'TURN_CHANGED' ? 'alkkagi-turn-change'
      : event.type.startsWith('ITEM_') ? 'alkkagi-item' : null
    if (cue) out.set(cue, Math.max(out.get(cue) ?? 0, event.strength ? IMPACT_LEVEL[event.strength] : 1))
  }
  return [...out]
}

export function emoteSfx(emote: string, character: CharacterId | undefined): SfxName | null {
  if (emote === 'EMOTE_CLAP' || emote === 'EMOTE_APPLAUSE_REQUEST') return 'emote-clap'
  if (emote === 'EMOTE_TSK') return 'emote-tsk'
  if (emote === 'EMOTE_FART') return 'emote-fart'
  if (emote === 'EMOTE_WAVE') return character === 'girl' ? 'emote-wave-female' : 'emote-wave-male'
  return null
}

export interface MoverSample {
  x: number; y: number; z: number
  /** Snapshot time in ms; the tracker only advances when it changes. */
  at: number
  moving: boolean; running: boolean; swimming: boolean
  /** Walking on the ground, not seated or using a facility. */
  free: boolean
  paved: boolean
}
export interface MoverState { x: number; y: number; z: number; at: number; vy: number; airborne: boolean; travelled: number; swimming: boolean }
// The server jumps at 6.2 m/s; stairs (0.22 m steps) climb well below these rates.
const JUMP_VY = 4.5, FALL_VY = -5, LANDED_VY = -0.6
export const STRIDE = { walk: 2, run: 2.6 } as const

/** Footsteps, jump, landing and splash from successive server poses of one avatar. */
export function moverSfx(state: MoverState | undefined, s: MoverSample): [MoverState, SfxName[]] {
  const fresh: MoverState = { x: s.x, y: s.y, z: s.z, at: s.at, vy: 0, airborne: false, travelled: 0, swimming: s.swimming }
  if (!state) return [fresh, []]
  if (s.at === state.at) return [state, []]
  const dt = (s.at - state.at) / 1000
  // Seat/facility poses and long hops (respawn) are not motion.
  if (!s.free || dt <= 0 || Math.hypot(s.x - state.x, s.z - state.z) > 5) return [fresh, []]
  // An unchanged pose keeps its old time, so after a pause the first move counts as one snapshot from rest.
  const vy = (s.y - state.y) / (dt > 0.5 ? 0.1 : dt), out: SfxName[] = []
  let { airborne, travelled } = state
  if (s.swimming) {
    if (!state.swimming) out.push('move-splash')
    airborne = false
    travelled = 0
  } else {
    if (!airborne && vy > JUMP_VY) { airborne = true; out.push('move-jump') }
    else if (vy < FALL_VY) airborne = true
    else if (airborne && state.vy < LANDED_VY * 2 && vy > LANDED_VY) { airborne = false; out.push('move-land') }
    if (s.moving && !airborne) {
      travelled += Math.hypot(s.x - state.x, s.z - state.z)
      const stride = s.running ? STRIDE.run : STRIDE.walk
      if (travelled >= stride) {
        travelled = Math.min(travelled - stride, stride)
        out.push(s.paved ? 'move-step-stone' : 'move-step-grass')
      }
    } else travelled = 0
  }
  return [{ x: s.x, y: s.y, z: s.z, at: s.at, vy, airborne, travelled, swimming: s.swimming }, out]
}
