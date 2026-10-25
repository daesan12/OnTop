import { expect, type Page } from '@playwright/test'
import { fixture } from './contractFixture'
import { replayGrill, type GrillLogEntry } from '../../src/features/bungeoppang/rules'
import { BUNGEOPPANG as R } from '../../src/features/bungeoppang/config'

/** HTTP contract fixture only. Never imported by product code or used as a production fallback. */
export async function bungeoppangFixture(page: Page, players = 4) {
  const world = await fixture(page, { players, manualMovement: true, position: { x: -36, y: .8, z: 16.3, yaw: Math.PI } })
  let earned = 0, nextId = 900, statusFailure = false, loseStart = false, loseComplete = false, rejectAbandon = false
  let walletFailure: 'WALLET_NOT_READY' | 'WALLET_UNAVAILABLE' | null = null, walletReads = 0
  const requests: { method: string; path: string; key: string | undefined; body: unknown }[] = []
  const games = new Map<string, { id: string; startedAt: number; status: string; result?: Record<string, unknown> }>()
  const keys = new Map<string, string>()
  await page.route('**/api/v1/wallets/me', route => {
    walletReads++
    return walletFailure ? route.fulfill({ status: walletFailure === 'WALLET_NOT_READY' ? 409 : 503, json: { code: walletFailure, message: walletFailure } })
      : route.fulfill({ json: { balance: 100 + earned, reservedBalance: 0, availableBalance: 100 + earned } })
  })
  await page.route('**/api/v1/minigames/sessions**', async route => {
    const req = route.request(), url = new URL(req.url()), body: unknown = req.postDataJSON()
    expect(req.headers().authorization).toBe('Bearer fixture-access')
    const key = req.headers()['idempotency-key']
    requests.push({ method: req.method(), path: url.pathname, key, body })
    if (url.pathname === '/api/v1/minigames/sessions') {
      if (req.method() === 'GET') return statusFailure
        ? route.fulfill({ status: 503, json: { code: 'MINIGAME_NOT_CONFIGURED', message: '설정 미완료' } })
        : route.fulfill({ json: { todayEarned: earned, dailyCap: 100, isFirstGame: earned === 0, seenTips: [], rulesVersion: 'v2' } })
      expect(body).toEqual({ minigameType: 'BUNGEOPPANG' })
      expect(key).toMatch(/^[A-Za-z0-9_-]{1,64}$/)
      let id = keys.get(key!)
      if (!id) {
        for (const g of games.values()) if (g.status === 'PLAYING') g.status = 'ABANDONED'
        id = String(++nextId); keys.set(key!, id)
        games.set(id, { id, status: 'PLAYING', startedAt: Date.now() })
      }
      if (loseStart) { loseStart = false; return route.abort('failed') }
      return route.fulfill({ status: 201, json: { minigameSessionId: id, minigameType: 'BUNGEOPPANG', status: 'PLAYING',
        startedAt: new Date(games.get(id)!.startedAt).toISOString(), rulesVersion: 'v2', heats: Array(64).fill(100), isFirstGame: earned === 0 } })
    }
    const match = url.pathname.match(/\/sessions\/(\d+)(?:\/(complete|abandon))?$/), game = games.get(match?.[1] ?? '')
    if (!game) return route.fulfill({ status: 404, json: { code: 'MINIGAME_NOT_FOUND' } })
    if (!match?.[2]) return route.fulfill({ json: { minigameSessionId: game.id, status: game.status, score: null, rewardAmount: 0,
      startedAt: new Date(game.startedAt).toISOString(), endedAt: null } })
    if (match[2] === 'abandon') {
      if (rejectAbandon) { rejectAbandon = false; return route.fulfill({ status: 503, json: { code: 'MINIGAME_UNAVAILABLE' } }) }
      game.status = 'ABANDONED'
      return route.fulfill({ json: { minigameSessionId: game.id, status: 'ABANDONED', rewardAmount: 0 } })
    }
    const input = body as { log: GrillLogEntry[]; clientScore: number; seenTips: string[] }
    expect(Object.keys(input).sort()).toEqual(['clientScore', 'log', 'seenTips'])
    if (!game.result) {
      expect(Date.now() - game.startedAt).toBeGreaterThanOrEqual(60000)
      const replay = replayGrill(input.log, Array(64).fill(100), R), reward = Math.min(100 - earned, replay.coins)
      earned += reward
      game.result = { minigameSessionId: game.id, status: 'COMPLETED', verifiedCompletedCount: replay.made,
        rewardAmount: reward, ...replay, coinsCalculated: replay.coins, coinsGranted: reward, todayEarned: earned, dailyCap: 100, capReached: earned === 100 }
      game.status = 'COMPLETED'
    }
    if (loseComplete) { loseComplete = false; return route.abort('failed') }
    return route.fulfill({ json: game.result })
  })
  return { ...world, requests, games, keys,
    failWallet: (value: typeof walletFailure) => { walletFailure = value }, get walletReads() { return walletReads },
    failStatus: (value: boolean) => { statusFailure = value },
    loseNextStart: () => { loseStart = true }, loseNextComplete: () => { loseComplete = true },
    rejectNextAbandon: () => { rejectAbandon = true },
  }
}
