import { beforeEach, describe, expect, it } from 'vitest'
import {
  canPlace,
  receiveGame,
  resetGame,
  tableBusy,
  useGame,
} from '../../src/game/store'
import { parseGame, parseOmok, parseResult, type Omok } from '../../src/game/protocol'
import type { Envelope } from '../../src/network/protocol'

const deadline = '2099-01-01T00:00:30Z'
function omok(): Omok {
  return {
    gameCode: 'OMOK',
    status: 'PLAYING',
    boardSize: 15,
    board: Array.from({ length: 15 }, () => Array(15).fill(0)),
    blackUserId: '101',
    whiteUserId: '102',
    turnUserId: '101',
    turnDeadline: deadline,
    moveCount: 0,
    lastMove: null,
    winnerUserId: null,
    endReason: null,
    endedAt: null,
  }
}
function send(type: string, payload: Record<string, unknown>) {
  receiveGame(
    { type, payload, requestId: null } as Envelope,
    '101',
    'table-real',
  )
}
function restore() {
  send('GAME_CONNECTION_STATE', {
    status: 'RESTORED',
    gameId: 'game-real',
    version: 0,
    state: omok(),
  })
}
function snapshot(version: number, state = omok(), role = 'PLAYER') {
  return {
    gameId: 'game-real',
    version,
    role,
    publicState: state,
    privateState: {},
  }
}
beforeEach(resetGame)

describe('leaving a table clears terminal presentation', () => {
  const unseated = (type: string, payload: Record<string, unknown>) =>
    receiveGame({ type, payload, requestId: null }, '101', '')
  const finished = (): Omok => ({ ...omok(), status: 'FINISHED', turnUserId: null, turnDeadline: null,
    winnerUserId: '101', endReason: 'TURN_TIMEOUT', endedAt: '2026-10-28T00:00:00Z' })

  it.each(['TABLE_LEFT', 'TABLE_STATE'])('clears the board, results and authority after %s without an own seat', type => {
    restore()
    send('GAME_RESULT', invalidResult())
    unseated(type, { tableId: 'table-real' })
    unseated('GAME_RESULT', invalidResult())
    unseated('GAME_STATE', snapshot(10, finished()))
    expect(useGame.getState()).toMatchObject({ game: null, result: null, lastResult: null,
      permittedGameId: '', completedGameId: '', start: null })
  })

  it('does not revive a completed game delivered on reconnect without a table', () => {
    unseated('GAME_CONNECTION_STATE', { status: 'FINISHED', gameId: 'game-real', version: 9, state: finished() })
    unseated('GAME_RESULT', invalidResult())
    expect(useGame.getState()).toMatchObject({ recovery: 'LOBBY', game: null, lastResult: null, permittedGameId: '' })
    expect(tableBusy()).toBe(false)
  })

  it('keeps a genuine active recovery before seat delivery and a seated terminal recovery', () => {
    unseated('GAME_CONNECTION_STATE', { status: 'RESTORED', gameId: 'game-real', version: 0, state: omok() })
    expect(useGame.getState().game?.omok?.status).toBe('PLAYING')
    send('GAME_CONNECTION_STATE', { status: 'FINISHED', gameId: 'game-real', version: 9, state: finished() })
    expect(useGame.getState().game?.omok?.status).toBe('FINISHED')
  })

  it('clears results and authority on NOT_SEATED and on unseated LOBBY', () => {
    for (const message of [
      { type: 'GAME_START_STATE', payload: { tableId: null, revision: 1, phase: 'NOT_SEATED',
        startAttemptId: null, gameCode: null, gameSessionId: null, code: null, simulation: false } },
      { type: 'GAME_CONNECTION_STATE', payload: { status: 'LOBBY' } },
    ]) {
      restore(); send('GAME_RESULT', invalidResult())
      unseated(message.type, message.payload)
      expect(useGame.getState()).toMatchObject({ game: null, result: null, lastResult: null, permittedGameId: '' })
    }
  })
})

