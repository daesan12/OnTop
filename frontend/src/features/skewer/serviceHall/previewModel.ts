import type { IngredientId } from '../game'
import { TABLES, STATIONS, START, distance, move, route, tableApproaches } from './plan'
import type { Point, Station } from './plan'
import { COOPERATIVE_RECIPES, cooperativeRecipe } from '../cooperativeMenu'

export type Status = 'unreceived' | 'collected' | 'cooking' | 'ready' | 'eating' | 'dirty' | 'clean'
export type Dish = { id: string; table: number; recipe: IngredientId[]; delivered: boolean }
export type Bill = { dishes: Dish[]; sake: number; sakeDelivered: number }
export type PreviewTable = { id: number; status: Status; people: number; bill: Bill | null; eatUntil: number | null }
export type Party = { id: number; size: 1 | 2 }
export type DirtyDishes = { id: number; table: number; settings: 1 | 2 }
export type Washer = { load: DirtyDishes[]; remaining: number; completed: number }
// Local preview mirrors the two-slot server washer; adding dishes restarts its batch timer.
export const DISHWASHING_PREVIEW = { carryCapacity: 2, batchCapacity: 2, cycleSeconds: 8 } as const
export const BUSINESS_PREVIEW_SECONDS = 240
export const WRONG_DELIVERY_PENALTY = 10
// UI playtest scoring only. No wallet, rank or server settlement is implied.
const MENU_PREVIEW_POINTS = [100, 100, 240, 160, 160, 240] as const
export function previewDishPoints(recipe: readonly IngredientId[]) { return MENU_PREVIEW_POINTS[COOPERATIVE_RECIPES.findIndex(r => r.join(',') === recipe.join(','))] ?? 0 }
export type HallView = { position: Point; tables: PreviewTable[]; held: number[]; carry: Dish[]; sake: number; dirtyDishes: DirtyDishes[]; washer: Washer; pass: Dish[]; stored: Dish[]; storageOpen: boolean; queue: Party[]; kitchen: Dish[]; clean: { table: number; progress: number } | null; message: string; revision: number; elapsed: number; score: number; remaining: number; finished: boolean; served: number }
export const RECIPES = COOPERATIVE_RECIPES
export const STATUS_LABEL: Record<Status, string> = { unreceived: '주문 미접수', collected: '주방 전달 대기', cooking: '조리 중', ready: '픽업 가능', eating: '식사 중', dirty: '청소 필요', clean: '빈자리' }
function bill(table: number, people: number, sake: number): Bill {
  return { dishes: Array.from({ length: people }, (_, i) => ({ id: `${table}-${i}`, table, recipe: cooperativeRecipe(table, i), delivered: false })), sake, sakeDelivered: 0 }
}

