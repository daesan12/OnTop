import { describe, expect, it } from 'vitest'
import { ChefPreview, insertionReady } from '../../src/features/skewer/chef/model'
import type { IngredientId } from '../../src/features/skewer/game'
const cook = (m: ChefPreview, recipe: readonly IngredientId[]) => recipe.forEach(ingredient => m.action({ type: 'thread', ingredient }))
describe('협동 꼬치 요리사 로컬 프리뷰', () => {
  it.each(['cheese', 'bacon'] as const)('%s는 조립 중 한 개를 허용하되 제출은 막고 네 번째 조각을 거절한다', ingredient => {
    const m = new ChefPreview()
    cook(m, [ingredient]); m.action({ type: 'submit' })
    expect(m.view().message).toContain('2~3개'); expect(m.view().skewer).toEqual([ingredient]); expect(m.view().pass).toHaveLength(0)
    cook(m, [ingredient]); expect(m.view().skewer).toEqual([ingredient])
    cook(m, ['tomato', ingredient, 'pepper', ingredient]); expect(m.view().skewer).toEqual([ingredient, 'tomato', ingredient, 'pepper', ingredient])
    cook(m, ['shrimp', ingredient]); expect(m.view().skewer).toHaveLength(6)
    m.action({ type: 'unthread' }); expect(m.view().skewer).toHaveLength(5)
  })
  it('세 조각 베이컨 주문을 실제로 조립해 제출할 수 있다', () => {
    const m = new ChefPreview()
    for (let i = 0; i < 2; i++) { cook(m, m.view().visible[0].recipe); m.action({ type: 'submit' }); m.action({ type: 'pickup' }) }
    m.action({ type: 'choose', id: 'sample-06' })
    const recipe = m.view().visible.find(job => job.table === 6)!.recipe
    expect(recipe.filter(id => id === 'bacon')).toHaveLength(3)
    cook(m, recipe); m.action({ type: 'submit' }); expect(m.view().pass[0].recipe).toEqual(recipe)
  })
  it('전달받은 앞의 두 장만 공개하며 뒷면 주문을 선택할 수 없다', () => {
    const m = new ChefPreview(), v = m.view(); expect(v.visible.map(j => j.table)).toEqual([1, 4]); expect(v.waiting).toBe(2)
    m.action({ type: 'choose', id: 'sample-03' }); expect(m.view().selectedJob).toBe('sample-01')
    m.clearIncoming(); expect(m.view().visible).toHaveLength(0); m.action({ type: 'thread', ingredient: 'tomato' }); expect(m.view().skewer).toHaveLength(0)
    m.receiveSamples(); expect(m.view().visible).toHaveLength(2)
  })
  it('틀린 주문도 실제 재료로 제출하고 제작 수와 배치를 한 번만 갱신한다', () => {
    const m = new ChefPreview(), before = m.view().pantry
    cook(m, ['tomato', 'shrimp']); m.action({ type: 'unthread' }); expect(m.view().skewer).toEqual(['tomato'])
    cook(m, ['pepper']); m.action({ type: 'submit' })
    expect(m.view().pass[0].recipe).toEqual(['tomato', 'pepper'])
    expect(m.view().completed).toBe(1); expect(m.view().pantry).not.toEqual(before)
    expect([...m.view().pantry!].sort()).toEqual([...before!].sort())
    expect(m.view().visible.map(j => j.table)).toEqual([4, 3])
    m.action({ type: 'submit' }); expect(m.view().completed).toBe(1)
  })
  it('큐브 사이 두 재료를 넣은 뒤 같은 큐브를 추가할 수 없고 끝에서 수정할 수 있다', () => {
    const m = new ChefPreview(); cook(m, ['cheese', 'tomato', 'pepper', 'cheese'])
    expect(m.view().skewer).toEqual(['cheese', 'tomato', 'pepper'])
    m.action({ type: 'unthread' }); cook(m, ['cheese'])
    expect(m.view().skewer).toEqual(['cheese', 'tomato', 'cheese'])
  })
  it('큐브 순서의 정반대 조립을 허용하고 수량 초과는 막는다', () => {
    const m = new ChefPreview(); m.action({ type: 'choose', id: 'sample-04' }); const recipe = [...m.view().visible[1].recipe].reverse()
    cook(m, recipe); m.action({ type: 'thread', ingredient: 'beef' }); expect(m.view().skewer).toEqual(recipe); m.action({ type: 'submit' }); expect(m.view().pass[0].table).toBe(4)
  })
  it('완성 접시 두 개에서 제출을 막고 수령 후 다시 제출할 수 있다', () => {
    const m = new ChefPreview()
    for (let i = 0; i < 2; i++) { cook(m, m.view().visible[0].recipe); m.action({ type: 'submit' }) }
    cook(m, m.view().visible[0].recipe); const built = m.view().skewer; m.action({ type: 'submit' }); expect(m.view().pass).toHaveLength(2); expect(m.view().skewer).toEqual(built)
    m.action({ type: 'pickup' }); m.action({ type: 'submit' }); expect(m.view().pass.map(j => j.table)).toEqual([4, 3]); expect(m.view().skewer).toHaveLength(0)
  })
  it('첫 조립 전에는 시간이 흐르지 않고 4분이 지나면 추가 조립을 막는다', () => {
    const m = new ChefPreview(); m.step(.1); expect(m.view().seconds).toBe(240); cook(m, ['tomato']); for (let i = 0; i < 2401; i++) m.step(.1)
    expect(m.view().seconds).toBe(0); m.action({ type: 'thread', ingredient: 'pepper' }); expect(m.view().skewer).toEqual(['tomato'])
  })
  it('VR 삽입은 거리와 방향을 모두 만족해야 하며 비정상 좌표를 거절한다', () => {
    expect(insertionReady(.1, .95)).toBe(true); expect(insertionReady(.1, -.95)).toBe(true)
    expect(insertionReady(.3, 1)).toBe(false); expect(insertionReady(.1, .3)).toBe(false); expect(insertionReady(NaN, 1)).toBe(false); expect(insertionReady(-.1, 1)).toBe(false)
  })
})
