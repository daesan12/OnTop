import { beforeEach, expect, it } from 'vitest'
import { canStartForfeit, canRetryForfeit, definiteForfeitRejection, forfeitBlocksInput, interruptForfeit, parseForfeitResult, resetForfeit, useForfeit, type ForfeitGameState } from '../../src/game/forfeit'
import { canPlace, receiveGame, resetGame, useGame } from '../../src/game/store'
import type { Game, Omok } from '../../src/game/protocol'
import { bridgeState } from '../fixtures/bridge'

const omok: Omok = { gameCode: 'OMOK', status: 'PLAYING', boardSize: 15, board: Array.from({ length: 15 }, () => Array(15).fill(0)),
  blackUserId: '101', whiteUserId: '102', turnUserId: '102', turnDeadline: '2000-01-01T00:00:00Z', moveCount: 0,
  lastMove: null, winnerUserId: null, endReason: null, endedAt: null }
const game: Game = { gameId: 'g', version: 4, role: 'PLAYER', omok }
const state = (): ForfeitGameState => ({ game, permittedGameId: 'g', watchedGameId: '', recovery: 'RESTORED', pending: false, uncertain: false, awaitingVersion: -1 })
const attempt = { userId: '101', gameId: 'g', actionId: 'stable-action', status: 'pending' as const, error: '' }
beforeEach(() => { resetGame(); resetForfeit() })
it('allows an active participant to forfeit off-turn without a client clock decision', () => {
  expect(canStartForfeit('101', state())).toBe(true)
  expect(canStartForfeit('foreign', state())).toBe(false)
})
it.each([
  { recovery: 'PENDING' }, { recovery: 'FINISHED' }, { recovery: 'ELIMINATED' }, { pending: true }, { uncertain: true },
  { awaitingVersion: 5 }, { permittedGameId: 'other' }, { watchedGameId: 'g' }, { game: null }, { start: { phase: 'SETTLING' } },
])('blocks an invalid participant context: %j', patch => expect(canStartForfeit('101', { ...state(), ...patch } as ForfeitGameState)).toBe(false))
it('blocks spectators and already eliminated/pending bridge participants', () => {
  expect(canStartForfeit('101', { ...state(), game: { ...game, role: 'SPECTATOR' } })).toBe(false)
  const bridge = bridgeState(3)
  bridge.players[0]!.pendingForfeit = true
  expect(canStartForfeit('101', { ...state(), game: { gameId: 'g', role: 'PLAYER', version: 4, bridge, secret: null } })).toBe(false)
  bridge.players[0]!.pendingForfeit = false; bridge.players[0]!.forfeited = true
  expect(canStartForfeit('101', { ...state(), game: { gameId: 'g', role: 'PLAYER', version: 4, bridge, secret: null } })).toBe(false)
})
it('keeps the same identity across reconnect interruption and requires an explicit scoped retry', () => {
  useForfeit.setState({ attempt }); interruptForfeit()
  expect(useForfeit.getState().attempt).toMatchObject({ actionId: 'stable-action', status: 'uncertain' })
  for (const recovery of ['RESTORED', 'FINISHED', 'ELIMINATED'] as const) expect(canRetryForfeit('101', { ...state(), recovery })).toBe(true)
  expect(canRetryForfeit('102', state())).toBe(false)
  expect(canRetryForfeit('101', { ...state(), recovery: 'PENDING' })).toBe(false)
  expect(canRetryForfeit('101', { ...state(), permittedGameId: 'next' })).toBe(false)
  resetForfeit(); expect(canRetryForfeit('101', state())).toBe(false)
})
it.each(['pending', 'uncertain', 'approved'] as const)('cannot resume gameplay from a fresh snapshot after a %s forfeit', status => {
  useGame.setState({ game: { ...game, omok: { ...omok, turnUserId: '101', turnDeadline: '2099-01-01T00:00:00Z' } }, permittedGameId: 'g', recovery: 'RESTORED' })
  useForfeit.setState({ attempt: { ...attempt, status } })
  const snapshot = useGame.getState().game!
  receiveGame({ type: 'GAME_STATE', requestId: null, payload: { gameId: 'g', role: 'PLAYER', version: 4, publicState: snapshot.omok, privateState: {} } }, '101', 't')
  expect(canPlace('101', 7, 7)).toBe(false)
  expect(forfeitBlocksInput('next')).toBe(false)
})
it('a definite rejection unlocks the current game without fabricating a result', () => {
  useForfeit.setState({ attempt: { ...attempt, status: 'rejected' } })
  expect(canStartForfeit('101', state())).toBe(true); expect(useGame.getState().result).toBeNull()
})
it.each([false, true])('validates both fresh and duplicate receipts (%s)', duplicate =>
  expect(parseForfeitResult({ gameId: 'g', actionId: 'stable-action', version: 5, duplicate }, attempt)).toEqual({ version: 5, duplicate }))
it.each([null, {}, { gameId: 'other', actionId: 'stable-action', version: 5, duplicate: false },
  { gameId: 'g', actionId: 'other', version: 5, duplicate: false }, { gameId: 'g', actionId: 'stable-action', version: -1, duplicate: false },
  { gameId: 'g', actionId: 'stable-action', version: 5, duplicate: 'false' }])('rejects malformed or mismatched receipts: %j', value => expect(() => parseForfeitResult(value, attempt)).toThrow())
it('does not treat unknown/unavailable server failures as proof of rejection', () => {
  expect(definiteForfeitRejection('GAME_FORFEIT_NOT_CONFIGURED')).toBe(true)
  expect(definiteForfeitRejection('GAME_FORFEIT_UNAVAILABLE')).toBe(false)
  expect(definiteForfeitRejection('GAME_FORFEIT_INVALID')).toBe(false)
})
