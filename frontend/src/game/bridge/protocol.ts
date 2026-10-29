import { integer, record } from '../../network/protocol'

export type Face = 1 | 2 | 3 | 4 | 'X'
export interface Pawn { id: number; status: 'ACTIVE' | 'RESERVE' | 'SCORED' | 'FALLEN' | 'REMOVED_SCORED' | 'FORFEITED'; position: number; goalSlot: number | null }
export interface BridgePlayer { userId: string; score: number; goals: number; forfeited: boolean; pendingForfeit: boolean; pawns: Pawn[] }
export interface GoalSlot { slot: number; status: 'UNUSED' | 'OCCUPIED' | 'VACATED'; userId: string | null; pawnId: number | null; removedReason: 'FAILED_DOUBT' | 'FORFEIT' | null; firstAssignedTurnId: number | null }
export interface Operation { type: 'FALL_PAWN' | 'MOVE_PAWN' | 'SCORE_PAWN' | 'VACATE_GOAL_SLOT' | 'SPAWN_PAWN' | 'FORFEIT_PLAYER'; userId: string; pawnId: number | null; fromPosition: number | null; toPosition: number | null; slotNumber: number | null; reason: string | null }
interface ResolutionBase { turnId: number; declarerUserId: string; declaredNumber: number; startedAt: string; operations: Operation[] }
export type Resolution = (ResolutionBase & { challenged: false; actualFace?: never; challengerUserId?: never; wasBluff?: never })
  | (ResolutionBase & { challenged: true; actualFace: Face; challengerUserId: string; wasBluff: boolean })
