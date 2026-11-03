import { memo } from 'react'
import type { IngredientId } from '../game'
import { recipeIllustration } from './recipeIllustration'
import { menuSkewerIllustration } from './menuSkewerIllustration'
import { ORDER_ARTWORK } from './orderArtwork'

const images = new Map<string, string>()
export function recipeArtImage(recipe: readonly IngredientId[], detailed = false): string {
  const baked = !detailed && ORDER_ARTWORK.get(recipe.join(','))
  if (baked) return baked
  const key = `${detailed}:${recipe.join(',')}`
  if (!images.has(key)) {
    images.set(key, `data:image/svg+xml;charset=utf-8,${encodeURIComponent(detailed ? recipeIllustration(recipe, true) : menuSkewerIllustration(recipe))}`)
  }
  return images.get(key)!
}
export const MenuArt = memo(function MenuArt({ recipe, label, angled = false }: { recipe: readonly IngredientId[]; label: string; angled?: boolean }) {
  const key = `angled:${recipe.join(',')}`
  if (angled && !images.has(key)) images.set(key, `data:image/svg+xml;charset=utf-8,${encodeURIComponent(menuSkewerIllustration(recipe, true))}`)
  return <img className="service-menu-art" src={angled ? images.get(key)! : recipeArtImage(recipe)} alt={label} data-recipe={recipe.join(',')} draggable={false} />
})
export function disposeMenuArt() { images.clear() }
