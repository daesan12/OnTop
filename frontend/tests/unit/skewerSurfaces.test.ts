import { describe, expect, it } from 'vitest'
import { createDeck, fabricSpans } from '../../src/features/skewer/game'
import { createFoodStrip, foodPositions } from '../../src/features/skewer/foodModels'

describe('food slices and skewer spacing', () => {
  it('builds closed slices with finite normals and actual thickness', () => {
    for (const id of ['cheese', 'bacon'] as const) for (const wrap of [true, false]) {
      const geometry = createFoodStrip(0.5, 0.125, id, wrap)
      const positions = geometry.getAttribute('position')
      const normals = geometry.getAttribute('normal')
      const index = geometry.getIndex()!
      const edges = new Map<string, number>()
      for (let i = 0; i < index.count; i += 3) for (let j = 0; j < 3; j++) {
        const a = index.getX(i + j), b = index.getX(i + (j + 1) % 3)
        const key = `${Math.min(a, b)}:${Math.max(a, b)}`
        edges.set(key, (edges.get(key) ?? 0) + 1)
      }
      expect([...edges.values()].every(count => count === 2)).toBe(true)
      for (let i = 0; i < positions.count; i++) {
        expect(Number.isFinite(positions.getX(i) + positions.getY(i) + positions.getZ(i))).toBe(true)
        expect(Number.isFinite(normals.getX(i) + normals.getY(i) + normals.getZ(i))).toBe(true)
      }
      expect(positions.getY(0)).toBeGreaterThan(positions.getY(positions.count / 2))
      expect(index.count / 3).toBeLessThan(1300)
      geometry.dispose()
    }
  })

  it('keeps inserted food fixed as more food is threaded, with thin wrap ends', () => {
    const recipe = ['tomato', 'cheese', 'shrimp', 'cheese', 'beef'] as const
    const positions = foodPositions(recipe)
    expect(foodPositions(recipe.slice(0, 3))).toEqual(positions.slice(0, 3))
    expect(positions[1] - positions[0]).toBeCloseTo(0.087)
    expect(positions[4]).toBeLessThan(0.7)
  })

  it('places every generated wrap above the food with both ends on its slots', () => {
    for (const card of createDeck(() => 0.5)) {
      if (card.kind !== 'order') continue
      const positions = foodPositions(card.recipe)
      for (const [layer, span] of fabricSpans(card.recipe).entries()) {
        const length = positions[span.end!] - positions[span.start]
        const geometry = createFoodStrip(length, 0.125, span.id, true, layer)
        geometry.computeBoundingBox()
        expect(geometry.boundingBox!.min.x).toBeCloseTo(0)
        expect(geometry.boundingBox!.max.x).toBeCloseTo(length)
        expect(geometry.boundingBox!.max.y).toBeGreaterThan(0.08)
        geometry.dispose()
      }
    }
  })
})
