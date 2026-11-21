import { parseAlkkagi, parseAlkkagiHand, type Alkkagi, type AlkkagiHand } from './alkkagi/protocol'
import { parseStoneState, type StoneState } from './stone-rumble/protocol'
import { integer, record } from '../network/protocol'
import { parseOneCard, parseHand, type OneCard, type Hand } from './onecard/protocol'
import { parseBridge, parseSecret, type Bridge, type SecretDie } from './bridge/protocol'
import { parseLedger, type DiceLedger } from './ledger/protocol'
import { parseHalliGalli, type HalliGalli } from './halligalli/protocol'
import { parseQuoridor, type Quoridor } from './quoridor/protocol'

export type Recovery =
  | 'UNKNOWN'
  | 'PENDING'
  | 'RESTORED'
  | 'LOBBY'
  | 'FINISHED'
  | 'ELIMINATED'
  | 'EXPIRED'
  | 'UNAVAILABLE'
export type Phase =
  'NOT_SEATED' | 'WAITING' | 'STARTING' | 'CONFIRMED' | 'PLAYING' | 'SETTLING'
export interface StartState {
  tableId: string | null
  revision: number
  phase: Phase
  startAttemptId: string | null
  gameCode: string | null
  gameSessionId: string | null
  code: string | null
  simulation: boolean
}
export interface Omok {
  draw?: { requestId: string; requesterUserId: string; deadline: string } | null
  drawDecision?: { requestId: string; status: 'ACCEPTED' | 'REJECTED' | 'EXPIRED' } | null
  drawRequestsUsed?: string[]
  undo?: { requestId: string; requesterUserId: string; deadline: string } | null
  undoDecision?: { requestId: string; status: 'ACCEPTED' | 'REJECTED' | 'EXPIRED' } | null
  gameCode: 'OMOK'
  status: 'PLAYING' | 'FINISHED'
  boardSize: 15
  board: number[][]
  /** Own black player's server Renju preview; never retained for white or spectators. */
  forbiddenMoves?: { x: number; y: number; kind?: '33' | '44' | '6' }[]
  blackUserId: string
  whiteUserId: string
  turnUserId: string | null
  turnDeadline: string | null
  moveCount: number
  coinTossEndsAt?: string
  lastMove: { x: number; y: number; stone: 'BLACK' | 'WHITE' } | null
  winnerUserId: string | null
  endReason: string | null
  endedAt: string | null
}
interface GameHeader {
  gameId: string
  version: number
  role: 'PLAYER' | 'SPECTATOR'
}
export interface OmokGame extends GameHeader { quoridor?: never; stone?: never; ledger?: never; alkkagi?: never; alkkagiHand?: never; omok: Omok; dice?: never; onecard?: never; hand?: never; bridge?: never; secret?: never; halli?: never }
export interface DiceGame extends GameHeader { quoridor?: never; stone?: never; ledger?: never; alkkagi?: never; alkkagiHand?: never; dice: Farkle; omok?: never; onecard?: never; hand?: never; bridge?: never; secret?: never; halli?: never }
export interface OneCardGame extends GameHeader { quoridor?: never; stone?: never; ledger?: never; alkkagi?: never; alkkagiHand?: never; onecard: OneCard; hand: Hand | null; omok?: never; dice?: never; bridge?: never; secret?: never; halli?: never }
export interface BridgeGame extends GameHeader { quoridor?: never; stone?: never; ledger?: never; alkkagi?: never; alkkagiHand?: never; bridge: Bridge; secret: SecretDie | null; omok?: never; dice?: never; onecard?: never; hand?: never; halli?: never }
export interface AlkkagiGame extends GameHeader { quoridor?: never; stone?: never; ledger?: never; alkkagi: Alkkagi; alkkagiHand: AlkkagiHand | null; omok?: never; dice?: never; onecard?: never; hand?: never; bridge?: never; secret?: never; halli?: never }
export interface LedgerGame extends GameHeader { quoridor?: never; stone?: never; alkkagi?: never; alkkagiHand?: never; ledger: DiceLedger; omok?: never; dice?: never; onecard?: never; hand?: never; bridge?: never; secret?: never; halli?: never }
export interface HalliGame extends GameHeader { quoridor?: never; stone?: never; ledger?: never; alkkagi?: never; alkkagiHand?: never; halli: HalliGalli; omok?: never; dice?: never; onecard?: never; hand?: never; bridge?: never; secret?: never }
export interface StoneGame extends GameHeader { quoridor?: never; stone: StoneState; ledger?: never; alkkagi?: never; alkkagiHand?: never; omok?: never; dice?: never; onecard?: never; hand?: never; bridge?: never; secret?: never; halli?: never }
export interface QuoridorGame extends GameHeader { quoridor: Quoridor; stone?: never; ledger?: never; alkkagi?: never; alkkagiHand?: never; omok?: never; dice?: never; onecard?: never; hand?: never; bridge?: never; secret?: never; halli?: never }
export type Game = QuoridorGame | StoneGame | OmokGame | DiceGame | OneCardGame | BridgeGame | AlkkagiGame | LedgerGame | HalliGame
export interface Farkle {
  gameCode: 'DICE'; status: 'PLAYING' | 'FINISHED'; players: string[]; scores: number[]
  targetScore: number; turnTimeLimitMs: 30000; turnUserId: string | null; turnDeadline: string | null
  turnScore: number; dice: { id: number; value: number; held: boolean }[]
  stage: 'AWAITING_ROLL' | 'SELECTING' | 'FINISHED'; rollId: number; round: number
  hotDice: boolean; lastEvent: 'START' | 'ROLL' | 'HOT_DICE' | 'BANK' | 'BUST' | 'TURN_TIMEOUT' | 'PLAYER_LEFT'
  forfeitedUserIds?: string[]
  winnerUserId: string | null; endReason: string | null; endedAt: string | null
  lastRoll?: { rollId: number; actorUserId: string; dice: Farkle['dice'] } | null
}
export const gameState = (g: Game) => g.omok ?? g.dice ?? g.onecard ?? g.bridge ?? g.ledger ?? g.alkkagi ?? g.halli ?? g.quoridor ?? g.stone
export const gamePlayers = (g: Game) => g.omok ? [g.omok.blackUserId, g.omok.whiteUserId] : g.dice ? g.dice.players : g.alkkagi ? g.alkkagi.players : (g.onecard ?? g.bridge ?? g.ledger ?? g.halli ?? g.quoridor ?? g.stone).players.map(p => p.userId)
export interface Result {
  version: number
  gameSessionId: string
  gameCode: string
  status: 'FINISHED' | 'INVALID'
  endReason: string
  settlementStatus: 'PENDING' | 'SETTLED'
  betAmountPerPlayer: number
  myCoinDelta: number | null
  participants: { userId: string; result: string | null; rank?: number | null; rewardCoins?: number | null }[]
  endedAt: string
}
export const id = (v: unknown): v is string =>
  typeof v === 'string' && !!v.trim() && v.length <= 120
