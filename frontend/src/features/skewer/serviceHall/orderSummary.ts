import type { IngredientId } from '../game'

/** Group only identical assemblies. Reversed/different recipes keep their own pictures. */
export function groupOrderDishes(dishes: readonly { recipe: readonly IngredientId[] }[]) {
  const groups = new Map<string, { key: string; recipe: readonly IngredientId[]; count: number }>()
  for (const dish of dishes) {
    const key = dish.recipe.join(',')
    const existing = groups.get(key)
    if (existing) existing.count++
    else groups.set(key, { key, recipe: dish.recipe, count: 1 })
  }
  return [...groups.values()]
}
