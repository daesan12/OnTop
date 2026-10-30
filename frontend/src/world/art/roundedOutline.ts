import { Path, Shape, ShapeGeometry } from 'three'

import type { OutlinePoint } from '../../map/geometry'
export { roundedSquare,insideRoundedSquare,type OutlinePoint } from '../../map/geometry'

export function outlinePath(points: readonly OutlinePoint[]) {
  const p = new Path()
  points.forEach(([x,z],i) => i ? p.lineTo(x,-z) : p.moveTo(x,-z))
  p.closePath()
  return p
}

export function outlineRing(inner: readonly OutlinePoint[], outer: readonly OutlinePoint[], y: number) {
  const shape = new Shape()
  shape.curves = outlinePath(outer).curves
  shape.holes.push(outlinePath(inner))
  const g = new ShapeGeometry(shape)
  g.rotateX(-Math.PI/2);g.translate(0,y,0)
  return g
}
