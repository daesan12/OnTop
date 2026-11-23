import { HORROR_PORTALS } from './horrorPlan'

// Outdoor entrances and their terrain openings share the generated FE/BE map contract.
export const SECRET_ENTRANCES_OPEN = true

const floor = 8.35
export const annex = { x0: -2.12, x1: 2.12, z0: -47.8, z1: -39.8, floor, ceiling: floor + 3 }
const west = HORROR_PORTALS[1]
// S15P31B105-450: the way to the top no longer starts beside the exit. Up the ramp you see the exit door, but behind
// bars; the way on is round the gallery to the far (east) end, up a stair, across the hall on a bridge, along a
// narrow way above the west gallery into the top room, and down a stair that comes out behind the bars.
/** A sloping stair: `y0` at `z0`, `y1` at `z1`, `width` across x, centred on `x`. */
export type InteriorRamp = { x: number; width: number; z0: number; z1: number; y0: number; y1: number }
/** From the gallery up to the bridge, against the outer edge of the east gallery, climbing north. */
export const upperStair: InteriorRamp = { x: 18.8, width: 2, z0: -79.1, z1: -72.9, y0: west.floor, y1: 14.2 }
/** From the top room down behind the bars to the exit door, going north. */
export const exitStair: InteriorRamp = { x: -53.7, width: 1.8, z0: -86.4, z1: -91.4, y0: west.floor, y1: 14.2 }
export const interiorRamps: readonly InteriorRamp[] = [upperStair, exitStair]
export const upperRoom = { x0: -56.7, x1: -49.65, z0: -92.95, z1: -91.4, floor: 14.2 }
export const upperArrival = { ...upperRoom, ceiling: 16.3 }

type Point = readonly [number, number, number]
type Access = { from: Point; to: Point; radius: number; yaw: number }
export const interiorAccess = {
  vestibule: { from: [3.65, 9.17, -43.1], to: [1.06, 9.15, -43.1], radius: 1.15, yaw: Math.PI / 2 },
  surface: { from: [1.58, 9.15, -43.1], to: [4.24, 9.08, -43.1], radius: .95, yaw: -Math.PI / 2 },
  passage: { from: [1.25, 9.15, -46.9], to: [1.35, 7.62, -49.55], radius: .85, yaw: 0 },
  entry: { from: [27.35, 7.6, -82], to: [25.25, 7.6, -82], radius: 1.15, yaw: Math.PI / 2 },
  return: { from: [25.25, 7.6, -82], to: [28.7, 7.6, -82], radius: 1.02, yaw: -Math.PI / 2 },
  exit: { from: [-57.1, west.floor + .8, -88], to: [-60.2, west.floor + .8, -88], radius: .82, yaw: Math.PI / 2 },
} as const satisfies Record<string, Access>

/** Visible soil below the stair's coarse height grid; excludes the room behind the wall. */
export const stoneDoorApproach = { x0: annex.x1, x1: interiorAccess.surface.to[0] + 4,
  z0: annex.z0 - 1, z1: annex.z1 + 2, floor: annex.floor - 1, ceiling: annex.ceiling }

export function inAnnex(p: { x: number; y: number; z: number }) {
  return p.x > annex.x0 && p.x < annex.x1 && p.z > annex.z0 && p.z < annex.z1
    && p.y > annex.floor && p.y < annex.ceiling
}

export function accessAt(p: { x: number; y: number; z: number }) {
  return (Object.keys(interiorAccess) as (keyof typeof interiorAccess)[]).find(key => {
    if (!SECRET_ENTRANCES_OPEN && (key === 'vestibule' || key === 'entry')) return false
    const { from: [x, y, z], radius } = interiorAccess[key]
    return Math.abs(p.y - y) <= .55 && Math.hypot(p.x - x, p.z - z) <= radius
  })
}

const volume = (center: Point, size: Point, material = 'stone') => ({ center, size, material })

// The deck stays on the perimeter, leaving the middle open to the lower hall.
const galleryY: number = west.floor
const deck = (x0: number, x1: number, z0: number, z1: number, y = galleryY) =>
  volume([(x0+x1)/2,y-.15,(z0+z1)/2], [x1-x0,.3,z1-z0])
