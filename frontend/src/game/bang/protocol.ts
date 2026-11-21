import { integer, record } from '../../network/protocol'

export const CARD_KINDS = ['BANG', 'MISSED', 'BEER', 'SALOON', 'DUEL', 'INDIANS', 'GATLING', 'STAGECOACH', 'WELLS_FARGO', 'GENERAL_STORE', 'PANIC', 'CAT_BALOU', 'BARREL', 'JAIL', 'DYNAMITE', 'MUSTANG', 'SCOPE', 'VOLCANIC', 'SCHOFIELD', 'REMINGTON', 'REV_CARABINE', 'WINCHESTER'] as const
export type CardKind = typeof CARD_KINDS[number]
export const ROLES = ['SHERIFF', 'DEPUTY', 'OUTLAW', 'RENEGADE'] as const
export type BangRole = typeof ROLES[number]
export const CHARACTERS = ['BART_CASSIDY', 'BLACK_JACK', 'CALAMITY_JANET', 'EL_GRINGO', 'JESSE_JONES', 'JOURDONNAIS', 'KIT_CARLSON', 'LUCKY_DUKE', 'PAUL_REGRET', 'PEDRO_RAMIREZ', 'ROSE_DOOLAN', 'SID_KETCHUM', 'SLAB_THE_KILLER', 'SUZY_LAFAYETTE', 'VULTURE_SAM', 'WILLY_THE_KID'] as const
export type BangCharacter = typeof CHARACTERS[number]
export interface BangCard { id: string; kind: CardKind; suit: 'HEARTS' | 'DIAMONDS' | 'CLUBS' | 'SPADES'; rank: number }
export interface BangPlayer { userId: string; character: BangCharacter; role: BangRole | null; hp: number; maxHp: number; active: boolean; forfeited: boolean; cardCount: number; range: number; equipment: BangCard[] }
export interface BangAction { kind: string; cardId?: string; secondCardId?: string; targetUserId?: string; targetCardId?: string; zone?: 'HAND' | 'TABLE'; fromDiscard?: boolean }
export interface BangState {
  gameCode: 'BANG'; status: 'PLAYING' | 'FINISHED'; phase: string; players: BangPlayer[]
  turnUserId: string | null; actorUserId: string | null; turnDeadline: string | null; turnNumber: number
  deckCount: number; topDiscard: BangCard | null; store: BangCard[]; lastJudgement: BangCard | null
  judgementReason: string | null; endReason: string | null; endedAt: string | null; winnerUserIds: string[]; history: string[]
  response?: { kind: 'BANG' | 'DUEL' | 'INDIANS'; sourceUserId: string; targetUserId: string; remaining: number }
}
export interface BangHand { userId: string; role: BangRole; hand: BangCard[]; choices: BangCard[]; actions: BangAction[]; distances: Record<string, number> }
const uid = (value: unknown): value is string => typeof value === 'string' && /^[1-9]\d{0,18}$/.test(value)
const identifier = (value: unknown): value is string => typeof value === 'string' && /^b[1-9]\d{0,2}$/.test(value)
const nullableUser = (value: unknown) => value === null || uid(value)
const iso = (value: unknown) => typeof value === 'string' && /Z$/.test(value) && Number.isFinite(Date.parse(value))
const cards = (value: unknown): value is BangCard[] => Array.isArray(value) && value.length <= 80 && value.every(card)
function card(value: unknown): value is BangCard {
  return record(value) && identifier(value.id) && CARD_KINDS.includes(value.kind as CardKind)
    && ['HEARTS', 'DIAMONDS', 'CLUBS', 'SPADES'].includes(String(value.suit)) && integer(value.rank) && value.rank >= 2 && value.rank <= 14
}
export function parseBang(value: unknown): BangState {
  if (!record(value) || value.gameCode !== 'BANG' || !['PLAYING', 'FINISHED'].includes(String(value.status))
    || !['PLAY', 'DRAW', 'KIT', 'LUCKY', 'DISCARD', 'RESPONSE', 'RESCUE', 'STORE', 'FINISHED'].includes(String(value.phase))
    || !Array.isArray(value.players) || value.players.length < 4 || value.players.length > 7
    || !value.players.every(player => record(player) && uid(player.userId) && CHARACTERS.includes(player.character as BangCharacter)
      && (player.role === null || ROLES.includes(player.role as BangRole)) && Number.isSafeInteger(player.hp) && Number(player.hp) >= -2 && Number(player.hp) <= 5
      && integer(player.maxHp) && player.maxHp >= 3 && player.maxHp <= 5 && Number(player.hp) <= player.maxHp
      && typeof player.active === 'boolean' && typeof player.forfeited === 'boolean' && integer(player.cardCount) && player.cardCount >= 0 && player.cardCount <= 80
      && integer(player.range) && player.range >= 1 && player.range <= 5 && cards(player.equipment)
      && !(value.status === 'PLAYING' && player.active && player.role !== null && player.role !== 'SHERIFF'))
    || new Set(value.players.map(player => player.userId)).size !== value.players.length
    || !nullableUser(value.turnUserId) || !nullableUser(value.actorUserId) || !(value.turnDeadline === null || iso(value.turnDeadline))
    || !integer(value.turnNumber) || value.turnNumber < 1 || !integer(value.deckCount) || value.deckCount < 0 || value.deckCount > 80
    || !(value.topDiscard === null || card(value.topDiscard)) || !(value.lastJudgement === null || card(value.lastJudgement))
    || !cards(value.store) || !Array.isArray(value.winnerUserIds) || !value.winnerUserIds.every(uid)
    || !Array.isArray(value.history) || value.history.length > 30 || !value.history.every(line => typeof line === 'string' && line.length <= 160)
    || !(value.endReason === null || ['LAW_WINS', 'OUTLAWS_WIN', 'RENEGADE_WINS', 'NO_ELIGIBLE_WINNERS'].includes(String(value.endReason)))
    || !(value.endedAt === null || iso(value.endedAt))) throw new Error('뱅 공개 상태 형식을 확인해주세요.')
  const players = value.players as unknown as BangPlayer[]
  if (value.status === 'PLAYING' ? !players.some(player => player.userId === value.turnUserId)
    || !players.some(player => player.userId === value.actorUserId && player.active) || !iso(value.turnDeadline)
    || value.endedAt !== null || value.endReason !== null || value.winnerUserIds.length !== 0
    : value.turnUserId !== null || value.actorUserId !== null || value.turnDeadline !== null || !iso(value.endedAt)
      || value.endReason === null || players.some(player => player.role === null)) throw new Error('뱅 차례와 결과를 확인해주세요.')
  if (value.response !== undefined && (!record(value.response) || !['BANG', 'DUEL', 'INDIANS'].includes(String(value.response.kind))
    || !uid(value.response.sourceUserId) || !uid(value.response.targetUserId) || !integer(value.response.remaining)
    || value.response.remaining < 1 || value.response.remaining > 2)) throw new Error('뱅 응답 상태를 확인해주세요.')
  return structuredClone(value) as unknown as BangState
}
export function parseBangHand(value: unknown, state: BangState, ownId: string, role: 'PLAYER' | 'SPECTATOR'): BangHand | null {
  if (role === 'SPECTATOR') {
    if (!record(value) || Object.keys(value).length) throw new Error('관전자에게 비공개 정보가 전달됐어요.')
    return null
  }
  if (!record(value) || value.userId !== ownId || !ROLES.includes(value.role as BangRole) || !cards(value.hand) || !cards(value.choices)
    || !record(value.distances) || !Object.values(value.distances).every(n => integer(n) && n >= 0 && n <= 5)
    || !Array.isArray(value.actions) || value.actions.length > 4000 || !value.actions.every(action => record(action)
      && ['play', 'draw', 'end_turn', 'discard', 'respond', 'barrel', 'take_hit', 'rescue', 'give_up', 'choose', 'sid_heal'].includes(String(action.kind))
      && (action.cardId === undefined || identifier(action.cardId)) && (action.secondCardId === undefined || identifier(action.secondCardId))
      && (action.targetCardId === undefined || identifier(action.targetCardId)) && (action.targetUserId === undefined || uid(action.targetUserId))))
    throw new Error('뱅 개인 상태를 확인해주세요.')
  const me = state.players.find(player => player.userId === ownId)
  if (!me || me.role !== null && me.role !== value.role || value.hand.length !== me.cardCount || new Set(value.hand.map(card => card.id)).size !== value.hand.length
    || !me.active && value.actions.length) throw new Error('뱅 손패 소유자를 확인해주세요.')
  return structuredClone(value) as unknown as BangHand
}
