import { PlaneGeometry } from 'three'

/** Arc length is the authored width, preserving UV proportions on a convex LED face. */
export function createAdvertisementGeometry(
  width: number,
  height: number,
  arc = 0,
) {
  const geometry = new PlaneGeometry(width, height, arc ? 32 : 1, 1)
  if (arc) {
    const radius = width / arc
    const positions = geometry.attributes.position
    for (let i = 0; i < positions.count; i++) {
      const angle = positions.getX(i) / radius
      positions.setXYZ(
        i,
        Math.sin(angle) * radius,
        positions.getY(i),
        (Math.cos(angle) - Math.cos(arc / 2)) * radius,
      )
    }
    geometry.computeVertexNormals()
  }
  geometry.computeBoundingSphere()
  return geometry
}
