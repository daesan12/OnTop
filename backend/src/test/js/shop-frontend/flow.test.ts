import { appendFileSync, readFileSync } from 'node:fs'
import { afterAll, expect, it, vi } from 'vitest'
import { clearAuthSession, restoreAuthSession } from '../../../../../frontend/src/auth/authFlow'
import { parkRuntime } from '../../../../../frontend/src/park/runtime/runtime'
import { SharedSocket } from '../../../../../frontend/src/network/socketClient'
import { resetWorld, useSession } from '../../../../../frontend/src/network/worldClient'
import type { Envelope } from '../../../../../frontend/src/network/protocol'
import { closeShop, equipShopItem, openShop, purchaseShopItem, resetShop, selectShopItem,
  setShopQuantity, useShop } from '../../../../../frontend/src/features/shop/controller'
import { keepPendingPurchase } from '../../../../../frontend/src/features/shop/pendingPurchase'

// 제품 모드의 실제 모듈을 사용하고 브라우저 API만 Node에 맞춘다.
vi.hoisted(() => {
  vi.stubEnv('DEV', false)
  vi.stubEnv('PROD', true)
  vi.stubEnv('MODE', 'production')
})
const base = process.env.TEST_SHOP_API_BASE_URL ?? ''
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error('Loopback test server required')
const realFetch = globalThis.fetch
const NativeWebSocket = globalThis.WebSocket
const peers: SharedSocket[] = []
let cookie = `ONTOP_REFRESH=${process.env.TEST_SHOP_REFRESH_TOKEN}`
let losePurchaseReply = false
let ticketCount = 0
const purchaseKeys: string[] = []
const storage = new Map<string, string>()

