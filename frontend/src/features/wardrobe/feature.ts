/** The deployed development park remains testable even if its remote build omits the dev flag.
 * Explicit false closes it; other deployed hosts retain the existing closed-by-default policy. */
export function wardrobeOutfitsEnabled(
  env: { VITE_WARDROBE_OUTFITS?: string; DEV?: boolean },
  hostname = typeof window === 'undefined' ? '' : (window.location?.hostname ?? ''),
) {
  return env.VITE_WARDROBE_OUTFITS === 'true'
    || (!!env.DEV || hostname === 'dev.on-top.world') && env.VITE_WARDROBE_OUTFITS !== 'false'
}
export const WARDROBE_OUTFITS_ENABLED = wardrobeOutfitsEnabled(import.meta.env)
