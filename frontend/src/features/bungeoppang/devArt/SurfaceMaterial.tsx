import type { Side } from 'three'
import type { Surface } from '../../../world/worldAssets'
import { attachSharedMaterial, sharedSurfaceMaterial } from './sharedMaterials'
export type { Surface } from '../../../world/worldAssets'

/** Solid matte surfaces. Authoring hints remain accepted so geometry and raycast
 * contracts do not depend on image maps or a custom surface shader. */
export function SurfaceMaterial({ kind, color = '#ffffff', side = 0, vertexColors = false,
  depthOffset = false }: {
  kind: Surface
  mapping?: 'uv' | 'box'
  meters?: number
  color?: string
  strength?: number
  detail?: number
  side?: Side
  vertexColors?: boolean
  depthOffset?: boolean
  paving?: boolean
  baked?: boolean
}) {
  return <primitive object={sharedSurfaceMaterial(kind, color, side, vertexColors, depthOffset)} attach={attachSharedMaterial} dispose={null} />
}
