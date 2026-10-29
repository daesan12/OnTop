import { BoxGeometry } from 'three'
import { SIMPLE_MAP } from './mapRenderProfile'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

// 108 triangles, reserved for touchable furniture/steps, never every city block.
const geometry = SIMPLE_MAP?new BoxGeometry():new RoundedBoxGeometry(1, 1, 1, 1, 0.025)
export function BeveledBox() {
  return <primitive object={geometry} attach="geometry" dispose={null} />
}
