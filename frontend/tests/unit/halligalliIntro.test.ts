import { afterEach, describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Game, StartState } from '../../src/game/protocol'
import { parseHalliGalli } from '../../src/game/halligalli/protocol'
import { INTRO_MS, freshStart, introLeft, useHalliIntro, watchIntro, type IntroWatch } from '../../src/game/halligalli/intro'
import { IntroCard } from '../../src/game/halligalli/HalliIntro'
import { resetGame, useGame } from '../../src/game/store'
import { halliPlayer, halliState } from '../fixtures/halligalli'

const NOW = Date.parse('2026-11-04T10:00:00Z')
// The server's first state: version 0, nothing flipped, the first 5 s turn started at `startedAgo` ms.
const first = (count = 2, startedAgo = 200, overrides: Record<string, unknown> = {}, now = NOW) => parseHalliGalli(halliState(count, {
  version: 0, flipSeq: 0, bellWindowId: null, lastEvent: null, flipDeadline: new Date(now - startedAgo + 5000).toISOString(),
  players: Array.from({ length: count }, (_, i) => halliPlayer(i, { faceUpCount: 0, topCard: null, drawCount: 14, cardCount: 14 })), ...overrides }))
const game = (halli = first(), role: 'PLAYER' | 'SPECTATOR' = 'PLAYER', gameId = 'g1') =>
  ({ gameId, role, version: halli.version, halli }) as unknown as Game
const start = (phase: StartState['phase'], extra: Partial<StartState> = {}): StartState => ({ tableId: 't1', revision: 1, phase,
  startAttemptId: 'a1', gameCode: 'HALLI_GALLI', gameSessionId: phase === 'PLAYING' ? 'g1' : null, code: null, simulation: false, ...extra })
const idle: IntroWatch = { armed: false, played: [] }
/** Feeds store snapshots through the watcher like the store subscription does. */
const run = (steps: [StartState | null, Game | null][], now = NOW) => {
  let w = idle; const plays: string[] = []
  for (const [s, g] of steps) { const r = watchIntro(w, s, g, now); w = r.watch; if (r.play) plays.push(r.play) }
  return plays
}

describe('start rule card', () => {
  afterEach(() => { resetGame(); useHalliIntro.setState({ gameId: '', at: 0 }) })
  it('knows the first server state of a match only while its first turn is fresh', () => {
    expect(freshStart(first(), NOW)).toBe(true)
    expect(freshStart(first(2, 1900), NOW)).toBe(true)
    expect(freshStart(first(2, 2500), NOW)).toBe(false)
    expect(freshStart(first(2, 200, { version: 1 }), NOW)).toBe(false)
    expect(freshStart(first(2, 200, { flipSeq: 1, bellWindowId: 1 }), NOW)).toBe(false)
  })
  it('plays once for 2, 3 and 4 players when the table goes from waiting through the start check into the match', () => {
    for (const count of [2, 3, 4]) {
      expect(run([[start('WAITING'), null], [start('STARTING'), null], [start('CONFIRMED'), null], [start('PLAYING'), null],
        [start('PLAYING'), game(first(count))], [start('PLAYING'), game(first(count))]])).toEqual(['g1'])
    }
  })
  it('does not play when the tab arrives in a running match: refresh, reconnect, late state or a spectator', () => {
    // Refresh or reconnect: the start state comes back as PLAYING with no waiting phase seen in this tab.
    expect(run([[start('PLAYING'), game()]])).toEqual([])
    expect(run([[null, null], [start('PLAYING'), game()]])).toEqual([])
    // Waiting was seen, but the first state reached this tab after the first flip or too late.
    expect(run([[start('WAITING'), null], [start('PLAYING'), game(first(2, 200, { version: 1, flipSeq: 1, bellWindowId: 1 }))]])).toEqual([])
    expect(run([[start('WAITING'), null], [start('PLAYING'), game(first(2, 3000))]])).toEqual([])
    // Spectators never get a seat's start state; a watch of a fresh match does not play either.
    expect(run([[null, game(first(), 'SPECTATOR')]])).toEqual([])
    expect(run([[start('WAITING'), null], [start('PLAYING'), game(first(), 'SPECTATOR')]])).toEqual([])
    // A practice (simulation) start does not arm it; leaving the seat disarms it.
    expect(run([[start('STARTING', { simulation: true }), null], [start('PLAYING'), game()]])).toEqual([])
    expect(run([[start('WAITING'), null], [start('NOT_SEATED'), null], [start('PLAYING'), game()]])).toEqual([])
  })
  it('plays again only for the next match, after the table waits again', () => {
    expect(run([[start('WAITING'), null], [start('PLAYING'), game()], [start('SETTLING'), game()],
      [start('PLAYING'), game()], [start('WAITING'), null], [start('PLAYING', { gameSessionId: 'g2' }), game(first(), 'PLAYER', 'g2')]]))
      .toEqual(['g1', 'g2'])
  })
  it('is wired to the game store: a waiting table, then the first state, sets the card for that game', () => {
    useGame.setState({ start: start('WAITING') })
    expect(useHalliIntro.getState().gameId).toBe('')
    useGame.setState({ start: start('PLAYING'), game: game(first(2, 0, {}, Date.now())) })
    expect(useHalliIntro.getState().gameId).toBe('g1')
  })
  it('renders the rule text as a status, for this game only and for about 2 s', () => {
    const html = renderToStaticMarkup(createElement(IntroCard))
    expect(html).toContain('class="hg-intro" role="status"')
    expect(html.replace(/<[^>]+>/g, '')).toBe('과일 합이 5개가 되면 종을 치세요!')
    expect(html).not.toContain('style=')
    const intro = { gameId: 'g1', at: 1000 }
    expect(introLeft(intro, 'g1', 1000)).toBe(INTRO_MS)
    expect(introLeft(intro, 'g1', 2500)).toBe(500)
    expect(introLeft(intro, 'g1', 1000 + INTRO_MS)).toBeLessThanOrEqual(0)
    expect(introLeft(intro, 'g2', 1000)).toBe(0)
    expect(introLeft({ gameId: '', at: 0 }, '', 0)).toBe(0)
  })

})
