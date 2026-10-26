import { appendFileSync, readFileSync } from 'node:fs'
import { afterAll, expect, it, vi } from 'vitest'
import { clearAuthSession, restoreAuthSession } from '../../../../../frontend/src/auth/authFlow'
import { parkRuntime } from '../../../../../frontend/src/park/runtime/runtime'
import { resetWorld, useSession } from '../../../../../frontend/src/network/worldClient'
import { canOpenBungeoppang } from '../../../../../frontend/src/features/bungeoppang/access'
import { bungeoppangClock, gameNow } from '../../../../../frontend/src/features/bungeoppang/bungeoppangView'
import { BUNGEOPPANG as rules } from '../../../../../frontend/src/features/bungeoppang/config'
import { cookLevel } from '../../../../../frontend/src/features/bungeoppang/rules'
import { advanceBungeoppangTime, leaveBungeoppang, openBungeoppang, pressBungeoppangSlot, quitBungeoppang,
  refreshBungeoppangStatus, refreshBungeoppangWallet, resetBungeoppang, setBungeoppangTool,
  startBungeoppang, submitBungeoppang, useBungeoppang } from '../../../../../frontend/src/features/bungeoppang/store'

vi.hoisted(() => { vi.stubEnv('DEV', false); vi.stubEnv('PROD', true); vi.stubEnv('MODE', 'production') })
const base = process.env.TEST_BUNGEOPPANG_API_BASE_URL ?? ''
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error('Loopback test server required')
const realFetch = globalThis.fetch, NativeWebSocket = globalThis.WebSocket
const storage = new Map<string, string>(), startKeys: string[] = [], completions: string[] = []
const documentAdapter = { hidden: false, activeElement: null, pointerLockElement: null }
let cookie = `ONTOP_REFRESH=${process.env.TEST_BUNGEOPPANG_REFRESH_TOKEN}`
let loseStart = true, loseComplete = true, loseWallet = false, tickets = 0

afterAll(async () => {
  resetBungeoppang()
  await parkRuntime.stop()
  clearAuthSession(); resetWorld(); vi.unstubAllGlobals(); vi.unstubAllEnvs()
})

