import { record, integer } from '../../network/protocol'
import { isEquipSlot } from '../../network/equipment'
import { RestError } from '../../network/restError'
import type { OwnedItem, PurchaseAttempt, ShopItem, ShopService } from './contracts'

const positive = (value: unknown): value is number => integer(value) && value > 0
const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim()
const messages: Record<string, string> = {
  SHOP_NOT_CONFIGURED: '상점이 아직 준비 중이에요. 잠시 후 다시 확인해 주세요.',
  SHOP_UNAVAILABLE: '상점을 잠시 이용할 수 없어요. 다시 확인해 주세요.',
  WALLET_NOT_READY: '계정의 지갑이 아직 준비되지 않았어요. 운영 담당자에게 확인해 주세요.',
  WALLET_UNAVAILABLE: '잔액을 불러오지 못했어요. 다시 확인해 주세요.',
  INSUFFICIENT_BALANCE: '사용 가능한 엽전이 부족해요. 경기 참가금으로 예약된 엽전은 사용할 수 없어요.',
  ITEM_ALREADY_OWNED: '이미 보유한 의상이에요. 보유 아이템에서 확인해 주세요.',
  ITEM_NOT_FOUND: '지금은 구매할 수 없는 상품이에요. 목록을 새로 확인해 주세요.',
  OWNED_ITEM_NOT_FOUND: '보유 아이템을 찾지 못했어요. 목록을 새로 확인해 주세요.',
  ITEM_NOT_EQUIPPABLE: '착용할 수 없는 아이템이에요.',
  IDEMPOTENCY_CONFLICT: '이 구매 요청의 내용을 확인해야 해요. 운영 담당자에게 확인해 주세요.',
  QUANTITY_TOO_LARGE: '구매 수량을 줄여 주세요.',
}
export class ShopError extends Error {
  constructor(readonly code: string, message: string, readonly uncertain = false) { super(message) }
}
const invalid = (): never => { throw new ShopError('INVALID_RESPONSE', '서버 응답을 확인하지 못했어요. 같은 요청으로 다시 확인해 주세요.', true) }
export function parseShopItem(value: unknown): ShopItem {
  if (!record(value) || !positive(value.itemId) || !text(value.itemCode) || !text(value.name)
    || !['EQUIPMENT', 'CONSUMABLE'].includes(String(value.itemType))
    || !(value.equipSlot === null || isEquipSlot(value.equipSlot)) || !integer(value.price)
    || !(value.imageKey === null || typeof value.imageKey === 'string')) return invalid()
  return { itemId: value.itemId, itemCode: value.itemCode, name: value.name,
    itemType: value.itemType as ShopItem['itemType'], equipSlot: value.equipSlot,
    price: value.price, imageKey: value.imageKey }
}
function owned(value: unknown): OwnedItem {
  if (!record(value) || !positive(value.userItemId) || !positive(value.quantity) || value.quantity > 2147483647
    || typeof value.equipped !== 'boolean') return invalid()
  const item = parseShopItem(value.item)
  if (value.equipped && (item.itemType !== 'EQUIPMENT' || !item.equipSlot)) return invalid()
  return { userItemId: value.userItemId, item, quantity: value.quantity, equipped: value.equipped }
}
function ownedList(value: unknown) {
  if (!Array.isArray(value)) return invalid()
  const items = value.map(owned), equipped = items.filter(item => item.equipped)
  if (new Set(items.map(item => item.userItemId)).size !== items.length
    || new Set(equipped.map(item => item.item.equipSlot)).size !== equipped.length) return invalid()
  return items
}
export function createShopService(requestJSON: (path: string, init?: RequestInit) => Promise<unknown>): ShopService {
  async function request(path: string, init: RequestInit = {}) {
    const timeout = AbortSignal.timeout(12000)
    try { return await requestJSON(path, { ...init, signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout }) }
    catch (error) {
      if (error instanceof ShopError) throw error
      if (error instanceof RestError) throw new ShopError(error.code,
        messages[error.code] ?? (error.status === 404 ? '상점 연결이 아직 준비되지 않았어요.'
          : error.status === 401 || error.status === 403 ? '로그인을 다시 확인해 주세요.' : '요청을 완료하지 못했어요. 다시 확인해 주세요.'),
        error.status >= 500 || error.status === 429 || error.code === 'IDEMPOTENCY_CONFLICT')
      throw new ShopError('NETWORK_ERROR', '처리 결과를 받지 못했어요. 같은 요청으로 다시 확인해 주세요.', true)
    }
  }
  const json = (method: string, body: unknown, signal?: AbortSignal, headers: Record<string, string> = {}): RequestInit =>
    ({ method, body: JSON.stringify(body), signal, headers: { 'Content-Type': 'application/json', ...headers } })
  return {
    async items(signal) {
      const p = await request('/api/v1/shop/items', { signal })
      if (!record(p) || !Array.isArray(p.items)) return invalid()
      const items = p.items.map(parseShopItem)
      if (new Set(items.map(item => item.itemId)).size !== items.length) return invalid()
      return items
    },
    async inventory(signal) {
      const p = await request('/api/v1/users/me/items', { signal })
      if (!record(p)) return invalid()
      return ownedList(p.items)
    },
    async purchase(attempt: PurchaseAttempt, signal) {
      if (!positive(attempt.itemId) || !positive(attempt.quantity) || attempt.quantity > 2147483647
        || !/^[A-Za-z0-9_-]{1,64}$/.test(attempt.key)) return invalid()
      const p = await request('/api/v1/shop/purchases', json('POST',
        { itemId: attempt.itemId, quantity: attempt.quantity }, signal, { 'Idempotency-Key': attempt.key }))
      if (!record(p) || !text(p.purchaseId) || p.itemId !== attempt.itemId || p.quantity !== attempt.quantity
        || !integer(p.unitPrice) || !integer(p.totalPrice) || !integer(p.balanceAfter) || !positive(p.userItemId)
        || !Number.isSafeInteger(p.unitPrice * p.quantity) || p.totalPrice !== p.unitPrice * p.quantity) return invalid()
      return { purchaseId: p.purchaseId, itemId: p.itemId, quantity: p.quantity,
        unitPrice: p.unitPrice, totalPrice: p.totalPrice, balanceAfter: p.balanceAfter, userItemId: p.userItemId }
    },
    async equip(userItemId, signal) {
      if (!positive(userItemId)) return invalid()
      const p = await request('/api/v1/users/me/equipment', json('PATCH', { userItemId }, signal))
      if (!record(p)) return invalid()
      const items = ownedList(p.equipment)
      if (items.length > 5 || items.some(item => !item.equipped) || !items.some(item => item.userItemId === userItemId)) return invalid()
      return items
    },
    async wallet(signal) {
      const p = await request('/api/v1/wallets/me', { signal })
      if (!record(p) || !integer(p.balance) || !integer(p.reservedBalance) || !integer(p.availableBalance)
        || p.balance - p.reservedBalance !== p.availableBalance) return invalid()
      return { balance: p.balance, reservedBalance: p.reservedBalance, availableBalance: p.availableBalance }
    },
  }
}
