import type { Part } from './Instances'
import type { AdvertisementSlot } from './advertisementFormats'
export interface BuildingDimensions {
  w: number
  h: number
  d: number
  variant?: number
  slots?: readonly AdvertisementSlot[]
}
/** Broad coloured facade panels replace per-window frames, blinds and roof vents.
 * Feature advertisements remain independent, at their existing coordinates. */
export function buildingParts({ w, h, d, variant = 0 }: BuildingDimensions) {
  const wall = ['#c8c3b6', '#afb9b9', '#bbb7ac'][variant % 3]!
  const stone: Part[] = [
    { p: [0, h / 2, 0], s: [w, h, d], c: wall },
    { p: [0, 0.09, 0], s: [w + 1.8, 0.18, d + 1.8], c: '#b7b7ad' },
    { p: [0, h + 0.3, 0], s: [w + 0.4, 0.6, d + 0.4], c: wall },
    { p: [0, h + 1.1, -d * 0.15], s: [w * 0.38, 2.2, d * 0.4], c: '#929c98' },
  ]
  const metal: Part[] = [], glass: Part[] = []
  for (let face = 0; face < 4; face++) {
    const yaw = face * Math.PI / 2, span = face % 2 ? d : w, depth = face % 2 ? w : d
    const part = (list: Part[], y: number, height: number, tint: string, projection = 0.06) =>
      list.push({ p: [Math.sin(yaw) * (depth / 2 + projection), y, Math.cos(yaw) * (depth / 2 + projection)],
        s: [span - 0.8, height, 0.08], r: [0, yaw, 0], c: tint })
    part(glass, 2.1, 3.8, '#8cabb0')
    part(metal, 4.4, 0.22, '#444d4d', 0.14)
    for (let y = 7.5; y < h - 1; y += 6) {
      part(glass, y, Math.min(3.6, (h - y) * 2 - 0.2), '#9cb4bc')
    }
  }
  return { stone, metal, glass }
}
