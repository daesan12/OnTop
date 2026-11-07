import { capsuleName } from './labels'

export interface GachaPrize { grade: number; initial: number; remaining: number; value: number }
export interface GachaMachine { roundId: string; version: number; remaining: number; prizes: GachaPrize[]; refillEndsAt: string | null }
export interface GachaInventory { tickets: number; boxes: { grade: number; quantity: number }[]; balance: number; availableBalance: number }
export interface GachaProduct { code: string; name: string; grade: number; compatibility: string; imageKey: string; itemIds: number[] }
export interface GachaState { enabled: boolean; ticketPrice: number; machine: GachaMachine; inventory: GachaInventory; products: GachaProduct[]; serverNow: string | null }
export interface GachaResult {
  operationId: string; kind: 'BUY' | 'DRAW' | 'OPEN'; roundId: string | null; grade: number
  product: GachaProduct | null; duplicate: boolean; paidCoins: number; awardedCoins: number
  inventory: GachaInventory; completedAt: string
}
export const gradeName = capsuleName
export const money = (value: number) => `${value.toLocaleString('ko-KR')}냥`

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const whole = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0
const timestamp = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value))
const invalid = (): never => { throw new Error('뽑기 응답을 확인하지 못했어요. 같은 요청으로 다시 확인해 주세요.') }
export function parseMachine(value: unknown): GachaMachine {
  if (!object(value) || typeof value.roundId !== 'string' || !/^[1-9]\d{0,18}$/.test(value.roundId)
    || !whole(value.version) || !whole(value.remaining) || !Array.isArray(value.prizes) || value.prizes.length !== 5
    || value.refillEndsAt != null && !timestamp(value.refillEndsAt)) return invalid()
  const expected = [1, 2, 4, 8, 15]
  const prizes = value.prizes.map((p, i) => {
    if (!object(p) || p.grade !== i + 1 || p.initial !== expected[i] || !whole(p.remaining)
      || p.remaining > expected[i]! || !whole(p.value)) return invalid()
    return { grade: p.grade, initial: p.initial, remaining: p.remaining, value: p.value }
  })
  if (prizes.reduce((sum, p) => sum + p.remaining, 0) !== value.remaining || value.remaining < 1) return invalid()
  return { roundId: value.roundId, version: value.version, remaining: value.remaining, prizes, refillEndsAt: value.refillEndsAt as string | null ?? null }
}
export function parseInventory(value: unknown): GachaInventory {
  if (!object(value) || !whole(value.tickets) || !whole(value.balance) || !whole(value.availableBalance)
    || value.availableBalance > value.balance || !Array.isArray(value.boxes) || value.boxes.length !== 4) return invalid()
  const boxes = value.boxes.map((box, i) => {
    if (!object(box) || box.grade !== i + 1 || !whole(box.quantity)) return invalid()
    return { grade: box.grade, quantity: box.quantity }
  })
  return { tickets: value.tickets, balance: value.balance, availableBalance: value.availableBalance, boxes }
}
function product(value: unknown): GachaProduct {
  if (!object(value) || typeof value.code !== 'string' || typeof value.name !== 'string'
    || !whole(value.grade) || value.grade < 1 || value.grade > 4 || typeof value.compatibility !== 'string'
    || typeof value.imageKey !== 'string' || !Array.isArray(value.itemIds) || !value.itemIds.every(n => whole(n) && n > 0)) return invalid()
  return { code: value.code, name: value.name, grade: value.grade, compatibility: value.compatibility,
    imageKey: value.imageKey, itemIds: value.itemIds }
}
export function parseState(value: unknown): GachaState {
  if (!object(value) || typeof value.enabled !== 'boolean' || !whole(value.ticketPrice) || !Array.isArray(value.products)) return invalid()
  const machine = parseMachine(value.machine)
  if (value.serverNow != null && !timestamp(value.serverNow) || machine.refillEndsAt && !timestamp(value.serverNow)) return invalid()
  return { enabled: value.enabled, ticketPrice: value.ticketPrice, machine,
    inventory: parseInventory(value.inventory), products: value.products.map(product), serverNow: value.serverNow as string | null ?? null }
}
export function parseResult(value: unknown): GachaResult {
  if (!object(value) || typeof value.operationId !== 'string' || !['BUY', 'DRAW', 'OPEN'].includes(String(value.kind))
    || !(value.roundId === null || typeof value.roundId === 'string') || !whole(value.grade)
    || typeof value.duplicate !== 'boolean' || !whole(value.paidCoins) || !whole(value.awardedCoins)
    || typeof value.completedAt !== 'string' || !Number.isFinite(Date.parse(value.completedAt))) return invalid()
  return { operationId: value.operationId, kind: value.kind as GachaResult['kind'], roundId: value.roundId,
    grade: value.grade, product: value.product === null ? null : product(value.product), duplicate: value.duplicate,
    paidCoins: value.paidCoins, awardedCoins: value.awardedCoins, inventory: parseInventory(value.inventory), completedAt: value.completedAt }
}
