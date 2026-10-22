export type QualityPreset = 'low' | 'medium' | 'high'
export const QUALITY_PRESETS = {
  low: {
    label: 'Low',
    maxDpr: 1,
    maxPixels: 1280 * 720,
    shadows: false,
    shadowSize: 512,
    foliageDetail: 0,
  },
  medium: {
    label: 'Medium',
    maxDpr: 1,
    maxPixels: 1600 * 900,
    shadows: true,
    shadowSize: 1024,
    foliageDetail: 1,
  },
  high: {
    label: 'High',
    maxDpr: 1,
    maxPixels: 1920 * 1080,
    shadows: true,
    shadowSize: 1536,
    foliageDetail: 2,
  },
} as const
export function effectiveDpr(
  preset: QualityPreset,
  width: number,
  height: number,
  deviceDpr: number,
) {
  const quality = QUALITY_PRESETS[preset]
  return Math.max(
    0.25,
    Math.min(
      deviceDpr,
      quality.maxDpr,
      Math.sqrt(quality.maxPixels / Math.max(1, width * height)),
    ),
  )
}
