import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('../../src/park/runtime/ParkRuntime', () => ({ useParkRuntime: () => ({}) }))
// The forfeit dialog portals into document.body, which SSR cannot provide; it is unrelated to this HUD.
vi.mock('../../src/game/onecard/OneCardForfeitDialog', () => ({ OneCardForfeitDialog: () => null }))
// SSR normally selects Zustand's initial snapshot; these tests deliberately render a received game.
vi.mock('../../src/game/store', async original => {
  const m = await original<typeof import('../../src/game/store')>()
  return { ...m, useGame: Object.assign(<T>(select: (s: ReturnType<typeof m.useGame.getState>) => T = s => s as T) => select(m.useGame.getState()), m.useGame) }
})
vi.mock('../../src/network/worldClient', async original => {
  const m = await original<typeof import('../../src/network/worldClient')>()
  return { ...m, useSession: Object.assign(<T>(select: (s: ReturnType<typeof m.useSession.getState>) => T = s => s as T) => select(m.useSession.getState()), m.useSession) }
})
import { OneCardPanel } from '../../src/game/onecard/OneCardPanel'
import { OneCardOpponentHud, fitOpponentHud, handCovers, opponentRows } from '../../src/game/onecard/OneCardOpponentHud'
import type { Card, OneCard } from '../../src/game/onecard/protocol'
import { useGame, resetGame } from '../../src/game/store'
import { useSession } from '../../src/network/worldClient'

const card = (rank = '4'): Card => ({ id: `hearts-${rank}`, suit: 'hearts', rank })
const state = (count = 4, patch: Partial<OneCard> = {}): OneCard => ({ gameCode: 'ONE_CARD', status: 'PLAYING',
  players: [7, 5, 4, 3].slice(0, count).map((cardCount, i) => ({ userId: String(101 + i), cardCount, active: true, oneCardUntil: null, oneCardStatus: 'none' as const })),
  turnUserId: '102', turnDeadline: new Date(Date.now() + 30000).toISOString(), turnTimeLimitMs: 30000, direction: 1, stage: 'PLAYING', extraAction: false,
  topCard: card('5'), activeSuit: 'hearts', drawCount: 30, attackTotal: 0, lastAttack: null, turnCount: 5,
  winnerUserIds: [], endReason: null, endedAt: null, ...patch })
const profiles = { '101': { nickname: '도윤' }, '102': { nickname: '하늘별빛바다구름' }, '103': { nickname: '준', gameMaster: true }, '104': { nickname: 'Minji123' } }
const hud = (o: OneCard, ownId = '101', p: Record<string, { nickname: string; gameMaster?: boolean; nicknameKnown?: boolean }> = profiles) =>
  renderToStaticMarkup(createElement(OneCardOpponentHud, { state: o, ownId, profiles: p, handCount: 7 }))

beforeEach(() => {
  resetGame()
  vi.stubGlobal('document', { hidden: false, querySelector: () => null })
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) })
  vi.stubGlobal('innerWidth', 1280); vi.stubGlobal('innerHeight', 720)
  useSession.setState({ sessionId: '101', status: 'connected', profiles: profiles as never, tableId: 'table-1', roomId: 'channel-1', pending: false, error: '', gameWatches: {} })
})
afterEach(() => { resetGame(); vi.unstubAllGlobals() })

