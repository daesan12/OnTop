import type { BoxCollider } from './world'
import { PAGODA_SITE } from './parkPlan'

// Reference-inspired game scale, not a surveyed heritage reconstruction.
export const PAGODA_DIMENSIONS = {
  height: 20 * PAGODA_SITE.scale,
  baseWidth: 9.1 * PAGODA_SITE.scale * PAGODA_SITE.widthScale,
  plazaWidth: 11 * PAGODA_SITE.scale * PAGODA_SITE.widthScale,
  pedestalTop: 2.6 * PAGODA_SITE.scale,
} as const
export const GARDEN_PAGODA = {
  ...PAGODA_DIMENSIONS,
  id: 'garden-pagoda',
  ...PAGODA_SITE,
} as const
export const PAGODA_ANCHORS = [GARDEN_PAGODA] as const

// Model-local metres. Rendering and collision apply the anchor's scale once.
export const PAGODA_TIERS = Array.from({ length: 10 }, (_, i) => ({
  y: i < 3 ? 2.6 + i * 2.45 : 9.95 + (i - 3) * 1.3,
  width: i < 3 ? 4.5 - i * 0.35 : 2.8 - (i - 3) * 0.19,
  bodyHeight: i < 3 ? 1.8 : 0.78,
  roofHeight: i < 3 ? 0.5 : 0.38,
  cross: i < 3,
}))

// The fence encloses the plinth. Higher camera bounds narrow with the actual tiers.
export const PAGODA_COLLIDERS: readonly BoxCollider[] = PAGODA_ANCHORS.flatMap(
  (anchor): BoxCollider[] => [
    {
      id: anchor.id,
      center: [anchor.x, 1.3 * anchor.scale, anchor.z],
      half: [anchor.baseWidth / 2, 1.3 * anchor.scale, anchor.baseWidth / 2],
      camera: true,
    },
    ...PAGODA_TIERS.map((tier, i) => ({
      id: `${anchor.id}-tier-${i}`,
      center: [
        anchor.x,
        (tier.y + (i < 3 ? 2.45 : 1.3) / 2) * anchor.scale,
        anchor.z,
      ] as const,
      half: [
        (tier.width / 2) * anchor.scale * anchor.widthScale,
        ((i < 3 ? 2.45 : 1.3) / 2) * anchor.scale,
        (tier.width / 2) * anchor.scale * anchor.widthScale,
      ] as const,
      camera: true,
    })),
    {
      id: `${anchor.id}-crown`,
      center: [anchor.x, 19.525 * anchor.scale, anchor.z],
      half: [
        0.46 * anchor.scale * anchor.widthScale,
        0.475 * anchor.scale,
        0.46 * anchor.scale * anchor.widthScale,
      ],
      camera: true,
    },
  ],
)