export interface Bridge {
  gameCode: 'LIAR_BRIDGE'; status: 'PLAYING' | 'FINISHED'; stage: 'AWAITING_ROLL' | 'DECLARING' | 'RESPONDING' | 'RESOLVING' | 'FINISHED'
  turnId: number; turnUserId: string | null; responderUserId: string | null; turnDeadline: string | null; phaseTimeLimitMs: 30000; resolutionVisualMs: 1500
  declaration: number | null; responseOrder: string[]; acceptedBy: string[]; players: BridgePlayer[]; goalSlots: GoalSlot[]; nextGoalSlot: number
  resolution: Resolution | null; operations: Operation[]; lastEvent: string; winnerUserIds: string[]; endReason: string | null; endedAt: string | null
}
export interface SecretDie { userId: string; turnId: number; die: Face }
export type BridgeInput = { kind: 'roll' | 'trust' | 'doubt' } | { kind: 'declare'; value: 1 | 2 | 3 | 4 }
const id = (v: unknown): v is string => typeof v === 'string' && !!v.trim() && v.length <= 120
const date = (v: unknown): v is string => typeof v === 'string' && /Z$/.test(v) && Number.isFinite(Date.parse(v))
const number = (v: unknown, min: number, max: number): v is number => integer(v) && v >= min && v <= max
const nullableNumber = (v: unknown, min: number, max: number) => v === null || number(v, min, max)
const nullableId = (v: unknown) => v === null || id(v)
const ids = (v: unknown): v is string[] => Array.isArray(v) && v.every(id) && new Set(v).size === v.length
export const isFace = (v: unknown): v is Face => v === 'X' || number(v, 1, 4)
const invalid = (): never => { throw new Error('다리 경기 공개·비공개 상태를 확인해주세요.') }
function parsePawn(p: unknown): Pawn {
  if (!record(p) || !number(p.id, 1, 28) || !['ACTIVE', 'RESERVE', 'SCORED', 'FALLEN', 'REMOVED_SCORED', 'FORFEITED'].includes(String(p.status))
    || !number(p.position, 0, 9) || !nullableNumber(p.goalSlot, 1, 8)) return invalid()
  const scored = p.status === 'SCORED' || p.status === 'REMOVED_SCORED'
  if (scored ? p.position !== 9 || p.goalSlot === null : p.position > 8 || p.goalSlot !== null || (p.status === 'RESERVE' && p.position !== 0)) return invalid()
  return { id: p.id, status: p.status as Pawn['status'], position: p.position, goalSlot: p.goalSlot as number | null }
}
function parseOperation(v: unknown, players: BridgePlayer[]): Operation {
  if (!record(v) || !['FALL_PAWN', 'MOVE_PAWN', 'SCORE_PAWN', 'VACATE_GOAL_SLOT', 'SPAWN_PAWN', 'FORFEIT_PLAYER'].includes(String(v.type))
    || !id(v.userId) || !players.some(p => p.userId === v.userId) || !nullableNumber(v.pawnId, 1, 28)
    || !nullableNumber(v.fromPosition, 0, 9) || !nullableNumber(v.toPosition, 0, 9) || !nullableNumber(v.slotNumber, 1, 8) || !nullableId(v.reason)
    || (v.type === 'FORFEIT_PLAYER' ? v.pawnId !== null : !players.find(p => p.userId === v.userId)!.pawns.some(p => p.id === v.pawnId))) return invalid()
  return { type: v.type as Operation['type'], userId: v.userId, pawnId: v.pawnId as number | null, fromPosition: v.fromPosition as number | null,
    toPosition: v.toPosition as number | null, slotNumber: v.slotNumber as number | null, reason: v.reason as string | null }
}
export function parseBridge(v: unknown): Bridge {
  if (!record(v) || v.gameCode !== 'LIAR_BRIDGE' || !['PLAYING', 'FINISHED'].includes(String(v.status))
    || !['AWAITING_ROLL', 'DECLARING', 'RESPONDING', 'RESOLVING', 'FINISHED'].includes(String(v.stage))
    || !integer(v.turnId) || v.turnId < 1 || !nullableId(v.turnUserId) || !nullableId(v.responderUserId)
    || !(v.turnDeadline === null || date(v.turnDeadline)) || v.phaseTimeLimitMs !== 30000 || v.resolutionVisualMs !== 1500
    || !nullableNumber(v.declaration, 1, 4) || !ids(v.responseOrder) || !ids(v.acceptedBy) || !ids(v.winnerUserIds)
    || !nullableId(v.endReason) || !(v.endedAt === null || date(v.endedAt)) || !number(v.nextGoalSlot, 1, 9)
    || !Array.isArray(v.players) || v.players.length < 2 || v.players.length > 4 || !Array.isArray(v.goalSlots) || v.goalSlots.length !== 8
    || !Array.isArray(v.operations) || !['START', 'ROLL', 'DECLARE', 'TRUST', 'ALL_TRUSTED', 'DOUBT_SUCCESS', 'DOUBT_FAILED', 'TURN_TIMEOUT', 'JUDGE_TIMEOUT', 'PLAYER_LEFT'].includes(String(v.lastEvent))) return invalid()
  // A hidden roll is never a public property; unchallenged results must omit it even when null.
  if (['die', 'face', 'actualFace'].some(key => key in v)) return invalid()
  const players: BridgePlayer[] = v.players.map(p => {
    if (!record(p) || !id(p.userId) || !number(p.score, 0, 36) || !number(p.goals, 0, 7) || typeof p.forfeited !== 'boolean'
      || typeof p.pendingForfeit !== 'boolean' || !Array.isArray(p.pawns) || p.pawns.length !== 7) return invalid()
    const pawns = p.pawns.map(parsePawn)
    if (pawns.filter(p => p.status === 'ACTIVE').length > 1 || pawns.filter(p => p.status === 'SCORED').length !== p.goals) return invalid()
    return { userId: p.userId, score: p.score, goals: p.goals, forfeited: p.forfeited, pendingForfeit: p.pendingForfeit, pawns }
  })
  const userIds = players.map(p => p.userId), pawns = players.flatMap(p => p.pawns)
  if (new Set(userIds).size !== players.length || new Set(pawns.map(p => p.id)).size !== pawns.length
    || ![...v.responseOrder, ...v.acceptedBy, ...v.winnerUserIds].every(id => userIds.includes(id))
    || !v.acceptedBy.every(id => (v.responseOrder as string[]).includes(id))) return invalid()
  const goalSlots: GoalSlot[] = v.goalSlots.map((s, index) => {
    if (!record(s) || s.slot !== index + 1 || !['UNUSED', 'OCCUPIED', 'VACATED'].includes(String(s.status)) || !nullableId(s.userId)
      || !nullableNumber(s.pawnId, 1, 28) || !(s.removedReason === null || s.removedReason === 'FAILED_DOUBT' || s.removedReason === 'FORFEIT')
      || !nullableNumber(s.firstAssignedTurnId, 1, v.turnId as number)) return invalid()
    if (s.status === 'UNUSED' ? s.userId !== null || s.pawnId !== null || s.removedReason !== null || s.firstAssignedTurnId !== null || s.slot < Number(v.nextGoalSlot)
      : s.firstAssignedTurnId === null || s.slot >= Number(v.nextGoalSlot)
        || (s.status === 'VACATED' ? s.userId !== null || s.pawnId !== null || s.removedReason === null : s.removedReason !== null || !players.some(p => p.userId === s.userId && p.pawns.some(pawn => pawn.id === s.pawnId && pawn.status === 'SCORED' && pawn.goalSlot === s.slot)))) return invalid()
    return { slot: s.slot, status: s.status as GoalSlot['status'], userId: s.userId as string | null, pawnId: s.pawnId as number | null,
      removedReason: s.removedReason as GoalSlot['removedReason'], firstAssignedTurnId: s.firstAssignedTurnId as number | null }
  })
  for (const p of players) if (p.score !== goalSlots.filter(s => s.status === 'OCCUPIED' && s.userId === p.userId).reduce((sum, s) => sum + s.slot, 0)
    || p.pawns.some(pawn => pawn.status === 'SCORED' && !goalSlots.some(s => s.status === 'OCCUPIED' && s.pawnId === pawn.id && s.userId === p.userId))) return invalid()
  if (v.status === 'PLAYING' ? v.stage === 'FINISHED' || !userIds.includes(String(v.turnUserId)) || !date(v.turnDeadline) || v.endedAt !== null || v.endReason !== null || v.winnerUserIds.length > 0
    : v.stage !== 'FINISHED' || v.turnUserId !== null || v.responderUserId !== null || v.turnDeadline !== null || !date(v.endedAt) || !id(v.endReason)) return invalid()
  if ((v.stage === 'RESPONDING' ? !userIds.includes(String(v.responderUserId)) || v.responderUserId === v.turnUserId || v.declaration === null || !v.responseOrder.includes(String(v.responderUserId))
    : v.responderUserId !== null) || (['AWAITING_ROLL', 'DECLARING'].includes(String(v.stage)) && v.declaration !== null)) return invalid()
  let resolution: Resolution | null = null
  if (v.resolution !== null) {
    const r = v.resolution
    if (!record(r) || !number(r.turnId, 1, v.turnId) || !id(r.declarerUserId) || !userIds.includes(r.declarerUserId)
      || !number(r.declaredNumber, 1, 4) || typeof r.challenged !== 'boolean' || !date(r.startedAt) || !Array.isArray(r.operations)) return invalid()
    const common = { turnId: r.turnId, declarerUserId: r.declarerUserId, declaredNumber: r.declaredNumber, startedAt: r.startedAt, operations: r.operations.map(op => parseOperation(op, players)) }
    if (r.challenged) {
      if (!isFace(r.actualFace) || !id(r.challengerUserId) || !userIds.includes(r.challengerUserId) || r.challengerUserId === r.declarerUserId || typeof r.wasBluff !== 'boolean') return invalid()
      resolution = { ...common, challenged: true, actualFace: r.actualFace, challengerUserId: r.challengerUserId, wasBluff: r.wasBluff }
    } else {
      if (['actualFace', 'challengerUserId', 'wasBluff'].some(key => key in r)) return invalid()
      resolution = { ...common, challenged: false }
    }
  }
  return { gameCode: 'LIAR_BRIDGE', status: v.status as Bridge['status'], stage: v.stage as Bridge['stage'], turnId: v.turnId, turnUserId: v.turnUserId as string | null,
    responderUserId: v.responderUserId as string | null, turnDeadline: v.turnDeadline as string | null, phaseTimeLimitMs: 30000, resolutionVisualMs: 1500,
    declaration: v.declaration as number | null, responseOrder: [...v.responseOrder], acceptedBy: [...v.acceptedBy], players, goalSlots, nextGoalSlot: v.nextGoalSlot,
    resolution, operations: v.operations.map(op => parseOperation(op, players)), lastEvent: v.lastEvent as string, winnerUserIds: [...v.winnerUserIds], endReason: v.endReason as string | null, endedAt: v.endedAt as string | null }
}
export function parseSecret(v: unknown, ownId: string, role: string, b: Bridge): SecretDie | null {
  if (!record(v)) return invalid()
  const owns = role === 'PLAYER' && b.status === 'PLAYING' && b.turnUserId === ownId && ['DECLARING', 'RESPONDING'].includes(b.stage)
    && b.players.some(p => p.userId === ownId && !p.pendingForfeit && !p.forfeited)
  if (!owns) { if (Object.keys(v).length) return invalid(); return null }
  if (v.userId !== ownId || v.turnId !== b.turnId || !isFace(v.die)) return invalid()
  return { userId: ownId, turnId: b.turnId, die: v.die }
}