afterAll(async () => {
  resetShop()
  await parkRuntime.stop()
  await Promise.all(peers.map(client => client.disconnect()))
  clearAuthSession()
  resetWorld()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

it('recovers an uncertain purchase, equips, broadcasts and reconnects using actual FE and DB contracts', async () => {
  clearAuthSession()
  resetWorld()
  vi.stubGlobal('window', { location: new URL(base + '/park') })
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value) },
    removeItem: (key: string) => { storage.delete(key) },
  })
  vi.stubGlobal('fetch', async (path: string, init: RequestInit = {}) => {
    if (path === '/park-bindings.json') {
      return new Response(readFileSync(new URL('../../../../../frontend/public/park-bindings.json', import.meta.url)))
    }
    if (!path.startsWith('/api/v1/')) throw new Error('Unexpected test path')
    const headers = new Headers(init.headers)
    // Native WebSocket has no Origin. Only its ticket uses null Origin; browser CORS is a separate check.
    if (path !== '/api/v1/auth/websocket-ticket') headers.set('Origin', 'https://dev.on-top.world')
    if (path === '/api/v1/auth/refresh') headers.set('Cookie', cookie)
    if (path === '/api/v1/shop/purchases') purchaseKeys.push(headers.get('Idempotency-Key') ?? '')
    const response = await realFetch(base + path, { ...init, headers, redirect: 'error' })
    const renewed = response.headers.getSetCookie().find(value => value.startsWith('ONTOP_REFRESH='))
    if (renewed) cookie = renewed.split(';')[0]!
    if (path === '/api/v1/auth/websocket-ticket' && response.ok) ticketCount++
    if (path === '/api/v1/shop/purchases' && response.ok && losePurchaseReply) {
      losePurchaseReply = false
      await response.arrayBuffer()
      throw new TypeError('Test adapter discards a committed purchase response')
    }
    return response
  })
  vi.stubGlobal('WebSocket', NativeWebSocket)
  expect(await restoreAuthSession(true)).toBe(true)
  const observer = await peer(process.env.TEST_SHOP_OBSERVER_TOKEN!, 'channel-1')
  const separated = await peer(process.env.TEST_SHOP_SEPARATED_TOKEN!, 'channel-2')
  await enterPark()
  await openAndWait()
  expect(useShop.getState().items).toHaveLength(4)
  expect(useShop.getState().inventory).toEqual([])
  expect(useShop.getState().wallet).toEqual({ balance: 100, reservedBalance: 10, availableBalance: 90 })

  selectShopItem(product(1))
  losePurchaseReply = true
  await purchaseShopItem()
  const uncertain = useShop.getState().attempt!
  expect(uncertain).toBeTruthy()
  expect(useShop.getState()).toMatchObject({ purchasing: false, receipt: null })
  expect(useShop.getState().purchaseError).not.toBe('')
  closeShop()
  await openAndWait()
  expect(useShop.getState().attempt?.key).toBe(uncertain.key)
  await purchaseShopItem()
  const firstReceipt = useShop.getState().receipt!
  expect(firstReceipt).toMatchObject({ itemId: 1, quantity: 1, balanceAfter: 90 })
  expect(purchaseKeys.slice(0, 2)).toEqual([uncertain.key, uncertain.key])
  expect(useShop.getState().attempt).toBeNull()
  expect(useShop.getState().inventory).toHaveLength(1)

  selectShopItem(product(3))
  setShopQuantity(2)
  await purchaseShopItem()
  expect(useShop.getState().wallet?.balance).toBe(80)
  // Simulate a pending receipt restored from this tab. An old balanceAfter must not overwrite current HUD balance.
  keepPendingPurchase('101', uncertain)
  closeShop()
  await openAndWait()
  await purchaseShopItem()
  expect(useShop.getState().receipt).toEqual(firstReceipt)
  expect(useShop.getState().wallet?.balance).toBe(80)
  expect(useSession.getState().account?.balance).toBe(80)

  selectShopItem(product(1))
  await purchaseShopItem()
  expect(useShop.getState().attempt).toBeNull()
  expect(useShop.getState().purchaseError).toContain('이미 보유')
  expect(useShop.getState().wallet?.balance).toBe(80)
  selectShopItem(product(4))
  await purchaseShopItem()
  expect(useShop.getState().attempt).toBeNull()
  expect(useShop.getState().purchaseError).toContain('사용 가능한 엽전')
  expect(useSession.getState().status).toBe('connected')

  await equipShopItem(owned(1))
  await hasEquipment(observer.messages, 1)
  await vi.waitFor(() => expect(useSession.getState().equipment['101']?.[0]?.itemId).toBe(1))
  selectShopItem(product(2))
  await purchaseShopItem()
  await equipShopItem(owned(2))
  await hasEquipment(observer.messages, 2)
  await vi.waitFor(() => expect(useSession.getState().equipment['101']).toEqual([
    { itemId: 2, itemCode: 'BLUE_TOP', equipSlot: 'TOP', imageKey: 'demo-BLUE_TOP' },
  ]))
  expect(useShop.getState().inventory.filter(item => item.equipped).map(item => item.item.itemId)).toEqual([2])
  // Observe channel-2's real state after equipment publication; an empty message array is not isolation proof.
  const foreignBarrier = separated.messages.length
  await separated.client.request('CHANNEL_JOIN', { channelId: 'channel-2' }, ['CHANNEL_STATE'])
  await vi.waitFor(() => expect(separated.messages.slice(foreignBarrier).some(message =>
    message.type === 'WORLD_STATE' && message.payload.channelId === 'channel-2'
      && (message.payload.avatars as { userId: string }[]).some(avatar => avatar.userId === '505'))).toBe(true))
  const foreignWorlds = separated.messages.filter(message => message.type === 'WORLD_STATE')
  expect(foreignWorlds.length).toBeGreaterThan(0)
  expect(foreignWorlds.every(message =>
    !(message.payload.avatars as { userId: string }[]).some(avatar => avatar.userId === '101'))).toBe(true)

  closeShop()
  const beforeDisconnect = observer.messages.length
  const beforeTickets = ticketCount
  await parkRuntime.stop()
  await vi.waitFor(() => expect(observer.messages.slice(beforeDisconnect).some(message =>
    message.type === 'WORLD_STATE' && !(message.payload.avatars as { userId: string }[])
      .some(avatar => avatar.userId === '101'))).toBe(true), { timeout: 5000 })
  expect(useSession.getState().equipment).toEqual({})
  await enterPark()
  await vi.waitFor(() => expect(useSession.getState().equipment['101']?.[0]?.itemId).toBe(2), { timeout: 8000 })
  await openAndWait()
  expect(ticketCount).toBe(beforeTickets + 1)
  expect(useShop.getState().inventory).toHaveLength(3)
  expect(useShop.getState().wallet).toEqual({ balance: 60, reservedBalance: 10, availableBalance: 50 })
  expect(useSession.getState().account?.balance).toBe(60)
  const file = process.env.TEST_SHOP_DIAGNOSTICS_FILE!
  appendFileSync(file, JSON.stringify({ actualFrontendController: true, actualFrontendService: true,
    actualParkRuntime: true, uncertainResponseRecoveredWithSameKey: true, historicalReceiptKeptCurrentBalance: true,
    duplicateEquipmentBlocked: true, reservedCoinsProtected: true, committedEquipmentBroadcast: true,
    foreignChannelIsolated: true, freshTicketReconnectRestoredEquipment: true, balance: 60, reservedBalance: 10,
    inventoryRows: useShop.getState().inventory.length, rendered3d: false }) + '\n')
})

