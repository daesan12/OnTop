import type { Game, Recovery } from '../protocol'
import { chessMotion } from './motion'
import type { Chess } from './protocol'

export type ChessSound = 'chess-castle' | 'chess-promotion' | 'chess-invalid' | 'chess-select' | 'chess-move' | 'chess-capture' | 'chess-check' | 'chess-checkmate' | 'chess-checkmate-win' | 'chess-checkmate-lose' | 'chess-draw'
export const CHESS_SOUND_DURATION = { 'chess-move': .15, 'chess-capture': .23, 'chess-check': .42,
  'chess-checkmate': .95, 'chess-checkmate-win': .95, 'chess-checkmate-lose': .88, 'chess-draw': .78, 'chess-select': .09, 'chess-invalid': .16, 'chess-promotion': .48, 'chess-castle': .3 } as const
export const isChessSound = (name: string): name is ChessSound => Object.hasOwn(CHESS_SOUND_DURATION, name)

/** Input feedback uses server destinations; choosing another own piece is not a failed move. */
export function chessSelectionSound(chess: Pick<Chess, 'board' | 'legalMoves' | 'whiteUserId' | 'blackUserId'>,
  ownId: string, selected: string, square: string): 'chess-select' | 'chess-invalid' | null {
  if (!/^[a-h][1-8]$/.test(square) || ![chess.whiteUserId, chess.blackUserId].includes(ownId) || selected === square) return null
  if (chess.legalMoves.some(move => move.from === selected && move.to === square)) return null
  if (chess.legalMoves.some(move => move.from === square)) return 'chess-select'
  if (!selected || !chess.legalMoves.some(move => move.from === selected)) return null
  const piece = chess.board[square.charCodeAt(0) - 97 + (Number(square[1]) - 1) * 8]
  if (!piece || piece === '.') return 'chess-invalid'
  return (piece === piece.toUpperCase()) === (ownId === chess.whiteUserId) ? null : 'chess-invalid'
}

/** A live FINISHED notice may precede its final board; a recovery must break continuity. */
export function chessSoundGame(previous: string, state: { game: Game | null; recovery: Recovery; uncertain: boolean; start?: { phase: string } | null }, connected: boolean) {
  const id = state.game?.chess ? state.game.gameId : ''
  if (!connected || state.uncertain || !id) return ''
  const finishing = state.recovery === 'FINISHED' || state.recovery === 'PENDING' && state.start?.phase === 'SETTLING'
  return state.recovery === 'RESTORED' || finishing && previous === id ? id : ''
}

function freshChessUpdate(previous: Game | null, next: Game, serverNow: number) {
  if (!previous?.chess || !next.chess || previous.gameId !== next.gameId || previous.role !== next.role
    || next.version <= previous.version || previous.chess.status !== 'PLAYING') return false
  const age = serverNow - Date.parse(next.chess.endedAt ?? next.chess.turnStartedAt)
  return Number.isFinite(age) && age >= -1200 && age < 1200
}

/** Same confirmed move/board reconciliation as the visual animation, including en passant. */
export function chessMoveSound(previous: Game | null, next: Game, serverNow: number): ChessSound | null {
  if (!freshChessUpdate(previous, next, serverNow)) return null
  if (!previous?.chess || !next.chess) return null
  const motion = chessMotion({ gameId: previous.gameId, board: previous.chess.board, moves: previous.chess.moves },
    { gameId: next.gameId, board: next.chess.board, moves: next.chess.moves })
  if (!motion) return null
  const king = motion.travel[0]
  if (motion.travel.length === 2 && !motion.captured && (
    king.piece === 'K' && king.from === 4 && [2, 6].includes(king.to)
    || king.piece === 'k' && king.from === 60 && [58, 62].includes(king.to))) return 'chess-castle'
  return motion.captured ? 'chess-capture' : 'chess-move'
}

/** Only a reconciled server move from the pawn's penultimate rank is a completed promotion. */
export function chessPromotionSound(previous: Game | null, next: Game, serverNow: number): 'chess-promotion' | null {
  if (!chessMoveSound(previous, next, serverNow) || !previous?.chess || !next.chess) return null
  const move = next.chess.moves.at(-1)!
  if (!/^[a-h][27][a-h][18][qrbn]$/.test(move)) return null
  const piece = previous.chess.board[move.charCodeAt(0) - 97 + (Number(move[1]) - 1) * 8]
  return piece === 'P' && move[1] === '7' && move[3] === '8'
    || piece === 'p' && move[1] === '2' && move[3] === '1' ? 'chess-promotion' : null
}

/** Position alerts follow special move sounds instead of masking them. */
export function chessSpecialMoveGap(cue: string, cues: readonly string[]) {
  if (cue !== 'chess-check' && !cue.startsWith('chess-checkmate') && cue !== 'chess-draw') return 0
  if (cues.includes('chess-promotion')) return CHESS_SOUND_DURATION['chess-promotion'] + .06
  return cues.includes('chess-castle') ? CHESS_SOUND_DURATION['chess-castle'] + .06 - .18 : 0
}

const DRAW_REASONS = new Set(['STALEMATE', 'INSUFFICIENT_MATERIAL', 'THREEFOLD_REPETITION', 'FIVEFOLD_REPETITION',
  'FIFTY_MOVES', 'SEVENTY_FIVE_MOVES', 'TIMEOUT_DRAW', 'AGREED_DRAW'])

