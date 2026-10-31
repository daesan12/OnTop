/** Model-local anchors shared by the lantern meshes and the existing night-light pool. */
export const FISH_SHOP_SIZE = { width: 9.2, depth: 6.6 } as const
export function shopLanternPositions(width:number,depth:number,awning=false) {
  // Keep the entire 52cm frame outside the awning's 4.4m half-width.
  const x=awning?width/2+.25:width/2-.34
  return [-x,x].map(x=>[x,3.09,depth/2+.5] as const)
}
export const FISH_SHOP_LANTERNS=shopLanternPositions(FISH_SHOP_SIZE.width,FISH_SHOP_SIZE.depth,true)
