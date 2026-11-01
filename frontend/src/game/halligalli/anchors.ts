import { create } from 'zustand'
import { TABLE_CLOCKWISE_PLAYERS, tableScale, tableSeats, type TableAnchor } from '../../config'

/**
 * Where Halli Galli things lie on the table, in table-local metres before the table's own scale (the same space
 * OneCardBoard uses). Each player's face-up card sits between the seat and the bell, the face-down pile beside it on
 * the player's right hand, and the bell in the middle. Cards stay far enough out that the upright bell does not hide
 * the far player's card from a seated camera.
 */
export const HALLI_LAYOUT = {
  card: { w: .22, h: .33 }, faceUp: .4, pile: { radial: .4, lateral: .28 }, bellRadius: .1,
  thickness: .0016, maxStack: .05, felt: { x: .895, z: .64 }, labelGap: .05,
} as const
/**
 * 3D bell proportions after the physical bell: black round base, low silver dome a little narrower than the base,
 * short stem and a small press button. Base radius is HALLI_LAYOUT.bellRadius.
 */
export const HALLI_BELL = { baseHeight: .026, dome: .086, domeHeight: .07, stem: .02, button: .016, buttonHeight: .01 } as const
export const bellHeight = HALLI_BELL.baseHeight + HALLI_BELL.domeHeight + HALLI_BELL.stem + HALLI_BELL.buttonHeight
/** CSS pixel size of the projected DOM cards; the homography scales them to the table. */
export const HALLI_STAGE_PX = { card: { w: 120, h: 180 } } as const

export type Vec3 = [number, number, number]
export type Point = { x: number; y: number }

export const halliSurfaceY = (anchor: Pick<TableAnchor, 'pavilionId'>) => anchor.pavilionId === 'P0' ? 1.078 : 1.094
export const stackHeight = (cards: number) => cards > 0 ? Math.min(HALLI_LAYOUT.maxStack, Math.max(.004, cards * HALLI_LAYOUT.thickness)) : 0

/**
 * Physical seat per player: the avatar's real seat when it is known and not taken twice, otherwise the first free
 * seat in the table's player order, so two cards never land on the same seat.
 */
export function halliSeatIndices(userIds: readonly string[], seatOf: (userId: string) => number | undefined, seatCount = 4) {
  const taken = new Set<number>()
  const known = userIds.map(id => {
    const seat = seatOf(id)
    if (seat === undefined || seat < 0 || seat >= seatCount || taken.has(seat)) return -1
    taken.add(seat); return seat
  })
  const free = TABLE_CLOCKWISE_PLAYERS.map(n => n - 1).filter(i => i < seatCount && !taken.has(i))
  return known.map(seat => seat >= 0 ? seat : free.shift() ?? 0)
}

/** Inward direction from the seat and the seated player's right hand, in table-local x/z. */
export function seatFrame(anchor: TableAnchor, seatIndex: number) {
  const seats = tableSeats(anchor), seat = seats[seatIndex] ?? seats[0]!, length = Math.hypot(seat.x, seat.z) || 1
  const out = { x: seat.x / length, z: seat.z / length }
  return { out, right: { x: out.z, z: -out.x } }
}

const toWorld = (anchor: TableAnchor, x: number, y: number, z: number): Vec3 => {
  const scale = tableScale(anchor)
  return [anchor.position[0] + x * scale, anchor.position[1] + y, anchor.position[2] + z * scale]
}

/**
 * Corners of a card lying flat, its top edge toward the bell so the owner reads it the right way up.
 * Order is top-left, top-right, bottom-left, bottom-right as seen from the seat, matching quadTransform.
 */
export function cardCorners(anchor: TableAnchor, seatIndex: number, radial: number, lateral: number, lift: number): Vec3[] {
  const { out, right } = seatFrame(anchor, seatIndex), { w, h } = HALLI_LAYOUT.card, y = halliSurfaceY(anchor) + lift
  const cx = out.x * radial + right.x * lateral, cz = out.z * radial + right.z * lateral
  return ([[-1, -1], [1, -1], [-1, 1], [1, 1]] as const).map(([side, depth]) =>
    toWorld(anchor, cx + right.x * side * w / 2 + out.x * depth * h / 2, y, cz + right.z * side * w / 2 + out.z * depth * h / 2))
}
export const faceUpCorners = (anchor: TableAnchor, seatIndex: number, faceUpCount: number) =>
  cardCorners(anchor, seatIndex, HALLI_LAYOUT.faceUp, 0, stackHeight(faceUpCount) + .001)
