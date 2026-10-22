import {
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Object3D,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Part } from './Instances'

/** Bake a fixed structure once. Joined beams need no invisible end caps;
 * upright rail posts keep their caps. Retains UVs, normals and per-part tint. */
export function mergeStaticBeams(
  batches: readonly { parts: readonly Part[]; sides: number }[],
) {
  const object = new Object3D(),
    color = new Color()
  const pieces = batches.flatMap(({ parts, sides }) => {
    const closed = new CylinderGeometry(1, 1, 1, sides)
    const open = new CylinderGeometry(1, 1, 1, sides, 1, true)
    const geometries = parts.map((part) => {
      const tilted = (part.r ?? []).some((n) => Math.abs(n) > 0.001)
      const geometry = (tilted ? open : closed).clone()
      geometry.clearGroups()
      object.position.set(...part.p)
      object.scale.set(...part.s)
      object.rotation.set(...(part.r ?? [0, 0, 0]))
      object.updateMatrix()
      geometry.applyMatrix4(object.matrix)
      color.set(part.c)
      const colors = new Float32Array(
        geometry.getAttribute('position').count * 3,
      )
      for (let i = 0; i < colors.length; i += 3) color.toArray(colors, i)
      geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
      return geometry
    })
    closed.dispose()
    open.dispose()
    return geometries
  })
  const result = mergeGeometries(pieces, false)!
  pieces.forEach((piece) => piece.dispose())
  result.computeBoundingBox()
  result.computeBoundingSphere()
  return result
}
