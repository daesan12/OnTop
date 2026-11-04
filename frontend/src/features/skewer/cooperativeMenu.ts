import type { IngredientId } from './game'
import { INGREDIENTS, availablePieces, validRecipe } from './game'

/** Six cooperative menus with exactly one ingredient between repeated cubes.
 * One of each other ingredient; cheese/bacon are independent cubes, two or three when used.
 * These are original menus, not reproductions of the board game's printed cards. */
export const COOPERATIVE_RECIPES: readonly (readonly IngredientId[])[] = [
  ['tomato', 'cheese', 'pepper', 'cheese', 'shrimp', 'beef'],
  ['bacon', 'beef', 'bacon', 'tomato', 'shrimp', 'pepper'],
  ['cheese', 'shrimp', 'cheese', 'tomato', 'bacon', 'pepper', 'bacon', 'beef'],
  ['bacon', 'beef', 'bacon', 'cheese', 'pepper', 'cheese', 'shrimp', 'tomato'],
  ['cheese', 'pepper', 'cheese', 'tomato', 'cheese', 'bacon', 'shrimp', 'bacon', 'beef'],
  ['bacon', 'beef', 'bacon', 'shrimp', 'bacon', 'cheese', 'pepper', 'cheese', 'tomato'],
]
export function cooperativeRecipe(table: number, dish = 0): IngredientId[] {
  return [...COOPERATIVE_RECIPES[(table + dish - 1) % COOPERATIVE_RECIPES.length]]
}

/** Each repeated cube must have exactly one different ingredient between occurrences. */
export function canThreadCooperative(skewer: readonly IngredientId[], id: IngredientId): boolean {
  if (availablePieces(skewer, id) <= 0) return false
  const last = skewer.lastIndexOf(id)
  return id !== 'cheese' && id !== 'bacon' || last < 0 || skewer.length - last === 2
}

export function validCooperativeRecipe(recipe: readonly IngredientId[]): boolean {
  return recipe.length > 0 && validRecipe(recipe) && recipe.every((id, index) => canThreadCooperative(recipe.slice(0, index), id))
}

export const INITIAL_PANTRY = INGREDIENTS.map(item => item.id)
export function shuffledPantry(previous: readonly IngredientId[], random = Math.random): IngredientId[] {
  const next = [...previous]
  for (let i = next.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [next[i], next[j]] = [next[j], next[i]] }
  if (next.every((id, i) => id === previous[i])) next.push(next.shift()!)
  return next
}
