import { HORROR_PORTALS } from './horrorPlan'

const floor = 8.35
export const annex = { x0: -2.12, x1: 2.12, z0: -47.8, z1: -39.8, floor, ceiling: floor + 3 }
const west = HORROR_PORTALS[1]
export const upperRamp = { x: -51.4, width: 2.1, z0: -85.2, z1: -91.4, y0: west.floor, y1: 14.2 }
export const upperRoom = { x0: -56.7, x1: -49.65, z0: -92.95, z1: -91.4, floor: upperRamp.y1 }
export const upperArrival = { ...upperRoom, ceiling: 16.3 }

type Point = readonly [number, number, number]
type Access = { from: Point; to: Point; radius: number; yaw: number }
export const interiorAccess = {
  vestibule: { from: [3.65, 9.17, -43.1], to: [1.06, 9.15, -43.1], radius: 1.15, yaw: Math.PI / 2 },
  surface: { from: [1.58, 9.15, -43.1], to: [4.24, 9.08, -43.1], radius: .95, yaw: -Math.PI / 2 },
  passage: { from: [1.25, 9.15, -46.9], to: [1.35, 7.62, -49.55], radius: .85, yaw: 0 },
  entry: { from: [27.35, 7.6, -82], to: [25.25, 7.6, -82], radius: 1.15, yaw: Math.PI / 2 },
  exit: { from: [-57.1, west.floor + .8, -88], to: [-60.2, west.floor + .8, -88], radius: .82, yaw: Math.PI / 2 },
} as const satisfies Record<string, Access>

export function inAnnex(p: { x: number; y: number; z: number }) {
  return p.x > annex.x0 && p.x < annex.x1 && p.z > annex.z0 && p.z < annex.z1
    && p.y > annex.floor && p.y < annex.ceiling
}

export function accessAt(p: { x: number; y: number; z: number }) {
  return (Object.keys(interiorAccess) as (keyof typeof interiorAccess)[]).find(key => {
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
  deck(-56.7,-52.55,-91.4,-89.85,upperRoom.floor),
  volume([-56.7,15.67,-91.4],[.22,2.94,3.1]),
  volume([-54.62,15.67,-89.85],[4.15,2.94,.22]),
  volume([-49.65,14.7,-92.18],[.22,1,1.55]),
  volume([-49.65,16.87,-92.18],[.22,.66,1.55]),
  volume([-54.7,15.67,-92.91],[4,2.94,.16]),
  guardX(-56.7,-52.7,-92.91,upperRoom.floor),
  guardX(-50.25,-49.65,-91.4,upperRoom.floor),
  volume([-55.65,14.45,-90.42],[1.05,.5,.62],'wood'),
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
