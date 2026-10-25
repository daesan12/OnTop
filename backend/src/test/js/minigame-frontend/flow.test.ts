import { readFileSync, writeFileSync } from 'node:fs'
import { expect, it, vi } from 'vitest'
import { createBungeoppangService, type BungeoppangGame } from '../../../../../frontend/src/features/bungeoppang/service'
import { RestError } from '../../../../../frontend/src/network/restError'
import { replayGrill, type GrillLogEntry } from '../../../../../frontend/src/features/bungeoppang/rules'
import { BUNGEOPPANG } from '../../../../../frontend/src/features/bungeoppang/config'

// Only the unused singleton is isolated. Every service request below goes to real Spring/MySQL.
vi.mock('../../../../../frontend/src/park/runtime/runtime', () => ({ parkRuntime: {
  requestJSON() { throw new Error('Use the explicit real HTTP transport') },
} }))

const base = process.env.TEST_MINIGAME_API_BASE_URL ?? ''
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error('A loopback test server is required')
const receiptPath = process.env.TEST_MINIGAME_RECEIPT_FILE!
function service(token: string) {
  return createBungeoppangService(async (path, init = {}) => {
    if (!path.startsWith('/api/v1/')) throw new Error('Unexpected request path')
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${token}`)
    headers.set('Origin', 'https://dev.on-top.world')
    const response = await fetch(base + path, { ...init, headers, redirect: 'error' })
    const body = await response.json()
    if (!response.ok) throw new RestError(response.status, body.code, body.message)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://dev.on-top.world')
    return body
  })
}
const player = service(process.env.TEST_MINIGAME_ACCESS_TOKEN!)
const other = service(process.env.TEST_MINIGAME_OTHER_TOKEN!)

function cooking(heats: number[]): GrillLogEntry[] {
  const entries: GrillLogEntry[] = []
  for (let i = 0; i < 7; i++) {
    const slot = i % 6
    const pour = i < 6 ? i * 350 : 22000
    const fill = pour + 3000
    const duration = Math.ceil(600000 / heats[i]!)
    entries.push({ slot, action: 'POUR', t: pour }, { slot, action: 'FILL', t: fill },
      { slot, action: 'TURN', t: fill + duration }, { slot, action: 'TURN', t: fill + 2 * duration })
  }
  entries.sort((a, b) => a.t - b.t)
  let last = -50
  for (const entry of entries) { entry.t = Math.max(entry.t, last + 50); last = entry.t }
  return entries
}
function submission(game: BungeoppangGame) {
  const log = cooking(game.heats)
  const result = replayGrill(log, game.heats, BUNGEOPPANG)
  return { input: { gameId: game.gameId, log, seenTips: ['START', 'GOLD'], clientScore: result.score }, result }
}

if (process.env.TEST_MINIGAME_PHASE === 'start') {
  it('loads actual status and wallet, then reuses the same start receipt', async () => {
    expect(await player.getStatus()).toMatchObject({ todayEarned: 0, isFirstGame: true, rulesVersion: 'v2' })
    expect(await player.balance()).toBe(100)
    const game = await player.startGame('frontend-start')
    expect(await player.startGame('frontend-start')).toEqual(game)
    writeFileSync(receiptPath, JSON.stringify(game))
  })
  it('rejects early completion without consuming the active session', async () => {
    const game = JSON.parse(readFileSync(receiptPath, 'utf8')) as BungeoppangGame
    await expect(player.submitResult(submission(game).input)).rejects.toMatchObject({ code: 'TOO_EARLY', retryable: true })
    expect((await player.startGame('frontend-start')).gameId).toBe(game.gameId)
    expect(await player.balance()).toBe(100)
  })
} else if (process.env.TEST_MINIGAME_PHASE === 'finish') {
  it('matches the real frontend replay and pays only once after repeated completion', async () => {
    const game = JSON.parse(readFileSync(receiptPath, 'utf8')) as BungeoppangGame
    const { input, result } = submission(game)
    const completed = await player.submitResult(input)
    expect(result.made).toBe(7)
    expect(completed).toMatchObject({ ...Object.fromEntries(Object.entries(result).filter(([k]) => k !== 'coins')),
      coinsCalculated: result.coins, coinsGranted: result.coins })
    expect(await player.submitResult(input)).toEqual(completed)
    expect(await player.balance()).toBe(100 + completed.coinsGranted)
    expect(await player.getStatus()).toMatchObject({ todayEarned: completed.coinsGranted, isFirstGame: false })
  })
  it('rejects another authenticated member accessing this session', async () => {
    const game = JSON.parse(readFileSync(receiptPath, 'utf8')) as BungeoppangGame
    await expect(other.submitResult(submission(game).input)).rejects.toMatchObject({ code: 'MINIGAME_NOT_FOUND' })
    expect(await other.balance()).toBe(50)
  })
} else if (process.env.TEST_MINIGAME_PHASE === 'abandon') {
  it('abandons idempotently and rejects an old start receipt without paying', async () => {
    const before = await player.balance()
    const game = await player.startGame('frontend-abandon')
    await player.abandon(game.gameId)
    await player.abandon(game.gameId)
    await expect(player.startGame('frontend-abandon')).rejects.toMatchObject({ code: 'GAME_NOT_ACTIVE' })
    expect(await player.balance()).toBe(before)
  })
} else { throw new Error('Unknown integration phase') }
