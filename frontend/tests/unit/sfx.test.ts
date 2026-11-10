import { afterEach, expect, it, vi } from 'vitest'
import { alkkagiCues, emoteSfx, gameSfx, moverSfx, STRIDE, type MoverSample, type MoverState } from '../../src/audio/sfxEvents'
import type { Game } from '../../src/game/protocol'

const omok = (turn: string, status = 'PLAYING', gameId = 'g1', role = 'PLAYER') =>
  ({ gameId, version: 1, role, omok: { status, turnUserId: turn } }) as unknown as Game
const dice = (rollId: number) =>
  ({ gameId: 'd1', version: rollId, role: 'PLAYER', dice: { status: 'PLAYING', turnUserId: 'other', rollId } }) as unknown as Game

it('승인된 오목 착수는 한 번 소리 내고 마지막 승리 착수도 재생한다', () => {
  const before = omok('me')
  before.omok!.moveCount = 0
  before.omok!.board = Array.from({ length: 15 }, () => Array(15).fill(0))
  const next = structuredClone(before)
  next.version = 2
  next.omok!.moveCount = 1
  next.omok!.lastMove = { x: 7, y: 7, stone: 'BLACK' }
  next.omok!.board[7]![7] = 1
  next.omok!.turnUserId = 'other'
  expect(gameSfx(before, next, 'other')).toEqual(['omok-place'])
  expect(gameSfx(before, next, 'other')).toContain('omok-place')
  expect(gameSfx(next, next, 'other')).not.toContain('omok-place')
  expect(gameSfx(null, next, 'other')).not.toContain('omok-place')
  next.omok!.status = 'FINISHED'
  expect(gameSfx(before, next, 'other')).toEqual(['omok-place'])
})
const onecard = (counts: number[], declared = -1) => ({
  gameId: 'c1', version: 1, role: 'PLAYER', hand: null,
  onecard: { status: 'PLAYING', turnUserId: 'other', players: counts.map((cardCount, i) =>
    ({ userId: `p${i}`, cardCount, oneCardStatus: i === declared ? 'declared' : 'none' })) },
}) as unknown as Game

it('starts a game once and cues only the turns that become mine', () => {
  expect(gameSfx(null, omok('me'), 'me')).toEqual(['game-start', 'game-turn'])
  expect(gameSfx(null, omok('other'), 'me')).toEqual(['game-start'])
  expect(gameSfx(omok('other'), omok('me'), 'me')).toEqual(['game-turn'])
  expect(gameSfx(omok('me'), omok('me'), 'me')).toEqual([])
  expect(gameSfx(omok('me'), omok('other', 'FINISHED'), 'me')).toEqual([])
  expect(gameSfx(null, omok('me', 'PLAYING', 'g1', 'SPECTATOR'), 'me')).toEqual([])
})

// 할리갈리 공개 상태의 lastEvent만 본다. 시각은 서버 시간(NOW) 기준이다.
const NOW = Date.parse('2026-11-09T01:00:00.000Z')
const at = (ago: number) => new Date(NOW - ago).toISOString()
type Ev = { type: string; userId: string; at: string }
const ev = (type: string, userId = 'other', ago = 100): Ev => ({ type, userId, at: at(ago) })
const halli = (version: number, lastEvent: Ev | null, o: { status?: string; turn?: string | null; gameId?: string; role?: string } = {}) =>
  ({ gameId: o.gameId ?? 'h1', version, role: o.role ?? 'PLAYER', halli: { status: o.status ?? 'PLAYING',
    turnUserId: o.turn === undefined ? 'other' : o.turn, lastEvent: lastEvent && { cardCount: 1, issuedCards: 0, ...lastEvent } } }) as unknown as Game

it('서버가 인정한 정상 종·벌칙 종은 참가자와 관전자 모두 종소리를 한 번 재생한다', () => {
  const flip = ev('FLIP', 'other', 500)
  for (const type of ['RING_SUCCESS', 'RING_PENALTY']) {
    expect(gameSfx(halli(4, flip), halli(5, ev(type)), 'me', NOW)).toEqual(['halli-bell'])
    expect(gameSfx(halli(4, flip, { role: 'SPECTATOR' }), halli(5, ev(type), { role: 'SPECTATOR' }), 'me', NOW)).toEqual(['halli-bell'])
  }
})

it('카드 뒤집기·거절·중복 종과 버전만 오른 상태에서는 종소리를 재생하지 않는다', () => {
  const before = halli(4, ev('RING_SUCCESS', 'other', 700))
  expect(gameSfx(before, halli(5, ev('FLIP')), 'me', NOW)).toEqual([])
  expect(gameSfx(before, halli(5, ev('AUTO_FLIP')), 'me', NOW)).toEqual([])
  // 거절된 종은 상태가 바뀌지 않는다. 같은 버전의 재전달도 같은 이벤트다.
  const rung = halli(5, ev('RING_PENALTY'))
  expect(gameSfx(rung, rung, 'me', NOW)).toEqual([])
  expect(gameSfx(rung, halli(5, ev('RING_PENALTY')), 'me', NOW)).toEqual([])
  // 기권 등으로 버전만 오르고 lastEvent가 그대로면 같은 종이다.
  expect(gameSfx(rung, halli(6, ev('RING_PENALTY')), 'me', NOW)).toEqual([])
})

