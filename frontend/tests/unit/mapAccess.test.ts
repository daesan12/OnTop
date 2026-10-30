import { afterEach, expect, it } from 'vitest'
import { gameBlocksParkMap } from '../../src/features/navigation/mapAccess'
import { closeParkMap, openParkMap, useParkMap } from '../../src/features/navigation/navigationState'
import { resetGame, useGame } from '../../src/game/store'
import type { Game } from '../../src/game/protocol'
import { gameplayMenusLocked } from '../../src/features/parkMenus/gameplayLock'
import { gameChatScope } from '../../src/features/chat/gameChat'

afterEach(() => { closeParkMap(); resetGame() })
for (const kind of ['omok', 'dice', 'onecard', 'bridge'] as const) it(`${kind}: blocks button/shortcut policy and imperative opening for a running game`, () => {
  const game = { gameId: 'test', version: 1, role: 'PLAYER', [kind]: { status: 'PLAYING' } } as unknown as Game
  expect(gameBlocksParkMap(game)).toBe(true)
  useGame.setState({ game }); openParkMap(); expect(useParkMap.getState().open).toBe(false)
  expect(gameBlocksParkMap({ ...game, role: 'SPECTATOR' })).toBe(true)
  expect(gameBlocksParkMap({ ...game, [kind]: { status: 'FINISHED' } } as Game)).toBe(false)
})
it('keeps start transitions blocked, and permits the map again outside a match', () => {
  for (const phase of ['STARTING', 'CONFIRMED', 'PLAYING']) expect(gameBlocksParkMap(null, phase)).toBe(true)
  for (const phase of ['WAITING', 'NOT_SEATED', 'SETTLING']) expect(gameBlocksParkMap(null, phase)).toBe(false)
  expect(gameBlocksParkMap(null)).toBe(false)
})
for (const kind of ['omok', 'dice', 'onecard', 'bridge'] as const) it(`${kind}: spectator menus and private chat remain scoped through the final screen`, () => {
  const game = { gameId: 'private-match', version: 1, role: 'SPECTATOR', [kind]: { status: 'FINISHED' } } as unknown as Game
  useGame.setState({ game, watchedGameId: game.gameId })
  expect(gameplayMenusLocked()).toBe(true)
  expect(gameChatScope()).toBe('private-match')
  openParkMap(); expect(useParkMap.getState().open).toBe(false)
  resetGame(); expect(gameChatScope()).toBe(''); expect(gameplayMenusLocked()).toBe(false)
})
