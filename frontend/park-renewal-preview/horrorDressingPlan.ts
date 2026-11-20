// Visual-only dressing for the underground hall (S15P31B105-450). Nothing here takes part in collision, the server
// map or the camera clamp: every piece sits against a wall, a column, the vault or the sealed cistern, or above the
// height the third-person camera may reach (HORROR.ceiling - .35, see safeHorrorCamera).
import { HORROR, HORROR_CRYPT, HORROR_PILLARS, horrorGround } from './horrorPlan'
import { HORROR_LAMPS } from './horrorGeometry'

export type V3 = readonly [number, number, number]
const f = HORROR.floor, top = HORROR.ceiling
/** Highest point the camera can occupy; vault pieces stay above it. */
export const CAMERA_CEILING = HORROR.ceiling - .35

/** Deterministic 0..1 noise so every client sees the same mess. */
export function hash(n: number) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s) }
function smoothNoise(t: number) { const i = Math.floor(t), u = t - i, w = u * u * (3 - 2 * u); return hash(i) * (1 - w) + hash(i + 1) * w }

/** Failing lamps (HORROR_LAMPS indices): the south-east corridor and the one by the lift. */
export const DYING_LAMPS: readonly number[] = [2, 6]
/** Light factor 0..~1.05 of lamp `i` at time `t` seconds. Steady lamps breathe; dying ones stutter and drop out. */
export function lampFlicker(i: number, t: number) {
  const breathe = 1 - .1 * smoothNoise(t * 2.3 + i * 7.1) - .04 * smoothNoise(t * 11 + i * 3.3)
  if (!DYING_LAMPS.includes(i)) return breathe
  const fit = smoothNoise(t * .45 + i * 13.7)
  if (fit < .62) return breathe * .92
  const stutter = Math.sin(t * 43 + i) * Math.sin(t * 17.3 + i * 2)
  if (fit > .86) return stutter > .55 ? .55 : .03
  return stutter > -.15 ? breathe : .08
}

// Ceiling ribs: a groin vault drawn on the flat roof over the two column bands, flush with it and above the camera.
export type Beam = { from: V3; to: V3; width: number; depth: number }
const xs = [-15, -6, 3, 12], bands = [[-98, -89], [-67, -57]] as const
const rib = (x0: number, z0: number, x1: number, z1: number, width = .85): Beam =>
  ({ from: [x0, top - .15, z0], to: [x1, top - .15, z1], width, depth: .3 })
export const VAULT_RIBS: Beam[] = [
  ...bands.flatMap(([z0, z1]) => [
    ...[z0, z1].map(z => rib(xs[0]!, z, xs[3]!, z)),
    ...xs.map(x => rib(x, z0, x, z1)),
    ...xs.slice(1).flatMap((x, k) => [rib(xs[k]!, z0, x, z1, .55), rib(xs[k]!, z1, x, z0, .55)]),
  ]),
  // Long ribs tying the two bands across the central hall, over the cistern.
  ...xs.map(x => rib(x, -89, x, -67, .7)),
]
/** Capitals and plinths that thicken each column a little (within the walking margin around a column). */
export const COLUMN_TRIM = HORROR_PILLARS.flatMap(p => {
  const x = (p.x0 + p.x1) / 2, z = (p.z0 + p.z1) / 2
  return [
    { at: [x, top - .45, z] as V3, size: [3.25, .5, 3.25] as V3 },
    { at: [x, f + .2, z] as V3, size: [3.15, .4, 3.15] as V3 },
  ]
})

// Chains from the vault: over the cistern, the machinery and the far corners; never over the gallery deck.
export const CHAINS: readonly { at: V3; length: number; hook: boolean }[] = [
  { at: [-27.5, top, -72.5], length: 4.2, hook: true },
  { at: [-22.3, top, -79.4], length: 3.1, hook: false },
  { at: [-25.6, top, -81.2], length: 3.8, hook: true },
  { at: [-21.4, top, -73.8], length: 2.4, hook: false },
  { at: [-36.2, top, -69.2], length: 3.4, hook: true },
  { at: [-40.1, top, -73.6], length: 2.6, hook: false },
  { at: [-10.5, top, -96], length: 2.2, hook: true },
  { at: [7.5, top, -96.5], length: 1.9, hook: false },
  { at: [-1.4, top, -61.6], length: 2, hook: true },
  { at: [8.1, top, -62.3], length: 1.7, hook: false },
]

