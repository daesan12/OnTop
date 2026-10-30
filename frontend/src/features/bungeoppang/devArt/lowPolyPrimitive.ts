import { BoxGeometry, SphereGeometry, type BufferGeometry } from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

/** Keep dimensions/angular coverage; remove surface subdivisions, never collision data.
 * The caller owns a replacement. Already small and custom geometry is shared unchanged. */
export function lowPolyPrimitive(source: BufferGeometry): BufferGeometry {
  if (source instanceof RoundedBoxGeometry) {
    const p = source.parameters
    return new BoxGeometry(p.width, p.height, p.depth)
  }
  if (source instanceof SphereGeometry) {
    const p = source.parameters
    if (p.widthSegments > 8 || p.heightSegments > 4)
      return new SphereGeometry(p.radius, Math.min(8, p.widthSegments), Math.min(4, p.heightSegments),
        p.phiStart, p.phiLength, p.thetaStart, p.thetaLength)
  }
  return source
}
