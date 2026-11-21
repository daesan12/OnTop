import { integer, record } from '../../network/protocol'

export interface ChessMove { from: string; to: string; promotion: 'q' | 'r' | 'b' | 'n' | null }
export interface Chess {
  gameCode: 'CHESS'; status: 'PLAYING' | 'FINISHED'; board: string; fen: string
  whiteUserId: string; blackUserId: string; turnUserId: string | null; turnDeadline: string | null
  turnStartedAt: string; remainingMs: [number, number]; inCheck: boolean; canClaimDraw: boolean
  legalMoves: ChessMove[]; moves: string[]; moveCount: number
  winnerUserId: string | null; endReason: string | null; endedAt: string | null
  drawOfferedBy: string | null; drawOffersUsed: string[]
}
export type ChessInput = { kind: 'move'; from: string; to: string; promotion?: string }
  | { kind: 'drawOffer' } | { kind: 'drawRespond'; accept: boolean }
  | { kind: 'claimDraw'; from?: string; to?: string; promotion?: string }
const id = (v: unknown): v is string => typeof v === 'string' && /^[1-9]\d{0,18}$/.test(v)
const date = (v: unknown): v is string => typeof v === 'string' && /Z$/.test(v) && Number.isFinite(Date.parse(v))
export const square = (v: unknown): v is string => typeof v === 'string' && /^[a-h][1-8]$/.test(v)
export const CHESS_END_REASON: Record<string, string> = {
  CHECKMATE: '체크메이트', STALEMATE: '스테일메이트', INSUFFICIENT_MATERIAL: '메이트 기물 부족',
  THREEFOLD_REPETITION: '3회 반복 청구', FIVEFOLD_REPETITION: '5회 반복', FIFTY_MOVES: '50수 규칙 청구',
  SEVENTY_FIVE_MOVES: '75수 규칙', TIMEOUT: '시간패', TIMEOUT_DRAW: '시간 만료 · 상대 메이트 불가',
  AGREED_DRAW: '합의 무승부', EXPLICIT_LEAVE: '기권', RECONNECT_EXPIRED: '재접속 시간 만료',
  LOGOUT: '로그아웃', MEMBER_DEACTIVATED: '회원 탈퇴',
}
export function parseChess(p: unknown): Chess {
  const invalid = (): never => { throw new Error('체스 공개 상태를 확인해주세요.') }
  if (!record(p) || p.gameCode !== 'CHESS' || !['PLAYING', 'FINISHED'].includes(String(p.status))
    || typeof p.board !== 'string' || !/^[.prnbqkPRNBQK]{64}$/.test(p.board)
    || [...p.board].filter(c => c === 'K').length !== 1 || [...p.board].filter(c => c === 'k').length !== 1
    || typeof p.fen !== 'string' || p.fen.length > 150 || !id(p.whiteUserId) || !id(p.blackUserId) || p.whiteUserId === p.blackUserId
    || !date(p.turnStartedAt) || typeof p.inCheck !== 'boolean' || typeof p.canClaimDraw !== 'boolean'
    || !Array.isArray(p.remainingMs) || p.remainingMs.length !== 2 || !p.remainingMs.every(n => integer(n) && n >= 0 && n <= 600000)
    || !integer(p.moveCount) || !Array.isArray(p.moves) || p.moves.length !== p.moveCount
    || !p.moves.every(m => typeof m === 'string' && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m))
    || !Array.isArray(p.legalMoves) || p.legalMoves.length > 256 || !p.legalMoves.every(m => record(m)
      && square(m.from) && square(m.to) && (m.promotion === null || ['q', 'r', 'b', 'n'].includes(String(m.promotion))))
    || !Array.isArray(p.drawOffersUsed) || p.drawOffersUsed.length > 2
    || !p.drawOffersUsed.every(u => u === p.whiteUserId || u === p.blackUserId)
    || !(p.drawOfferedBy === null || p.drawOfferedBy === p.whiteUserId || p.drawOfferedBy === p.blackUserId)
    || !(p.winnerUserId === null || p.winnerUserId === p.whiteUserId || p.winnerUserId === p.blackUserId)) return invalid()
  if (p.status === 'PLAYING' ? ![p.whiteUserId, p.blackUserId].includes(String(p.turnUserId)) || !date(p.turnDeadline)
      || p.endedAt !== null || p.endReason !== null || p.winnerUserId !== null
    : p.turnUserId !== null || p.turnDeadline !== null || !date(p.endedAt) || !CHESS_END_REASON[String(p.endReason)]
      || p.legalMoves.length !== 0 || p.drawOfferedBy !== null || p.canClaimDraw) return invalid()
  // Return only the documented fields; server values determine every legal destination and result.
  return { gameCode: 'CHESS', status: p.status as Chess['status'], board: p.board, fen: p.fen,
    whiteUserId: p.whiteUserId, blackUserId: p.blackUserId, turnUserId: p.turnUserId as string | null,
    turnDeadline: p.turnDeadline as string | null, turnStartedAt: p.turnStartedAt,
    remainingMs: [...p.remainingMs] as [number, number], inCheck: p.inCheck, canClaimDraw: p.canClaimDraw,
    legalMoves: p.legalMoves.map(m => ({ from: m.from, to: m.to, promotion: m.promotion })) as ChessMove[],
    moves: [...p.moves] as string[], moveCount: p.moveCount, winnerUserId: p.winnerUserId as string | null,
    endReason: p.endReason as string | null, endedAt: p.endedAt as string | null,
    drawOfferedBy: p.drawOfferedBy as string | null, drawOffersUsed: [...p.drawOffersUsed] as string[] }
}
