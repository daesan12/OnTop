export const FOUNTAIN_APPROACH_BLEND_WIDTH=1.2

/** The legacy two-metre terrain sampler can still be below zero at the plaza
 * boundary. Blend that residual away before returning to the level park floor. */
export function blendFountainEdge(radius:number,outer:number,height:number){
  const t=Math.max(0,Math.min(1,(radius-outer+FOUNTAIN_APPROACH_BLEND_WIDTH)/FOUNTAIN_APPROACH_BLEND_WIDTH))
  return height*(1-t*t*(3-2*t))
}
