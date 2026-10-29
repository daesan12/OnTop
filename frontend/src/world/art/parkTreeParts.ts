import {
  DENSE_TREE_PLANTINGS,
  GARDEN_TREES,
  TREE_PLANTINGS,
  WILLOW_TREES,
  groundHeight,
  type Vec3,
} from '../../config'
import { beam, seeded, type Part, type XYZ } from './Instances'

export type TreeShape =
  | 'broadleaf'
  | 'slender'
  | 'round'
  | 'column'
  | 'cone'
  | 'box'
  | 'willow'
  | 'garden'
export interface TreePlanting {
  position: Vec3
  scale: number
  kind: TreeShape
  blossom?: string
}
// Placement stays owned by shared-config: art changes must not reseed the park.
export const parkTreePlantings: readonly TreePlanting[] = [
  ...[...TREE_PLANTINGS, ...DENSE_TREE_PLANTINGS].map((t) => ({
    ...t,
    scale: 'scale' in t ? t.scale : 1,
  })),
  ...WILLOW_TREES.map((position) => ({
    position,
    scale: 1,
    kind: 'willow' as const,
  })),
  ...GARDEN_TREES.map(({ x, z, scale, kind }) => ({
    position: [x, groundHeight(x, z), z] as XYZ,
    scale,
    kind: 'garden' as const,
    blossom:
      kind === 'pink-cherry'
        ? '#e8abc0'
        : kind === 'white-cherry'
          ? '#e8e6cf'
          : '#b66a3e',
  })),
]

/** Opaque faceted clumps, without leaf cards, textures or per-frame work. */
export function buildParkTreeParts(plantings: readonly TreePlanting[]) {
  const wood: Part[] = [],
    crowns: Part[] = [],
    cones: Part[] = []
  for (const tree of plantings) {
    const {
      position: [x, y, z],
      scale,
      kind,
      blossom,
    } = tree
    const random = seeded(Math.round(x * 997 + z * 7919) >>> 0)
    const yaw = random() * Math.PI * 2
    const world = (p: XYZ): XYZ => [
      x + (p[0] * Math.cos(yaw) - p[2] * Math.sin(yaw)) * scale,
      y + p[1] * scale,
      z + (p[0] * Math.sin(yaw) + p[2] * Math.cos(yaw)) * scale,
    ]
    const branch = (a: XYZ, b: XYZ, radius: number, color: string) =>
      wood.push(beam(world(a), world(b), radius * scale, color))
    const palette = [
      ['#315c38', '#497d3d', '#6e9a44', '#93b94f'],
      ['#365e3e', '#568447', '#7a9f4b', '#a3bd59'],
      ['#285c48', '#427e4f', '#67994b', '#94b854'],
    ][Math.floor(random() * 3)]!
    const crown = (p: XYZ, s: XYZ, shade: number, shape: Part[] = crowns) =>
      shape.push({
        p: world(p),
        s: s.map((v) => v * scale) as XYZ,
        r: [0.06 * (random() - 0.5), yaw + random(), 0.08 * (random() - 0.5)],
        c: blossom ?? palette[shade]!,
      })
    const small = ['round', 'column', 'cone', 'box'].includes(kind)
    const radius = small ? 0.12 : kind === 'willow' ? 0.31 : 0.28
    const fork = small ? 1.15 : kind === 'slender' ? 3.8 : 2.25
    branch([0, 0, 0], [0.07, fork * 0.55, 0], radius * 1.2, '#885535')
    branch(
      [0.07, fork * 0.55 - 0.035, 0],
      [-0.04, fork + 0.75, 0.04],
      radius * 0.624,
      '#885535',
    )
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3
      branch(
        [0, radius * 2.2, 0],
        [Math.cos(a) * radius * 2.1, 0.005, Math.sin(a) * radius * 2.1],
        radius * 0.42,
        '#95623b',
      )
    }
    if (kind === 'cone') {
      // Overlapping tiers make an evergreen silhouette rather than a single cone.
      for (let i = 0; i < 4; i++)
        crown(
          [0, 1.85 + i * 1.05, 0],
          [1.05 - i * 0.23, 1.15 - i * 0.17, 1.05 - i * 0.23],
          i,
          cones,
        )
    } else if (kind === 'column' || kind === 'slender') {
      const tall = kind === 'slender'
      const bottom = tall ? 4.5 : 1.15
      // The tall crown begins well above ground; a central leader joins its lobes.
      if (tall) branch([0, fork, 0], [0, 7.5, 0], radius * 0.55, '#70462f')
      for (let i = 0; i < 4; i++) {
        const width = (tall ? 1.35 : 0.9) * (1 - i * 0.17)
        crown(
          [0.12 * Math.sin(i * 2), bottom + i * (tall ? 1.12 : 0.94), 0],
          [width, tall ? 1.2 : 1, width],
          i,
        )
      }
    } else if (kind === 'box') {
      for (const dx of [-0.58, 0.58])
        for (const dz of [-0.58, 0.58])
          crown([dx, 2.9, dz], [0.88, 1.02, 0.88], dx < 0 ? 1 : 2)
      crown([0, 3.1, 0], [1.12, 0.96, 1.12], 3)
    } else {
      const round = kind === 'round',
        willow = kind === 'willow',
        garden = kind === 'garden'
      const width = round ? 1.3 : willow ? 3.3 : garden ? 2.5 : 2.8
      const base = round ? 2.1 : willow ? 4.15 : garden ? 3.05 : 3.8
      for (let i = 0; i < 4; i++) {
        const angle = (i * Math.PI * 2) / 4 + 0.3
        const dx = Math.cos(angle) * width * 0.49,
          dz = Math.sin(angle) * width * 0.49
        const cy = base + (random() - 0.5) * 0.35
        branch(
          [0, fork * 0.75, 0],
          [dx * 0.9, cy, dz * 0.9],
          radius * 0.48,
          '#70462f',
        )
        crown(
          [dx, cy, dz],
          [width * 0.6, round ? 0.9 : willow ? 1.9 : 1.35, width * 0.59],
          i % 2,
        )
      }
      crown(
        [0, base + (round ? 0.65 : 1.2), 0],
        [width * 0.68, round ? 1.1 : 1.5, width * 0.65],
        2,
      )
      crown(
        [-width * 0.33, base + (round ? 0.65 : 0.9), width * 0.12],
        [width * 0.49, round ? 0.95 : 1.25, width * 0.5],
        2,
      )
      crown(
        [width * 0.24, base + (round ? 0.85 : 1.35), -width * 0.17],
        [width * 0.48, round ? 0.9 : 1.35, width * 0.48],
        3,
      )
    }
  }
  return { wood, crowns, cones }
}
