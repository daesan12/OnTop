import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
// Server rendering reads a zustand store's initial state. Read the live state like a mounted client instead.
vi.mock('../../src/game/store', async original => {
  const actual = await original<typeof import('../../src/game/store')>()
  return { ...actual, useGame: Object.assign((selector?: (s: ReturnType<typeof actual.useGame.getState>) => unknown) =>
    selector ? selector(actual.useGame.getState()) : actual.useGame.getState(), actual.useGame) }
})
vi.mock('../../src/network/worldClient', async original => {
  const actual = await original<typeof import('../../src/network/worldClient')>()
  return { ...actual, useSession: Object.assign((selector?: (s: ReturnType<typeof actual.useSession.getState>) => unknown) =>
    selector ? selector(actual.useSession.getState()) : actual.useSession.getState(), actual.useSession) }
})
vi.mock('../../src/game/forfeit', async original => {
  const actual = await original<typeof import('../../src/game/forfeit')>()
  return { ...actual, useForfeit: Object.assign((selector?: (s: ReturnType<typeof actual.useForfeit.getState>) => unknown) =>
    selector ? selector(actual.useForfeit.getState()) : actual.useForfeit.getState(), actual.useForfeit) }
})
import { HalliForfeit } from '../../src/game/halligalli/HalliForfeit'
import { ParkRuntimeProvider } from '../../src/park/runtime/ParkRuntime'
import { receiveGame, resetGame, useGame } from '../../src/game/store'
import { resetWorld, useSession } from '../../src/network/worldClient'
import { resetForfeit, useForfeit } from '../../src/game/forfeit'
import { halliPlayer, halliState } from '../fixtures/halligalli'

const playing = (own: Record<string, unknown>) => {
  receiveGame({ type: 'GAME_CONNECTION_STATE', requestId: null, payload: { status: 'RESTORED', gameId: 'halli', version: 4,
    state: { publicState: halliState(3, { turnUserId: '102', players: [halliPlayer(0, own), halliPlayer(1), halliPlayer(2)] }),
      privateState: {} } } }, '101', 't')
  useGame.setState({ start: { tableId: 't', revision: 1, phase: 'PLAYING', startAttemptId: 'a', gameCode: 'HALLI_GALLI',
    gameSessionId: 'halli', code: null, simulation: false } as never })
}
const menu = () => renderToStaticMarkup(createElement(ParkRuntimeProvider, { onAuthEnded: () => {},
  children: createElement(HalliForfeit, { gameId: 'halli', disabled: false }) }))
beforeEach(() => {
  resetGame(); resetForfeit()
  useSession.setState({ status: 'connected', sessionId: '101', pending: false })
})
afterEach(() => { resetWorld(); resetForfeit(); resetGame() })

it('keeps 기권 in the game menu for an active player', () => {
  playing({})
  const html = menu()
  expect(html).toContain('>기권</button>')
  expect(html).not.toContain('테이블 나가기')
})
it('shows 테이블 나가기 in the same slot for a naturally eliminated player, without a confirmation sheet', () => {
  playing({ active: false, eliminated: true })
  const html = menu()
  expect(html).toMatch(/^<div class="hg-menu-danger"><button type="button" data-icon="exit">테이블 나가기<\/button><\/div>$/)
  expect(html).not.toContain('기권')
})
it('keeps the pending or uncertain forfeit re-check ahead of leaving', () => {
  for (const status of ['pending', 'uncertain'] as const) {
    playing({ active: false, eliminated: true })
    useForfeit.setState({ attempt: { userId: '101', gameId: 'halli', actionId: 'f1', status, error: '' } })
    const html = menu()
    expect(html).toContain('>기권</button>')
    expect(html).not.toContain('테이블 나가기')
  }
})
it('shows nothing to a forfeited player, whose seat the server already released', () => {
  playing({ active: false, eliminated: true, forfeited: true })
  expect(menu()).toBe('')
})
