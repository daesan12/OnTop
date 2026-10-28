import type { Side } from 'three'
import type { Surface } from '../worldAssets'
export type { Surface } from '../worldAssets'

/** Solid matte surfaces. Authoring hints remain accepted so geometry and raycast
 * contracts do not depend on image maps or a custom surface shader. */
export function SurfaceMaterial({ color = '#ffffff', side = 0, vertexColors = false,
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
  return <meshLambertMaterial color={color} side={side} vertexColors={vertexColors}
    polygonOffset={depthOffset}
    polygonOffsetFactor={0} polygonOffsetUnits={-1} />
}
