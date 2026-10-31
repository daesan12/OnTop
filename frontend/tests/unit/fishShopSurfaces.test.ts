import { expect, it } from 'vitest'
import { fishBreadShopArt } from '../../src/world/art/luckyFacilityGeometry'
import { fishShopSeamSamples } from '../fixtures/fishShopSurfaces'

it('keeps the sloped canopy and valance covered by exactly one colour on both sides of every seam', () => {
  const samples = fishShopSeamSamples(fishBreadShopArt.paint!)
  expect(samples).toHaveLength(88)
  expect(samples.filter(sample => !sample.covered)).toEqual([])
  expect(samples.filter(sample => sample.surfaceColors !== 1)).toEqual([])
})
