import type { Game } from '../protocol'
import { chessMotion } from './motion'

export type ChessSound = 'chess-move' | 'chess-capture'
export const CHESS_SOUND_DURATION = { 'chess-move': .15, 'chess-capture': .23 } as const

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

/** Original damped wooden percussion; deterministic, with no downloads or extra AudioContext. */
export function chessSoundSamples(kind: ChessSound, rate: number) {
  const duration = CHESS_SOUND_DURATION[kind], samples = new Float32Array(Math.ceil(duration * rate))
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