it('이전 상태가 없거나 다른 경기이거나 오래된 종은 재생하지 않는다', () => {
  // 첫 수신·재접속(이전 상태 없음)과 관전 시작
  expect(gameSfx(null, halli(5, ev('RING_SUCCESS')), 'me', NOW)).toEqual(['game-start'])
  expect(gameSfx(null, halli(5, ev('RING_SUCCESS'), { role: 'SPECTATOR' }), 'me', NOW)).toEqual([])
  // 다른 gameId의 상태를 이전 이벤트로 비교하지 않는다.
  expect(gameSfx(halli(9, ev('FLIP'), { gameId: 'old' }), halli(5, ev('RING_SUCCESS')), 'me', NOW)).not.toContain('halli-bell')
  // 카드 이동 연출과 같은 900ms 기준
  expect(gameSfx(halli(4, null), halli(5, ev('RING_SUCCESS', 'other', 899)), 'me', NOW)).toEqual(['halli-bell'])
  expect(gameSfx(halli(4, null), halli(5, ev('RING_SUCCESS', 'other', 900)), 'me', NOW)).toEqual([])
  expect(gameSfx(halli(4, null), halli(5, ev('RING_SUCCESS', 'other', -900)), 'me', NOW)).toEqual([])
})

it('경기를 끝낸 마지막 종도 재생한다', () => {
  expect(gameSfx(halli(4, ev('FLIP')), halli(5, ev('RING_SUCCESS', 'me'), { status: 'FINISHED', turn: null }), 'me', NOW))
    .toEqual(['halli-bell'])
  expect(gameSfx(halli(4, ev('FLIP')), halli(5, ev('RING_PENALTY', 'other'), { status: 'FINISHED', turn: null }), 'me', NOW))
    .toEqual(['halli-bell'])
})

it('종이 울린 갱신에서는 차례 알림을 겹치지 않고, 종이 없으면 차례 알림은 그대로다', () => {
  const flip = ev('FLIP', 'other', 500)
  expect(gameSfx(halli(4, flip), halli(5, ev('RING_SUCCESS', 'me'), { turn: 'me' }), 'me', NOW)).toEqual(['halli-bell'])
  expect(gameSfx(halli(4, flip), halli(5, ev('FLIP', 'other'), { turn: 'me' }), 'me', NOW)).toEqual(['game-turn'])
  // 다른 게임의 차례 알림은 그대로다.
  expect(gameSfx(omok('other'), omok('me'), 'me', NOW)).toEqual(['game-turn'])
})

it('rolls dice and draws or declares cards from state changes', () => {
  expect(gameSfx(dice(1), dice(2), 'me')).toEqual(['dice-roll'])
  expect(gameSfx(dice(2), dice(2), 'me')).toEqual([])
  expect(gameSfx(onecard([5, 5]), onecard([6, 5]), 'me')).toEqual(['card-draw'])
  expect(gameSfx(onecard([2, 5]), onecard([1, 5], 0), 'me')).toEqual(['card-one'])
  expect(gameSfx(onecard([1, 5], 0), onecard([1, 5], 0), 'me')).toEqual([])
})

it('maps emotes to sounds and waves by character', () => {
  expect(emoteSfx('EMOTE_APPLAUSE_REQUEST', 'man')).toBe('emote-clap')
  expect(emoteSfx('EMOTE_WAVE', 'girl')).toBe('emote-wave-female')
  expect(emoteSfx('EMOTE_WAVE', undefined)).toBe('emote-wave-male')
  expect(emoteSfx('UNKNOWN', 'man')).toBeNull()
})

const sample = (patch: Partial<MoverSample>): MoverSample => ({
  x: 0, y: 0.8, z: 0, at: 0, moving: false, running: false, swimming: false, free: true, paved: true, ...patch,
})
function run(samples: Partial<MoverSample>[]) {
  let state: MoverState | undefined
  const cues: string[] = []
  for (const s of samples) {
    const [next, out] = moverSfx(state, sample(s))
    state = next
    cues.push(...out)
  }
  return cues
}

it('steps once per stride on the surface underfoot', () => {
  const walk = Array.from({ length: 11 }, (_, i) => ({ x: i * 0.625, at: i * 100, moving: true, paved: i < 6 }))
  expect(run(walk)).toEqual(['move-step-stone', 'move-step-grass', 'move-step-grass'].slice(0, Math.floor(6.25 / STRIDE.walk)))
})

