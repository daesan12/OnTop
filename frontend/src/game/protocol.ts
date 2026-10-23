import { integer, record } from '../network/protocol'

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
  lastMove: { x: number; y: number; stone: 'BLACK' | 'WHITE' } | null
  winnerUserId: string | null
  endReason: string | null
  endedAt: string | null
}
export interface Game {
  gameId: string
  version: number
  role: 'PLAYER' | 'SPECTATOR'
  omok: Omok
}
export interface Result {
  version: number
  gameSessionId: string
  gameCode: string
  status: 'FINISHED' | 'INVALID'
  settlementStatus: 'PENDING' | 'SETTLED'
  myCoinDelta: number | null
  participants: { userId: string; result: string }[]
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
export function parseGame(p: Record<string, unknown>): Game {
  if (
    !id(p.gameId) ||
    !integer(p.version) ||
    !['PLAYER', 'SPECTATOR'].includes(String(p.role)) ||
    !record(p.privateState) ||
    Object.keys(p.privateState).length !== 0
  )
    throw new Error('오목 공개 상태 또는 관전 권한을 확인해주세요.')
  return {
    gameId: p.gameId,
    version: p.version,
    role: p.role as Game['role'],
    omok: parseOmok(p.publicState),
  }
}
export function parseResult(p: Record<string, unknown>, ownId: string): Result {
  if (
    !id(p.gameSessionId) ||
    !integer(p.version) ||
    p.gameCode !== 'OMOK' ||
    !['FINISHED', 'INVALID'].includes(String(p.status)) ||
    !['PENDING', 'SETTLED'].includes(String(p.settlementStatus)) ||
    !integer(p.betAmountPerPlayer) ||
    p.betAmountPerPlayer < 1 ||
    !date(p.endedAt) ||
    !Array.isArray(p.participants) ||
    p.participants.length < 2 ||
    p.participants.length > 4 ||
    !p.participants.every((v) => record(v) && id(v.userId) && id(v.result)) ||
    new Set(p.participants.map((v) => v.userId)).size !==
      p.participants.length ||
    !p.participants.some((v) => v.userId === ownId) ||
    (p.settlementStatus === 'PENDING'
      ? p.myCoinDelta !== null
      : !Number.isSafeInteger(p.myCoinDelta))
  )
    throw new Error('경기 정산 결과 형식이 올바르지 않습니다.')
  return {
    version: p.version,
    gameSessionId: p.gameSessionId,
    gameCode: 'OMOK',
    status: p.status as Result['status'],
    settlementStatus: p.settlementStatus as Result['settlementStatus'],
    myCoinDelta: p.myCoinDelta as number | null,
    participants: p.participants.map((v) => ({
      userId: String(v.userId),
      result: String(v.result),
    })),
  }
}