function product(id: number) {
  const item = useShop.getState().items.find(item => item.itemId === id)
  expect(item).toBeDefined()
  return item!
}

function owned(id: number) {
  const item = useShop.getState().inventory.find(item => item.item.itemId === id)
  expect(item).toBeDefined()
  return item!
}

async function openAndWait() {
  openShop()
  await vi.waitFor(() => {
    expect(useShop.getState()).toMatchObject({ open: true, loading: false, productsReady: true, inventoryReady: true })
    expect(useShop.getState().wallet).not.toBeNull()
  }, { timeout: 8000 })
}

async function enterPark() {
  parkRuntime.start()
  await vi.waitFor(() => expect(useSession.getState().sessionId).toBe('101'), { timeout: 8000 })
  expect(await parkRuntime.selectChannel('channel-1')).toBe(true)
}

async function peer(token: string, channelId: string) {
  const messages: Envelope[] = []
  const client = new SharedSocket({
    ticket: async signal => {
      const response = await fetch('/api/v1/auth/websocket-ticket', {
        method: 'POST', signal, headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) throw new Error('Test ticket issuance failed')
      return (await response.json()).ticket
    },
    socket: ticket => new WebSocket(base.replace('http:', 'ws:') + '/ws/tables?ticket=' + encodeURIComponent(ticket)),
    message: message => messages.push(message), closed: () => {}, error: message => { throw new Error(message) },
  })
  peers.push(client)
  await client.connect()
  await client.request('CHANNEL_JOIN', { channelId }, ['CHANNEL_STATE'])
  const ownId = messages.find(message => message.type === 'CONNECTED')?.payload.userId
  expect(ownId).toBeTruthy()
  await vi.waitFor(() => expect(messages.some(message => message.type === 'WORLD_STATE'
    && message.payload.channelId === channelId
    && (message.payload.avatars as { userId: string }[]).some(avatar => avatar.userId === ownId))).toBe(true))
  return { client, messages }
}

async function hasEquipment(messages: Envelope[], itemId: number) {
  await vi.waitFor(() => expect(messages.some(message => message.type === 'WORLD_STATE'
    && (message.payload.avatars as { userId: string; equipment?: { itemId: number }[] }[])
      .some(avatar => avatar.userId === '101' && avatar.equipment?.[0]?.itemId === itemId))).toBe(true), { timeout: 8000 })
  const current = messages.findLast(message => message.type === 'WORLD_STATE')!
  const avatar = (current.payload.avatars as { userId: string; equipment: object[] }[]).find(a => a.userId === '101')!
  expect(Object.keys(avatar.equipment[0]!).sort()).toEqual(['equipSlot', 'imageKey', 'itemCode', 'itemId'])
}