it('hears a jump and its landing, and a splash into the lake', () => {
  // Rest for a while, jump at 6.2 m/s, fall back under gravity and stop.
  const ys = [0.8, 1.3, 1.6, 1.7, 1.6, 1.3, 0.85, 0.8, 0.8]
  expect(run([{ at: 0 }, ...ys.map((y, i) => ({ y, at: 2000 + i * 100 }))])).toEqual(['move-jump', 'move-land'])
  expect(run([{ at: 0 }, { at: 100, swimming: true }, { at: 200, swimming: true }])).toEqual(['move-splash'])
})

it('ignores stairs, seats and teleports', () => {
  const stairs = Array.from({ length: 6 }, (_, i) => ({ y: 0.8 + i * 0.22, at: i * 100 }))
  expect(run(stairs)).toEqual([])
  expect(run([{ at: 0 }, { y: 1.4, at: 100, free: false }, { y: 0.8, at: 200 }])).toEqual([])
  expect(run([{ at: 0 }, { x: 40, at: 100, moving: true }])).toEqual([])
})

it('keeps placed sounds near their source and loops steady on the range edge', async () => {
  const { loopAudible, rangeOf } = await import('../../src/audio/sfx')
  expect(rangeOf('amb-fountain')).toEqual([8, 25])
  expect(rangeOf('amb-pigeon-takeoff')).toEqual([5, 25])
  expect(rangeOf('emote-clap')).toEqual([6, 30])
  // Starts only inside the range, keeps running a little past it, then stops.
  expect(loopAudible(24, 25, false)).toBe(true)
  expect(loopAudible(26, 25, false)).toBe(false)
  expect(loopAudible(27, 25, true)).toBe(true)
  expect(loopAudible(28.5, 25, true)).toBe(false)
})

async function load() {
  vi.resetModules()
  return import('../../src/audio/bgm')
}
afterEach(() => { vi.unstubAllGlobals() })

it('keeps the effects level apart from the music level', async () => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v) } })
  const { setSfxSettings, useBgmSettings, useSfxSettings } = await load()
  setSfxSettings({ volume: 80 })
  expect(useSfxSettings.getState()).toEqual({ volume: 80, muted: false })
  expect(useBgmSettings.getState()).toEqual({ volume: 50, muted: false })
  expect(JSON.parse(values.get('ontop-sfx-v1')!)).toEqual({ volume: 80, muted: false })
  expect(values.has('ontop-bgm-v1')).toBe(false)
})

const alkkagi = (turn: string, cards: string[] | null, gameId = 'a1') =>
  ({ gameId, version: 1, role: 'PLAYER', alkkagi: { status: 'PLAYING', turnUserId: turn },
    alkkagiHand: cards && { cards: cards.map(id => ({ id, type: 'WALL' })) } }) as unknown as Game

it('알까기는 내 차례 알림 대신 차례 전환음을 쓰고, 새로 받은 비책 카드에만 카드음을 낸다', () => {
  expect(gameSfx(null, alkkagi('me', ['c1']), 'me')).toEqual(['game-start'])
  expect(gameSfx(alkkagi('other', ['c1']), alkkagi('me', ['c1']), 'me')).toEqual([])
  expect(gameSfx(alkkagi('me', ['c1']), alkkagi('me', ['c1', 'c2']), 'me')).toEqual(['alkkagi-item'])
  // 사용해서 줄어든 손패, 다른 경기의 손패, 관전자(손패 없음)는 획득이 아니다.
  expect(gameSfx(alkkagi('me', ['c1', 'c2']), alkkagi('me', ['c2']), 'me')).toEqual([])
  expect(gameSfx(alkkagi('me', ['c1']), alkkagi('me', ['c1', 'c2'], 'a2'), 'me')).not.toContain('alkkagi-item')
  expect(gameSfx(alkkagi('me', null), alkkagi('me', null), 'me')).toEqual([])
})

it('알까기 피드백 이벤트를 효과음으로 바꾸고 같은 소리는 한 번만 가장 큰 세기로 낸다', () => {
  const ev = (type: string, strength?: 'weak' | 'medium' | 'strong') => ({ id: type, type, at: 0, strength })
  expect(alkkagiCues([ev('SHOT'), ev('TURN_CHANGED'), ev('ITEM_WALL'), ev('TURN_WARNING'), ev('GAME_FINISHED')]))
    .toEqual([['alkkagi-shot', 1], ['alkkagi-turn-change', 1], ['alkkagi-item', 1]])
  expect(alkkagiCues([ev('PIECE_HIT', 'weak'), ev('WALL_HIT', 'medium'), ev('PIECE_FALL'), ev('PIECE_FALL')]))
    .toEqual([['alkkagi-collision', 0.75], ['alkkagi-fall', 1]])
  expect(alkkagiCues([])).toEqual([])
})