it('plays for real wall time through hidden-tab completion and recovers reward, wallet and reconnect', async () => {
  clearAuthSession(); resetWorld()
  const events = new EventTarget()
  vi.stubGlobal('window', { location: new URL(base + '/park'), setTimeout,
    dispatchEvent: events.dispatchEvent.bind(events), addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events) })
  vi.stubGlobal('document', documentAdapter)
  vi.stubGlobal('sessionStorage', { getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value) }, removeItem: (key: string) => { storage.delete(key) } })
  // Real time, not fake timers. Background tabs stop animation frames; product interval still advances time.
  vi.stubGlobal('requestAnimationFrame', (callback: (now: number) => void) => setTimeout(() => {
    if (!documentAdapter.hidden) callback(performance.now())
  }, 16))
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  vi.stubGlobal('WebSocket', NativeWebSocket)
  vi.stubGlobal('fetch', async (path: string, init: RequestInit = {}) => {
    if (path === '/park-bindings.json') return new Response(readFileSync(
      new URL('../../../../../frontend/public/park-bindings.json', import.meta.url)))
    if (!path.startsWith('/api/v1/')) throw new Error('Unexpected test path')
    const headers = new Headers(init.headers)
    // Native WS has no Origin, so its ticket also uses null Origin. This is not a browser CORS test.
    if (path !== '/api/v1/auth/websocket-ticket') headers.set('Origin', 'https://dev.on-top.world')
    if (path === '/api/v1/auth/refresh') headers.set('Cookie', cookie)
    const start = path === '/api/v1/minigames/sessions' && init.method === 'POST'
    const complete = path.endsWith('/complete')
    if (start) startKeys.push(headers.get('Idempotency-Key') ?? '')
    if (complete) completions.push(String(init.body))
    const response = await realFetch(base + path, { ...init, headers, redirect: 'error' })
    const renewed = response.headers.getSetCookie().find(value => value.startsWith('ONTOP_REFRESH='))
    if (renewed) cookie = renewed.split(';')[0]!
    if (path === '/api/v1/auth/websocket-ticket' && response.ok) tickets++
    if (response.ok && ((start && loseStart) || (complete && loseComplete)
      || (path === '/api/v1/wallets/me' && loseWallet))) {
      if (start) loseStart = false
      else if (complete) loseComplete = false
      else loseWallet = false
      await response.arrayBuffer()
      throw new TypeError('Adapter discards a successful real server response')
    }
    return response
  })
  expect(await restoreAuthSession(true)).toBe(true)
  await enterPark()
  await openAndWait()
  expect(useBungeoppang.getState().status).toMatchObject({ todayEarned: 0, isFirstGame: true })
  expect(useSession.getState().account?.balance).toBe(100)
  await startBungeoppang()
  expect(useBungeoppang.getState()).toMatchObject({ phase: 'start', gameId: '' })
  expect(useBungeoppang.getState().startError).toBeTruthy()
  await startBungeoppang()
  const gameId = useBungeoppang.getState().gameId
  expect(gameId).toMatch(/^[1-9]\d*$/)
  expect(startKeys).toHaveLength(2)
  expect(startKeys[0]).toBe(startKeys[1])
  await vi.waitFor(() => expect(useBungeoppang.getState().phase).toBe('play'), { timeout: 5000 })
  await cook([0, 1, 2, 3, 4, 5])
  await cook([0])
  expect(useBungeoppang.getState().grill).toMatchObject({ made: 7, golden: 7, score: 86 })
  // Leave one unfinished slot and hide the tab. No shortened duration or DB timestamp changes.
  await delay(110)
  setBungeoppangTool('batter'); pressBungeoppangSlot(1)
  expect(useBungeoppang.getState().grill?.slots[1]?.phase).toBe('batter')
  documentAdapter.hidden = true
  await vi.waitFor(() => expect(useBungeoppang.getState().submitError?.retryable).toBe(true), { timeout: 70000 })
  expect(bungeoppangClock.t).toBe(rules.durationMs)
  expect(completions).toHaveLength(1)
  expect(useBungeoppang.getState().result).toBeNull()
  await startBungeoppang()
  expect(startKeys).toHaveLength(2) // uncertain completion must be confirmed before a new round
  loseWallet = true
  await submitBungeoppang()
  expect(completions).toHaveLength(2)
  expect(completions[1]).toBe(completions[0])
  // Unfinished slots earn nothing; wasted counts explicit DISCARD actions only.
  expect(useBungeoppang.getState().result).toMatchObject({ score: 86, made: 7, wasted: 0, coinsGranted: 5, todayEarned: 5 })
  await vi.waitFor(() => expect(useBungeoppang.getState().walletError).toBeTruthy())
  expect(useSession.getState().account?.balance).toBe(100)
  await refreshBungeoppangWallet()
  expect(useSession.getState().account?.balance).toBe(105)
  expect(useBungeoppang.getState().walletError).toBeNull()
  expect(completions).toHaveLength(2) // wallet recovery must not submit another reward
  await refreshBungeoppangStatus()
  expect(useBungeoppang.getState().status).toMatchObject({ todayEarned: 5, isFirstGame: false })
  documentAdapter.hidden = false
  leaveBungeoppang()
  await vi.waitFor(() => expect(useBungeoppang.getState().phase).toBe('idle'), { timeout: 3000 })
  await openAndWait(); await startBungeoppang()
  expect(useBungeoppang.getState().gameId).not.toBe(gameId)
  expect(startKeys[2]).not.toBe(startKeys[0])
  await quitBungeoppang()
  await vi.waitFor(() => expect(useBungeoppang.getState().phase).toBe('idle'), { timeout: 3000 })
  await parkRuntime.stop()
  await enterPark(); await openAndWait()
  expect(tickets).toBeGreaterThanOrEqual(2)
  expect(useBungeoppang.getState().status).toMatchObject({ todayEarned: 5, isFirstGame: false })
  expect(useSession.getState().account?.balance).toBe(105)
  appendFileSync(process.env.TEST_BUNGEOPPANG_DIAGNOSTICS_FILE!, JSON.stringify({
    actualFrontendStore: true, actualRuntimeAuthSocket: true, realSixtySecondRound: true,
    hiddenTabContinued: true, sameStartKeyAfterLostReply: true, sameCompletionAfterLostReply: true,
    walletRecoveryWithoutResubmission: true, abandonedWithoutReward: true, reconnectRecovered: true,
    unfinishedSlotExcluded: true, score: 86, made: 7, wasted: 0, reward: 5, balance: 105, rendered3d: false,
  }) + '\n')
})

async function enterPark() {
  parkRuntime.start()
  await vi.waitFor(() => expect(useSession.getState()).toMatchObject({ status: 'connected', roomId: 'channel-1', mapCompatible: true }), { timeout: 10000 })
  await vi.waitFor(() => expect(canOpenBungeoppang()).toBe(true), { timeout: 5000 })
}
async function openAndWait() {
  openBungeoppang()
  await vi.waitFor(() => {
    expect(useBungeoppang.getState().phase).toBe('start')
    expect(useBungeoppang.getState().status).not.toBeNull()
    expect(useBungeoppang.getState().statusError).toBeNull()
    expect(useBungeoppang.getState().walletError).toBeNull()
  }, { timeout: 5000 })
}
async function cook(slots: number[]) {
  setBungeoppangTool('batter')
  for (const slot of slots) { await delay(110); pressBungeoppangSlot(slot) }
  setBungeoppangTool('bean')
  for (const slot of slots) { await delay(350); pressBungeoppangSlot(slot) }
  const deadline = performance.now() + 22000
  while (slots.some(slot => useBungeoppang.getState().grill!.slots[slot]!.phase !== 'empty')) {
    if (performance.now() > deadline) throw new Error('Cooking inputs did not finish in their valid window')
    advanceBungeoppangTime()
    const grill = useBungeoppang.getState().grill!
    const slot = slots.find(index => {
      const value = grill.slots[index]!
      return (value.phase === 'front' || value.phase === 'back') && cookLevel(value.since, gameNow(), value.heat, rules) >= 78
    })
    if (slot !== undefined) pressBungeoppangSlot(slot)
    await delay(90)
  }
}
async function delay(ms: number) { await new Promise(resolve => setTimeout(resolve, ms)) }
