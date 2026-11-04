import { describe, expect, it } from 'vitest'
import { HallPreview } from '../../src/features/skewer/serviceHall/previewModel'
import { actionUnavailable, nextTask } from '../../src/features/skewer/serviceHall/ServiceHud'
import { groupOrderDishes } from '../../src/features/skewer/serviceHall/orderSummary'
import { menuSkewerIllustration } from '../../src/features/skewer/serviceHall/menuSkewerIllustration'

describe('서빙 HUD의 행동 안내', () => {
  it('동일한 꼬치만 수량으로 묶고 재료 순서가 다른 주문은 별도로 보여준다', () => {
    const recipe = ['tomato', 'cheese', 'pepper'] as const
    const reversed = [...recipe].reverse()
    const dishes = [{ recipe }, { recipe: [...recipe] }, { recipe: reversed }]
    const groups = groupOrderDishes(dishes)
    expect(groups.map(g => g.count)).toEqual([2, 1])
    expect(groups.map(g => g.recipe)).toEqual([recipe, reversed])
    expect(dishes).toHaveLength(3)
    expect(groupOrderDishes([])).toEqual([])
  })
  it('남은 주문 그림을 요약해도 전달된 메뉴를 다시 합산하지 않는다', () => {
    const model = new HallPreview(), dishes = model.tables[5].bill!.dishes
    dishes[0].delivered = true
    expect(groupOrderDishes(dishes.filter(d => !d.delivered)).reduce((count, g) => count + g.count, 0)).toBe(dishes.length - 1)
  })
  it('비스듬한 주문 그림도 큐브와 새우를 포함한 조립 순서를 보존한다', () => {
    const recipe = ['cheese', 'bacon', 'shrimp', 'cheese', 'pepper', 'bacon'] as const
    const picture = menuSkewerIllustration(recipe, true)
    expect([...picture.matchAll(/data-ingredient="([^"]+)"/g)].map(m => m[1])).toEqual(recipe)
    expect(picture).toContain('rotate(-19 ')
  })
  it('다른 테이블 음식도 전달을 시도할 수 있으며 빈손만 차단한다', () => {
    const model = new HallPreview()
    model.tables[0].status = 'cooking'
    model.carry = [model.pass[0]]
    expect(actionUnavailable(model.view(), { kind: 'table', id: 1 })).toBeNull()
    model.sake = 1
    expect(actionUnavailable(model.view(), { kind: 'table', id: 1 })).toBeNull()
    model.tables[0].bill!.sakeDelivered = 1
    expect(actionUnavailable(model.view(), { kind: 'table', id: 1 })).toBeNull()
    model.carry = []; model.sake = 0
    expect(actionUnavailable(model.view(), { kind: 'table', id: 1 })).toContain('먼저 가져오세요')
  })
  it('이미 전달한 메뉴라도 트레이에 남아 있으면 전달 시도는 허용하고 판정은 모델이 맡는다', () => {
    const model = new HallPreview()
    model.carry = [model.pass[0]]
    expect(actionUnavailable(model.view(), { kind: 'table', id: 6 })).toBeNull()
    model.tables[5].bill!.dishes[0].delivered = true
    expect(actionUnavailable(model.view(), { kind: 'table', id: 6 })).toBeNull()
  })
  it('접시와 주문표가 가득 찬 경우 내려놓거나 전달할 곳을 알려준다', () => {
    const model = new HallPreview()
    model.carry = [...model.pass]
    model.held = [4, 6]
    expect(actionUnavailable(model.view(), { kind: 'pickup' })).toContain('보관')
    expect(actionUnavailable(model.view(), { kind: 'table', id: 1 })).toContain('주방')
    model.sake = 2
    expect(actionUnavailable(model.view(), { kind: 'fridge' })).toContain('R로 반납')
  })
  it('주문표를 들고 있어도 식기 운반 중이면 세척을 먼저 안내한다', () => {
    const model = new HallPreview()
    model.held = [1]
    model.dirtyDishes = [{ id: 1, table: 2, settings: 1 }]
    expect(nextTask(model.view())).toContain('세척기')
    model.dirtyDishes = []
    expect(nextTask(model.view())).toContain('주방 전달대')
  })
})
