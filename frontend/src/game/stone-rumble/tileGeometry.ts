import { ExtrudeGeometry, Shape } from 'three'
import { STONE_TILE_RADIUS } from './layout'

export const STONE_PANEL_RADIUS = STONE_TILE_RADIUS - .035
const DEPTH = .38
const CHAMFER_WIDTH = .095
const CHAMFER_HEIGHT = .07

/** 상판을 z=0에 고정한다. 깎인 면과 몸통 모두 서버 육각 셀 안에 들어간다. */
export function createStoneTileGeometry() {
  const shape = new Shape()
  // ExtrudeGeometry의 육각 꼭짓점 miter만큼 미리 안쪽으로 잡아 모서리가 이웃 셀을 침범하지 않게 한다.
  const capRadius = STONE_PANEL_RADIUS - CHAMFER_WIDTH * 2 / Math.sqrt(3)
  for (let vertex = 0; vertex < 6; vertex++) {
    const angle = Math.PI / 6 + vertex * Math.PI / 3
    const x = Math.cos(angle) * capRadius, y = Math.sin(angle) * capRadius
    if (vertex === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  }
  shape.closePath()
  const bodyDepth = DEPTH - CHAMFER_HEIGHT * 2
  const geometry = new ExtrudeGeometry(shape, { depth: bodyDepth, steps: 1, bevelEnabled: true,
    bevelSegments: 1, bevelSize: CHAMFER_WIDTH, bevelThickness: CHAMFER_HEIGHT, curveSegments: 1 })
  geometry.translate(0, 0, -bodyDepth - CHAMFER_HEIGHT)
  return geometry
}
