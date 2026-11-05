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
  it('keeps only the exact deployed development host open when the build flag is omitted', () => {
    expect(wardrobeOutfitsEnabled({ DEV: false }, 'dev.on-top.world')).toBe(true)
    for (const host of ['www.on-top.world', 'on-top.world', 'dev.on-top.world.example.com', 'preview.vercel.app'])
      expect(wardrobeOutfitsEnabled({ DEV: false }, host)).toBe(false)
    expect(wardrobeOutfitsEnabled({ DEV: false, VITE_WARDROBE_OUTFITS: 'false' }, 'dev.on-top.world')).toBe(false)
  })
})