// Cobwebs: corner triangles where a column or a wall meets the vault, and low ones in the dead corners.
export type Web = { corner: V3; a: V3; b: V3 }
const vaultWebs = HORROR_PILLARS.flatMap((p, k) => {
  const y = top - .02, s = 1.2 + hash(k) * .9
  const corners: [number, number, number, number][] = [[p.x0, p.z0, -1, -1], [p.x1, p.z0, 1, -1], [p.x1, p.z1, 1, 1], [p.x0, p.z1, -1, 1]]
  return corners.filter((_, c) => hash(k * 4 + c + .5) > .45).map(([x, z, sx]) => ({
    corner: [x, y, z] as V3,
    a: [x + sx * s, y, z] as V3,
    b: [x, y - s * .9, z] as V3,
  })).concat(corners.filter((_, c) => hash(k * 4 + c + .25) > .7).map(([x, z, , sz]) => ({
    corner: [x, y, z] as V3, a: [x, y, z + sz * s] as V3, b: [x, y - s * .9, z] as V3,
  })))
})
const roomCorner = (x: number, z: number, sx: number, sz: number, y: number, s: number): Web[] => [
  { corner: [x, y, z], a: [x + sx * s, y, z], b: [x, y, z + sz * s] },
  { corner: [x, y, z], a: [x + sx * s, y, z], b: [x, y - sy(y) * s, z] },
]
function sy(y: number) { return y > f + 3 ? 1 : -1 }
export const COBWEBS: Web[] = [
  ...vaultWebs,
  ...roomCorner(25.1, -104.1, -1, 1, top - .02, 2.4),
  ...roomCorner(25.1, -48.9, -1, -1, top - .02, 2.2),
  ...roomCorner(-25.1, -104.1, 1, 1, top - .02, 2),
  ...roomCorner(-57.1, -48.9, 1, -1, top - .02, 2.6),
  // Low corners by the effigies and the lift: things nobody walks into.
  { corner: [25.1, f + .02, -104.1], a: [25.1 - 1.1, f + .02, -104.1], b: [25.1, f + 1.2, -104.1] },
  { corner: [-34.2, f + 7.65, -87.2], a: [-35.2, f + 7.65, -87.2], b: [-34.2, f + 6.8, -87.2] },
  { corner: [-39.8, f + 7.65, -82.8], a: [-38.8, f + 7.65, -82.8], b: [-39.8, f + 6.9, -82.8] },
]

// Wall marks (atlas cells): 0 soot handprint, 1 claw scratches, 2 tally marks, 3 water stain, 4 smeared handprints,
// 5 scratched arrow. `normal` points into the hall; size in metres (w, h).
export type Mark = { at: V3; normal: V3; cell: number; size: readonly [number, number]; spin?: number }
const east = [-1, 0, 0] as const, west = [1, 0, 0] as const, north = [0, 0, 1] as const, south = [0, 0, -1] as const
export const WALL_MARKS: Mark[] = [
  // Lift cage and machinery: hands that tried to get out.
  { at: [-36.6, f + 1.75, -73.7 - .02], normal: south, cell: 0, size: [.42, .5], spin: .3 },
  { at: [-38.7, f + 1.45, -73.7 - .02], normal: south, cell: 4, size: [.75, .95] },
  { at: [-40.4, f + 2.05, -73.7 - .02], normal: south, cell: 1, size: [.7, .8] },
  { at: [-36.4, f + 2.1, -68.3 + .02], normal: north, cell: 1, size: [.8, .9] },
  // Effigy wall: someone was counting.
  { at: [25.1 - .02, f + 1.6, -91.2], normal: east, cell: 2, size: [.9, .55] },
  { at: [25.1 - .02, f + 1.3, -64.6], normal: east, cell: 2, size: [.7, .5], spin: -.08 },
  // Long water stains from the vault.
  ...[-100.5, -86.5, -71, -58.5].map((z, k): Mark => ({ at: [25.1 - .02, f + 6.4, z], normal: east, cell: 3, size: [1.6, 6.5 - k * .6] })),
  ...[-50, -40, -12, 14].map((x, k): Mark => ({ at: [x, f + 6.6, -48.9 - .02], normal: south, cell: 3, size: [1.5, 6 - k * .4] })),
  ...[-10, 6, 20].map((x, k): Mark => ({ at: [x, f + 6.5, -104.1 + .02], normal: north, cell: 3, size: [1.7, 6.2 - k * .5] })),
  // Columns: claw marks at shoulder height on the faces you pass.
  ...HORROR_PILLARS.filter((_, k) => hash(k + 40) > .55).map((p, k): Mark => {
    const z = (p.z0 + p.z1) / 2, side = hash(k + 41) > .5
    return side ? { at: [p.x1 + .02, f + 1.55, z + (hash(k) - .5)], normal: west, cell: 1, size: [.65, .8] }
      : { at: [(p.x0 + p.x1) / 2 + (hash(k) - .5), f + 1.5, p.z1 + .02], normal: north, cell: 1, size: [.6, .75] }
  }),
  // The way out: scratched arrows that point back in, and hands at the ramp foot.
  { at: [-49.1 + .37, f + 1.5, -60], normal: west, cell: 5, size: [.9, .5], spin: Math.PI },
  { at: [-54.9 + .37 + 5.08, f + 1.4, -57.6], normal: east, cell: 0, size: [.42, .5], spin: -.4 },
  { at: [-25.1 + .02, f + 1.3, -100], normal: west, cell: 0, size: [.42, .5], spin: .15 },
  { at: [-40, f + 1.45, -93.1 + .02], normal: north, cell: 2, size: [.6, .45] },
]

