export type ChessPosition = { gameId: string; board: string; moves: readonly string[] }
export type PieceTravel = { from: number; to: number; piece: string; result: string; jump: boolean }
export type ChessMotion = { travel: PieceTravel[]; captured: { index: number; piece: string } | null; duration: number }
const indexOf = (square: string) => square.charCodeAt(0) - 97 + (Number(square[1]) - 1) * 8
const boardValid = (board: string) => /^[.prnbqkPRNBQK]{64}$/.test(board)
export const chessPoint = (index: number) => ({ x: index % 8 - 3.5, z: 3.5 - Math.floor(index / 8) })
const clamp = (n: number) => Math.max(0, Math.min(1, n))
const ease = (n: number) => n * n * (3 - 2 * n)

/** Reconcile one confirmed UCI move with its two boards. This does not calculate legal moves. */
export function chessMotion(previous: ChessPosition | null, next: ChessPosition): ChessMotion | null {
  if (!previous || !next.gameId || previous.gameId !== next.gameId || !boardValid(previous.board) || !boardValid(next.board)
    || next.moves.length !== previous.moves.length + 1 || !previous.moves.every((move, i) => move === next.moves[i])) return null
  const move = next.moves.at(-1)!
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)) return null
  const from = indexOf(move.slice(0, 2)), to = indexOf(move.slice(2, 4)), piece = previous.board[from]
  if (from === to || piece === '.') return null
  const white = piece === piece.toUpperCase(), kind = piece.toUpperCase(), expected = [...previous.board]
  const result = move[4] ? white ? move[4].toUpperCase() : move[4] : piece
  if (move[4] && kind !== 'P') return null
  let captured: ChessMotion['captured'] = expected[to] === '.' ? null : { index: to, piece: expected[to] }
  if (captured && (captured.piece.toUpperCase() === 'K' || (captured.piece === captured.piece.toUpperCase()) === white)) return null
  expected[from] = '.'; expected[to] = result
  const travel: PieceTravel[] = [{ from, to, piece, result, jump: kind === 'N' }]
  if (kind === 'P' && from % 8 !== to % 8 && !captured) {
    const index = to + (white ? -8 : 8), pawn = white ? 'p' : 'P'
    if (expected[index] !== pawn) return null
    captured = { index, piece: pawn }; expected[index] = '.'
  }
  if (kind === 'K' && Math.abs(to - from) === 2) {
    const rookFrom = to > from ? from + 3 : from - 4, rookTo = to > from ? from + 1 : from - 1, rook = white ? 'R' : 'r'
    if (expected[rookFrom] !== rook || expected[rookTo] !== '.') return null
    expected[rookFrom] = '.'; expected[rookTo] = rook
    travel.push({ from: rookFrom, to: rookTo, piece: rook, result: rook, jump: false })
  }
  if (expected.join('') !== next.board) return null
  const a = chessPoint(from), b = chessPoint(to)
  return { travel, captured, duration: kind === 'N' ? .52 : Math.min(.56, .32 + Math.hypot(b.x - a.x, b.z - a.z) * .035) }
}

export function chessTravelPose(travel: PieceTravel, progress: number) {
  const t = clamp(progress), s = ease(t), from = chessPoint(travel.from), to = chessPoint(travel.to)
  return { x: (from.x - to.x) * (1 - s), z: (from.z - to.z) * (1 - s), y: Math.sin(t * Math.PI) * (travel.jump ? .85 : .12) }
}
export function chessCapturePose(progress: number) {
  const s = ease(clamp((progress - .3) / .7))
  return { opacity: 1 - s, scale: 1 - .22 * s, y: -.12 * s, tilt: .35 * s }
}
