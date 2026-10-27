import { createHash } from 'node:crypto'
import { expect, type Page } from '@playwright/test'
import { fixture } from './contractFixture'
import { applyAction, createGrill, supplyOrder, type BreadFilling, type BungeoppangRules, type GrillLogEntry,
  type GrillState } from '../../src/features/bungeoppang/rulesV4'

type WireAction = { seq: number; action: GrillLogEntry['action']; t: number; slot?: number; filling?: BreadFilling;
  breadId?: number; orderId?: string; deliveryKey?: string }
type WireOrder = { orderId: string; orderIndex: number; items: Record<BreadFilling, number> }
type Game = { id: string; status: string; issuedAt: number; timing: Record<string, string>; orders: WireOrder[];
  accepted: WireAction[]; revision: number; checkpoint: unknown; start: unknown; result?: Record<string, unknown>;
  deliveries: Map<string, unknown> }

const items = (bean = 0, custard = 0, pizza = 0, chocolate = 0) => ({ bean, custard, pizza, chocolate })
const wireRules = { slots: 6, durationMs: 60000, countdownMs: 3500, sideMs: 8000, rushSideMs: 6000,
  rushFromMs: 40000, heatMin: 85, heatMax: 115, heatListLength: 512, trayCapacity: 4, maxOrderItems: 4,
  specialOrderChancePercent: 20, specialBonusPercent: 50, firstOrder: items(2), okFrom: 50, goldenFrom: 70,
  goldenTo: 90, burntFrom: 100, okPoint: 2, goldenPoint: 5, pointsPerCoin: 15, dailyCoinCap: 100,
  minGapMs: 50, sameSlotGapMs: 300, maxLogEntries: 1200 }
const { countdownMs: _countdown, specialOrderChancePercent, ...shared } = wireRules
const rules: BungeoppangRules = { ...shared, orderListLength: 0, specialOrderChance: specialOrderChancePercent / 100 }
const configVersion = 'v4-fixture'
const heats: number[] = Array(wireRules.heatListLength).fill(100)
const keyPattern = /^[A-Za-z0-9_-]{1,64}$/

/** Same issuer-owned replay the server performs: wire log + issued orders -> authoritative grill state. */
function replay(game: Game, log: WireAction[]): GrillState {
  let state = createGrill(heats, game.orders[0]!, rules)
  for (const action of log) {
    if (!state.order && game.orders[state.orderIndex]) state = supplyOrder(state, state.orderIndex, game.orders[state.orderIndex]!, rules)
    const entry: GrillLogEntry = action.action === 'DELIVER'
      ? { slot: -1, action: 'DELIVER', t: action.t, order: game.orders.find(o => o.orderId === action.orderId)!.orderIndex }
      : action.action === 'TRAY_DISCARD'
        ? { slot: state.tray.findIndex(bread => bread.id === action.breadId), action: 'TRAY_DISCARD', t: action.t }
        : { slot: action.slot!, action: action.action, t: action.t, ...(action.action === 'FILL' ? { filling: action.filling } : {}) }
    state = applyAction(state, entry, rules).state
  }
  return state
}
const count = (log: WireAction[], action: string) => log.filter(entry => entry.action === action).length
const stats = (state: GrillState, log: WireAction[]) => ({ score: state.score, made: state.made,
  successfulMade: state.made - state.failed, golden: state.golden, failed: state.failed, wasted: state.wasted,
  grillDiscarded: count(log, 'DISCARD'), trayDiscarded: count(log, 'TRAY_DISCARD'), combo: state.combo,
  maxCombo: state.maxCombo, served: state.served, customersServed: state.customersServed,
  specialServed: state.specialServed, bonusScore: state.bonusScore })
const checkpoint = (game: Game, state: GrillState, log: WireAction[], prefixHash: string) => ({
  revision: game.revision, throughSeq: log.length, prefixHash, heatCursor: state.fills, lastAt: state.lastAt,
  slots: state.slots.map((slot, index) => ({ slot: index, ...slot })),
  tray: state.tray.map(bread => ({ breadId: bread.id, filling: bread.filling, front: bread.front, back: bread.back,
    points: bread.points })),
  stats: stats(state, log), currentOrder: state.order ? game.orders[state.orderIndex] ?? null : null })

