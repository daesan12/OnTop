import type { Game, Recovery } from '../protocol'
import { chessMotion } from './motion'

export type ChessSound = 'chess-move' | 'chess-capture' | 'chess-check' | 'chess-checkmate' | 'chess-checkmate-win' | 'chess-checkmate-lose'
export const CHESS_SOUND_DURATION = { 'chess-move': .15, 'chess-capture': .23, 'chess-check': .42,
  'chess-checkmate': .95, 'chess-checkmate-win': .95, 'chess-checkmate-lose': .88 } as const
export const isChessSound = (name: string): name is ChessSound => Object.hasOwn(CHESS_SOUND_DURATION, name)

/** A live FINISHED notice may precede its final board; a recovery must break continuity. */
export function chessSoundGame(previous: string, state: { game: Game | null; recovery: Recovery; uncertain: boolean; start?: { phase: string } | null }, connected: boolean) {
  const id = state.game?.chess ? state.game.gameId : ''
  if (!connected || state.uncertain || !id) return ''
  const finishing = state.recovery === 'FINISHED' || state.recovery === 'PENDING' && state.start?.phase === 'SETTLING'
  return state.recovery === 'RESTORED' || finishing && previous === id ? id : ''
}

/** Same confirmed move/board reconciliation as the visual animation, including en passant. */
export function chessMoveSound(previous: Game | null, next: Game, serverNow: number): ChessSound | null {
  if (!previous?.chess || !next.chess || previous.gameId !== next.gameId || previous.role !== next.role
    || next.version <= previous.version || previous.chess.status !== 'PLAYING') return null
  const age = serverNow - Date.parse(next.chess.endedAt ?? next.chess.turnStartedAt)
  if (!Number.isFinite(age) || age < -1200 || age >= 1200) return null
  const motion = chessMotion({ gameId: previous.gameId, board: previous.chess.board, moves: previous.chess.moves },
    { gameId: next.gameId, board: next.chess.board, moves: next.chess.moves })
  return motion ? motion.captured ? 'chess-capture' : 'chess-move' : null
}

/** Checkmate takes priority over check; never infer attacks or the winner locally. */
export function chessPositionSound(previous: Game | null, next: Game, serverNow: number, ownId = ''): ChessSound | null {
  if (!chessMoveSound(previous, next, serverNow)) return null
  const chess = next.chess!
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
  if (kind === 'chess-check' || kind.startsWith('chess-checkmate')) {
    // Rounded attacks and a soft final fade keep the warning distinct without a harsh alarm.
    const notes = kind === 'chess-check' ? [[0, 740], [.15, 622.25]]
      : kind === 'chess-checkmate-lose' ? [[0, 392], [.14, 329.63], [.28, 261.63], [.42, 196]]
      : [[0, 523.25], [.12, 659.25], [.24, 783.99], [.36, 1046.5]]
    for (let i = 0; i < samples.length; i++) {
      const t = i / rate
      for (const [start, frequency] of notes) {
        const age = t - start
        if (age < 0) continue
        samples[i] += (1 - Math.exp(-age * 350)) * Math.exp(-age * (kind === 'chess-check' ? 13 : 8))
          * (Math.sin(2 * Math.PI * frequency * age) + .18 * Math.sin(2 * Math.PI * frequency * 2 * age)) * .5
      }
      samples[i] *= Math.min(1, (duration - t) / .04)
    }
    return samples
  }
  const capture = kind === 'chess-capture'
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
    samples[i] = (impact(t, capture ? 245 : 390) + (capture ? .5 * impact(t - .045, 540) : 0))
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
