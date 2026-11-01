import type { CharacterId } from '../config/avatar'
import { gameState, type Game } from '../game/protocol'
import type { SfxName } from './sfx'

/** Who must act now: the bridge responder answers a declaration, otherwise the turn holder. */
export function turnOwner(g: Game): string | null {
  if (g.alkkagi) return g.alkkagi.turnUserId
  if (g.omok) return g.omok.turnUserId
  if (g.dice) return g.dice.turnUserId
  if (g.onecard) return g.onecard.turnUserId
  if (g.ledger) return g.ledger.turnUserId
  return g.bridge.stage === 'RESPONDING' ? g.bridge.responderUserId : g.bridge.turnUserId
}

/** Cues for one game update compared with the previous state of the same game. */
export function gameSfx(prev: Game | null, next: Game | null, ownId: string): SfxName[] {
  if (!next) return []
  const out: SfxName[] = []
  const before = prev?.gameId === next.gameId ? prev : null
  const move = next.omok?.lastMove
  const omokPlaced = next.omok && before?.omok && move && next.version > before.version
    && next.omok.moveCount === before.omok.moveCount + 1
    && before.omok.board[move.y]?.[move.x] === 0 && next.omok.board[move.y]?.[move.x] !== 0
  if (omokPlaced) out.push('omok-place')
  // 마지막 승리 착수도 소리가 나며, 상태 복구·중복 스냅샷·거절 입력은 재생하지 않는다.
  if (gameState(next).status !== 'PLAYING') return out
  if (!before && next.role === 'PLAYER') out.push('game-start')
  // 승인 착수에는 '탁'만 재생한다. 차례 알림의 전자음이 동시에 겹치지 않게 한다.
  if (!omokPlaced && next.role === 'PLAYER' && turnOwner(next) === ownId && (!before || turnOwner(before) !== ownId)) out.push('game-turn')
  if (!before) return out
  if (next.dice && before.dice && next.dice.rollId !== before.dice.rollId) out.push('dice-roll')
  if (next.onecard && before.onecard) {
    const cards = (g: Game) => g.onecard!.players.reduce((n, p) => n + p.cardCount, 0)
    if (cards(next) > cards(before)) out.push('card-draw')
    if (next.onecard.players.some(p => p.oneCardStatus === 'declared'
      && before.onecard!.players.find(q => q.userId === p.userId)?.oneCardStatus !== 'declared')) out.push('card-one')
  }
  return out
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