// Rubble: fallen stones along the wall feet, the column plinths and the machine bed. Small enough to step over.
export type Stone = { at: V3; radius: number; spin: number }
function scatter(seed: number, count: number, place: (u: number, v: number) => [number, number]): Stone[] {
  return Array.from({ length: count }, (_, i) => {
    const [x, z] = place(hash(seed + i * 1.37), hash(seed + i * 2.91)), r = .06 + hash(seed + i * 4.1) ** 2 * .2
    return { at: [x, horrorGround(x, z) + r * .45, z], radius: r, spin: hash(seed + i) * 6.28 }
  })
}
export const RUBBLE: Stone[] = [
  ...scatter(1, 40, (u, v) => [-25 + u * 50, -104.1 + .2 + v * .7]),
  ...scatter(2, 34, (u, v) => [-57 + u * 82, -48.9 - .2 - v * .7]),
  ...scatter(3, 26, (u, v) => [25.1 - .2 - v * .7, -103 + u * 53]),
  ...HORROR_PILLARS.flatMap((p, k) => scatter(10 + k * 9, 5, (u, v) => {
    const side = Math.floor(u * 4), t = (u * 4) % 1, x = (p.x0 + p.x1) / 2, z = (p.z0 + p.z1) / 2, d = 1.62 + v * .2
    return side === 0 ? [x - 1.4 + t * 2.8, z - d] : side === 1 ? [x + d, z - 1.4 + t * 2.8] : side === 2 ? [x - 1.4 + t * 2.8, z + d] : [x - d, z - 1.4 + t * 2.8]
  })),
  ...scatter(90, 22, (u, v) => { const a = u * Math.PI * 2, r = HORROR_CRYPT.rx + .15 + v * .35; return [HORROR_CRYPT.x + Math.cos(a) * r, HORROR_CRYPT.z + Math.sin(a) * r * HORROR_CRYPT.rz / HORROR_CRYPT.rx] }),
]

/** Light shafts: the three hanging pendants, plus a cold one through a grate above the cistern. */
export const SHAFTS: readonly { top: V3; bottom: number; radius: [number, number]; color: string; strength: number }[] = [
  { top: [5, 12.5, -80], bottom: f, radius: [.42, 2.6], color: '#d7a865', strength: .2 },
  { top: [-25, 12.5, -76], bottom: f + HORROR_CRYPT.height, radius: [.42, 2.2], color: '#b8c7a8', strength: .18 },
  { top: [-38, 12.5, -75], bottom: f + .9, radius: [.42, 2.1], color: '#d7a865', strength: .16 },
  { top: [-25, top, -76], bottom: f + HORROR_CRYPT.height, radius: [.7, 1.6], color: '#86a8b8', strength: .22 },
]
export const CEILING_GRATE = { at: [-25, top - .05, -76] as V3, size: 1.5 }
/** Effigy eyes (two backed stone figures on the east wall, horrorGeometry); they face into the hall (-x). */
export const EFFIGY_EYES: V3[] = [-95, -61].flatMap(z => [[23.5 - .76, f + 3.08, z - .2], [23.5 - .76, f + 3.08, z + .2]] as V3[])
export const LAMP_COUNT = HORROR_LAMPS.length
/** Per-lamp multiplier the presence events use to put lamps out behind you (1 = normal). */
export const lampOverride = new Float32Array(LAMP_COUNT).fill(1)
