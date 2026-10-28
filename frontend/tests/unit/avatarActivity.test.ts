import { expect, it } from 'vitest'
import { ownGameActivity } from '../../src/world/avatarActivity'
import { bridgeState } from '../fixtures/bridge'
import type { BridgeGame, Phase, Recovery } from '../../src/game/protocol'

function playing() {
  return { game: { gameId: 'match', version: 1, role: 'PLAYER', bridge: bridgeState(), secret: null } as BridgeGame,
    permittedGameId: 'match', watchedGameId: '', recovery: 'RESTORED' as Recovery, start: null }
}

it('labels only an approved participant in a live game', () => {
  expect(ownGameActivity('101', playing())).toBe(true)
  expect(ownGameActivity('102', playing())).toBe(true)
  expect(ownGameActivity('another-user', playing())).toBe(false)
  expect(ownGameActivity('101', { ...playing(), game: null })).toBe(false)
  expect(ownGameActivity('101', { ...playing(), permittedGameId: 'older-match' })).toBe(false)
})
it('never calls a spectator a participant', () => {
  const state = playing()
  expect(ownGameActivity('101', { ...state, watchedGameId: 'match' })).toBe(false)
  expect(ownGameActivity('101', { ...state, game: { ...state.game, role: 'SPECTATOR' } })).toBe(false)
})
it.each<Recovery>(['UNKNOWN', 'PENDING', 'LOBBY', 'FINISHED', 'ELIMINATED', 'EXPIRED', 'UNAVAILABLE'])('clears local game activity on %s', recovery => {
  expect(ownGameActivity('101', { ...playing(), recovery })).toBe(false)
})
it.each<Phase>(['NOT_SEATED', 'WAITING', 'STARTING', 'CONFIRMED', 'SETTLING'])('does not label %s as playing', phase => {
  expect(ownGameActivity('101', { ...playing(), start: { phase, tableId: 'table', revision: 1, startAttemptId: 'attempt',
    gameCode: 'LIAR_BRIDGE', gameSessionId: 'match', code: null, simulation: false } })).toBe(false)
})
it('clears on a finished match or approved forfeit while other participants can keep playing', () => {
  const state = playing()
  expect(ownGameActivity('101', { ...state, game: { ...state.game, bridge: { ...state.game.bridge, status: 'FINISHED' } } })).toBe(false)
  state.game.bridge.players[0]!.forfeited = true
  expect(ownGameActivity('101', state)).toBe(false)
  expect(ownGameActivity('102', state)).toBe(true)
})
