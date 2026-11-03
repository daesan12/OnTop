import { describe, expect, it } from 'vitest'
import { createDeck, SKEWER_TIP } from '../../src/features/skewer/game'
import { foodPositions, assembledFoodScale } from '../../src/features/skewer/foodModels'

describe('독립 큐브의 꼬치 배치', () => {
  it('두 번째 큐브를 꽂아도 앞서 꽂은 음식의 위치가 변하지 않는다', () => {
    const recipe = ['tomato', 'cheese', 'shrimp', 'cheese', 'beef'] as const
    const positions = foodPositions(recipe)
    expect(foodPositions(recipe.slice(0, 3))).toEqual(positions.slice(0, 3))
    expect(positions[1] - positions[0]).toBeCloseTo(.148)
    expect(positions[3] - positions[2]).toBeCloseTo(.148)
  })
  it('모든 주문에서 큐브끼리 겹치지 않고 열 조각까지 꼬치 안에 들어간다', () => {
    for (const card of createDeck(() => .5)) {
      if (card.kind !== 'order') continue
      const positions = foodPositions(card.recipe)
      expect(positions).toHaveLength(card.recipe.length)
      for (let i = 1; i < positions.length; i++) expect(positions[i] - positions[i - 1]).toBeGreaterThan(.14 * assembledFoodScale(card.recipe))
      expect(positions.at(-1)! + .074 * assembledFoodScale(card.recipe)).toBeLessThan(SKEWER_TIP.x)
    }
  })
})
