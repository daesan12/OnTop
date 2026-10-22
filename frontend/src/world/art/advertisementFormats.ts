/** Confirmed image ratios. Metre sizes and building assignments remain art tuning. */
export const ADVERTISEMENT_FORMATS = {
  square: { label: '정사각형', ratio: [1, 1], pixels: [1080, 1080] },
  portrait: { label: '세로형', ratio: [4, 5], pixels: [1080, 1350] },
  poster: { label: '포스터형', ratio: [3, 4], pixels: [1080, 1440] },
  vertical: { label: '긴 세로형', ratio: [9, 16], pixels: [1080, 1920] },
  landscape: { label: '가로형', ratio: [16, 9], pixels: [1920, 1080] },
  wide: { label: '넓은 가로형', ratio: [2, 1], pixels: [1600, 800] },
} as const

export type AdvertisementFormat = keyof typeof ADVERTISEMENT_FORMATS
export interface AdvertisementSlot {
  id: string
  format: AdvertisementFormat
  width: number
  x: number
  y: number
  mount: 'facade' | 'roof'
  /** Convex LED arc, in radians. Zero keeps a flat authored-ratio panel. */
  arc?: number
}
export const ADVERTISEMENT_FRAME = {
  border: 0.24,
  depth: 0.5,
  wallGap: 0.2,
} as const

export function advertisementSize(format: AdvertisementFormat, width: number) {
  const [w, h] = ADVERTISEMENT_FORMATS[format].ratio
  return { width, height: (width * h) / w }
}
