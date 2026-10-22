import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

// 108 triangles, reserved for touchable furniture/steps, never every city block.
const geometry = new RoundedBoxGeometry(1, 1, 1, 1, 0.025)
export function BeveledBox() {
  return <primitive object={geometry} attach="geometry" dispose={null} />
}
