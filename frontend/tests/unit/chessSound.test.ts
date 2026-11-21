import { describe, expect, it } from 'vitest'
import type { ChessGame } from '../../src/game/protocol'
import { gameSfx } from '../../src/audio/sfxEvents'
import { CHESS_SOUND_DURATION, chessMoveSound, chessSoundBuffer, chessSoundSamples } from '../../src/game/chess/sound'

const NOW = Date.parse('2026-11-21T00:00:00Z')
function game(pieces: Record<string, string>, moves: string[], version: number, patch: Partial<ChessGame['chess']> = {}, role: ChessGame['role'] = 'PLAYER'): ChessGame {
  const board = Array<string>(64).fill('.')
  for (const [square, piece] of Object.entries(pieces)) board[square.charCodeAt(0) - 97 + (Number(square[1]) - 1) * 8] = piece
  return { gameId: 'g', version, role, chess: { gameCode: 'CHESS', status: 'PLAYING', board: board.join(''), moves,
    whiteUserId: '101', blackUserId: '202', turnUserId: '202', turnStartedAt: new Date(NOW).toISOString(), endedAt: null, ...patch } as ChessGame['chess'] }
}
describe('체스 승인 이동 효과음', () => {
  it('이동과 잡기를 구분하고 차례 전자음을 겹치지 않는다', () => {
    const a = game({ e2: 'P', d5: 'p' }, [], 0, { turnUserId: '101' }), b = game({ e4: 'P', d5: 'p' }, ['e2e4'], 1)
    expect(gameSfx(a, b, '202', NOW)).toEqual(['chess-move'])
    const capture = game({ d5: 'P' }, ['e2e4', 'e4d5'], 2)
    expect(gameSfx(b, capture, '202', NOW)).toEqual(['chess-capture'])
  })
  it('중복·낡은 버전·최초 수신·이전 경기·건너뛴 수는 재생하지 않는다', () => {
    const a = game({ e2: 'P' }, [], 0), b = game({ e4: 'P' }, ['e2e4'], 1)
    expect(chessMoveSound(null, b, NOW)).toBeNull()
    expect(chessMoveSound(b, b, NOW)).toBeNull()
    expect(chessMoveSound(a, { ...b, version: 0 }, NOW)).toBeNull()
    expect(chessMoveSound(a, { ...b, gameId: 'new' }, NOW)).toBeNull()
    expect(chessMoveSound(a, game({ e4: 'P' }, ['e2e3', 'e3e4'], 2), NOW)).toBeNull()
    expect(chessMoveSound(a, b, NOW + 1200)).toBeNull()
    expect(chessMoveSound(a, b, NOW - 1201)).toBeNull()
  })
  it('앙파상은 잡기, 캐슬링은 한 번의 이동 소리로 낸다', () => {
    expect(chessMoveSound(game({ e5: 'P', d5: 'p' }, [], 0), game({ d6: 'P' }, ['e5d6'], 1), NOW)).toBe('chess-capture')
    expect(gameSfx(game({ e1: 'K', h1: 'R' }, [], 0), game({ g1: 'K', f1: 'R' }, ['e1g1'], 1), '202', NOW)).toEqual(['chess-move'])
  })
  it('종료를 만든 마지막 잡기도 재생하고 비이동 종료에는 재생하지 않는다', () => {
    const a = game({ h5: 'Q', f7: 'p' }, [], 0), b = game({ f7: 'Q' }, ['h5f7'], 1, { status: 'FINISHED', endedAt: new Date(NOW).toISOString(), endReason: 'CHECKMATE' })
    expect(gameSfx(a, b, '101', NOW)).toEqual(['chess-capture'])
    expect(chessMoveSound(a, { ...a, version: 1, chess: { ...a.chess, status: 'FINISHED', endReason: 'EXPLICIT_LEAVE' } }, NOW)).toBeNull()
  })
  it('관전자도 같은 공개 수의 소리를 듣고 관전 역할 전환은 재생하지 않는다', () => {
    const a = game({ e2: 'P' }, [], 0, {}, 'SPECTATOR'), b = game({ e4: 'P' }, ['e2e4'], 1, {}, 'SPECTATOR')
    expect(gameSfx(a, b, '505', NOW)).toEqual(['chess-move'])
    expect(chessMoveSound({ ...a, role: 'PLAYER' }, b, NOW)).toBeNull()
  })
  it('원본 파형은 짧고 유효하며 시작/끝의 클릭 잡음과 피크를 제한한다', () => {
    for (const rate of [22050, 44100, 48000]) for (const kind of ['chess-move', 'chess-capture'] as const) {
      const data = chessSoundSamples(kind, rate)
      expect(data.length).toBe(Math.ceil(CHESS_SOUND_DURATION[kind] * rate))
      expect([...data].every(Number.isFinite)).toBe(true)
      expect(Math.max(...data.map(Math.abs))).toBeLessThan(.91)
      expect(data[0]).toBe(0); expect(Math.abs(data.at(-1)!)).toBeLessThan(.002)
      expect(data.some(n => Math.abs(n) > .5)).toBe(true)
    }
  })
  it('같은 AudioContext와 종류는 버퍼를 재사용하고 새 컨텍스트는 분리한다', () => {
    const context = () => ({ sampleRate: 48000, createBuffer: (_channels: number, size: number) => {
      const data = new Float32Array(size); return { getChannelData: () => data }
    } }) as unknown as AudioContext
    const first = context(), second = context(), buffer = chessSoundBuffer(first, 'chess-move')
    expect(chessSoundBuffer(first, 'chess-move')).toBe(buffer)
    expect(chessSoundBuffer(first, 'chess-capture')).not.toBe(buffer)
    expect(chessSoundBuffer(second, 'chess-move')).not.toBe(buffer)
  })
})