it('excludes the viewer and keeps the server seat order for 2 and 4 players', () => {
  expect(opponentRows(state(2), '101', profiles).map(r => [r.name, r.count])).toEqual([['하늘별빛바다구름', '5장']])
  expect(opponentRows(state(4), '101', profiles).map(r => r.userId)).toEqual(['102', '103', '104'])
  // The viewer in the middle of the order does not reorder the remaining seats.
  expect(opponentRows(state(4), '103', profiles).map(r => r.userId)).toEqual(['101', '102', '104'])
  expect(opponentRows(state(4, { direction: -1 }), '101', profiles).map(r => r.userId)).toEqual(['102', '103', '104'])
})
it('marks only the active current-turn opponent and follows turn changes', () => {
  expect(opponentRows(state(4), '101', profiles).map(r => r.current)).toEqual([true, false, false])
  expect(opponentRows(state(4, { turnUserId: '104' }), '101', profiles).map(r => r.current)).toEqual([false, false, true])
  expect(opponentRows(state(4, { turnUserId: '101' }), '101', profiles).every(r => !r.current)).toBe(true)
  const html = hud(state(4, { turnUserId: '103' }))
  expect(html.match(/data-current="true"/g)).toHaveLength(1)
  expect(html).toMatch(/data-current="true"><span class="onecard-opponent-name">GM 준<\/span>/)
})
it('shows a forfeit instead of a number and reuses the GM display and seat fallback rules', () => {
  const forfeited = state(4, { players: state(4).players.map(p => p.userId === '103' ? { ...p, active: false, cardCount: 0 } : p) })
  const rows = opponentRows(forfeited, '101', { '102': { nickname: '하늘' }, '103': { nickname: '준', gameMaster: true }, '104': { nickname: '산책자 000104', nicknameKnown: false } })
  expect(rows.map(r => [r.name, r.count, r.forfeited])).toEqual([['하늘', '5장', false], ['GM 준', '기권', true], ['참가자 4', '3장', false]])
  expect(hud(forfeited)).not.toContain('0장')
  expect(hud(forfeited)).toContain('data-forfeited="true"')
})
it('never invents a count, hides when finished and stays out of the accessibility tree', () => {
  const broken = state(2, { players: [state(2).players[0]!, { ...state(2).players[1]!, cardCount: Number.NaN }] })
  expect(opponentRows(broken, '101', profiles)[0]!.count).toBe('')
  expect(hud(broken)).not.toContain('장</b>')
  expect(hud(state(2, { status: 'FINISHED', stage: 'FINISHED', turnUserId: null, turnDeadline: null }))).toBe('')
  expect(hud(state(2), '505').match(/<li/g)).toHaveLength(2)
  expect(hud(state(4))).toContain('aria-hidden="true"')
  expect(hud(state(4))).not.toContain('원카드 참가자')
})
it('steps aside only when a resting hand card actually reaches under the clock', () => {
  const hud = { left: 20, right: 228, top: 201, bottom: 300 }
  // 1280×720 measurements: a 7-card fan starts at x≈233, a 17-card fan at y≈307.
  expect(handCovers(hud, [{ left: 233, right: 380, top: 243, bottom: 440 }])).toBe(false)
  expect(handCovers(hud, [{ left: 111, right: 200, top: 307, bottom: 436 }])).toBe(false)
  expect(handCovers(hud, [{ left: 130, right: 252, top: 247, bottom: 418 }])).toBe(true)
  expect(handCovers(hud, [])).toBe(false)
  // 4-player measurements: full rows end at y≈300, compact rows at y≈258.
  const size = { full: { left: 20, right: 228, top: 201, bottom: 300 }, compact: { left: 20, right: 228, top: 201, bottom: 258 }, hidden: null }
  const fit = (top: number) => fitOpponentHud(f => size[f], [{ left: 160, right: 300, top, bottom: top + 180 }])
  expect(fit(310)).toBe('full')     // 17 cards at 1280×720
  expect(fit(261)).toBe('compact')  // 9 cards at 1280×720
  expect(fit(249)).toBe('hidden')   // 7 cards at 1100×720
  // Hidden by the media query (no box): nothing to fit.
  expect(fitOpponentHud(() => ({ left: 0, right: 0, top: 0, bottom: 0 }), [{ left: 0, right: 9, top: 0, bottom: 9 }])).toBe('full')
})
it('renders under the clock for players only and keeps the hidden roster, public card and hand intact', () => {
  const o = state(4)
  useGame.setState({ game: { gameId: 'cards', version: 3, role: 'PLAYER', onecard: o, hand: { userId: '101', hand: [card('4')], playableCardIds: [], canDraw: false } },
    recovery: 'RESTORED', pending: false, uncertain: false, awaitingVersion: -1 })
  const player = renderToStaticMarkup(createElement(OneCardPanel))
  expect(player).toContain('class="onecard-opponent-hud"')
  expect(player).toContain('aria-label="원카드 참가자"')
  expect(player).toContain('class="onecard-public"')
  expect(player).toContain('onecard-actions-panel')
  expect(player.indexOf('onecard-opponent-hud')).toBeLessThan(player.indexOf('onecard-actions-panel'))
  expect(player).not.toContain('<span class="onecard-opponent-name">나</span>')

  useSession.setState({ sessionId: '505' })
  useGame.setState({ game: { gameId: 'cards', version: 3, role: 'SPECTATOR', onecard: o, hand: null }, watchedGameId: 'cards' })
  expect(renderToStaticMarkup(createElement(OneCardPanel))).not.toContain('onecard-opponent-hud')

  useSession.setState({ sessionId: '101' })
  useGame.setState({ game: { gameId: 'cards', version: 4, role: 'PLAYER', hand: { userId: '101', hand: [], playableCardIds: [], canDraw: false },
    onecard: state(2, { status: 'FINISHED', stage: 'FINISHED', turnUserId: null, turnDeadline: null, winnerUserIds: ['101'], endReason: 'EMPTY_HAND', endedAt: new Date().toISOString() }) } })
  expect(renderToStaticMarkup(createElement(OneCardPanel))).not.toContain('onecard-opponent-hud')

  // Reconnect/recovery clears the public game; the panel falls back to its recovery message without the HUD.
  resetGame()
  const recovering = renderToStaticMarkup(createElement(OneCardPanel))
  expect(recovering).toContain('공개 판과 본인 손패를 확인하고 있습니다.')
  expect(recovering).not.toContain('onecard-opponent-hud')
})
