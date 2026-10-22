import { PARK_SIZE } from '../../config'
import type { AdvertisementSlot } from './advertisementFormats'

// Measured from the park wall to the facade, rather than to a building's centre.
export const CITY_FACADE_SETBACK = 30
const facade = PARK_SIZE / 2 + CITY_FACADE_SETBACK
export const MEDIA_BUILDINGS = [
  {
    id: 'west-media',
    x: -facade - 15,
    z: -33,
    w: 36,
    d: 30,
    h: 58,
    yaw: Math.PI / 2,
    slots: [
      {
        id: 'west-square',
        format: 'square',
        width: 30,
        x: 0,
        y: 33,
        mount: 'facade',
      },
    ],
  },
  {
    id: 'east-media',
    x: facade + 15,
    z: -39,
    w: 34,
    d: 30,
    h: 82,
    yaw: -Math.PI / 2,
    slots: [
      {
        id: 'east-vertical',
        format: 'vertical',
        width: 28,
        x: 0,
        y: 43,
        mount: 'facade',
      },
    ],
  },
  {
    id: 'north-media',
    x: 27,
    z: -facade - 11,
    w: 38,
    d: 22,
    h: 64,
    yaw: 0,
    slots: [
      {
        id: 'north-poster',
        format: 'poster',
        width: 32,
        x: 0,
        y: 36,
        mount: 'facade',
      },
    ],
  },
  {
    id: 'west-poster-media',
    x: -facade - 15,
    z: 31,
    w: 36,
    d: 30,
    h: 62,
    yaw: Math.PI / 2,
    slots: [
      {
        id: 'west-portrait',
        format: 'portrait',
        width: 30,
        x: 0,
        y: 34,
        mount: 'facade',
      },
    ],
  },
  {
    id: 'east-wide-media',
    x: facade + 15,
    z: 29,
    w: 48,
    d: 30,
    h: 43,
    yaw: -Math.PI / 2,
    slots: [
      {
        id: 'east-wide',
        format: 'wide',
        width: 42,
        x: 0,
        y: 25,
        mount: 'facade',
      },
    ],
  },
  {
    id: 'north-landscape-media',
    x: -39,
    z: -facade - 11,
    w: 46,
    d: 22,
    h: 48,
    yaw: 0,
    slots: [
      {
        id: 'north-roof',
        format: 'landscape',
        width: 40,
        x: 0,
        y: 28,
        mount: 'facade',
      },
    ],
  },
] satisfies readonly {
  id: string
  x: number
  z: number
  w: number
  d: number
  h: number
  yaw: number
  slots: AdvertisementSlot[]
}[]

/** Keep relocated media blocks and background roofs/awnings at least 8m apart. */
export function backgroundBuildingZ(side: number, x: number, initialZ: number) {
  const yaw = (side * Math.PI) / 2,
    c = Math.cos(yaw),
    s = Math.sin(yaw)
  const halfX = Math.abs(c) * 12.5 + Math.abs(s) * 9.5
  const halfZ = Math.abs(s) * 12.5 + Math.abs(c) * 9.5
  const clear = (z: number) =>
    MEDIA_BUILDINGS.every((b) => {
      const bc = Math.abs(Math.cos(b.yaw)),
        bs = Math.abs(Math.sin(b.yaw))
      // Include the projecting canopy and roof sign, not just the main cuboid.
      const bx = bc * (b.w / 2 + 1) + bs * (b.d / 2 + 2.3)
      const bz = bs * (b.w / 2 + 1) + bc * (b.d / 2 + 2.3)
      return (
        Math.abs(c * x + s * z - b.x) >= halfX + bx + 8 ||
        Math.abs(-s * x + c * z - b.z) >= halfZ + bz + 8
      )
    })
  for (let row = 0; row < 4; row++) {
    const z = initialZ - row * 40
    if (clear(z)) return z
  }
  throw new Error('No clear background building position outside the park')
}
