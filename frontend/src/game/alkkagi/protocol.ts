import { record, integer } from '../../network/protocol'
import type { Snapshot } from './replay'

export type Alkkagi = Snapshot & { gameCode: 'ALKKAGI'; status: 'PLAYING' | 'FINISHED'; players: string[]; turnUserId: string | null; winnerUserId: string | null }
export type Card = { id: string; type: string }
export type AlkkagiHand = { gameId: string; version: number; cards: Card[]; choice: { id: string; losses: number; deadline: number; options: Card[] } | null }
const types = ['WALL','RELOCATE','POWER_UP','GROW','SHRINK','EXTRA_SHOT','SWAP','DEFEND']
const card = (c: unknown): c is Card => record(c) && typeof c.id === 'string' && !!c.id && types.includes(String(c.type))
export function parseAlkkagi(p: Record<string, unknown>, gameId: string, version: number): Alkkagi {
  if (p.gameId !== gameId || p.version !== version || p.gameCode !== 'ALKKAGI'
    || !['PLAYING','FINISHED'].includes(String(p.status)) || !['COIN_TOSS','AIMING','SIMULATING','CHOOSING','FINISHED'].includes(String(p.stage))
    || (p.status === 'FINISHED') !== (p.stage === 'FINISHED')
    || !Array.isArray(p.players) || p.players.length !== 2 || new Set(p.players).size !== 2
    || !p.players.every(x => typeof x === 'string' && /^[1-9][0-9]*$/.test(x))
    || ![0,1].includes(Number(p.turn)) || (p.winner !== null && ![0,1].includes(Number(p.winner)))
    || !['serverNow','turnDeadline','matchDeadline','tick','simulationId','turnNumber'].every(k => integer(p[k]))
    || !record(p.settings) || !['halfWidth','halfHeight','maximumImpulse','deceleration','restitution'].every(k => Number.isFinite(p.settings![k as never]))
    || !Array.isArray(p.pieces) || p.pieces.length !== 32 || new Set(p.pieces.map(x => record(x) ? x.id : null)).size !== 32
    || !p.pieces.every(x => record(x) && typeof x.id === 'string' && [0,1].includes(Number(x.owner)) && typeof x.alive === 'boolean'
      && ['x','y','vx','vy','radius','mass'].every(k => typeof x[k] === 'number' && Number.isFinite(x[k]))))
    throw new Error('알까기 서버 상태를 확인해주세요.')
  if (p.coinTossEndsAt !== undefined && (typeof p.coinTossEndsAt !== 'string' || !Number.isFinite(Date.parse(p.coinTossEndsAt)))
    || p.cardCounts !== undefined && (!Array.isArray(p.cardCounts) || p.cardCounts.length !== 2 || !p.cardCounts.every(n => integer(n) && Number(n) >= 0 && Number(n) <= 64))
    || p.itemEffects !== undefined && (!Array.isArray(p.itemEffects) || p.itemEffects.length > 16 || !p.itemEffects.every(e => record(e)
      && integer(e.version) && Number(e.version) <= version && integer(e.at) && integer(e.turnNumber)
      && [0,1].includes(Number(e.actor)) && types.includes(String(e.type)) && Array.isArray(e.targets) && e.targets.every(t => typeof t === 'string'))))
    throw new Error('알까기 공개 카드 상태를 확인해주세요.')
  return p as unknown as Alkkagi
}
export function parseAlkkagiHand(p: Record<string, unknown>, state: Alkkagi, own: string, role: string): AlkkagiHand | null {
  if (role !== 'PLAYER') {
    if (Object.keys(p).length) throw new Error('관전 개인 정보는 허용되지 않습니다.')
    return null
  }
  if (!state.players.includes(own) || p.gameId !== state.gameId || p.version !== state.version
    || !Array.isArray(p.cards) || !p.cards.every(card)
    || new Set(p.cards.map(c => c.id)).size !== p.cards.length
    || !(p.choice === null || record(p.choice) && typeof p.choice.id === 'string'
      && integer(p.choice.deadline) && integer(p.choice.losses) && Array.isArray(p.choice.options)
      && p.choice.options.length === 3 && p.choice.options.every(card))) throw new Error('본인 카드 상태를 확인해주세요.')
  return p as unknown as AlkkagiHand
}
