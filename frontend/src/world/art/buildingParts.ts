import { SIMPLE_MAP } from './mapRenderProfile'
import type { Part } from './Instances'
import {
  advertisementSize,
  type AdvertisementSlot,
} from './advertisementFormats'

export interface BuildingDimensions {
  w: number
  h: number
  d: number
  variant?: number
  slots?: readonly AdvertisementSlot[]
}
/** Repeatable facade modules, batched by material and culled as one building. */
export function buildingParts({
  w,
  h,
  d,
  variant = 0,
  slots = [],
}: BuildingDimensions) {
  const stone: Part[] = [],
    metal: Part[] = [],
    glass: Part[] = []
  const add = (
    list: Part[],
    p: Part['p'],
    s: Part['s'],
    c: string,
    r?: Part['r'],
  ) => list.push({ p, s, c, r })
  const wall = ['#c8c3b6', '#afb9b9', '#bbb7ac'][variant % 3]!
  add(stone, [0, h / 2, 0], [w, h, d], wall)
  add(stone, [0, 0.09, 0], [w + 1.8, 0.18, d + 1.8], '#b7b7ad')
  if (SIMPLE_MAP) {
    add(stone,[0,h+.5,-d*.15],[w*.35,1,d*.3],'#929c98')
    for(let face=0;face<4;face++) {
      const yaw=face*Math.PI/2,span=face%2?d:w,depth=face%2?w:d
      for(let row=0;row<4;row++) {
        const y=(row+.5)*h/4,z=depth/2+.05
        add(glass,[Math.sin(yaw)*z,y,Math.cos(yaw)*z],[span*.88,h*.15,.08],'#8cabb0',[0,yaw,0])
      }
    }
    return {stone,metal,glass}
  }
  // Parapets and recessed equipment differentiate the silhouette from a plain box.
  for (const side of [-1, 1]) {
    add(stone, [side * (w / 2 - 0.2), h + 0.45, 0], [0.4, 0.9, d], wall)
    add(stone, [0, h + 0.45, side * (d / 2 - 0.2)], [w, 0.9, 0.4], wall)
  }
  add(stone, [0, h + 1.1, -d * 0.15], [w * 0.38, 2.2, d * 0.4], '#929c98')
  for (let i = 0; i < 3; i++) {
    add(
      metal,
      [-w * 0.25 + i * w * 0.25, h + 0.55, d * 0.19],
      [w * 0.14, 1.1, d * 0.17],
      '#88928f',
    )
    for (let k = 0; k < 6; k++)
      add(
        metal,
        [-w * 0.25 + i * w * 0.25, h + 1.13, d * 0.13 + k * d * 0.024],
        [w * 0.13, 0.04, 0.045],
        '#4c5959',
      )
  }
  for (let face = 0; face < 4; face++) {
    const yaw = (face * Math.PI) / 2,
      span = face % 2 ? d : w,
      depth = face % 2 ? w : d
    const point = (x: number, y: number, z: number): Part['p'] => [
      Math.cos(yaw) * x + Math.sin(yaw) * z,
      y,
      -Math.sin(yaw) * x + Math.cos(yaw) * z,
    ]
    const part = (
      list: Part[],
      x: number,
      y: number,
      z: number,
      a: number,
      b: number,
      c: number,
      tint: string,
    ) => add(list, point(x, y, z), [a, b, c], tint, [0, yaw, 0])
    // Ground-floor shopfront, projecting canopy and columns.
    part(glass, 0, 2.1, depth / 2 + 0.035, span - 0.9, 3.8, 0.08, '#8cabb0')
    part(metal, 0, 4.4, depth / 2 + 0.75, span + 1, 0.22, 1.8, '#444d4d')
    for (let x = -span / 2 + 0.3; x < span / 2; x += 3.2) {
      part(stone, x, 2.1, depth / 2 + 0.18, 0.38, 4.2, 0.38, wall)
      part(metal, x + 1.45, 2, depth / 2 + 0.09, 0.06, 3.9, 0.08, '#7c8582')
    }
    const columns = Math.floor((span - 1) / 2.4),
      cell = (span - 1) / columns
    for (let row = 0; row < Math.floor((h - 5) / 3); row++) {
      const y = 6.5 + row * 3
      part(
        stone,
        0,
        y - 1.25,
        depth / 2 + 0.08,
        span,
        variant % 2 ? 0.48 : 0.65,
        0.2,
        variant % 2 ? '#9ca9a8' : '#b8b6ac',
      )
      part(metal, 0, y + 1.3, depth / 2 + 0.15, span, 0.09, 0.22, '#697775')
      for (let col = 0; col < columns; col++) {
        const x = -span / 2 + 0.5 + (col + 0.5) * cell
        if (
          face === 0 &&
          slots.some((s) => {
            const q = advertisementSize(s.format, s.width)
            return (
              Math.abs(x - s.x) < q.width / 2 + cell / 2 + 0.3 &&
              Math.abs(y - s.y) < q.height / 2 + 1.5
            )
          })
        )
          continue
        part(
          glass,
          x,
          y,
          depth / 2 + 0.045,
          cell - (variant % 2 ? 0.13 : 0.6),
          variant % 2 ? 2.28 : 1.9,
          0.07,
          ['#9cb4bc', '#9cadb2', '#b0bdbe', '#889fa9'][
            (col + row * 3 + variant) % 4
          ]!,
        )
        part(
          metal,
          x - cell / 2,
          y,
          depth / 2 + 0.12,
          0.07,
          2.6,
          0.12,
          '#6c7c7c',
        )
        part(
          metal,
          x,
          y + 0.3,
          depth / 2 + 0.11,
          cell - 0.12,
          0.055,
          0.11,
          '#8e9c98',
        )
        // A few blinds add occupied-office detail without separate lights.
        if ((col * 7 + row * 3 + variant) % 9 === 0)
          part(
            stone,
            x,
            y + 0.7,
            depth / 2 + 0.086,
            cell - 0.2,
            0.65,
            0.03,
            '#b9bdb3',
          )
      }
    }
  }
  return { stone, metal, glass }
}