/** Explicitly local UI fixture for route review. It never awards money or impersonates a cook/server. */
export class HallPreview {
  position = { ...START }; elapsed = 0; revision = 0
  score = 0; served = 0
  get finished() { return this.elapsed >= BUSINESS_PREVIEW_SECONDS }
  tables: PreviewTable[] = TABLES.map(t => {
    const statuses: Record<number, Status> = { 1: 'unreceived', 2: 'dirty', 3: 'clean', 4: 'unreceived', 5: 'eating', 6: 'ready' }
    const status = statuses[t.id]
    return { id: t.id, status, people: status === 'clean' || status === 'dirty' ? 0 : t.capacity, bill: status === 'clean' || status === 'dirty' ? null : bill(t.id, t.capacity, t.capacity), eatUntil: status === 'eating' ? 8 : null }
  })
  held: number[] = []; carry: Dish[] = []; sake = 0
  // Separate from the chef's two-slot pass. Every issued, undelivered dish can be put down.
  stored: Dish[] = []; storageOpen = false
  dirtyDishes: DirtyDishes[] = []
  washer: Washer = { load: [], remaining: 0, completed: 0 }
  pass: Dish[] = this.tables[5].bill!.dishes.map(d => ({ ...d, recipe: [...d.recipe] }))
  queue: Party[] = [{ id: 1, size: 1 }, { id: 2, size: 2 }, { id: 3, size: 1 }]
  kitchen: Dish[] = []; clean: { table: number; progress: number } | null = null
  message = ''; private path: Point[] = []; private nextArrival = 12; private messageAt = 0; private nextDirtyId = 1
  private changed(message?: string) { this.revision++; if (message) { this.message = message; this.messageAt = this.elapsed } }
  navigate(destination: Point) { if (this.finished || this.storageOpen) return; this.path = route(this.position, destination); this.clean = null; this.changed() }
  nearest(): { kind: 'table'; id: number } | { kind: Station } | null {
    const choices = [...TABLES.flatMap(t => tableApproaches(t).map(point => ({ point, result: { kind: 'table' as const, id: t.id } }))), ...Object.entries(STATIONS).map(([kind, point]) => ({ point, result: { kind: kind as Station } }))]
    choices.sort((a, b) => distance(a.point, this.position) - distance(b.point, this.position))
    return distance(choices[0].point, this.position) <= .92 ? choices[0].result : null
  }
  blockedReason(): string | null {
    if (this.finished) return '영업이 끝났어요'
    const at = this.nearest(); if (!at) return null
    if (at.kind === 'washer') {
      if (!this.dirtyDishes.length) return this.washer.load.length ? '자동 세척 중' : '수거한 식기가 없어요'
      return this.washer.load.length >= DISHWASHING_PREVIEW.batchCapacity ? `세척기 가득 참 · ${Math.ceil(this.washer.remaining)}초 후 투입` : null
    }
    if (at.kind === 'storage' && !this.dirtyDishes.length && !this.carry.length && !this.stored.length) return '맡길 꼬치를 가져오세요'
    if (at.kind !== 'table') return this.dirtyDishes.length ? '식기를 세척기에 넣어 주세요' : null
    const t = this.tables.find(t => t.id === at.id)!
    if (t.status === 'dirty') {
      if (this.carry.length || this.sake) return '음식을 서빙하거나 반납해 주세요'
      if (this.dirtyDishes.length >= DISHWASHING_PREVIEW.carryCapacity) return '식기가 가득 찼어요 · 세척기에 비워 주세요'
    } else if (this.dirtyDishes.length && !['clean', 'eating'].includes(t.status)) return '식기를 세척기에 넣어 주세요'
    return null
  }
  actionLabel() {
    const at = this.nearest()
    if (!at) return '가까이 이동해 주세요'
    const blocked = this.blockedReason(); if (blocked) return blocked
    if (at.kind === 'washer') return `식기 ${Math.min(this.dirtyDishes.length, DISHWASHING_PREVIEW.batchCapacity - this.washer.load.length)}테이블분 넣기`
    if (at.kind === 'orders') return this.held.length ? '주문표 전달' : '주문 전달대'
    if (at.kind === 'pickup') return '완성 접시 받기'
    if (at.kind === 'fridge') return '사케 꺼내기'
    if (at.kind === 'storage') return this.carry.length ? `꼬치 ${this.carry.length}접시 맡기기` : '보관한 꼬치 고르기'
    if (at.kind !== 'table') return '가까이 이동해 주세요'
    const t = this.tables.find(t => t.id === at.id)!
    return t.status === 'unreceived' ? `${t.id}번 주문 받기` : t.status === 'dirty' ? `${t.id}번 청소하기` : ['collected', 'cooking', 'ready'].includes(t.status) ? `${t.id}번 음식 전달` : STATUS_LABEL[t.status]
  }
  press() {
    if (this.storageOpen) return
    const at = this.nearest(); if (!at) return
    const blocked = this.blockedReason(); if (blocked) return this.changed(blocked)
    if (at.kind === 'washer') {
      const added = this.dirtyDishes.splice(0, DISHWASHING_PREVIEW.batchCapacity - this.washer.load.length)
      this.washer.load.push(...added)
      this.score += added.length * 3
      this.washer.remaining = DISHWASHING_PREVIEW.cycleSeconds
      this.changed(`세척기 투입 +${added.length * 3}점! 마지막 투입부터 8초간 세척해요.`); return
    }
    if (at.kind === 'orders') {
      if (!this.held.length) return this.changed('손님에게 받은 주문표를 먼저 가져오세요.')
      this.held.forEach(id => { const t = this.tables.find(t => t.id === id)!; t.status = 'cooking'; this.kitchen.push(...t.bill!.dishes.map(d => ({ ...d }))) })
      this.held = []; this.changed('주문표를 주방에 전달했어요.'); return
    }
    if (at.kind === 'pickup') {
      if (this.carry.length >= 2) return this.changed('접시 두 개를 들고 있어요. 먼저 서빙해 주세요.')
      const dish = this.pass.shift(); if (!dish) return this.changed('완성된 접시가 아직 없어요.')
      this.carry.push(dish); this.changed(`${dish.table}번 테이블 접시를 받았어요.`); return
    }
    if (at.kind === 'fridge') {
      if (this.sake >= 2) return this.changed('사케는 두 병까지 들 수 있어요.')
      this.sake++; this.changed('사케 한 병을 챙겼어요.'); return
    }
    if (at.kind === 'storage') {
      if (!this.carry.length) return this.openStorage()
      const count = this.carry.length
      this.stored.push(...this.carry.splice(0))
      this.changed(`꼬치 ${count}접시를 보관했어요. 테이블 번호와 메뉴를 그대로 보관해요.`); return
    }
    if (at.kind !== 'table') return
    const t = this.tables.find(t => t.id === at.id)!
    if (t.status === 'unreceived') {
      if (this.held.length >= 2) return this.changed('주문표 두 장을 주방에 먼저 전달해 주세요.')
      this.held.push(t.id); t.status = 'collected'; this.changed(`${t.id}번 테이블 주문을 받았어요.`); return
    }
    if (t.status === 'dirty') { this.clean = { table: t.id, progress: 0 }; this.changed(); return }
    if (t.status === 'clean' || t.status === 'eating' || !t.bill) return
    const matchingDish = this.carry.some(dish => dish.table === t.id && t.bill!.dishes.some(d => d.id === dish.id && !d.delivered))
    const sake = Math.min(this.sake, t.bill.sake - t.bill.sakeDelivered)
    if (!matchingDish && !sake && (this.carry.length || this.sake)) {
      const penalty = Math.min(this.score, WRONG_DELIVERY_PENALTY)
      this.score -= penalty
      return this.changed(`오배송 -${penalty}점! ${t.id}번 주문과 달라요. 음식은 트레이에 남아 있어요.`)
    }
    let delivered = 0
    this.carry = this.carry.filter(dish => {
      if (dish.table !== t.id) return true
      const requested = t.bill!.dishes.find(d => d.id === dish.id)
      if (!requested || requested.delivered) return true
      requested.delivered = true; delivered++; this.score += previewDishPoints(requested.recipe); return false
    })
    this.sake -= sake; t.bill.sakeDelivered += sake
    this.score += sake * 30
    if (t.bill.dishes.every(d => d.delivered) && t.bill.sakeDelivered === t.bill.sake) { t.status = 'eating'; t.eatUntil = this.elapsed + 6.5; this.served++ }
    this.changed(delivered + sake ? `${t.id}번에 접시 ${delivered}개 · 사케 ${sake}병을 전달했어요.` : '이 테이블에 맞는 음식과 사케를 가져오세요.')
  }
  secondaryLabel(): string | null {
    const at = this.nearest()
    if (at?.kind === 'fridge' && this.sake) return `사케 ${this.sake}병 반납`
    if (at?.kind === 'storage' && this.stored.length) return '보관한 꼬치 받기'
    return null
  }
  secondaryBlockedReason(): string | null {
    if (this.finished) return '영업이 끝났어요'
    if (this.dirtyDishes.length) return '식기를 세척기에 넣어 주세요'
    if (this.nearest()?.kind === 'storage' && this.carry.length >= 2) return '접시 두 개를 먼저 서빙하거나 맡겨 주세요'
    return null
  }
  pressSecondary() {
    if (this.storageOpen || !this.secondaryLabel()) return
    const blocked = this.secondaryBlockedReason(); if (blocked) return this.changed(blocked)
    if (this.nearest()?.kind === 'fridge') {
      const count = this.sake; this.sake = 0
      this.changed(`사케 ${count}병을 냉장고에 반납했어요.`)
    } else this.openStorage()
  }
  private openStorage() {
    if (this.finished || this.nearest()?.kind !== 'storage') return
    const blocked = this.secondaryBlockedReason(); if (blocked) return this.changed(blocked)
    if (!this.stored.length) return this.changed('보관한 꼬치가 없어요.')
    this.path = []; this.clean = null; this.storageOpen = true; this.changed()
  }
  closeStorage() { if (this.storageOpen) { this.storageOpen = false; this.changed() } }
  takeStored(id: string) {
    if (!this.storageOpen || this.finished || this.nearest()?.kind !== 'storage') return
    const blocked = this.secondaryBlockedReason(); if (blocked) return this.changed(blocked)
    const index = this.stored.findIndex(dish => dish.id === id)
    if (index < 0) return this.changed('이미 가져간 접시예요. 남은 접시를 골라 주세요.')
    const [dish] = this.stored.splice(index, 1); this.carry.push(dish); this.storageOpen = false
    this.changed(`${dish.table}번 보관 접시를 받았어요.`)
  }
  release() { if (this.clean) { this.clean = null; this.changed('청소를 멈췄어요. E를 계속 눌러주세요.') } }
  step(seconds: number, dx = 0, dz = 0) {
    if (this.finished) return
    const clockDelta = Math.min(Math.max(0, seconds), BUSINESS_PREVIEW_SECONDS - this.elapsed), dt = Math.min(.05, clockDelta)
    this.elapsed += clockDelta
    if (this.finished) { this.clean = null; this.path = []; this.storageOpen = false; this.changed('영업을 마쳤어요.'); return }
    if (this.storageOpen) { dx = 0; dz = 0 }
    if (this.message && this.elapsed - this.messageAt > 3.5) { this.message = ''; this.revision++ }
    if (dx || dz) { this.path = []; this.release() }
    while (!dx && !dz && this.path[0] && distance(this.position, this.path[0]) < .14) this.path.shift()
    if (!dx && !dz && this.path[0]) { dx = this.path[0].x - this.position.x; dz = this.path[0].z - this.position.z; const n = Math.hypot(dx, dz); dx /= n; dz /= n }
    if (dx || dz) this.position = move(this.position, dx, dz, dt)
    if (this.clean) {
      const at = this.nearest()
      if (dx || dz || at?.kind !== 'table' || at.id !== this.clean.table) this.release()
      else {
        this.clean.progress += clockDelta / 1.5
        if (this.clean.progress >= 1) {
          const t = this.tables.find(t => t.id === this.clean!.table)!
          this.dirtyDishes.push({ id: this.nextDirtyId++, table: t.id, settings: t.bill ? (t.bill.dishes.length === 2 ? 2 : 1) : TABLES[t.id - 1].capacity })
          this.score += 4
          t.status = 'clean'; t.bill = null; this.clean = null
          this.changed(`${t.id}번 정리 +2점 · 식기 수거 +2점! 식기를 세척기에 넣어 주세요.`)
        }
      }
    }
    if (this.washer.load.length) {
      this.washer.remaining = Math.max(0, this.washer.remaining - clockDelta)
      if (this.washer.remaining === 0) {
        this.washer.completed += this.washer.load.length; this.washer.load = []
        this.changed('자동 세척을 마쳤어요. 다음 식기를 넣을 수 있어요.')
      }
    }
    for (const t of this.tables) if (t.status === 'eating' && t.eatUntil !== null && this.elapsed >= t.eatUntil) { t.status = 'dirty'; t.people = 0; t.eatUntil = null; this.changed() }
    if (this.elapsed >= this.nextArrival) {
      this.nextArrival = this.elapsed + 12
      const twoWaiting = this.queue.some(p => p.size === 2)
      for (const party of this.queue) {
        const target = this.tables.filter(t => t.status === 'clean').sort((a, b) => TABLES[a.id - 1].capacity - TABLES[b.id - 1].capacity).find(t => TABLES[t.id - 1].capacity === party.size || party.size === 1 && !twoWaiting)
        if (!target) continue
        target.status = 'unreceived'; target.people = party.size; target.bill = bill(target.id, party.size, party.size)
        this.queue = this.queue.filter(p => p.id !== party.id); this.changed(); break
      }
    }
  }
  view(): HallView { return { position: { ...this.position }, tables: this.tables.map(t => ({ ...t })), held: [...this.held], carry: [...this.carry], sake: this.sake, dirtyDishes: this.dirtyDishes.map(d => ({ ...d })), washer: { ...this.washer, load: this.washer.load.map(d => ({ ...d })) }, pass: [...this.pass], stored: this.stored.map(d => ({ ...d, recipe: [...d.recipe] })), storageOpen: this.storageOpen, queue: [...this.queue], kitchen: [...this.kitchen], clean: this.clean ? { ...this.clean } : null, message: this.message, revision: this.revision, elapsed: this.elapsed, score: this.score, remaining: Math.max(0, BUSINESS_PREVIEW_SECONDS - this.elapsed), finished: this.finished, served: this.served } }
}