const nullableId = (v: unknown) => v === null || id(v)
const date = (v: unknown): v is string =>
  typeof v === 'string' && Number.isFinite(Date.parse(v)) && /Z$/.test(v)
export const recoveryStatuses: Recovery[] = [
  'PENDING',
  'RESTORED',
  'LOBBY',
  'FINISHED',
  'ELIMINATED',
  'EXPIRED',
  'UNAVAILABLE',
]
export function parseStart(p: Record<string, unknown>): StartState {
  if (
    !nullableId(p.tableId) ||
    !integer(p.revision) ||
    ![
      'NOT_SEATED',
      'WAITING',
      'STARTING',
      'CONFIRMED',
      'PLAYING',
      'SETTLING',
    ].includes(String(p.phase)) ||
    !['startAttemptId', 'gameCode', 'gameSessionId', 'code'].every((k) =>
      nullableId(p[k]),
    ) ||
    typeof p.simulation !== 'boolean' ||
    (['PLAYING', 'SETTLING'].includes(String(p.phase)) && !id(p.gameSessionId))
  )
    throw new Error('경기 시작 상태 형식이 올바르지 않습니다.')
  return {
    tableId: p.tableId as string | null,
    revision: p.revision,
    phase: p.phase as Phase,
    startAttemptId: p.startAttemptId as string | null,
    gameCode: p.gameCode as string | null,
    gameSessionId: p.gameSessionId as string | null,
    code: p.code as string | null,
    simulation: p.simulation,
  }
}
export function parseOmok(p: unknown, ownId = '', privateState?: unknown): Omok {
  if (
    !record(p) ||
    p.gameCode !== 'OMOK' ||
    !['PLAYING', 'FINISHED'].includes(String(p.status)) ||
    p.boardSize !== 15 ||
    !Array.isArray(p.board) ||
    p.board.length !== 15 ||
    !p.board.every(
      (row) =>
        Array.isArray(row) &&
        row.length === 15 &&
        row.every((v) => v === 0 || v === 1 || v === 2),
    ) ||
    !id(p.blackUserId) ||
    !id(p.whiteUserId) ||
    p.blackUserId === p.whiteUserId ||
    !integer(p.moveCount) ||
    p.moveCount > 225 ||
    !nullableId(p.winnerUserId) ||
    !nullableId(p.endReason) ||
    !(p.endedAt === null || date(p.endedAt))
  )
    throw new Error('오목 상태 형식이 올바르지 않습니다.')
  const players = [p.blackUserId, p.whiteUserId]
  const board = p.board as number[][]
  if (privateState !== undefined && (!record(privateState) || Object.keys(privateState).length > 0
    && (ownId !== p.blackUserId || privateState.userId !== ownId)))
    throw new Error('오목 금수 정보의 수신자를 확인해주세요.')
  // Older servers sent public previews. Keep them only for the authenticated black player.
  const forbiddenMoves = ownId === p.blackUserId
    ? record(privateState) && privateState.forbiddenMoves !== undefined ? privateState.forbiddenMoves : p.forbiddenMoves
    : undefined
  if (forbiddenMoves !== undefined && (!Array.isArray(forbiddenMoves) || forbiddenMoves.length > 225
    || !forbiddenMoves.every(m => record(m) && integer(m.x) && integer(m.y) && m.x < 15 && m.y < 15 && board[m.y]![m.x] === 0 && (m.kind === undefined || typeof m.kind === 'string' && ['33','44','6'].includes(m.kind)))
    || new Set(forbiddenMoves.map(m => `${m.x},${m.y}`)).size !== forbiddenMoves.length))
    throw new Error('오목 금수 위치를 확인해주세요.')
  if (p.drawRequestsUsed !== undefined && (!Array.isArray(p.drawRequestsUsed) || p.drawRequestsUsed.length > 2
    || new Set(p.drawRequestsUsed).size !== p.drawRequestsUsed.length || !p.drawRequestsUsed.every(u => players.includes(u))))
    throw new Error('오목 무승부 요청 횟수를 확인해주세요.')
  if (p.draw !== undefined && p.draw !== null && (!record(p.draw) || !id(p.draw.requestId)
    || p.draw.requesterUserId !== p.turnUserId || !players.includes(p.draw.requesterUserId as string)
    || !date(p.draw.deadline) || p.status !== 'PLAYING' || p.undo != null
    || !Array.isArray(p.drawRequestsUsed) || !p.drawRequestsUsed.includes(p.draw.requesterUserId)))
    throw new Error('오목 무승부 요청을 확인해주세요.')
  if (p.drawDecision !== undefined && p.drawDecision !== null && (!record(p.drawDecision)
    || !id(p.drawDecision.requestId) || !['ACCEPTED', 'REJECTED', 'EXPIRED'].includes(String(p.drawDecision.status))))
    throw new Error('오목 무승부 응답을 확인해주세요.')
  if (p.undo !== undefined && p.undo !== null && (!record(p.undo) || !id(p.undo.requestId)
    || p.undo.requesterUserId !== p.turnUserId || !players.includes(p.undo.requesterUserId as string)
    || !date(p.undo.deadline) || p.status !== 'PLAYING' || p.moveCount < 2))
    throw new Error('오목 무르기 요청을 확인해주세요.')
  if (p.undoDecision !== undefined && p.undoDecision !== null && (!record(p.undoDecision)
    || !id(p.undoDecision.requestId) || !['ACCEPTED', 'REJECTED', 'EXPIRED'].includes(String(p.undoDecision.status))))
    throw new Error('오목 무르기 결과를 확인해주세요.')
  if (
    (p.winnerUserId !== null && !players.includes(p.winnerUserId)) ||
    p.board.flat().filter(Boolean).length !== p.moveCount ||
    (p.status === 'PLAYING' &&
      (typeof p.turnUserId !== 'string' ||
        !players.includes(p.turnUserId) ||
        !date(p.turnDeadline) ||
        p.endedAt !== null ||
        p.winnerUserId !== null ||
        p.endReason !== null)) ||
    (p.status === 'FINISHED' &&
      (p.turnUserId !== null ||
        p.turnDeadline !== null ||
        !date(p.endedAt) ||
        !id(p.endReason)))
  )
    throw new Error('오목 차례·종료 상태를 확인해주세요.')
  if (p.lastMove !== null) {
    const m = p.lastMove
    if (
      !record(m) ||
      !integer(m.x) ||
      !integer(m.y) ||
      m.x > 14 ||
      m.y > 14 ||
      !['BLACK', 'WHITE'].includes(String(m.stone)) ||
      p.board[m.y][m.x] !== (m.stone === 'BLACK' ? 1 : 2)
    )
      throw new Error('오목 마지막 수를 확인해주세요.')
  } else if (p.moveCount !== 0) throw new Error('오목 마지막 수가 없습니다.')
  // Copy known fields and only the recipient-checked black preview.
  return {
    gameCode: 'OMOK',
    status: p.status as Omok['status'],
    boardSize: 15,
    board: p.board.map((row) => [...row]),
    ...(forbiddenMoves === undefined ? {} : { forbiddenMoves: (forbiddenMoves as NonNullable<Omok['forbiddenMoves']>).map(m => ({x: m.x, y: m.y, ...(m.kind === undefined ? {} : {kind:m.kind})})) }),
    blackUserId: p.blackUserId,
    whiteUserId: p.whiteUserId,
    turnUserId: p.turnUserId as string | null,
    turnDeadline: p.turnDeadline as string | null,
    moveCount: p.moveCount,
    ...(p.draw === undefined ? {} : { draw: p.draw === null ? null : {
      requestId: String((p.draw as Record<string, unknown>).requestId), requesterUserId: String((p.draw as Record<string, unknown>).requesterUserId),
      deadline: String((p.draw as Record<string, unknown>).deadline) } }),
    ...(p.drawDecision === undefined ? {} : { drawDecision: p.drawDecision === null ? null : {
      requestId: String((p.drawDecision as Record<string, unknown>).requestId), status: (p.drawDecision as NonNullable<Omok['drawDecision']>).status } }),
    ...(p.drawRequestsUsed === undefined ? {} : {drawRequestsUsed: [...p.drawRequestsUsed as string[]]}),
    ...(p.undo === undefined ? {} : { undo: p.undo === null ? null : {
      requestId: String((p.undo as Record<string, unknown>).requestId), requesterUserId: String((p.undo as Record<string, unknown>).requesterUserId),
      deadline: String((p.undo as Record<string, unknown>).deadline) } }),
    ...(p.undoDecision === undefined ? {} : { undoDecision: p.undoDecision === null ? null : {
      requestId: String((p.undoDecision as Record<string, unknown>).requestId), status: (p.undoDecision as NonNullable<Omok['undoDecision']>).status } }),
    ...(typeof p.coinTossEndsAt === 'string' && Number.isFinite(Date.parse(p.coinTossEndsAt)) ? { coinTossEndsAt: p.coinTossEndsAt } : {}),
    lastMove:
      p.lastMove === null
        ? null
        : {
            x: Number((p.lastMove as Record<string, unknown>).x),
            y: Number((p.lastMove as Record<string, unknown>).y),
            stone: (p.lastMove as { stone: 'BLACK' | 'WHITE' }).stone,
          },
    winnerUserId: p.winnerUserId as string | null,
    endReason: p.endReason as string | null,
    endedAt: p.endedAt as string | null,
  }
}
export function parseGame(p: Record<string, unknown>, ownId = ''): Game {
  if (
    !id(p.gameId) ||
    !integer(p.version) ||
    !['PLAYER', 'SPECTATOR'].includes(String(p.role)) ||
    !record(p.privateState) ||
    (!(record(p.publicState) && ['OMOK', 'ONE_CARD', 'LIAR_BRIDGE', 'ALKKAGI'].includes(String(p.publicState.gameCode)) && p.role === 'PLAYER') && Object.keys(p.privateState).length !== 0)
  )
    throw new Error('경기 공개 상태 또는 관전 권한을 확인해주세요.')
  const common = {
    gameId: p.gameId,
    version: p.version,
    role: p.role as Game['role'],
  }
  if (record(p.publicState) && p.publicState.gameCode === 'STONE_RUMBLE') return { ...common, stone: parseStoneState(p.publicState) }
  if (record(p.publicState) && p.publicState.gameCode === 'ALKKAGI') {
    const alkkagi = parseAlkkagi(p.publicState, common.gameId, common.version)
    return { ...common, alkkagi, alkkagiHand: parseAlkkagiHand(p.privateState, alkkagi, ownId, common.role) }
  }
  if (record(p.publicState) && p.publicState.gameCode === 'DICE_LEDGER') return { ...common, ledger: parseLedger(p.publicState) }
  if (record(p.publicState) && p.publicState.gameCode === 'QUORIDOR') {
    const quoridor = parseQuoridor(p.publicState)
    if (quoridor.version !== common.version) throw new Error('쿼리도 버전이 일치하지 않습니다.')
    return { ...common, quoridor }
  }
  if (record(p.publicState) && p.publicState.gameCode === 'HALLI_GALLI') return { ...common, halli: parseHalliGalli(p.publicState) }
  if (record(p.publicState) && p.publicState.gameCode === 'LIAR_BRIDGE') {
    const bridge = parseBridge(p.publicState)
    return { ...common, bridge, secret: parseSecret(p.privateState, ownId, common.role, bridge) }
  }
  if (record(p.publicState) && p.publicState.gameCode === 'ONE_CARD') {
    const onecard = parseOneCard(p.publicState)
    return { ...common, onecard, hand: p.role === 'PLAYER' ? parseHand(p.privateState, ownId, onecard) : null }
  }
  return record(p.publicState) && p.publicState.gameCode === 'DICE'
    ? { ...common, dice: parseFarkle(p.publicState) } : { ...common, omok: parseOmok(p.publicState, common.role === 'PLAYER' ? ownId : '', p.privateState) }
}
export function parseResult(p: Record<string, unknown>, ownId: string): Result {
  const participantCount = Array.isArray(p.participants) ? p.participants.length : 0
  const cappedStone = p.gameCode === 'STONE_RUMBLE' && p.settlementStatus === 'SETTLED' && p.betAmountPerPlayer === 0
  if (
    !id(p.gameSessionId) ||
    !integer(p.version) ||
    !['OMOK', 'DICE', 'ONE_CARD', 'LIAR_BRIDGE', 'DICE_LEDGER', 'ALKKAGI', 'HALLI_GALLI', 'QUORIDOR', 'STONE_RUMBLE'].includes(String(p.gameCode)) ||
    !['FINISHED', 'INVALID'].includes(String(p.status)) ||
    typeof p.endReason !== 'string' || !/^[A-Z][A-Z0-9_]{0,31}$/.test(p.endReason) ||
    !['PENDING', 'SETTLED'].includes(String(p.settlementStatus)) ||
    !integer(p.betAmountPerPlayer) ||
    p.betAmountPerPlayer < 0 ||
    !date(p.endedAt) ||
    !Array.isArray(p.participants) ||
    p.participants.length < 2 ||
    p.participants.length > (p.gameCode === 'STONE_RUMBLE' ? 8 : 4) ||
    !p.participants.every((v) => record(v) && id(v.userId)
      && (id(v.result) || (p.status === 'INVALID' && v.result === null))
      && (v.rank == null && v.rewardCoins == null || p.gameCode === 'STONE_RUMBLE'
        && integer(v.rank) && Number(v.rank) >= 1 && Number(v.rank) <= participantCount
        && integer(v.rewardCoins) && Number(v.rewardCoins) <= 80
        && (cappedStone ? Number(v.rewardCoins) >= 0 && (v.userId !== ownId || v.rewardCoins === p.myCoinDelta)
          : Number(v.rewardCoins) >= 10 && Number(v.rewardCoins) % 5 === 0))) ||
    new Set(p.participants.map((v) => v.userId)).size !==
      p.participants.length ||
    !p.participants.some((v) => v.userId === ownId) ||
    (p.settlementStatus === 'PENDING'
      ? p.myCoinDelta !== null
      : !Number.isSafeInteger(p.myCoinDelta)) ||
    (p.status === 'INVALID' && p.settlementStatus === 'SETTLED' && p.myCoinDelta !== 0)
  )
    throw new Error('경기 정산 결과 형식이 올바르지 않습니다.')
  return {
    version: p.version,
    gameSessionId: p.gameSessionId,
    gameCode: String(p.gameCode),
    status: p.status as Result['status'],
    endReason: p.endReason,
    settlementStatus: p.settlementStatus as Result['settlementStatus'],
    betAmountPerPlayer: p.betAmountPerPlayer,
    myCoinDelta: p.myCoinDelta as number | null,
    endedAt: p.endedAt,
    participants: p.participants.map((v) => ({
      userId: String(v.userId),
      result: v.result === null ? null : String(v.result),
      ...(typeof v.rank === 'number' ? { rank: v.rank, rewardCoins: v.rewardCoins as number } : {}),
    })),
  }
}