const guardX = (x0: number, x1: number, z: number, y = galleryY) =>
  volume([(x0+x1)/2,y+.55,z],[x1-x0,1.1,.13],'guard')
const guardZ = (x: number, z0: number, z1: number, y = galleryY) =>
  volume([x,y+.55,(z0+z1)/2],[.13,1.1,z1-z0],'guard')

export const galleryVolumes = [
  deck(-49,19.8,-92.85,-89.15),
  deck(16,19.8,-89.15,-52),
  deck(-47,16,-56,-52),
  deck(-47,-43,-89.15,-56),
  guardX(-43,16,-89.15), guardX(-43,16,-56),
  guardZ(-43,-89.15,-56), guardZ(16,-89.15,-56),
  guardX(-49,19.8,-92.85), guardX(-47,19.8,-52),
  guardZ(19.8,-92.85,-52), guardZ(-47,-89.15,-52),
  guardX(-49,-47,-89.15),
]

export const upperRoomVolumes = [
  deck(upperRoom.x0, upperRoom.x1, upperRoom.z0, upperRoom.z1, upperRoom.floor),
  volume([-56.7,15.67,-92.18],[.22,2.94,1.55]),
  // The east side is a doorway now (the narrow way comes in there): only its lintel is left.
  volume([-49.65,16.87,-92.18],[.22,.66,1.55]),
  volume([-54.7,15.67,-92.91],[4,2.94,.16]),
  guardX(-56.7,-52.7,-92.91,upperRoom.floor),
  // The open north edge, either side of the stair down to the exit.
  guardX(-56.7,-54.6,-91.4,upperRoom.floor),
  guardX(-52.8,-49.65,-91.4,upperRoom.floor),
  volume([-55.6,14.45,-92.3],[1.05,.5,.62],'wood'),
]

// The third floor: a landing at the top of the east stair, the bridge across the hall (well clear of the hanging
// lamps and the lift cage), the narrow way south above the west gallery and in at the top room's east door. Railed;
// the gallery still passes underneath (two metres of headroom).
const top = 14.2
export const catwalkVolumes = [
  deck(16,19.8,-72.9,-70.9,top),
  deck(-46.6,16,-72.5,-70.9,top),
  deck(-46.6,-44.9,-91.4,-72.5,top),
  deck(-49.65,-44.9,-92.95,-91.4,top),
  guardX(-46.6,19.8,-70.9,top), guardX(-44.9,16,-72.5,top), guardX(16,17.8,-72.9,top), guardZ(19.8,-72.9,-70.9,top),
  guardZ(-46.6,-91.4,-70.9,top), guardZ(-44.9,-92.95,-72.5,top), guardX(-49.65,-46.6,-91.4,top),
  // The open east side of the stair up, in steps that climb with it.
  ...Array.from({ length: 6 }, (_, i) => {
    const z0 = upperStair.z0 + i * (upperStair.z1 - upperStair.z0) / 6, z1 = z0 + (upperStair.z1 - upperStair.z0) / 6
    const y = upperStair.y0 + (upperStair.y1 - upperStair.y0) * (i + .5) / 6
    return guardZ(19.8, z0, z1, y)
  }),
]

export const annexVolumes = [
  volume([0, floor - .15, -43.8], [4.24, .3, 8]),
  volume([0, annex.ceiling + .16, -43.8], [4.24, .32, 8]),
  volume([-2.18, floor + 1.5, -43.8], [.32, 3, 8]),
  volume([2.18, floor + 1.5, -43.8], [.32, 3, 8]),
  volume([0, floor + 1.5, -47.8], [4.24, 3, .32]),
  volume([0, floor + 1.5, -39.8], [4.24, 3, .32]),
  volume([-.74, floor + 1.5, -42.35], [2.76, 3, .22]),
  volume([-.34, floor + .26, -40.55], [2.8, .52, 1.1], 'wood'),
  volume([-1.66, floor + .19, -41.52], [.52, .38, .43], 'wood'),
]

// The landing behind the south wall turns around the end of two offset screens.
export const passageVolumes = [
  volume([-.1, 8.8, -49.8], [.24, 4, 3.6]),
  volume([1.25, 8.8, -51.55], [2.9, 4, .24]),
  volume([2.8, 8.8, -48.85], [.25, 4, 1.7]),
]
