import { describe, expect, it } from 'vitest'
import { followRoute, TABLES, STATIONS, START, ROOM, distance, move, route, walkable, tableApproaches, tableDestination } from '../../src/features/skewer/serviceHall/plan'
import { BUSINESS_PREVIEW_SECONDS, DISHWASHING_PREVIEW, HallPreview } from '../../src/features/skewer/serviceHall/previewModel'
const advance = (model: HallPreview, seconds: number) => { for (let i = 0; i < Math.ceil(seconds / .05); i++) model.step(.05) }
describe('새 꼬치왕 매장 동선 프리뷰', () => {
  it('오배송은 10점을 차감하고 음식과 주문을 보존해 올바른 테이블에 다시 전달한다', () => {
    const m = new HallPreview(); m.score = 40; m.carry = [m.pass[0]]
    m.position = { ...TABLES[0].approach }; m.press()
    expect(m.score).toBe(40) // 주문 접수는 오배송이 아니다.
    const before = structuredClone(m.tables[0].bill), dish = m.carry[0]
    m.press()
    expect(m.score).toBe(30); expect(m.message).toContain('오배송 -10점')
    expect(m.carry).toEqual([dish]); expect(m.tables[0].bill).toEqual(before); expect(m.served).toBe(0)
    m.position = { ...TABLES[5].approach }; m.press()
    expect(m.carry).toHaveLength(0); expect(m.tables[5].bill!.dishes[0].delivered).toBe(true)
    expect(m.score).toBeGreaterThan(30); expect(m.message).not.toContain('오배송')
  })
  it('불필요한 사케도 오배송이며 감점은 0점까지만 적용하고 빈손은 감점하지 않는다', () => {
    const m = new HallPreview(); m.score = 5; m.sake = 1; m.tables[0].status = 'cooking'; m.tables[0].bill!.sakeDelivered = 1
    m.position = { ...TABLES[0].approach }; m.press()
    expect(m.score).toBe(0); expect(m.sake).toBe(1); expect(m.message).toContain('오배송 -5점')
    m.press(); expect(m.score).toBe(0)
    m.score = 20; m.sake = 0; m.press(); expect(m.score).toBe(20)
  })
  it('다른 테이블 꼬치를 들었어도 맞는 사케를 전달하면 감점하지 않는다', () => {
    const m = new HallPreview(); m.score = 40; m.carry = [m.pass[0]]; m.sake = 1
    m.tables[0].status = 'cooking'; m.position = { ...TABLES[0].approach }; m.press()
    expect(m.score).toBe(70); expect(m.carry).toHaveLength(1); expect(m.sake).toBe(0)
    expect(m.message).not.toContain('오배송')
  })
  it('두 테이블 꼬치를 함께 들면 해당 테이블 접시만 정상 전달하고 나머지는 보존한다', () => {
    const m = new HallPreview(); m.score = 40
    m.tables[0].status = 'cooking'
    const other = m.pass[0]
    m.carry = [{ ...m.tables[0].bill!.dishes[0] }, other]
    m.position = { ...TABLES[0].approach }; m.press()
    expect(m.carry).toEqual([other]); expect(m.tables[0].bill!.dishes[0].delivered).toBe(true)
    expect(m.score).toBe(140); expect(m.message).not.toContain('오배송')
  })
  it('1인석 세 곳과 2인 테이블 세 곳의 접근점이 모두 연결된다', () => {
    expect(TABLES.filter(t => t.capacity === 1)).toHaveLength(3); expect(TABLES.filter(t => t.capacity === 2)).toHaveLength(3)
    expect(TABLES.flatMap(t => t.seats)).toHaveLength(9)
    // A continuous middle aisle and two cross aisles connect every serving column.
    expect(ROOM.width * ROOM.depth).toBeGreaterThan(20 * 11.4 * 1.5)
    for (let x = -10.5; x <= 10.5; x += .25) for (const z of [-.2, 1.15, 2.2]) expect(walkable({ x, z })).toBe(true)
    for (const x of [-3.75, 3.75]) for (let z = -4.25; z <= 6.5; z += .25) expect(walkable({ x, z })).toBe(true)
    const points = [START, ...TABLES.flatMap(tableApproaches), ...Object.values(STATIONS)]
    for (const from of points) for (const to of points) {
      if (distance(from, to) < .01) continue
      const path = route(from, to); expect(path.length, `${JSON.stringify(from)} → ${JSON.stringify(to)}`).toBeGreaterThan(0); expect(path.every(walkable)).toBe(true)
      let p = from
      for (let step = 0; step < 3000 && path.length; step++) {
        p = followRoute(p, path, .05); expect(walkable(p)).toBe(true)
      }
      expect(distance(p, to), JSON.stringify({ from, to, p, next: path[0] })).toBeLessThan(.20)
    }
  })
  it('의자·테이블 중심을 통과하지 않으며 대각선 이동도 빨라지지 않는다', () => {
    TABLES.forEach(t => { expect(walkable(t)).toBe(false); t.seats.forEach(s => expect(walkable(s)).toBe(false)) })
    const p = { x: -2.8, z: .5 }
    expect(distance(p, move(p, 1, 1, .05))).toBeCloseTo(distance(p, move(p, 1, 0, .05)))
  })
  it('의자가 막지 않는 테이블의 여러 면에서 상호작용하며 가까운 면으로 이동한다', () => {
    for (const t of TABLES) for (const p of tableApproaches(t)) {
      const m = new HallPreview(); m.position = { ...p }
      expect(m.nearest()).toEqual({ kind: 'table', id: t.id }); expect(tableDestination(p, t)).toEqual(p)
    }
    const m = new HallPreview(); m.position = { x: TABLES[0].x - 1.4, z: TABLES[0].z }; m.press(); expect(m.held).toEqual([1])
    m.position = { x: TABLES[1].x + 1.4, z: TABLES[1].z }; m.press(); advance(m, 1.6); expect(m.tables[1].status).toBe('clean')
  })
  it('테이블 주문서 한 장에서 인원수만큼 꼬치 미션을 만들어 주방에 전달한다', () => {
    const m = new HallPreview(); expect(m.kitchen).toHaveLength(0)
    m.position = { ...TABLES[3].approach }; m.press(); expect(m.held).toEqual([4]); expect(m.kitchen).toHaveLength(0)
    m.position = { ...STATIONS.orders }; m.press(); expect(m.kitchen).toHaveLength(2); expect(m.kitchen.every(d => d.table === 4)).toBe(true); expect(m.held).toHaveLength(0)
  })
  it('접시 두 개와 사케 두 병을 운반하고 테이블에 맞는 메뉴만 전달한다', () => {
    const m = new HallPreview(); m.position = { ...STATIONS.pickup }; m.press(); m.press(); m.press(); expect(m.carry).toHaveLength(2)
    m.position = { ...STATIONS.fridge }; m.press(); m.press(); m.press(); expect(m.sake).toBe(2)
    m.position = { ...TABLES[5].approach }; m.press()
    expect(m.carry).toHaveLength(0); expect(m.sake).toBe(0); expect(m.tables[5].status).toBe('eating')
    expect(m.tables[5].bill!.dishes.every(d => d.delivered)).toBe(true); expect(m.tables[5].bill!.sakeDelivered).toBe(2)
  })
  it('청소는 1.5초 유지해야 끝나며 이동하거나 손을 떼면 취소된다', () => {
    const m = new HallPreview(); m.position = { ...TABLES[1].approach }; m.press(); advance(m, .6); m.release()
    expect(m.tables[1].status).toBe('dirty'); expect(m.clean).toBeNull()
    expect(m.dirtyDishes).toHaveLength(0); expect(m.score).toBe(0)
    m.press(); m.step(.05, 1, 0); expect(m.clean).toBeNull(); expect(m.tables[1].status).toBe('dirty')
    m.position = { ...TABLES[1].approach }; m.press(); advance(m, 1.45); expect(m.tables[1].status).toBe('dirty'); advance(m, .1)
    expect(m.tables[1].status).toBe('clean')
    expect(m.dirtyDishes).toEqual([{ id: 1, table: 2, settings: 1 }])
    expect(m.score).toBe(4)
    m.position = { ...STATIONS.washer }; m.press(); expect(m.score).toBe(7)
    m.press(); advance(m, 8.1); expect(m.score).toBe(7)
  })
  it('입구 대기 손님은 깨끗한 알맞은 자리에 앉고 더러운 자리는 선택하지 않는다', () => {
    const m = new HallPreview(); advance(m, 12.1)
    expect(m.tables[2].status).toBe('unreceived'); expect(m.tables[2].people).toBe(1); expect(m.queue.map(p => p.id)).toEqual([2, 3])
    expect(m.tables[1].status).toBe('dirty')
  })
  it('꼬치 또는 사케를 하나라도 들고 있으면 테이블 정리와 식기 수거를 시작하지 않는다', () => {
    for (const food of ['skewer', 'sake']) {
      const m = new HallPreview()
      m.position = { ...STATIONS[food === 'skewer' ? 'pickup' : 'fridge'] }; m.press()
      m.position = { ...TABLES[1].approach }; m.press(); advance(m, 2)
      expect(m.clean).toBeNull(); expect(m.tables[1].status).toBe('dirty'); expect(m.dirtyDishes).toHaveLength(0)
      expect(m.message).toContain('서빙하거나 반납')
      expect(m.carry.length + m.sake).toBe(1)
    }
  })
  it('식기를 들면 새 주문 접수·기존 주문 전달·접시와 사케 수령을 모두 차단한다', () => {
    const m = new HallPreview()
    m.position = { ...TABLES[0].approach }; m.press()
    m.position = { ...TABLES[1].approach }; m.press(); advance(m, 1.6); m.release()
    const passIds = m.pass.map(d => d.id)
    for (const point of [TABLES[3].approach, STATIONS.orders, STATIONS.pickup, STATIONS.fridge]) {
      m.position = { ...point }; expect(m.blockedReason()).toContain('식기를 세척기에'); m.press()
      expect(m.held).toEqual([1]); expect(m.tables[0].status).toBe('collected'); expect(m.tables[3].status).toBe('unreceived')
      expect(m.kitchen).toHaveLength(0); expect(m.carry).toHaveLength(0); expect(m.sake).toBe(0); expect(m.pass.map(d => d.id)).toEqual(passIds)
      expect(m.dirtyDishes).toHaveLength(1)
    }
  })
  it('식기는 두 테이블분까지 수거하며 세 번째 테이블은 상태를 보존한다', () => {
    const m = new HallPreview()
    m.position = { ...TABLES[1].approach }; m.press(); advance(m, 1.6)
    advance(m, 8)
    m.position = { ...TABLES[4].approach }; m.press(); advance(m, 1.6)
    expect(m.dirtyDishes.map(d => [d.table, d.settings])).toEqual([[2, 1], [5, 2]])
    m.tables[5].status = 'dirty'; m.tables[5].people = 0
    m.position = { ...TABLES[5].approach }; m.press(); advance(m, 2)
    expect(m.clean).toBeNull(); expect(m.tables[5].status).toBe('dirty'); expect(m.dirtyDishes).toHaveLength(DISHWASHING_PREVIEW.carryCapacity)
    expect(m.message).toContain('가득')
  })
  it('세척기에 투입하면 즉시 빈손이 되고 기존 주문표를 전달하며 세척은 자동 완료된다', () => {
    const m = new HallPreview()
    m.position = { ...TABLES[0].approach }; m.press()
    m.position = { ...TABLES[1].approach }; m.press(); advance(m, 1.6)
    const bundle = { ...m.dirtyDishes[0] }
    m.position = { ...STATIONS.washer }; m.press()
    expect(m.dirtyDishes).toHaveLength(0); expect(m.washer.load).toEqual([bundle]); expect(m.held).toEqual([1])
    const remaining = m.washer.remaining
    m.press(); expect(m.washer.load).toEqual([bundle]); expect(m.washer.remaining).toBe(remaining)
    m.position = { ...STATIONS.orders }; m.press(); expect(m.tables[0].status).toBe('cooking'); expect(m.kitchen).toHaveLength(1)
    m.position = { ...STATIONS.pickup }; m.press(); expect(m.carry).toHaveLength(1)
    advance(m, DISHWASHING_PREVIEW.cycleSeconds + .2)
    expect(m.washer).toEqual({ load: [], remaining: 0, completed: 1 }); expect(m.carry).toHaveLength(1)
    advance(m, 1); expect(m.washer.completed).toBe(1)
  })
  it('세척 중 빈칸에 다음 식기를 넣고 새 투입분만 점수를 받는다', () => {
    const m = new HallPreview()
    m.position = { ...TABLES[1].approach }; m.press(); advance(m, 1.6)
    m.position = { ...STATIONS.washer }; m.press()
    m.tables[4].status = 'dirty'; m.tables[4].people = 0
    m.position = { ...TABLES[4].approach }; m.press(); advance(m, 1.6)
    const score = m.score
    m.position = { ...STATIONS.washer }; m.press()
    expect(m.dirtyDishes).toHaveLength(0); expect(m.washer.load.map(d => d.table)).toEqual([2, 5])
    expect(m.score).toBe(score + 3)
    expect(m.washer.remaining).toBe(DISHWASHING_PREVIEW.cycleSeconds)
    m.dirtyDishes.push({ id: 99, table: 3, settings: 1 })
    m.press(); expect(m.dirtyDishes).toHaveLength(1); expect(m.score).toBe(score + 3)
    advance(m, DISHWASHING_PREVIEW.cycleSeconds + .1)
    expect(m.washer.completed).toBe(2)
    m.press(); expect(m.dirtyDishes).toHaveLength(0); expect(m.washer.load.map(d => d.table)).toEqual([3])
  })
  it('식기를 아직 세척하지 않아도 수거한 테이블에는 다음 손님이 앉는다', () => {
    const m = new HallPreview()
    m.position = { ...TABLES[1].approach }; m.press(); advance(m, 1.6)
    advance(m, 24)
    expect(m.tables[1].status).toBe('unreceived'); expect(m.tables[1].people).toBe(1)
    expect(m.dirtyDishes).toHaveLength(1); expect(m.washer.load).toHaveLength(0)
  })
  it('식기와 세척기 스냅샷 수정으로 실제 운반 상태를 바꾸지 않는다', () => {
    const m = new HallPreview()
    m.position = { ...TABLES[1].approach }; m.press(); advance(m, 1.6)
    m.view().dirtyDishes[0].table = 99; expect(m.dirtyDishes[0].table).toBe(2)
    m.position = { ...STATIONS.washer }; m.press()
    const view = m.view(); view.washer.load[0].table = 99; view.washer.remaining = 0
    expect(m.washer.load[0].table).toBe(2); expect(m.washer.remaining).toBe(DISHWASHING_PREVIEW.cycleSeconds)
  })
  it('화면 점수는 수령이 아닌 실제 메뉴 전달 시 올라가며 반복 입력으로 중복되지 않는다', () => {
    const m = new HallPreview(); expect(m.view().score).toBe(0)
    m.position = { ...STATIONS.pickup }; m.press(); m.press()
    m.position = { ...STATIONS.fridge }; m.press(); m.press(); expect(m.score).toBe(0)
    m.position = { ...TABLES[5].approach }; m.press(); expect(m.view().score).toBe(400); expect(m.served).toBe(1)
    m.press(); expect(m.score).toBe(400); expect(m.served).toBe(1)
  })
  it('4분 종료 시 영업 시간을 고정하고 이동·수령·진행 중 정리를 종료한다', () => {
    const m = new HallPreview(); expect(m.view().remaining).toBe(BUSINESS_PREVIEW_SECONDS)
    m.position = { ...TABLES[1].approach }; m.press(); m.elapsed = BUSINESS_PREVIEW_SECONDS - .01; m.step(.05)
    expect(m.view().remaining).toBe(0); expect(m.finished).toBe(true); expect(m.clean).toBeNull(); expect(m.dirtyDishes).toHaveLength(0)
    const position = { ...m.position }; m.navigate(STATIONS.fridge); m.step(.05, 1, 0); m.press()
    expect(m.position).toEqual(position); expect(m.score).toBe(0); expect(m.elapsed).toBe(BUSINESS_PREVIEW_SECONDS)
  })
  it('프레임이 느려져도 영업 시간과 청소 유지 시간은 같은 실제 시간으로 진행한다', () => {
    const smooth = new HallPreview(), slow = new HallPreview()
    for (const m of [smooth, slow]) { m.position = { ...TABLES[1].approach }; m.press() }
    for (let i = 0; i < 100; i++) smooth.step(.01)
    slow.step(1)
    expect(slow.view().remaining).toBeCloseTo(smooth.view().remaining)
    expect(slow.clean!.progress).toBeCloseTo(smooth.clean!.progress)
    slow.step(.51); advance(smooth, .51)
    expect(slow.dirtyDishes.map(d => d.table)).toEqual(smooth.dirtyDishes.map(d => d.table))
  })
  it('냉장고에서 사케를 전부 반납하며 접시·점수는 보존하고 반복 반납으로 수량이 음수가 되지 않는다', () => {
    const m = new HallPreview(); m.position = { ...STATIONS.pickup }; m.press()
    const dish = m.carry[0]
    m.position = { ...STATIONS.fridge }; m.press(); m.press()
    m.position = { ...TABLES[1].approach }; m.pressSecondary(); expect(m.sake).toBe(2)
    m.position = { ...STATIONS.fridge }; m.pressSecondary(); expect(m.sake).toBe(0); expect(m.carry).toEqual([dish])
    m.pressSecondary(); expect(m.sake).toBe(0); expect(m.score).toBe(0)
    m.press(); expect(m.sake).toBe(1)
  })
  it('주방 전달대가 가득 차 있어도 네 접시를 전용 보관대에 맡기고 정확한 접시를 선택해 받는다', () => {
    const m = new HallPreview()
    m.position = { ...STATIONS.pickup }; m.press(); m.press()
    const first = m.carry.map(d => ({ ...d, recipe: [...d.recipe] }))
    m.pass = m.tables[3].bill!.dishes.map(d => ({ ...d, recipe: [...d.recipe] }))
    m.position = { ...STATIONS.storage }; m.press()
    expect(m.pass).toHaveLength(2); expect(m.stored).toEqual(first); expect(m.carry).toHaveLength(0)
    m.position = { ...STATIONS.pickup }; m.press(); m.press()
    m.position = { ...STATIONS.storage }; m.press(); expect(m.stored).toHaveLength(4)
    m.press(); expect(m.storageOpen).toBe(true)
    const selected = m.stored[2]; m.takeStored(selected.id)
    expect(m.carry).toEqual([selected]); expect(m.stored).toHaveLength(3); expect(m.storageOpen).toBe(false)
    m.takeStored(selected.id); expect(m.carry).toHaveLength(1)
    m.pressSecondary(); m.takeStored(first[1].id)
    expect(m.carry.map(d => d.id)).toEqual([selected.id, first[1].id]); expect(m.score).toBe(0)
    m.pressSecondary(); expect(m.storageOpen).toBe(false)
    expect(new Set([...m.stored, ...m.carry].map(d => d.id)).size).toBe(4)
  })
  it('모든 테이블이 더러워도 사케 반납과 꼬치 보관으로 빈손이 되어 다시 청소할 수 있다', () => {
    const m = new HallPreview()
    m.position = { ...STATIONS.pickup }; m.press(); m.press()
    m.position = { ...STATIONS.fridge }; m.press(); m.press()
    m.tables.forEach(t => { t.status = 'dirty'; t.people = 0 })
    m.position = { ...TABLES[1].approach }; m.press(); expect(m.clean).toBeNull()
    m.position = { ...STATIONS.fridge }; m.pressSecondary()
    m.position = { ...TABLES[1].approach }; m.press(); expect(m.clean).toBeNull()
    m.position = { ...STATIONS.storage }; m.press()
    m.position = { ...TABLES[1].approach }; m.press(); advance(m, 1.6)
    expect(m.tables[1].status).toBe('clean'); expect(m.dirtyDishes).toHaveLength(1)
    expect(m.stored).toHaveLength(2); expect(m.sake).toBe(0); expect(m.carry).toHaveLength(0); expect(m.score).toBe(4)
  })
  it('식기 운반 중에는 보관 접시를 수령하지 못하고 기존 보관 내용도 보존한다', () => {
    const m = new HallPreview()
    m.position = { ...STATIONS.pickup }; m.press()
    m.position = { ...STATIONS.storage }; m.press(); const stored = m.view().stored
    m.position = { ...TABLES[1].approach }; m.press(); advance(m, 1.6)
    m.position = { ...STATIONS.storage }; m.press(); m.pressSecondary()
    expect(m.storageOpen).toBe(false); expect(m.stored).toEqual(stored); expect(m.carry).toHaveLength(0)
    m.storageOpen = true; m.takeStored(stored[0].id)
    expect(m.stored).toEqual(stored); expect(m.carry).toHaveLength(0); expect(m.dirtyDishes).toHaveLength(1)
  })
  it('보관 접시 선택 중 영업은 진행하고 이동과 다른 작업은 차단하며 취소해도 음식을 잃지 않는다', () => {
    const m = new HallPreview(); m.position = { ...STATIONS.pickup }; m.press()
    m.position = { ...STATIONS.storage }; m.press(); m.press()
    const before = m.view(); m.navigate(STATIONS.fridge); m.step(1, 1, 0); m.pressSecondary()
    expect(m.elapsed).toBe(before.elapsed + 1); expect(m.position).toEqual(before.position)
    m.takeStored('missing'); expect(m.stored).toEqual(before.stored)
    m.closeStorage(); expect(m.stored).toEqual(before.stored); expect(m.carry).toHaveLength(0)
  })
  it('보관 접시는 거리·종료·운반 용량을 검사하며 종료 시 자동 서빙이나 점수 지급을 하지 않는다', () => {
    const m = new HallPreview(); m.position = { ...STATIONS.pickup }; m.press(); m.press()
    m.position = { ...STATIONS.storage }; m.press(); m.press()
    const stored = m.view().stored
    m.position = { ...STATIONS.fridge }; m.takeStored(stored[0].id); expect(m.stored).toEqual(stored)
    m.position = { ...STATIONS.storage }; m.carry = [{ ...stored[0] }, { ...stored[1] }]
    m.takeStored(stored[0].id); expect(m.stored).toEqual(stored)
    m.carry = []; m.elapsed = BUSINESS_PREVIEW_SECONDS - .01; m.step(.05); m.takeStored(stored[0].id)
    expect(m.storageOpen).toBe(false); expect(m.stored).toEqual(stored); expect(m.carry).toHaveLength(0); expect(m.score).toBe(0)
  })
  it('보관 스냅샷의 메뉴를 바꿔도 실제 보관 중인 접시는 바뀌지 않는다', () => {
    const m = new HallPreview(); m.position = { ...STATIONS.pickup }; m.press()
    m.position = { ...STATIONS.storage }; m.press()
    const expected = [...m.stored[0].recipe], snapshot = m.view()
    snapshot.stored[0].recipe.reverse(); snapshot.stored[0].table = 99
    expect(m.stored[0].recipe).toEqual(expected); expect(m.stored[0].table).toBe(6)
  })
})
