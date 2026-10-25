import { describe, expect, it, vi } from 'vitest'
import { createShopService } from '../../src/features/shop/service'
import { RestError } from '../../src/network/restError'

const item = { itemId: 1, itemCode: 'TEST_TOP', name: '검증 상의', itemType: 'EQUIPMENT', equipSlot: 'TOP', price: 10, imageKey: 'test-top' }
const owned = { userItemId: 11, item, quantity: 1, equipped: true }
const attempt = { key: 'same-purchase-key', itemId: 1, quantity: 1, name: item.name }
const receipt = { purchaseId: 'test-receipt', itemId: 1, quantity: 1, unitPrice: 10, totalPrice: 10, balanceAfter: 90, userItemId: 11 }
describe('existing shop REST contract', () => {
  it('uses only the four specified methods/payloads and reads a fresh wallet separately', async () => {
    const request = vi.fn().mockResolvedValueOnce({ items: [item] }).mockResolvedValueOnce(receipt)
      .mockResolvedValueOnce({ items: [owned] }).mockResolvedValueOnce({ equipment: [owned] })
      .mockResolvedValueOnce({ balance: 95, reservedBalance: 30, availableBalance: 65 })
    const shop = createShopService(request)
    expect(await shop.items()).toEqual([item])
    expect(await shop.purchase(attempt)).toEqual(receipt)
    expect(await shop.inventory()).toEqual([owned])
    expect(await shop.equip(11)).toEqual([owned])
    expect(await shop.wallet()).toEqual({ balance: 95, reservedBalance: 30, availableBalance: 65 })
    expect(request.mock.calls.map(call => [call[0], call[1].method ?? 'GET'])).toEqual([
      ['/api/v1/shop/items', 'GET'], ['/api/v1/shop/purchases', 'POST'], ['/api/v1/users/me/items', 'GET'],
      ['/api/v1/users/me/equipment', 'PATCH'], ['/api/v1/wallets/me', 'GET'],
    ])
    expect(JSON.parse(request.mock.calls[1]![1].body)).toEqual({ itemId: 1, quantity: 1 })
    expect(request.mock.calls[1]![1].headers).toEqual({ 'Content-Type': 'application/json', 'Idempotency-Key': attempt.key })
    expect(JSON.parse(request.mock.calls[3]![1].body)).toEqual({ userItemId: 11 })
  })
  it('reuses the same purchase key and body after a lost response, without automatic resubmission', async () => {
    const request = vi.fn().mockRejectedValueOnce(new TypeError('lost response')).mockResolvedValueOnce(receipt)
    const shop = createShopService(request)
    await expect(shop.purchase(attempt)).rejects.toMatchObject({ code: 'NETWORK_ERROR', uncertain: true })
    expect(request).toHaveBeenCalledTimes(1)
    expect(await shop.purchase(attempt)).toEqual(receipt)
    expect(request.mock.calls.map(call => [call[1].body, call[1].headers])).toEqual([
      [JSON.stringify({ itemId: 1, quantity: 1 }), { 'Content-Type': 'application/json', 'Idempotency-Key': attempt.key }],
      [JSON.stringify({ itemId: 1, quantity: 1 }), { 'Content-Type': 'application/json', 'Idempotency-Key': attempt.key }],
    ])
  })
  it.each([
    [503, 'SHOP_NOT_CONFIGURED', true], [503, 'SHOP_UNAVAILABLE', true], [409, 'WALLET_NOT_READY', false],
    [409, 'INSUFFICIENT_BALANCE', false], [409, 'ITEM_ALREADY_OWNED', false], [409, 'IDEMPOTENCY_CONFLICT', true],
  ] as const)('keeps HTTP %s %s instead of treating a rejection as a successful purchase', async (status, code, uncertain) => {
    const request = vi.fn().mockRejectedValue(new RestError(status, code, 'server error'))
    await expect(createShopService(request).purchase(attempt)).rejects.toMatchObject({ code, uncertain })
    expect(request).toHaveBeenCalledTimes(1)
  })
  it('rejects malformed IDs, quantities and inconsistent receipts without generating a fresh request', async () => {
    const request = vi.fn().mockResolvedValue(receipt), shop = createShopService(request)
    for (const patch of [{ quantity: 0 }, { quantity: 1.5 }, { itemId: '1' }, { key: 'bad key' }, { quantity: 2147483648 }])
      await expect(shop.purchase({ ...attempt, ...patch } as typeof attempt)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
    expect(request).not.toHaveBeenCalled()
    for (const patch of [{ itemId: 2 }, { quantity: 2 }, { totalPrice: 11 }, { userItemId: '11' }, { balanceAfter: -1 }]) {
      request.mockResolvedValueOnce({ ...receipt, ...patch })
      await expect(shop.purchase(attempt)).rejects.toMatchObject({ code: 'INVALID_RESPONSE', uncertain: true })
    }
  })
  it('distinguishes empty catalogs from unavailable/malformed responses and restricts equipped slots', async () => {
    const request = vi.fn().mockResolvedValueOnce({ items: [] }).mockResolvedValueOnce({ equipment: [owned, { ...owned, userItemId: 12 }] })
      .mockResolvedValueOnce({ items: [{ ...item, price: -1 }] }).mockResolvedValueOnce({ balance: 95, reservedBalance: 30, availableBalance: 95 })
    const shop = createShopService(request)
    expect(await shop.items()).toEqual([])
    await expect(shop.equip(11)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
    await expect(shop.items()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
    await expect(shop.wallet()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })
  it('accepts the documented nullable product slot without treating it as an approved equipped appearance', async () => {
    const request = vi.fn().mockResolvedValueOnce({ items: [{ ...item, equipSlot: null, imageKey: null }] })
      .mockResolvedValueOnce({ equipment: [{ ...owned, item: { ...item, equipSlot: null } }] })
    const shop = createShopService(request)
    expect(await shop.items()).toEqual([{ ...item, equipSlot: null, imageKey: null }])
    await expect(shop.equip(11)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })
})