/** v4 HTTP contract fixture only. Never imported by product code or used as a production fallback. */
export async function bungeoppangFixture(page: Page, players = 4) {
  const world = await fixture(page, { players, manualMovement: true, position: { x: -36, y: .8, z: 16.3, yaw: Math.PI } })
  let earned = 0, nextId = 900, statusFailure = false, loseStart = false, loseComplete = false, rejectAbandon = false
  let startResponseDelay = 0, loseClockRead = false
  let walletFailure: 'WALLET_NOT_READY' | 'WALLET_UNAVAILABLE' | null = null, walletReads = 0
  const requests: { method: string; path: string; key: string | undefined; body: unknown }[] = []
  const games = new Map<string, Game>()
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
      if (req.method() === 'GET') {
        expect(url.searchParams.get('rulesVersion')).toBe('v4')
        return statusFailure
          ? route.fulfill({ status: 503, json: { code: 'MINIGAME_NOT_CONFIGURED', message: '설정 미완료' } })
          : route.fulfill({ json: { rulesVersion: 'v4', serverNow: new Date().toISOString(), todayEarned: earned,
            dailyCap: 100, isFirstGame: earned === 0, seenTips: [], activeSessionId: null, supportedRulesVersions: ['v2', 'v4'] } })
      }
      expect(body).toEqual({ minigameType: 'BUNGEOPPANG', rulesVersion: 'v4' })
      expect(key).toMatch(keyPattern)
      let id = keys.get(key!)
      if (!id) {
        for (const g of games.values()) if (g.status === 'PLAYING') g.status = 'ABANDONED'
        id = String(++nextId); keys.set(key!, id)
        const issuedAt = Date.now(), at = (ms: number) => new Date(issuedAt + ms).toISOString()
        const timing = { countdownStartsAt: at(1000), playStartsAt: at(4500), playEndsAt: at(64500),
          submitDeadline: at(79500), expiresAt: at(89500) }
        const game: Game = { id, status: 'PLAYING', issuedAt, timing, orders: [{ orderId: '1', orderIndex: 0, items: items(2) }],
          accepted: [], revision: 0, checkpoint: null, start: null, deliveries: new Map() }
        game.checkpoint = checkpoint(game, createGrill(heats, game.orders[0]!, rules), [],
          createHash('sha256').update(`BUNGEOPPANG/v4\n${id}\n${configVersion}\n`).digest('hex'))
        game.start = { minigameSessionId: id, minigameType: 'BUNGEOPPANG', status: 'PLAYING', phase: 'WAITING_START',
          rulesVersion: 'v4', configVersion, issuedAt: at(0), startedAt: at(0), timing, rules: wireRules, heats,
          isFirstGame: earned === 0, checkpoint: game.checkpoint }
        games.set(id, game)
      }
      if (loseStart) { loseStart = false; return route.abort('failed') }
      if (startResponseDelay) {
        const delay = startResponseDelay; startResponseDelay = 0
        await new Promise(resolve => setTimeout(resolve, delay))
      }
      return route.fulfill({ status: 201, json: games.get(id)!.start })
    }
    const match = url.pathname.match(/\/sessions\/(\d+)(?:\/(complete|abandon|deliveries))?$/), game = games.get(match?.[1] ?? '')
    if (!game) return route.fulfill({ status: 404, json: { code: 'MINIGAME_NOT_FOUND' } })
    if (!match?.[2]) {
      if (loseClockRead) { loseClockRead = false; return route.abort('failed') }
      const active = game.status === 'PLAYING', progress = active || url.searchParams.get('includeProgress') === 'true'
      return route.fulfill({ json: { minigameSessionId: game.id, rulesVersion: 'v4', configVersion, status: game.status,
        phase: active ? 'PLAYING' : game.status, score: game.result?.score ?? null, rewardAmount: game.result?.rewardAmount ?? 0,
        endedAt: null, endReason: null, serverNow: new Date().toISOString(), startedAt: new Date(game.issuedAt).toISOString(),
        timing: game.timing, checkpoint: progress ? game.checkpoint : null, acceptedLog: progress ? game.accepted : [],
        issuedOrders: progress ? game.orders : [], result: game.result ?? null, deliveryLookup: null } })
    }
    if (match[2] === 'abandon') {
      if (rejectAbandon) { rejectAbandon = false; return route.fulfill({ status: 503, json: { code: 'MINIGAME_UNAVAILABLE' } }) }
      game.status = 'ABANDONED'
      return route.fulfill({ json: { minigameSessionId: game.id, status: 'ABANDONED', rewardAmount: 0 } })
    }
    expect(key).toMatch(keyPattern)
    if (match[2] === 'deliveries') {
      const stored = game.deliveries.get(key!)
      if (stored) return route.fulfill({ json: stored })
      const input = body as { rulesVersion: string; throughSeq: number; prefixHash: string; log: WireAction[] }
      expect(input).toMatchObject({ rulesVersion: 'v4', throughSeq: input.log.length })
      expect(input.log.slice(0, game.accepted.length)).toEqual(game.accepted)
      const last = input.log.at(-1)!
      expect(last).toMatchObject({ action: 'DELIVER', deliveryKey: key, orderId: game.orders.at(-1)!.orderId })
      const before = replay(game, input.log.slice(0, -1))
      let state = replay(game, input.log)
      const next: WireOrder = { orderId: String(game.orders.length + 1), orderIndex: game.orders.length, items: items(2) }
      game.orders.push(next); state = supplyOrder(state, next.orderIndex, next, rules)
      game.accepted = input.log; game.revision++
      game.checkpoint = checkpoint(game, state, input.log, input.prefixHash)
      const response = { minigameSessionId: game.id, deliveryKey: key, orderId: last.orderId, accepted: true,
        acceptedAt: new Date().toISOString(), throughSeq: input.log.length, prefixHash: input.prefixHash,
        consumedBreadIds: before.tray.filter(bread => !state.tray.some(left => left.id === bread.id)).map(bread => bread.id),
        scoreDelta: state.score - before.score, bonusDelta: state.bonusScore - before.bonusScore,
        nextOrder: next, checkpoint: game.checkpoint }
      game.deliveries.set(key!, response)
      return route.fulfill({ json: response })
    }
    const input = body as { log: WireAction[]; prefixHash: string; throughSeq: number; clientScore: number; seenTips: string[] }
    expect(Object.keys(input).sort()).toEqual(['clientScore', 'log', 'prefixHash', 'rulesVersion', 'seenTips', 'throughSeq'])
    // A lost completion never reaches the server, so the session stays PLAYING until the same request is retried.
    if (loseComplete) { loseComplete = false; return route.abort('failed') }
    if (!game.result) {
      if (Date.now() < Date.parse(game.timing.playEndsAt)) return route.fulfill({ status: 422, json: { code: 'TOO_EARLY', message: 'TOO_EARLY' } })
      expect(input.log.slice(0, game.accepted.length)).toEqual(game.accepted)
      expect(count(input.log.slice(game.accepted.length), 'DELIVER')).toBeLessThanOrEqual(1)
      const state = replay(game, input.log), calculated = Math.floor(state.score / rules.pointsPerCoin)
      const reward = Math.min(100 - earned, calculated), settledAt = new Date()
      earned += reward
      game.result = { minigameSessionId: game.id, status: 'COMPLETED', rulesVersion: 'v4', configVersion,
        verifiedCompletedCount: state.made, rewardAmount: reward, ...stats(state, input.log), coinsCalculated: calculated,
        coinsGranted: reward, todayEarned: earned, dailyCap: 100, capReached: earned === 100,
        undeliveredCount: state.tray.length, unfinishedGrillCount: state.slots.filter(slot => slot.phase !== 'empty').length,
        rewardDate: new Date(settledAt.getTime() + 9 * 3_600_000).toISOString().slice(0, 10), settledAt: settledAt.toISOString(),
        finalThroughSeq: input.log.length, finalPrefixHash: input.prefixHash }
      delete game.result.combo
      game.status = 'COMPLETED'
    }
    return route.fulfill({ json: game.result })
  })
  return { ...world, requests, games, keys,
    failWallet: (value: typeof walletFailure) => { walletFailure = value }, get walletReads() { return walletReads },
    failStatus: (value: boolean) => { statusFailure = value },
    loseNextStart: () => { loseStart = true }, loseNextComplete: () => { loseComplete = true },
    rejectNextAbandon: () => { rejectAbandon = true },
    delayNextStartResponse: (ms: number) => { startResponseDelay = ms },
    loseNextClockRead: () => { loseClockRead = true },
  }
}