export const pileCorners = (anchor: TableAnchor, seatIndex: number, drawCount: number) =>
  cardCorners(anchor, seatIndex, HALLI_LAYOUT.pile.radial, HALLI_LAYOUT.pile.lateral, stackHeight(drawCount) + .001)
export const bellCentre = (anchor: TableAnchor): Vec3 => toWorld(anchor, 0, halliSurfaceY(anchor), 0)
/**
 * Outline of the 3D bell in world space (base rim and dome shoulder all round, plus the button), for the screen box
 * of the accessible bell button. The table scales x/z only, so heights are not scaled.
 */
export function bellOutline(anchor: TableAnchor, steps = 12): Vec3[] {
  const r = HALLI_LAYOUT.bellRadius, y = halliSurfaceY(anchor), top = y + HALLI_BELL.baseHeight, points: Vec3[] = []
  for (let i = 0; i < steps; i++) {
    const a = i / steps * Math.PI * 2, c = Math.cos(a), s = Math.sin(a)
    points.push(toWorld(anchor, c * r, y, s * r), toWorld(anchor, c * r, top, s * r),
      toWorld(anchor, c * HALLI_BELL.dome * .7, top + HALLI_BELL.domeHeight * .7, s * HALLI_BELL.dome * .7))
  }
  points.push(toWorld(anchor, 0, y + bellHeight, 0))
  return points
}

/** Just past the felt edge on the seat side; the seat label hangs off this point, away from the bell. */
export function labelPoint(anchor: TableAnchor, seatIndex: number): Vec3 {
  const { out } = seatFrame(anchor, seatIndex), { felt, labelGap } = HALLI_LAYOUT
  const edge = 1 / Math.max(Math.abs(out.x) / felt.x, Math.abs(out.z) / felt.z) + labelGap
  return toWorld(anchor, out.x * edge, halliSurfaceY(anchor), out.z * edge)
}

/**
 * CSS matrix3d mapping a width × height element onto four screen points (top-left, top-right, bottom-left,
 * bottom-right), with transform-origin 0 0. Same solve as the table tablet, sized for any element.
 */
export function quadTransform(width: number, height: number, points: readonly Point[]) {
  const source = [[0, 0], [width, 0], [0, height], [width, height]]
  const a: number[][] = []
  source.forEach(([x, y], i) => {
    const p = points[i]!
    a.push([x!, y!, 1, 0, 0, 0, -p.x * x!, -p.x * y!, p.x])
    a.push([0, 0, 0, x!, y!, 1, -p.y * x!, -p.y * y!, p.y])
  })
  for (let c = 0; c < 8; c++) {
    let pivot = c
    for (let r = c + 1; r < 8; r++) if (Math.abs(a[r]![c]!) > Math.abs(a[pivot]![c]!)) pivot = r
    ;[a[c], a[pivot]] = [a[pivot]!, a[c]!]
    const n = a[c]![c]!
    if (Math.abs(n) < 1e-10) return ''
    for (let j = c; j < 9; j++) a[c]![j] = a[c]![j]! / n
    for (let r = 0; r < 8; r++) if (r !== c) {
      const m = a[r]![c]!
      for (let j = c; j < 9; j++) a[r]![j] = a[r]![j]! - m * a[c]![j]!
    }
  }
  const [aa, b, c, d, e, f, g, h] = a.map(row => row[8]!)
  return `matrix3d(${aa},${d},0,${g},${b},${e},0,${h},0,0,1,0,${c},${f},0,1)`
}

/**
 * Wide screens show the stage only while the 3D board can project the bell into view; otherwise the fixed 2D table
 * is used. One flag, so the two layouts never mount together.
 */
export const HALLI_STAGE_MIN = { width: 801, height: 550 } as const
export const useHalliStage = create<{ projected: boolean }>(() => ({ projected: false }))
/** DOM elements the 3D board places every frame, keyed `face:<id>`, `draw:<id>`, `label:<id>` and `bell`. */
export const halliStageElements = new Map<string, HTMLElement>()
const refs = new Map<string, (element: HTMLElement | null) => void>()
/** Stable ref callback per key, so re-renders do not unregister and re-register the element. */
export function stageRef(key: string) {
  let ref = refs.get(key)
  if (!ref) refs.set(key, ref = element => {
    if (element) halliStageElements.set(key, element)
    else halliStageElements.delete(key)
  })
  return ref
}