const invalidResult = () => ({
  version: 1, gameSessionId: 'game-real', gameCode: 'OMOK', status: 'INVALID',
  endReason: 'ENGINE_LOST', settlementStatus: 'PENDING', betAmountPerPlayer: 7,
  participants: [{ userId: '101', result: null }, { userId: '102', result: null }],
  myCoinDelta: null, endedAt: '2026-10-26T00:00:00Z',
})
describe('stored terminal result contract', () => {
  it('preserves nullable INVALID outcomes and the server fee, reason and result version', () => {
    const payload = invalidResult()
    expect(parseResult(payload, '101')).toEqual(payload)
    const settled = { ...payload, version: 2, settlementStatus: 'SETTLED', myCoinDelta: 0 }
    expect(parseResult(settled, '101')).toEqual(settled)
    expect(parseResult(settled, '101').participants[0]?.result).toBeNull()
  })
  it('requires a verdict for FINISHED and keeps INVALID forfeit verdicts without fabricating nulls', () => {
    expect(() => parseResult({ ...invalidResult(), status: 'FINISHED' }, '101')).toThrow()
    const aborted = { ...invalidResult(), endReason: 'ABORTED_NO_PLAYERS',
      participants: [{ userId: '101', result: 'FORFEIT' }, { userId: '102', result: 'FORFEIT' }] }
    expect(parseResult(aborted, '101').participants).toEqual(aborted.participants)
  })
  it.each([
    { settlementStatus: 'PENDING', myCoinDelta: 0 },
    { settlementStatus: 'SETTLED', myCoinDelta: null },
    { settlementStatus: 'SETTLED', myCoinDelta: 7 },
    { betAmountPerPlayer: -1 }, { betAmountPerPlayer: Number.MAX_SAFE_INTEGER + 1 },
    { endReason: null },
    { participants: [{ userId: '101' }, { userId: '102', result: null }] },
  ])('rejects an inconsistent stored result: %j', patch => {
    expect(() => parseResult({ ...invalidResult(), ...patch }, '101')).toThrow()
  })
  it('still rejects a result without the recipient or with duplicate participants', () => {
    expect(() => parseResult(invalidResult(), '103')).toThrow()
    expect(() => parseResult({ ...invalidResult(), participants: [{ userId: '101', result: null }, { userId: '101', result: null }] }, '101')).toThrow()
  })
})
describe('server-authoritative OMOK slice', () => {
  it('blocks input during settlement even if the final board arrives later', () => {
    restore()
    send('GAME_START_STATE', {
      tableId: 'table-real',
      revision: 3,
      phase: 'SETTLING',
      startAttemptId: 'attempt',
      gameCode: 'OMOK',
      gameSessionId: 'game-real',
      code: null,
      simulation: false,
    })
    expect(canPlace('101', 7, 7)).toBe(false)
  })
  it('drops an unsupported replacement snapshot and freezes old board input', () => {
    restore()
    send('GAME_STATE', {
      ...snapshot(1),
      publicState: { gameCode: 'UNSUPPORTED_GAME' },
    })
    expect(useGame.getState().game).toBeNull()
    expect(canPlace('101', 7, 7)).toBe(false)
  })
  it('clears a denied spectator subscription rather than retaining its board', () => {
    useGame.setState({ watchedGameId: 'game-real' })
    send('GAME_STATE', snapshot(0, omok(), 'SPECTATOR'))
    send('ERROR', { code: 'GAME_STATE_ACCESS_DENIED' })
    expect(useGame.getState().watchedGameId).toBe('')
    expect(useGame.getState().game).toBeNull()
  })
  it('copies only documented public fields, including lastMove', () => {
    const state = omok()
    state.board[7]![7] = 1
    state.moveCount = 1
    Object.assign(state, {
      lastMove: { x: 7, y: 7, stone: 'BLACK', unapproved: 'discard' },
      unapproved: 'discard',
    })
    const parsed = parseOmok(state)
    expect(parsed).not.toHaveProperty('unapproved')
    expect(parsed.lastMove).toEqual({ x: 7, y: 7, stone: 'BLACK' })
  })
  it('starts only after real grant; rehearsal/all-ready never create a game', () => {
    send('GAME_START_STATE', {
      tableId: 'table-real',
      revision: 1,
      phase: 'CONFIRMED',
      startAttemptId: 'attempt',
      gameCode: 'OMOK',
      gameSessionId: 'demo',
      code: null,
      simulation: true,
    })
    expect(useGame.getState().game).toBeNull()
    expect(useGame.getState().permittedGameId).toBe('')
    expect(canPlace('101', 7, 7)).toBe(false)
  })
  it('requires own turn, empty in-range cell and original deadline', () => {
    restore()
    expect(canPlace('101', 7, 7)).toBe(true)
    expect(canPlace('102', 7, 7)).toBe(false)
    expect(canPlace('101', -1, 7)).toBe(false)
    expect(canPlace('101', 7, 7, Date.parse(deadline))).toBe(false)
    send('GAME_CONNECTION_STATE', { status: 'PENDING' })
    expect(canPlace('101', 7, 7)).toBe(false)
    expect(tableBusy()).toBe(true)
    restore()
    expect(useGame.getState().game!.omok!.turnDeadline).toBe(deadline)
  })
  it('ack is not a stone; freezes input until matching or newer public state', () => {
    restore()
    send('GAME_ACTION_RESULT', { gameId: 'game-real', version: 1 })
    expect(useGame.getState().game!.omok!.moveCount).toBe(0)
    expect(canPlace('101', 7, 7)).toBe(false)
    const next = omok()
    next.board[7]![7] = 1
    next.moveCount = 1
    Object.assign(next, {
      turnUserId: '102',
      lastMove: { x: 7, y: 7, stone: 'BLACK' },
    })
    send('GAME_STATE', snapshot(1, next))
    send('GAME_STATE', snapshot(0))
    expect(useGame.getState().game!.omok!.moveCount).toBe(1)
    expect(canPlace('101', 7, 7)).toBe(false)
  })
  it('accepts state before ack without rolling back or blocking newer version', () => {
    restore()
    send('GAME_STATE', snapshot(3))
    send('GAME_ACTION_RESULT', { gameId: 'game-real', version: 2 })
    expect(canPlace('101', 7, 7)).toBe(true)
  })
  it('rejects private/invalid board data and ignores unrelated game identities', () => {
    restore()
    expect(() =>
      parseGame({ ...snapshot(1), privateState: { hand: ['secret'] } }),
    ).toThrow()
    expect(() => parseOmok({ ...omok(), board: [[1]] })).toThrow()
    send('GAME_STATE', { ...snapshot(100), gameId: 'other-game' })
    expect(useGame.getState().game!.version).toBe(0)
  })
  it('renders spectators from public-only watch state but never grants input', () => {
    useGame.setState({ watchedGameId: 'game-real' })
    send('GAME_STATE', snapshot(0, omok(), 'SPECTATOR'))
    expect(useGame.getState().game?.role).toBe('SPECTATOR')
    expect(canPlace('101', 7, 7)).toBe(false)
    send('GAME_WATCH_LEFT', { gameId: 'game-real' })
    expect(useGame.getState().game).toBeNull()
  })
  it('does not let late recovery replace a newer game or newer board', () => {
    restore()
    send('GAME_STATE', snapshot(4))
    restore()
    expect(useGame.getState().game!.version).toBe(4)
    send('GAME_CONNECTION_STATE', {
      status: 'RESTORED',
      gameId: 'old-game',
      version: 99,
      state: omok(),
    })
    expect(useGame.getState().game!.gameId).toBe('game-real')
  })
  it('clears all game and uncertainty state on disconnect/channel reset', () => {
    restore()
    useGame.setState({ uncertain: true, pending: true })
    resetGame()
    send('GAME_STATE', snapshot(9))
    expect(useGame.getState().game).toBeNull()
    expect(useGame.getState().uncertain).toBe(false)
  })
  it('keeps settlement versions separate, ignores stale results, and never adds wallet balance', () => {
    restore()
    const result = {
      version: 10,
      gameSessionId: 'game-real',
      gameCode: 'OMOK',
      status: 'FINISHED',
      endReason: 'NORMAL',
      settlementStatus: 'PENDING',
      betAmountPerPlayer: 1,
      participants: [
        { userId: '101', result: 'WIN' },
        { userId: '102', result: 'LOSE' },
      ],
      myCoinDelta: null,
      endedAt: '2026-10-22T00:00:00Z',
    }
    send('GAME_RESULT', result)
    expect(useGame.getState().result?.myCoinDelta).toBeNull()
    send('GAME_RESULT', {
      ...result,
      version: 11,
      settlementStatus: 'SETTLED',
      myCoinDelta: 1,
    })
    send('GAME_RESULT', result)
    expect(useGame.getState().result?.myCoinDelta).toBe(1)
    expect(useGame.getState().game!.version).toBe(0)
  })
  it('ignores other table/old start revisions and clears game only on server WAITING', () => {
    restore()
    const start = {
      tableId: 'table-real',
      revision: 3,
      phase: 'SETTLING',
      startAttemptId: 'attempt',
      gameCode: 'OMOK',
      gameSessionId: 'game-real',
      code: null,
      simulation: false,
    }
    send('GAME_START_STATE', start)
    send('GAME_START_STATE', {
      ...start,
      revision: 2,
      phase: 'WAITING',
      gameSessionId: null,
    })
    send('GAME_START_STATE', {
      ...start,
      tableId: 'different-table',
      revision: 99,
      phase: 'WAITING',
    })
    expect(useGame.getState().game).not.toBeNull()
    expect(tableBusy()).toBe(true)
    send('GAME_START_STATE', {
      ...start,
      revision: 4,
      phase: 'WAITING',
      gameSessionId: null,
    })
    expect(useGame.getState().game).toBeNull()
    expect(tableBusy()).toBe(false)
  })
})
