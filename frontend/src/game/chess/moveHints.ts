import type { Chess } from './protocol'

/** inCheck describes the side to move; never infer attacks or danger from local move rules. */
export function checkedKingSquare(chess: Pick<Chess, 'board' | 'status' | 'inCheck' | 'turnUserId' | 'whiteUserId' | 'blackUserId'>) {
  if (chess.status !== 'PLAYING' || !chess.inCheck || chess.board.length !== 64) return ''
  const king = chess.turnUserId === chess.whiteUserId ? 'K' : chess.turnUserId === chess.blackUserId ? 'k' : ''
  const index = king ? chess.board.indexOf(king) : -1
  return index < 0 ? '' : `${'abcdefgh'[index % 8]}${1 + Math.floor(index / 8)}`
}

export type BoardPoint = { x: number; z: number }
export type MoveTarget = { square: string; index: number; capture: boolean }
export type MovePath = { points: BoardPoint[]; target: MoveTarget; kind: 'ray' | 'jump' | 'castle' }
const validSquare = (square: string) => /^[a-h][1-8]$/.test(square)
const indexOf = (square: string) => square.charCodeAt(0) - 97 + (Number(square[1]) - 1) * 8
const pointAt = (index: number): BoardPoint => ({ x: index % 8 - 3.5, z: 3.5 - Math.floor(index / 8) })

/** Presentation of the server's destination list only. This never calculates or expands chess legality. */
export function chessMoveHints(board: string, selected: string, destinations: readonly string[]) {
  const targets: MoveTarget[] = [], paths: MovePath[] = []
  if (board.length !== 64 || !validSquare(selected) || !board[indexOf(selected)] || board[indexOf(selected)] === '.') return { targets, paths }
  const origin = indexOf(selected), piece = board[origin].toUpperCase(), from = pointAt(origin)
  for (const square of new Set(destinations)) {
    if (!validSquare(square) || square === selected) continue
    const index = indexOf(square)
    // A legal diagonal pawn destination on an empty square is en passant.
    targets.push({ square, index, capture: board[index] !== '.' || piece === 'P' && index % 8 !== origin % 8 })
  }
  const rays = new Map<string, MovePath>()
  for (const target of targets) {
    const to = pointAt(target.index), dx = to.x - from.x, dz = to.z - from.z
    if (piece === 'N') {
      const bend = Math.abs(dx) > Math.abs(dz) ? { x: to.x, z: from.z } : { x: from.x, z: to.z }
      paths.push({ points: [from, bend, to], target, kind: 'jump' })
    } else {
      const key = `${Math.sign(dx)},${Math.sign(dz)}`, previous = rays.get(key)
      const end = previous?.points.at(-1)
      if (!end || dx * dx + dz * dz > (end.x - from.x) ** 2 + (end.z - from.z) ** 2)
        rays.set(key, { points: [from, to], target, kind: piece === 'K' && Math.abs(dx) === 2 ? 'castle' : 'ray' })
    }
  }
  paths.push(...rays.values())
  return { targets, paths }
}

export function chessSelectionLabel(board: string, selected: string, destinations: readonly string[], labels: Record<string, string>) {
  const hints = chessMoveHints(board, selected, destinations)
  if (!hints.targets.length) return ''
  const captures = hints.targets.filter(target => target.capture).length, moves = hints.targets.length - captures
  return `${selected} ${labels[board[indexOf(selected)].toUpperCase()]}${moves ? ` · 이동 ${moves}칸` : ''}${captures ? ` · 잡기 ${captures}칸` : ''}`
    + (hints.paths.some(path => path.kind === 'jump') ? ' · 점선 L자' : hints.paths.some(path => path.kind === 'castle') ? ' · 캐슬링 가능' : '')
}