/** Checkmate takes priority over check; never infer attacks or the winner locally. */
export function chessPositionSound(previous: Game | null, next: Game, serverNow: number, ownId = ''): ChessSound | null {
  if (!freshChessUpdate(previous, next, serverNow) || !previous?.chess || !next.chess) return null
  const chess = next.chess!
  if (chess.status === 'FINISHED' && chess.winnerUserId === null && DRAW_REASONS.has(chess.endReason ?? '')) {
    if (next.role === 'PLAYER' && ![chess.whiteUserId, chess.blackUserId].includes(ownId)) return null
    // Agreements/claims/timeouts do not move a piece; automatic draws can follow a move.
    const unchanged = previous.chess.board === chess.board && previous.chess.moves.length === chess.moves.length
      && previous.chess.moves.every((move, i) => move === chess.moves[i])
    return unchanged || chessMoveSound(previous, next, serverNow) ? 'chess-draw' : null
  }
  if (!chessMoveSound(previous, next, serverNow)) return null
  if (chess.status === 'FINISHED') {
    if (chess.endReason !== 'CHECKMATE' || !chess.winnerUserId
      || ![chess.whiteUserId, chess.blackUserId].includes(chess.winnerUserId)) return null
    if (next.role === 'SPECTATOR') return 'chess-checkmate'
    if (![chess.whiteUserId, chess.blackUserId].includes(ownId)) return null
    return chess.winnerUserId === ownId ? 'chess-checkmate-win' : 'chess-checkmate-lose'
  }
  return chess.inCheck && [chess.whiteUserId, chess.blackUserId].includes(chess.turnUserId ?? '') ? 'chess-check' : null
}

/** Original percussion/chimes; deterministic, with no downloads or extra AudioContext. */
export function chessSoundSamples(kind: ChessSound, rate: number) {
  const duration = CHESS_SOUND_DURATION[kind], samples = new Float32Array(Math.ceil(duration * rate))
  if (kind === 'chess-check' || kind.startsWith('chess-checkmate') || kind === 'chess-draw' || kind === 'chess-invalid' || kind === 'chess-promotion') {
    // Rounded attacks and a soft final fade keep the warning distinct without a harsh alarm.
    const notes = kind === 'chess-check' ? [[0, 740], [.15, 622.25]]
      : kind === 'chess-promotion' ? [[0, 659.25], [.1, 880], [.2, 1174.66]]
      : kind === 'chess-invalid' ? [[0, 330], [.065, 277.18]]
      : kind === 'chess-draw' ? [[0, 440], [.18, 523.25], [.36, 440]]
      : kind === 'chess-checkmate-lose' ? [[0, 392], [.14, 329.63], [.28, 261.63], [.42, 196]]
      : [[0, 523.25], [.12, 659.25], [.24, 783.99], [.36, 1046.5]]
    for (let i = 0; i < samples.length; i++) {
      const t = i / rate
      for (const [start, frequency] of notes) {
        const age = t - start
        if (age < 0) continue
        samples[i] += (1 - Math.exp(-age * 350)) * Math.exp(-age * (kind === 'chess-invalid' ? 18 : kind === 'chess-check' ? 13 : 8))
          * (Math.sin(2 * Math.PI * frequency * age) + .18 * Math.sin(2 * Math.PI * frequency * 2 * age)) * .5
      }
      samples[i] *= Math.min(1, (duration - t) / .04)
    }
    return samples
  }
  const capture = kind === 'chess-capture', castle = kind === 'chess-castle'
  let seed = 188, low = 0, peak = 0
  for (let i = 0; i < samples.length; i++) {
    const t = i / rate
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    const noise = seed / 0xffffffff * 2 - 1
    low += (noise - low) * .28
    const impact = (age: number, frequency: number) => age < 0 ? 0 : (1 - Math.exp(-age * 1800))
      * (.48 * Math.sin(2 * Math.PI * frequency * age) * Math.exp(-age * 45)
        + .2 * Math.sin(2 * Math.PI * frequency * 2.61 * age) * Math.exp(-age * 80)
        + .32 * low * Math.exp(-age * 65))
    samples[i] = (impact(t, castle ? 280 : capture ? 245 : kind === 'chess-select' ? 620 : 390)
      + (castle ? .65 * impact(t - .095, 420) : capture ? .5 * impact(t - .045, 540) : 0))
      * Math.min(1, t / .001) * Math.min(1, (duration - t) / .015)
    peak = Math.max(peak, Math.abs(samples[i]))
  }
  if (peak) for (let i = 0; i < samples.length; i++) samples[i] *= .9 / peak
  return samples
}

const cache = new WeakMap<AudioContext, Map<ChessSound, AudioBuffer>>()
export function chessSoundBuffer(context: AudioContext, kind: ChessSound) {
  let buffers = cache.get(context)
  if (!buffers) { buffers = new Map(); cache.set(context, buffers) }
  let buffer = buffers.get(kind)
  if (!buffer) {
    const samples = chessSoundSamples(kind, context.sampleRate)
    buffer = context.createBuffer(1, samples.length, context.sampleRate); buffer.getChannelData(0).set(samples)
    buffers.set(kind, buffer)
  }
  return buffer
}
