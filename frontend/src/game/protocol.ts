import { parseAlkkagi, parseAlkkagiHand, type Alkkagi, type AlkkagiHand } from './alkkagi/protocol'
import { integer, record } from '../network/protocol'
import { parseOneCard, parseHand, type OneCard, type Hand } from './onecard/protocol'
import { parseBridge, parseSecret, type Bridge, type SecretDie } from './bridge/protocol'
import { parseLedger, type DiceLedger } from './ledger/protocol'
import { parseHalliGalli, type HalliGalli } from './halligalli/protocol'

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
  gameCode: 'OMOK'
  status: 'PLAYING' | 'FINISHED'
  boardSize: 15
  board: number[][]
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
export interface OmokGame extends GameHeader { ledger?: never; alkkagi?: never; alkkagiHand?: never; omok: Omok; dice?: never; onecard?: never; hand?: never; bridge?: never; secret?: never; halli?: never }
export interface DiceGame extends GameHeader { ledger?: never; alkkagi?: never; alkkagiHand?: never; dice: Farkle; omok?: never; onecard?: never; hand?: never; bridge?: never; secret?: never; halli?: never }
export interface OneCardGame extends GameHeader { ledger?: never; alkkagi?: never; alkkagiHand?: never; onecard: OneCard; hand: Hand | null; omok?: never; dice?: never; bridge?: never; secret?: never; halli?: never }
export interface BridgeGame extends GameHeader { ledger?: never; alkkagi?: never; alkkagiHand?: never; bridge: Bridge; secret: SecretDie | null; omok?: never; dice?: never; onecard?: never; hand?: never; halli?: never }
export interface AlkkagiGame extends GameHeader { ledger?: never; alkkagi: Alkkagi; alkkagiHand: AlkkagiHand | null; omok?: never; dice?: never; onecard?: never; hand?: never; bridge?: never; secret?: never; halli?: never }
export interface LedgerGame extends GameHeader { alkkagi?: never; alkkagiHand?: never; ledger: DiceLedger; omok?: never; dice?: never; onecard?: never; hand?: never; bridge?: never; secret?: never; halli?: never }
export interface HalliGame extends GameHeader { ledger?: never; alkkagi?: never; alkkagiHand?: never; halli: HalliGalli; omok?: never; dice?: never; onecard?: never; hand?: never; bridge?: never; secret?: never }
export type Game = OmokGame | DiceGame | OneCardGame | BridgeGame | AlkkagiGame | LedgerGame | HalliGame
export interface Farkle {
  gameCode: 'DICE'; status: 'PLAYING' | 'FINISHED'; players: string[]; scores: number[]
  targetScore: number; turnTimeLimitMs: 30000; turnUserId: string | null; turnDeadline: string | null
  turnScore: number; dice: { id: number; value: number; held: boolean }[]
  stage: 'AWAITING_ROLL' | 'SELECTING' | 'FINISHED'; rollId: number; round: number
  hotDice: boolean; lastEvent: 'START' | 'ROLL' | 'HOT_DICE' | 'BANK' | 'BUST' | 'TURN_TIMEOUT'
  winnerUserId: string | null; endReason: string | null; endedAt: string | null
}
export const gameState = (g: Game) => g.omok ?? g.dice ?? g.onecard ?? g.bridge ?? g.ledger ?? g.alkkagi ?? g.halli
export const gamePlayers = (g: Game) => g.omok ? [g.omok.blackUserId, g.omok.whiteUserId] : g.dice ? g.dice.players : g.alkkagi ? g.alkkagi.players : (g.onecard ?? g.bridge ?? g.ledger ?? g.halli).players.map(p => p.userId)
export interface Result {
  version: number
  gameSessionId: string
  gameCode: string
  status: 'FINISHED' | 'INVALID'
  endReason: string
  settlementStatus: 'PENDING' | 'SETTLED'
  betAmountPerPlayer: number
  myCoinDelta: number | null
  participants: { userId: string; result: string | null }[]
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
export function parseOmok(p: unknown): Omok {
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
  // Copy only known public fields; private payloads and extra server data never enter this store.
  return {
    gameCode: 'OMOK',
    status: p.status as Omok['status'],
    boardSize: 15,
    board: p.board.map((row) => [...row]),
    blackUserId: p.blackUserId,
    whiteUserId: p.whiteUserId,
    turnUserId: p.turnUserId as string | null,
    turnDeadline: p.turnDeadline as string | null,
    moveCount: p.moveCount,
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
    (!(record(p.publicState) && ['ONE_CARD', 'LIAR_BRIDGE', 'ALKKAGI'].includes(String(p.publicState.gameCode)) && p.role === 'PLAYER') && Object.keys(p.privateState).length !== 0)
  )
    throw new Error('경기 공개 상태 또는 관전 권한을 확인해주세요.')
  const common = {
    gameId: p.gameId,
    version: p.version,
    role: p.role as Game['role'],
  }
  if (record(p.publicState) && p.publicState.gameCode === 'ALKKAGI') {
    const alkkagi = parseAlkkagi(p.publicState, common.gameId, common.version)
    return { ...common, alkkagi, alkkagiHand: parseAlkkagiHand(p.privateState, alkkagi, ownId, common.role) }
  }
  if (record(p.publicState) && p.publicState.gameCode === 'DICE_LEDGER') return { ...common, ledger: parseLedger(p.publicState) }
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
    ? { ...common, dice: parseFarkle(p.publicState) } : { ...common, omok: parseOmok(p.publicState) }
}
export function parseResult(p: Record<string, unknown>, ownId: string): Result {
  if (
    !id(p.gameSessionId) ||
    !integer(p.version) ||
    !['OMOK', 'DICE', 'ONE_CARD', 'LIAR_BRIDGE', 'DICE_LEDGER', 'ALKKAGI', 'HALLI_GALLI'].includes(String(p.gameCode)) ||
    !['FINISHED', 'INVALID'].includes(String(p.status)) ||
    typeof p.endReason !== 'string' || !/^[A-Z][A-Z0-9_]{0,31}$/.test(p.endReason) ||
    !['PENDING', 'SETTLED'].includes(String(p.settlementStatus)) ||
    !integer(p.betAmountPerPlayer) ||
    p.betAmountPerPlayer < 1 ||
    !date(p.endedAt) ||
    !Array.isArray(p.participants) ||
    p.participants.length < 2 ||
    p.participants.length > 4 ||
    !p.participants.every((v) => record(v) && id(v.userId)
      && (id(v.result) || (p.status === 'INVALID' && v.result === null))) ||
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
    })),
  }
}