export function parseFarkle(p: unknown): Farkle {
  if (!record(p) || p.gameCode !== 'DICE' || !['PLAYING', 'FINISHED'].includes(String(p.status))
    || !Array.isArray(p.players) || p.players.length < 2 || p.players.length > 4 || !p.players.every(id)
    || new Set(p.players).size !== p.players.length
    || !Array.isArray(p.scores) || p.scores.length !== p.players.length || !p.scores.every(integer)
    || ![2000, 4000, 6000].includes(Number(p.targetScore)) || typeof p.targetScore !== 'number' || p.turnTimeLimitMs !== 30000
    || !integer(p.turnScore) || !integer(p.rollId) || !integer(p.round) || p.round < 1
    || !['AWAITING_ROLL', 'SELECTING', 'FINISHED'].includes(String(p.stage)) || typeof p.hotDice !== 'boolean'
    || !['START', 'ROLL', 'HOT_DICE', 'BANK', 'BUST', 'TURN_TIMEOUT', 'PLAYER_LEFT'].includes(String(p.lastEvent))
    || !nullableId(p.winnerUserId) || !nullableId(p.endReason) || !(p.endedAt === null || date(p.endedAt))
    || !Array.isArray(p.dice) || ![0, 6].includes(p.dice.length)
    || !p.dice.every(d => record(d) && integer(d.id) && d.id <= 5 && integer(d.value) && d.value >= 1 && d.value <= 6 && typeof d.held === 'boolean')
    || new Set(p.dice.map(d => d.id)).size !== p.dice.length)
    throw new Error('주사위 공개 상태 형식을 확인해주세요.')
  const forfeited = p.forfeitedUserIds ?? []
  const players = p.players
  if (!Array.isArray(forfeited) || !forfeited.every(user => id(user) && players.includes(user))
    || new Set(forfeited).size !== forfeited.length || forfeited.length >= p.players.length
    || forfeited.includes(p.turnUserId) || forfeited.includes(p.winnerUserId))
    throw new Error('주사위 기권 참가자를 확인해주세요.')
  if ((p.status === 'PLAYING' && (!id(p.turnUserId) || !p.players.includes(p.turnUserId) || !date(p.turnDeadline)
      || p.winnerUserId !== null || p.endedAt !== null || p.endReason !== null || p.stage === 'FINISHED'))
    || (p.status === 'FINISHED' && (p.turnUserId !== null || p.turnDeadline !== null || !date(p.endedAt)
      || !id(p.endReason) || !id(p.winnerUserId) || !p.players.includes(p.winnerUserId) || p.stage !== 'FINISHED'))
    || (p.stage === 'AWAITING_ROLL' && p.dice.length !== 0)
    || (p.stage === 'SELECTING' && p.dice.length !== 6))
    throw new Error('주사위 차례·단계·마감을 확인해주세요.')
  const lastRoll = p.lastRoll
  if (lastRoll != null && (!record(lastRoll) || !integer(lastRoll.rollId) || lastRoll.rollId !== p.rollId
    || !id(lastRoll.actorUserId) || !p.players.includes(lastRoll.actorUserId)
    || !Array.isArray(lastRoll.dice) || lastRoll.dice.length !== 6
    || !lastRoll.dice.every(d => record(d) && integer(d.id) && d.id <= 5 && integer(d.value) && d.value >= 1 && d.value <= 6 && typeof d.held === 'boolean')
    || new Set(lastRoll.dice.map(d => d.id)).size !== 6)) throw new Error('마지막 주사위 굴림 형식을 확인해주세요.')
  return {
    gameCode: 'DICE', status: p.status as Farkle['status'], players: [...p.players], scores: [...p.scores],
    forfeitedUserIds: [...forfeited],
    targetScore: p.targetScore, turnTimeLimitMs: 30000, turnUserId: p.turnUserId as string | null,
    turnDeadline: p.turnDeadline as string | null, turnScore: p.turnScore,
    dice: p.dice.map(d => ({ id: Number(d.id), value: Number(d.value), held: Boolean(d.held) })),
    stage: p.stage as Farkle['stage'], rollId: p.rollId, round: p.round, hotDice: p.hotDice,
    lastEvent: p.lastEvent as Farkle['lastEvent'], winnerUserId: p.winnerUserId as string | null,
    endReason: p.endReason as string | null, endedAt: p.endedAt as string | null,
    lastRoll: lastRoll == null ? null : { rollId: lastRoll.rollId as number, actorUserId: lastRoll.actorUserId as string,
      dice: (lastRoll.dice as Farkle['dice']).map(d => ({ id: d.id, value: d.value, held: d.held })) },
  }
}
