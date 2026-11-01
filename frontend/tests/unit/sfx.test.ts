import { afterEach, expect, it, vi } from 'vitest'
import { emoteSfx, gameSfx, moverSfx, STRIDE, type MoverSample, type MoverState } from '../../src/audio/sfxEvents'
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
