import { expect, type Page, type Route } from '@playwright/test'
import type { OwnedItem, PurchaseReceipt, ShopItem } from '../../src/features/shop/contracts'
import type { PublicEquipment } from '../../src/network/equipment'

// Synthetic contract responses confined to tests. No demo products enter the app.
export async function shopFixture(page: Page, broadcast: (equipment: PublicEquipment[]) => void) {
  const items: ShopItem[] = [
    { itemId: 1, itemCode: 'FIXTURE_TOP_A', name: '검증 상의 가', itemType: 'EQUIPMENT', equipSlot: 'TOP', price: 10, imageKey: 'fixture-top-a' },
    { itemId: 2, itemCode: 'FIXTURE_TOP_B', name: '검증 상의 나', itemType: 'EQUIPMENT', equipSlot: 'TOP', price: 20, imageKey: 'fixture-top-b' },
    { itemId: 3, itemCode: 'FIXTURE_CONSUMABLE', name: '검증 소비 아이템', itemType: 'CONSUMABLE', equipSlot: null, price: 3, imageKey: null },
  ]
  const owned: OwnedItem[] = [{ userItemId: 22, item: items[1]!, quantity: 1, equipped: true }]
  const receipts = new Map<string, { body: object; receipt: PurchaseReceipt }>()
  const calls: { method: string; path: string; key: string | undefined; body: Record<string, unknown> | null }[] = []
  let balance = 100, reserved = 30, debitCount = 0, disabled = false
  let purchaseMode: 'normal' | 'lost' | 'unauthorized' | 'hold' = 'normal', error = ''
  let holdWorld = false, pendingWorld: PublicEquipment[] = [], held: { route: Route; json: object } | undefined
  async function handle(route: Route) {
    const request = route.request(), path = new URL(request.url()).pathname, method = request.method()
    expect(request.headers().authorization).toBe('Bearer fixture-access')
    const body = method === 'GET' ? null : request.postDataJSON() as Record<string, unknown>
    calls.push({ method, path, key: request.headers()['idempotency-key'], body })
    if (disabled) return route.fulfill({ status: 503, json: { code: 'SHOP_NOT_CONFIGURED', message: 'disabled' } })
    if (path === '/api/v1/wallets/me') return route.fulfill({ json: { balance, reservedBalance: reserved, availableBalance: balance - reserved } })
    if (path === '/api/v1/shop/items') return route.fulfill({ json: { items } })
    if (path === '/api/v1/users/me/items') return route.fulfill({ json: { items: owned } })
    if (path === '/api/v1/users/me/equipment') {
      expect(method).toBe('PATCH'); expect(Object.keys(body!).sort()).toEqual(['userItemId'])
      const target = owned.find(item => item.userItemId === body!.userItemId)!
      for (const item of owned) if (item.item.equipSlot === target.item.equipSlot) item.equipped = item === target
      pendingWorld = owned.filter(item => item.equipped).map(({ item }) => ({ itemId: item.itemId, itemCode: item.itemCode, equipSlot: item.equipSlot!, imageKey: item.imageKey }))
      if (!holdWorld) broadcast(pendingWorld)
      return route.fulfill({ json: { equipment: owned.filter(item => item.equipped) } })
    }
    expect(path).toBe('/api/v1/shop/purchases'); expect(method).toBe('POST')
    expect(Object.keys(body!).sort()).toEqual(['itemId', 'quantity'])
    const key = request.headers()['idempotency-key']!
    expect(key).toMatch(/^[A-Za-z0-9_-]{1,64}$/)
    if (purchaseMode === 'unauthorized') {
      purchaseMode = 'normal'; return route.fulfill({ status: 401, json: { code: 'UNAUTHENTICATED' } })
    }
    if (error) return route.fulfill({ status: 409, json: { code: error, message: error } })
    let saved = receipts.get(key)
    if (saved) expect(body).toEqual(saved.body)
    else {
      const item = items.find(item => item.itemId === body!.itemId)!, quantity = Number(body!.quantity)
      const totalPrice = item.price * quantity
      balance -= totalPrice; debitCount++
      const userItemId = 100 + debitCount
      owned.push({ userItemId, item, quantity, equipped: false })
      const receipt = { purchaseId: 'receipt-' + debitCount, itemId: item.itemId, quantity,
        unitPrice: item.price, totalPrice, balanceAfter: balance, userItemId }
      saved = { body: body!, receipt }; receipts.set(key, saved)
    }
    if (purchaseMode === 'lost') { purchaseMode = 'normal'; return route.abort('failed') }
    if (purchaseMode === 'hold') { purchaseMode = 'normal'; held = { route, json: saved.receipt }; return }
    return route.fulfill({ json: saved.receipt })
  }
  for (const path of ['/api/v1/shop/**', '/api/v1/users/me/items', '/api/v1/users/me/equipment', '/api/v1/wallets/me'])
    await page.route('**' + path, handle)
  return {
    calls, get debitCount() { return debitCount }, get inventory() { return owned },
    purchaseMode: (mode: typeof purchaseMode) => { purchaseMode = mode },
    disabled: (value: boolean) => { disabled = value }, error: (code: string) => { error = code },
    holdWorld: (value: boolean) => { holdWorld = value }, flushWorld: () => broadcast(pendingWorld),
    balance: (value: number) => { balance = value },
    release: async () => { if (held) { const h = held; held = undefined; await h.route.fulfill({ json: h.json }).catch(() => {}) } },
  }
}