export function parseFarkle(p: unknown): Farkle {
  if (!record(p) || p.gameCode !== 'DICE' || !['PLAYING', 'FINISHED'].includes(String(p.status))
    || !Array.isArray(p.players) || p.players.length !== 2 || !p.players.every(id) || new Set(p.players).size !== 2
    || !Array.isArray(p.scores) || p.scores.length !== 2 || !p.scores.every(integer)
    || ![2000, 4000, 6000].includes(Number(p.targetScore)) || typeof p.targetScore !== 'number' || p.turnTimeLimitMs !== 30000
    || !integer(p.turnScore) || !integer(p.rollId) || !integer(p.round) || p.round < 1
    || !['AWAITING_ROLL', 'SELECTING', 'FINISHED'].includes(String(p.stage)) || typeof p.hotDice !== 'boolean'
    || !['START', 'ROLL', 'HOT_DICE', 'BANK', 'BUST', 'TURN_TIMEOUT'].includes(String(p.lastEvent))
    || !nullableId(p.winnerUserId) || !nullableId(p.endReason) || !(p.endedAt === null || date(p.endedAt))
    || !Array.isArray(p.dice) || ![0, 6].includes(p.dice.length)
    || !p.dice.every(d => record(d) && integer(d.id) && d.id <= 5 && integer(d.value) && d.value >= 1 && d.value <= 6 && typeof d.held === 'boolean')
    || new Set(p.dice.map(d => d.id)).size !== p.dice.length)
    throw new Error('주사위 공개 상태 형식을 확인해주세요.')
  if ((p.status === 'PLAYING' && (!id(p.turnUserId) || !p.players.includes(p.turnUserId) || !date(p.turnDeadline)
      || p.winnerUserId !== null || p.endedAt !== null || p.endReason !== null || p.stage === 'FINISHED'))
    || (p.status === 'FINISHED' && (p.turnUserId !== null || p.turnDeadline !== null || !date(p.endedAt)
      || !id(p.endReason) || !id(p.winnerUserId) || !p.players.includes(p.winnerUserId) || p.stage !== 'FINISHED'))
    || (p.stage === 'AWAITING_ROLL' && p.dice.length !== 0)
    || (p.stage === 'SELECTING' && p.dice.length !== 6))
    throw new Error('주사위 차례·단계·마감을 확인해주세요.')
  return {
    gameCode: 'DICE', status: p.status as Farkle['status'], players: [...p.players], scores: [...p.scores],
    targetScore: p.targetScore, turnTimeLimitMs: 30000, turnUserId: p.turnUserId as string | null,
    turnDeadline: p.turnDeadline as string | null, turnScore: p.turnScore,
    dice: p.dice.map(d => ({ id: Number(d.id), value: Number(d.value), held: Boolean(d.held) })),
    stage: p.stage as Farkle['stage'], rollId: p.rollId, round: p.round, hotDice: p.hotDice,
    lastEvent: p.lastEvent as Farkle['lastEvent'], winnerUserId: p.winnerUserId as string | null,
    endReason: p.endReason as string | null, endedAt: p.endedAt as string | null,
  }
}
