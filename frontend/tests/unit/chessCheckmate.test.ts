import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Result } from '../../src/game/protocol'
import type { TableState } from '../../src/network/protocol'
import { gatheringModel } from '../../src/features/tableLobby/gatheringModel'
import { chessCheckmateWinner, observeSpectatorCheckmate } from '../../src/game/chess/checkmate'
import { resetGame, useGame } from '../../src/game/store'
import { parseGame } from '../../src/game/protocol'
import { parseChess } from '../../src/game/chess/protocol'
import { ChessSpectatorFinishWait, waitingForChessFinish } from '../../src/game/chess/spectatorFinish'

const table: TableState = { tableId: 't', version: 1, capacity: 2, minimumPlayers: 2, allReady: false,
  gameCode: 'CHESS', targetScore: null, betAmountPerPlayer: 0, selectorUserId: '101',
  seats: ['101', '202'].map((userId, i) => ({ userId, seatNumber: i + 1, ready: false })) }
const result: Result = { gameSessionId: 'g', version: 1, gameCode: 'CHESS', status: 'FINISHED', endReason: 'CHECKMATE',
  betAmountPerPlayer: 0, endedAt: '2026-11-21T00:00:00Z', settlementStatus: 'PENDING', myCoinDelta: null,
  participants: [{ userId: '101', result: 'LOSE' }, { userId: '202', result: 'WIN' }] }
const model = (r: Result | null, ownId = '101') => gatheringModel({ table, ownId, game: null, result: r, start: null, nickname: id => `참가자 ${id}` })
afterEach(() => { resetGame(); vi.useRealTimers() })

describe('체크메이트 승리 연출의 서버 결과 연결', () => {
  it('엔진 스냅샷이 없어도 두 참가자에게 서버의 같은 승자를 표시한다', () => {
    for (const ownId of ['101', '202']) {
      const m = model(result, ownId), winner = chessCheckmateWinner(m)
      expect(winner?.playerId).toBe('202')
      expect(winner?.nickname).toBe('참가자 202')
      expect(m.settlement).toBe('정산 대기 중')
      expect(m.canReturn).toBe(false)
    }
  })
  it('정산 완료 갱신은 승자를 바꾸거나 다음 판 권한을 만들지 않는다', () => {
    const m = model({ ...result, version: 2, settlementStatus: 'SETTLED', myCoinDelta: 0 })
    expect(chessCheckmateWinner(m)?.playerId).toBe('202')
    expect(m.canReturn).toBe(false)
  })
  it('진행 중·기권·무승부·무효·다른 게임에는 체크메이트 연출을 열지 않는다', () => {
    expect(chessCheckmateWinner(model(null))).toBeNull()
    for (const r of [{ ...result, endReason: 'EXPLICIT_LEAVE' }, { ...result, endReason: 'STALEMATE' },
      { ...result, status: 'INVALID' as const }, { ...result, gameCode: 'OMOK' }]) expect(chessCheckmateWinner(model(r))).toBeNull()
  })
  it('승자 누락이나 복수 승자가 온 경우 임의로 승자를 정하지 않는다', () => {
    for (const outcome of ['DRAW', 'WIN']) expect(chessCheckmateWinner(model({ ...result,
      participants: result.participants.map(p => ({ ...p, result: outcome })) }))).toBeNull()
  })
  it('관전 종료 스냅샷과 자동 해제가 연이어 와도 공개 승자를 한 번만 보관한다', () => {
    const show = vi.fn(), stop = observeSpectatorCheckmate(show)
    try {
      const chess = parseChess({ gameCode: 'CHESS', status: 'FINISHED', board: '....K.......................................................k...',
        fen: '8/8/8/8/8/8/8/4K2k b - - 0 1', whiteUserId: '101', blackUserId: '202', turnUserId: null, turnDeadline: null,
        turnStartedAt: result.endedAt, remainingMs: [500000, 500000], inCheck: true, canClaimDraw: false, legalMoves: [], moves: [], moveCount: 0,
        winnerUserId: '101', endReason: 'CHECKMATE', endedAt: result.endedAt, drawOfferedBy: null, drawOffersUsed: [] })
      const game = parseGame({ gameId: 'watched', version: 1, role: 'SPECTATOR', publicState: chess, privateState: {} }, '505')
      useGame.setState({ game, watchedGameId: 'watched' })
      useGame.setState({ game: { ...game, version: 2 } })
      useGame.setState({ game: null, watchedGameId: '' })
      expect(show).toHaveBeenCalledTimes(1)
      expect(show).toHaveBeenCalledWith({ gameId: 'watched', winnerId: '101', side: '백' })
    } finally { stop() }
  })
  it('반복된 공원 갱신에도 마지막 상태 대기는 1.2초를 넘기지 않는다', () => {
    vi.useFakeTimers()
    const wait = new ChessSpectatorFinishWait(), expired = vi.fn()
    expect(wait.hold('g', expired)).toBe(true)
    vi.advanceTimersByTime(600); expect(wait.hold('g', expired)).toBe(true)
    vi.advanceTimersByTime(600); expect(expired).toHaveBeenCalledTimes(1)
    expect(wait.hold('g', expired)).toBe(false)
    vi.advanceTimersByTime(5000); expect(expired).toHaveBeenCalledTimes(1)
    expect(wait.hold('next', expired)).toBe(true)
    wait.reset(); vi.advanceTimersByTime(1200); expect(expired).toHaveBeenCalledTimes(1)
  })
  it('이미 보던 체스의 종료 메타데이터만 기다리고 새 경기·다른 게임·참가자는 기다리지 않는다', () => {
    const game = { gameId: 'g', version: 1, role: 'SPECTATOR' as const, chess: { status: 'PLAYING' as const } } as Parameters<typeof waitingForChessFinish>[0]
    expect(waitingForChessFinish(game, 'g', 'CHESS', null)).toBe(true)
    expect(waitingForChessFinish(game, 'other', 'CHESS', null)).toBe(false)
    expect(waitingForChessFinish(game, 'g', 'OMOK', null)).toBe(false)
    expect(waitingForChessFinish(game, 'g', 'CHESS', 'new-game')).toBe(false)
    expect(waitingForChessFinish(game && { ...game, role: 'PLAYER' }, 'g', 'CHESS', null)).toBe(false)
  })
})
