/** Wardrobe outfits (마이룸 customising) are on in the dev build (VITE_WARDROBE_OUTFITS=true, like the
 * alkkagi flag) and in local development, and off in the production build until they open to users: the
 * wardrobe then lists no outfits and every avatar keeps its default clothes, whatever the server sends. */
export function wardrobeOutfitsEnabled(env: { VITE_WARDROBE_OUTFITS?: string; DEV?: boolean }) {
  return env.VITE_WARDROBE_OUTFITS === 'true' || !!env.DEV && env.VITE_WARDROBE_OUTFITS !== 'false'
}
export const WARDROBE_OUTFITS_ENABLED = wardrobeOutfitsEnabled(import.meta.env)
