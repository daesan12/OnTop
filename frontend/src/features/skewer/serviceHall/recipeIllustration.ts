import { INGREDIENT_ART } from '../ingredientArt'
import { pieceLabel, validAssembly } from '../game'
import type { IngredientId } from '../game'

/** Every illustrated piece comes from the actual recipe, including repeated cubes. */
export function recipeIllustration(recipe: readonly IngredientId[], detailed = false): string {
  if (!validAssembly(recipe)) throw new Error('그릴 수 없는 꼬치 조합입니다.')
  const spacing = 592 / Math.max(recipe.length - 1, 1)
  const x = (index: number) => recipe.length === 1 ? 360 : 64 + index * spacing
  const scale = Math.min(2.4, spacing / 44)
  const foods = recipe.map((id, index) => {
    const token = INGREDIENT_ART[id].map(p => `<path d="${p.d}" fill="${p.fill ?? 'none'}"${p.stroke ? ` stroke="${p.stroke}" stroke-width="${p.strokeWidth ?? 1}"` : ''} stroke-linecap="round" stroke-linejoin="round"/>`).join('')
    return `<g data-ingredient="${id}" data-index="${index}" transform="translate(${x(index)},90)"><ellipse cy="34" rx="34" ry="7" fill="#593a1b" opacity=".1"/><g transform="translate(${-22 * scale},${-22 * scale}) scale(${scale})">${token}</g></g>`
  }).join('')
  const steps = detailed ? recipe.map((_, index) => `<g data-step="${index + 1}"><circle cx="${x(index)}" cy="170" r="15" fill="#795034"/><text x="${x(index)}" y="176" fill="#fff5db" font-size="19" font-weight="700">${index + 1}</text><text x="${x(index)}" y="210" fill="#523b2b" font-size="20" font-weight="700">${pieceLabel(recipe, index)}</text></g>`).join('') : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="${detailed ? 240 : 180}" viewBox="0 0 720 ${detailed ? 240 : 180}" data-recipe="${recipe.join(',')}" font-family="Malgun Gothic,sans-serif" text-anchor="middle"><path d="M22,90 H695 l-12,-6" fill="none" stroke="#a67835" stroke-width="5" stroke-linecap="round"/>${foods}${steps}</svg>`
}
