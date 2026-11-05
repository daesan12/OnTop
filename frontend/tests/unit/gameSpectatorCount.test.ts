import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, expect, it, vi } from 'vitest'
import type { Game } from '../../src/game/protocol'

const state = vi.hoisted(() => ({ game: null as Game | null,
  gameWatches: {} as Record<string, { gameId: string; tableId: string }> }))
vi.mock('../../src/game/store', () => ({ useGame: (select: (s: typeof state) => unknown) => select(state) }))
vi.mock('../../src/network/worldClient', () => ({ useSession: (select: (s: typeof state) => unknown) => select(state) }))
import { GameSpectatorCount } from '../../src/game/GameSpectatorCount'

beforeEach(() => { state.game = null; state.gameWatches = {} })
const render = () => renderToStaticMarkup(createElement(GameSpectatorCount))
it('현재 진행 경기의 승인 명부만 세고 다른 경기 관전자는 제외한다', () => {
  state.game = { gameId: 'g', omok: { status: 'PLAYING' } } as Game
  state.gameWatches = { '101': { gameId: 'g', tableId: 't' }, '202': { gameId: 'other', tableId: 'u' } }
  expect(render()).toContain('현재 관전자 1명')
  delete state.gameWatches['101']; expect(render()).toContain('현재 관전자 0명')
})
it('승인 명부 방송이 아직 남아 있어도 종료 경기 배지는 즉시 숨긴다', () => {
  state.game = { gameId: 'g', omok: { status: 'FINISHED' } } as Game
  state.gameWatches = { '101': { gameId: 'g', tableId: 't' } }
  expect(render()).toBe('')
})
it('알까기에서도 진행 중에 표시하고 경기 화면을 떠나면 숨긴다', () => {
  state.game = { gameId: 'g', alkkagi: { status: 'PLAYING' } } as Game
  expect(render()).toContain('현재 관전자 0명')
  state.game = null; expect(render()).toBe('')
})
