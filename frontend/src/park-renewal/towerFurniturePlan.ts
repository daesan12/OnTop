import type {Point} from './plan.ts'
// The native 18m tower's deck offset is stretched along with its height.
export const TOWER_TOP={
 floor:(18+.12)*40/18,
 telescopes:[[-4.6,-4.5],[-1.4,-6.35]] as Point[],
 notes:[2.1,-5.8] as Point,
 benches:[[5.7,-3],[5.7,1.7]] as Point[],
}
/** The rotated summit has a stairwell in the outer 45°–180° sector. */
export function onSolidTowerDeck(x:number,z:number,margin=0){const a=(Math.atan2(z,x)+Math.PI*2)%(Math.PI*2),radius=a>Math.PI/4&&a<Math.PI?5:8;return Math.hypot(x,z)<radius-margin}

/** The optics face native +Z; aim toward the central plaza, then stand behind them. */
export const telescopeYaw=(x:number,z:number)=>Math.atan2(-x,38-z)
