const profileQuery = new URLSearchParams(window.location.search)
export const originalRemainingGlbs = profileQuery.get('glb-profile')==='before'
export const originalFacilityGeometry = profileQuery.get('facility-profile')==='before'
export const structureModels = {
 station: profileQuery.get('station-profile')==='before'
  ? new URL('./models/balloon-boarding-station.glb', import.meta.url).href
  : new URL('./models/balloon-boarding-station-optimized.glb', import.meta.url).href,
 pavilion: profileQuery.get('sub-pavilion-profile')==='before'
  ? new URL('./models/sub-octagonal-pavilion.glb', import.meta.url).href
  : new URL('./models/sub-octagonal-pavilion-optimized.glb', import.meta.url).href,
}
export const models: Record<string, string> = {
  main: profileQuery.get('pavilion-profile')==='before'
    ? new URL('./models/main-octagonal-pavilion-5.glb', import.meta.url).href
    : new URL('./models/main-octagonal-pavilion-5-optimized.glb', import.meta.url).href,
  fortune: originalRemainingGlbs
    ? new URL('./models/ontop-fortune-room-4.glb', import.meta.url).href
    : new URL('./models/ontop-fortune-room-4-optimized.glb', import.meta.url).href,
  lottery: originalRemainingGlbs
    ? new URL('./models/ontop-lottery-shop-2.glb', import.meta.url).href
    : new URL('./models/ontop-lottery-shop-2-optimized.glb', import.meta.url).href,
  bread: originalRemainingGlbs
    ? new URL('./models/bungeoppang-shop.glb', import.meta.url).href
    : new URL('./models/bungeoppang-shop-optimized.glb', import.meta.url).href,
  pigeon: profileQuery.get('pigeon-profile')==='before'
    ? new URL('./models/pigeon-shop.glb', import.meta.url).href
    : new URL('./models/pigeon-shop-optimized.glb', import.meta.url).href,
  dock: originalRemainingGlbs
    ? new URL('./models/duck-dock-3.glb', import.meta.url).href
    : new URL('./models/duck-dock-3-optimized.glb', import.meta.url).href,
  cafe: profileQuery.get('cafe-profile')==='before'
    ? new URL('./models/hanjeongseon-cafe-2.glb', import.meta.url).href
    : new URL('./models/hanjeongseon-cafe-2-optimized.glb', import.meta.url).href,
  stele: originalRemainingGlbs
    ? new URL('./models/jumpmap-stele-a.glb', import.meta.url).href
    : new URL('./models/jumpmap-stele-a-optimized.glb', import.meta.url).href,
  boat: originalRemainingGlbs
    ? new URL('./models/duck-boat-1.glb', import.meta.url).href
    : new URL('./models/duck-boat-1-optimized.glb', import.meta.url).href,
}
