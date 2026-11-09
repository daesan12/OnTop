import { afterEach, expect, it, vi } from 'vitest'
import { parkPeriodTrack, parkTrack, resultSting, type ParkMoment } from '../../src/audio/bgmScene'
import type { Game, Result } from '../../src/game/protocol'

const park = (patch: Partial<ParkMoment> = {}): ParkMoment => ({
  game: null, bungeoppang: false, arcade: null, shopping: false, telescope: false, seated: false, hour: 12, ...patch,
})
const game = (key: 'omok' | 'dice' | 'onecard' | 'bridge' | 'alkkagi', status: 'PLAYING' | 'FINISHED' = 'PLAYING') =>
  ({ [key]: { status } }) as unknown as Game
const result = (mine: string | null, status: Result['status'] = 'FINISHED', gameCode = 'OMOK'): Result => ({
  version: 1, gameSessionId: 'g1', gameCode, status, endReason: 'FIVE_IN_ROW', settlementStatus: 'SETTLED',
  betAmountPerPlayer: 10, myCoinDelta: 0, endedAt: '2026-10-28T00:00:00Z',
  participants: [{ userId: 'me', result: mine }, { userId: 'other', result: 'WIN' }],
})

it('follows the location chip bands for the park loop', () => {
  expect([5, 6.9, 7, 15.9, 16, 18.9, 19, 23].map(parkPeriodTrack)).toEqual([
    'park-night', 'park-night', 'park-day', 'park-day', 'park-dusk', 'park-dusk', 'park-night', 'park-night',
  ])
})

it('plays the live game first, then the screen activity, then the park', () => {
  const all = { bungeoppang: true, shopping: true, telescope: true, seated: true }
  expect(parkTrack(park({ ...all, game: game('omok') }))).toBe('omok')
  expect(parkTrack(park({ game: game('dice') }))).toBe('dice')
  expect(parkTrack(park({ game: game('onecard') }))).toBe('onecard')
  expect(parkTrack(park({ game: game('bridge') }))).toBe('bridge')
  expect(parkTrack(park({ ...all, game: game('omok', 'FINISHED') }))).toBe('bungeoppang')
  expect(parkTrack(park({ shopping: true, telescope: true, seated: true }))).toBe('shop')
  expect(parkTrack(park({ telescope: true, seated: true }))).toBe('observatory')
  expect(parkTrack(park({ seated: true }))).toBe('lobby')
  expect(parkTrack(park({ hour: 17 }))).toBe('park-dusk')
})

it('chooses a sting only from the player own finished result', () => {
  expect(resultSting(result('WIN'), 'me')).toBe('victory')
  for (const lost of ['LOSE', 'ELIMINATED', 'FORFEIT']) expect(resultSting(result(lost), 'me')).toBe('defeat')
  expect(resultSting(result('DRAW'), 'me')).toBeNull()
  expect(resultSting(result(null, 'INVALID'), 'me')).toBeNull()
  expect(resultSting(result('WIN'), 'stranger')).toBeNull()
})

it('알까기는 경기 곡과 승리·패배·무승부 전용 결과 음악을 쓴다', () => {
  expect(parkTrack(park({ game: game('alkkagi'), arcade: 'arcade-room-bgm' }))).toBe('alkkagi-bgm')
  expect(resultSting(result('WIN', 'FINISHED', 'ALKKAGI'), 'me')).toBe('alkkagi-win')
  for (const lost of ['LOSE', 'FORFEIT']) expect(resultSting(result(lost, 'FINISHED', 'ALKKAGI'), 'me')).toBe('alkkagi-lose')
  expect(resultSting(result('DRAW', 'FINISHED', 'ALKKAGI'), 'me')).toBe('alkkagi-draw')
  expect(resultSting(result('WIN', 'INVALID', 'ALKKAGI'), 'me')).toBeNull()
  expect(resultSting(result('WIN', 'FINISHED', 'ALKKAGI'), 'stranger')).toBeNull()
})

it('열린 오락기 게임의 곡은 붕어빵 다음, 상점보다 먼저 고른다', () => {
  expect(parkTrack(park({ arcade: 'mole-bgm-fever', shopping: true, seated: true }))).toBe('mole-bgm-fever')
  expect(parkTrack(park({ arcade: 'arcade-room-bgm', bungeoppang: true }))).toBe('bungeoppang')
})

function storage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  return {
    values,
    getItem: vi.fn((name: string) => values.get(name) ?? null),
    setItem: vi.fn((name: string, value: string) => { values.set(name, value) }),
  }
}
async function load() {
  vi.resetModules()
  return import('../../src/audio/bgm')
}
afterEach(() => { vi.unstubAllGlobals() })

it('restores and saves the music volume and mute choice', async () => {
  const saved = storage({ 'ontop-bgm-v1': JSON.stringify({ volume: 130, muted: true }) })
  vi.stubGlobal('localStorage', saved)
  const { setBgmSettings, useBgmSettings } = await load()
  expect(useBgmSettings.getState()).toEqual({ volume: 100, muted: true })
  setBgmSettings({ volume: 33.6, muted: false })
  expect(JSON.parse(saved.values.get('ontop-bgm-v1')!)).toEqual({ volume: 34, muted: false })
})

it('falls back to defaults when storage is blocked or malformed', async () => {
  vi.stubGlobal('localStorage', storage({ 'ontop-bgm-v1': '{oops' }))
  expect((await load()).useBgmSettings.getState()).toEqual({ volume: 50, muted: false })
  vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } })
  const { setBgmSettings, useBgmSettings } = await load()
  setBgmSettings({ muted: true })
  expect(useBgmSettings.getState()).toEqual({ volume: 50, muted: true })
})
