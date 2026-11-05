import { describe, expect, it } from 'vitest'
import { wardrobeOutfitsEnabled } from '../../src/features/wardrobe/feature'

describe('wardrobe outfits flag', () => {
  it('is off in a production build unless the dev build turns it on', () => {
    expect(wardrobeOutfitsEnabled({ DEV: false })).toBe(false)
    expect(wardrobeOutfitsEnabled({ DEV: false, VITE_WARDROBE_OUTFITS: 'true' })).toBe(true)
  })
  it('is on in local development unless turned off', () => {
    expect(wardrobeOutfitsEnabled({ DEV: true })).toBe(true)
    expect(wardrobeOutfitsEnabled({ DEV: true, VITE_WARDROBE_OUTFITS: 'false' })).toBe(false)
  })
})
