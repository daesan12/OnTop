import { describe, expect, it } from 'vitest'
import { COOPERATIVE_RECIPES, cooperativeRecipe, validCooperativeRecipe } from '../../src/features/skewer/cooperativeMenu'
import { availablePieces, matchesOrder, validRecipe } from '../../src/features/skewer/game'
import { ChefPreview } from '../../src/features/skewer/chef/model'
import { HallPreview } from '../../src/features/skewer/serviceHall/previewModel'
import { recipeIllustration } from '../../src/features/skewer/serviceHall/recipeIllustration'
import { menuSkewerIllustration } from '../../src/features/skewer/serviceHall/menuSkewerIllustration'
import { ORDER_ARTWORK } from '../../src/features/skewer/serviceHall/orderArtwork'
import type { IngredientId } from '../../src/features/skewer/game'

describe('협동 꼬치 메뉴의 실제 조립 가능성', () => {
  it('고해상도 주문 이미지 여섯 장은 큐브 개수와 순서까지 정확히 같은 레시피에만 연결한다', () => {
    expect([...ORDER_ARTWORK.keys()].sort()).toEqual(COOPERATIVE_RECIPES.map(r => r.join(',')).sort())
    expect(new Set(ORDER_ARTWORK.values()).size).toBe(6)
  })
  it('모든 주문은 큐브 사이 정확히 한 재료와 수량 제한을 지킨다', () => {
    for (const recipe of COOPERATIVE_RECIPES) {
      expect(validRecipe(recipe)).toBe(true)
      expect(validCooperativeRecipe(recipe)).toBe(true)
      for (const cube of ['cheese', 'bacon']) expect([0, 2, 3]).toContain(recipe.filter(id => id === cube).length)
      expect(recipe.filter(id => id !== 'cheese' && id !== 'bacon').sort()).toEqual(['beef', 'pepper', 'shrimp', 'tomato'])
      const built: typeof recipe[number][] = []
      for (const ingredient of recipe) { expect(availablePieces(built, ingredient)).toBeGreaterThan(0); built.push(ingredient) }
      expect(matchesOrder([...recipe].reverse(), recipe)).toBe(true)
    }
  })
  it('홀의 주문·전달대와 요리사의 주문이 같은 메뉴 기준을 사용한다', () => {
    const hall = new HallPreview(), chef = new ChefPreview()
    for (const job of chef.view().visible) expect(job.recipe).toEqual(hall.tables[job.table - 1].bill!.dishes[0].recipe)
    for (const dish of hall.pass) expect(dish.recipe).toEqual(hall.tables[dish.table - 1].bill!.dishes.find(d => d.id === dish.id)!.recipe)
    const copy = cooperativeRecipe(1); copy.pop(); expect(cooperativeRecipe(1)).toEqual(COOPERATIVE_RECIPES[0])
  })
  it('주문 그림에는 실제 조합의 재료와 독립 큐브만 표시하며 미지원 재료를 거절한다', () => {
    for (const recipe of COOPERATIVE_RECIPES) {
      const picture = recipeIllustration(recipe), guide = recipeIllustration(recipe, true)
      expect([...picture.matchAll(/data-ingredient="([^"]+)"/g)].map(m => m[1])).toEqual(recipe)
      expect(picture).not.toContain('data-wrap=')
      expect(guide.match(/data-step=/g)).toHaveLength(recipe.length)
      expect(guide).not.toMatch(/앞끝|뒤끝|감싸/)
      expect(picture).not.toMatch(/href=|<image|<script/)
      const menu = menuSkewerIllustration(recipe)
      expect([...menu.matchAll(/data-ingredient="([^"]+)"/g)].map(m => m[1])).toEqual(recipe)
      expect([...menuSkewerIllustration([...recipe].reverse()).matchAll(/data-ingredient="([^"]+)"/g)].map(m => m[1])).toEqual([...recipe].reverse())
      expect(menu).not.toMatch(/href=|<image|<script|data-wrap=/)
    }
    expect(recipeIllustration(['cheese', 'tomato'])).toContain('data-ingredient="cheese"')
    expect(() => recipeIllustration(['mushroom'] as unknown as IngredientId[])).toThrow('그릴 수 없는')
    expect(() => recipeIllustration(['beef', 'beef'])).toThrow('그릴 수 없는')
    expect(() => menuSkewerIllustration(['mushroom'] as unknown as IngredientId[])).toThrow('그릴 수 없는')
    expect(() => menuSkewerIllustration(['cheese', 'cheese', 'cheese', 'cheese'])).toThrow('그릴 수 없는')
  })
})
