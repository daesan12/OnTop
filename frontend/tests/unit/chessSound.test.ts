import { describe, expect, it } from 'vitest'
import type { ChessGame } from '../../src/game/protocol'
import { gameSfx } from '../../src/audio/sfxEvents'
import { CHESS_SOUND_DURATION, chessMoveSound, chessPositionSound, chessSoundGame, chessSoundBuffer, chessSoundSamples } from '../../src/game/chess/sound'

const NOW = Date.parse('2026-11-21T00:00:00Z')
function game(pieces: Record<string, string>, moves: string[], version: number, patch: Partial<ChessGame['chess']> = {}, role: ChessGame['role'] = 'PLAYER'): ChessGame {
  const board = Array<string>(64).fill('.')
  for (const [square, piece] of Object.entries(pieces)) board[square.charCodeAt(0) - 97 + (Number(square[1]) - 1) * 8] = piece
  return { gameId: 'g', version, role, chess: { gameCode: 'CHESS', status: 'PLAYING', board: board.join(''), moves,
    whiteUserId: '101', blackUserId: '202', turnUserId: '202', turnStartedAt: new Date(NOW).toISOString(), endedAt: null, ...patch } as ChessGame['chess'] }
}
describe('체스 승인 이동 효과음', () => {
  it('정상 대국의 종료 알림 선행은 허용하고 복구·불확실·연결 해제는 연속성을 끊는다', () => {
    const state = { game: game({ e2: 'P' }, [], 0), recovery: 'RESTORED' as const, uncertain: false }
    const live = chessSoundGame('', state, true)
    expect(live).toBe('g')
    expect(chessSoundGame(live, { ...state, recovery: 'FINISHED' }, true)).toBe('g')
    expect(chessSoundGame(live, { ...state, recovery: 'PENDING', start: { phase: 'SETTLING' } }, true)).toBe('g')
    expect(chessSoundGame('', { ...state, recovery: 'PENDING', start: { phase: 'SETTLING' } }, true)).toBe('')
    expect(chessSoundGame('', { ...state, recovery: 'FINISHED' }, true)).toBe('')
    const pending = chessSoundGame(live, { ...state, recovery: 'PENDING' }, true)
    expect(chessSoundGame(pending, { ...state, recovery: 'FINISHED' }, true)).toBe('')
    expect(chessSoundGame(live, { ...state, uncertain: true }, true)).toBe('')
    expect(chessSoundGame(live, state, false)).toBe('')
    expect(chessSoundGame(live, { ...state, game: null }, true)).toBe('')
  })
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
  it('서버가 체크로 확정한 새 수에만 착수음과 체크음을 한 번씩 낸다', () => {
    const a = game({ d1: 'Q' }, [], 0), b = game({ h5: 'Q' }, ['d1h5'], 1, { inCheck: true })
    expect(gameSfx(a, b, '202', NOW)).toEqual(['chess-move', 'chess-check'])
    expect(chessPositionSound(b, { ...b, version: 2 }, NOW)).toBeNull()
    expect(chessPositionSound(null, b, NOW)).toBeNull()
    expect(chessPositionSound(a, b, NOW + 1200)).toBeNull()
    expect(chessPositionSound(a, { ...b, role: 'SPECTATOR' }, NOW)).toBeNull()
    expect(chessPositionSound(a, { ...b, chess: { ...b.chess, inCheck: false } }, NOW)).toBeNull()
    const reply = game({ h5: 'Q' }, ['d1h5'], 2, { inCheck: false })
    const again = game({ f7: 'Q' }, ['d1h5', 'h5f7'], 3, { inCheck: true })
    expect(chessPositionSound(reply, again, NOW)).toBe('chess-check')
  })
  it('체크메이트에는 체크음 대신 마무리음을 내고 무승부·기권·잘못된 승자에는 내지 않는다', () => {
    const a = game({ h5: 'Q', f7: 'p' }, [], 0), b = game({ f7: 'Q' }, ['h5f7'], 1,
      { status: 'FINISHED', endedAt: new Date(NOW).toISOString(), endReason: 'CHECKMATE', winnerUserId: '101', inCheck: true })
    expect(gameSfx(a, b, '101', NOW)).toEqual(['chess-capture', 'chess-checkmate-win'])
    expect(gameSfx(a, b, '202', NOW)).toEqual(['chess-capture', 'chess-checkmate-lose'])
    expect(gameSfx({ ...a, role: 'SPECTATOR' }, { ...b, role: 'SPECTATOR' }, '505', NOW)).toEqual(['chess-capture', 'chess-checkmate'])
    expect(chessPositionSound(b, { ...b, version: 2 }, NOW)).toBeNull()
    for (const endReason of ['STALEMATE', 'EXPLICIT_LEAVE', 'TIMEOUT'])
      expect(chessPositionSound(a, { ...b, chess: { ...b.chess, endReason } }, NOW)).toBeNull()
    for (const winnerUserId of [null, 'outsider'])
      expect(chessPositionSound(a, { ...b, chess: { ...b.chess, winnerUserId } }, NOW)).toBeNull()
  })
  it('백흑 색상 대신 서버 승자와 실제 참가 계정으로 승패음을 고른다', () => {
    const a = game({ d8: 'q' }, [], 0), b = game({ h4: 'q' }, ['d8h4'], 1,
      { status: 'FINISHED', endedAt: new Date(NOW).toISOString(), endReason: 'CHECKMATE', winnerUserId: '202', inCheck: true })
    expect(gameSfx(a, b, '202', NOW)).toEqual(['chess-move', 'chess-checkmate-win'])
    expect(gameSfx(a, b, '101', NOW)).toEqual(['chess-move', 'chess-checkmate-lose'])
    expect(gameSfx(a, b, 'outsider', NOW)).toEqual(['chess-move'])
    expect(chessPositionSound(a, b, NOW)).toBeNull()
    expect(chessPositionSound(a, b, NOW + 1200, '202')).toBeNull()
    expect(chessPositionSound(b, { ...b, version: 2 }, NOW, '202')).toBeNull()
    expect(chessPositionSound(null, b, NOW, '202')).toBeNull()
    expect(gameSfx({ ...a, role: 'SPECTATOR' }, { ...b, role: 'SPECTATOR' }, '202', NOW)).toEqual(['chess-move', 'chess-checkmate'])
  })
  it('이동 없는 모든 서버 무승부는 참가자·관전자에게 같은 마무리음 한 번을 낸다', () => {
    const a = game({ e2: 'P' }, ['g1f3'], 3)
    for (const endReason of ['AGREED_DRAW', 'STALEMATE', 'INSUFFICIENT_MATERIAL', 'THREEFOLD_REPETITION',
      'FIVEFOLD_REPETITION', 'FIFTY_MOVES', 'SEVENTY_FIVE_MOVES', 'TIMEOUT_DRAW']) {
      const b = { ...a, version: 4, chess: { ...a.chess, status: 'FINISHED' as const, endReason, winnerUserId: null, endedAt: new Date(NOW).toISOString() } }
      expect(gameSfx(a, b, '101', NOW)).toEqual(['chess-draw'])
      expect(gameSfx(a, b, '202', NOW)).toEqual(['chess-draw'])
      expect(gameSfx({ ...a, role: 'SPECTATOR' }, { ...b, role: 'SPECTATOR' }, '505', NOW)).toEqual(['chess-draw'])
      expect(chessPositionSound(null, b, NOW, '101')).toBeNull()
      expect(chessPositionSound(b, { ...b, version: 5 }, NOW, '101')).toBeNull()
      expect(chessPositionSound(a, b, NOW + 1200, '101')).toBeNull()
      expect(chessPositionSound(a, b, NOW, 'outsider')).toBeNull()
      expect(chessPositionSound(a, { ...b, chess: { ...b.chess, winnerUserId: '101' } }, NOW, '101')).toBeNull()
    }
  })
  it('자동 무승부 착수음은 유지하고 제안·거절·기권·건너뛴 종료에는 무승부음을 내지 않는다', () => {
    const a = game({ e2: 'P' }, [], 0), b = game({ e4: 'P' }, ['e2e4'], 1,
      { status: 'FINISHED', endReason: 'STALEMATE', winnerUserId: null, endedAt: new Date(NOW).toISOString() })
    expect(gameSfx(a, b, '101', NOW)).toEqual(['chess-move', 'chess-draw'])
    expect(chessPositionSound(a, { ...b, chess: { ...b.chess, moves: ['e2e3', 'e3e4'] } }, NOW, '101')).toBeNull()
    for (const endReason of ['EXPLICIT_LEAVE', 'TIMEOUT', 'UNKNOWN'])
      expect(chessPositionSound(a, { ...b, chess: { ...b.chess, endReason } }, NOW, '101')).toBeNull()
    for (const drawOfferedBy of ['101', null])
      expect(gameSfx(a, { ...a, version: 1, chess: { ...a.chess, drawOfferedBy } }, '101', NOW)).toEqual([])
  })
  it('원본 파형은 짧고 유효하며 시작/끝의 클릭 잡음과 피크를 제한한다', () => {
    for (const rate of [22050, 44100, 48000]) for (const kind of Object.keys(CHESS_SOUND_DURATION) as (keyof typeof CHESS_SOUND_DURATION)[]) {
      const data = chessSoundSamples(kind, rate)
      expect(data.length).toBe(Math.ceil(CHESS_SOUND_DURATION[kind] * rate))
      expect([...data].every(Number.isFinite)).toBe(true)
      expect(Math.max(...data.map(Math.abs))).toBeLessThan(.91)
      expect(data[0]).toBe(0); expect(Math.abs(data.at(-1)!)).toBeLessThan(.002)
      expect(data.some(n => Math.abs(n) > .3)).toBe(true)
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
