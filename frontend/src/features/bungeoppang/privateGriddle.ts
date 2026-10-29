import { ExtrudeGeometry, Path, Shape } from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { type PropBuilder, type PropFinish, type XYZ } from './devArt/propGeometry'
import { FISH_CART_GRILL } from '../../config/fishCart'
import { createFishCartShape as fish } from '../../world/art/fishCartShape'
import { createSculptedFish } from './fishBreadGeometry'
const brass = '#b49a63'
function rounded(b: PropBuilder, k: PropFinish, color: string, p: XYZ, s: XYZ, r = 0.015) {
  b.add(k, new RoundedBoxGeometry(...s, 2, r), color, p)
}
export function griddle(b: PropBuilder, detailed: boolean) {
  const layout = FISH_CART_GRILL, [cx, cy, cz] = layout.center
  rounded(b, 'metal', '#888f88', [cx, cy - .05, cz], [1.31, 0.08, 0.83], 0.025)
  // Open front burner bay: the six private flames are visible below the original mould anchors.
  rounded(b, 'metal', '#222c2c', [cx, cy - .035, .455], [1.23, .105, .075], .015)
  for (const x of layout.columns) for (const z of layout.rows) {
    b.cylinder('metal', '#161e20', [cx + x, cy - .025, cz + z], .066, .075, .025, [0, 0, 0], 12)
  }
  rounded(b, 'stone', '#171b1b', [cx, cy - .004, cz], [1.23, 0.012, 0.74], 0.012)
  if (detailed) {
    const plate = new Shape()
    const w = layout.width / 2, d = layout.depth / 2
    plate.moveTo(-w, -d); plate.lineTo(w, -d); plate.lineTo(w, d); plate.lineTo(-w, d); plate.closePath()
    for (const x of layout.columns) for (const z of layout.rows) {
      const points = fish(layout.mouldScale).getPoints(16).map(p => { p.x += x; p.y -= z; return p })
      const hole = new Path(points); plate.holes.push(hole)
    }
    b.add('metal', new ExtrudeGeometry(plate, { depth: layout.thickness, bevelEnabled: true, bevelSize: 0.004,
      bevelThickness: 0.004, bevelSegments: 1, curveSegments: 12 }), '#444a43', [cx, cy, cz], [1, 1, 1], [-Math.PI / 2, 0, 0])
    for (const x of [-1.21, -0.11]) {
      b.curve('metal', '#c3c5b9', [[x, 1.16, 0.39], [x, 1.23, 0.49], [x + 0.07, 1.23, 0.49]], 0.019, 12)
    }
    const mould = createSculptedFish(layout.mouldScale * .98, true)
    for (const x of layout.columns) for (const z of layout.rows) {
      b.add('metal', mould, '#ffffff',
        [cx + x, layout.surfaceY - .007, cz + z], [1, 1, 1], [0, 0, 0], true, true)
      // Individual die frames, hinge pins and retaining screws leave the fish opening clear.
      for (const side of [-1, 1]) {
        b.cylinder('metal', '#a1a49c', [cx + x + side * .17, cy + .048, cz + z + .10], .012, .012, .016, [0, 0, 0], 12)
        b.box('metal', '#707774', [cx + x + side * .17, cy + .058, cz + z + .10], [.015, .002, .003])
      }
      b.cylinder('metal', '#8c918a', [cx + x, cy + .041, cz + z - .128], .016, .016, .27, [0, 0, Math.PI / 2], 16)
      b.box('metal', '#242b2b', [cx + x, cy + .052, cz + z - .128], [.012, .003, .035])
    }
    mould.dispose()
    for (const z of [-.39, .42]) {
      b.box('metal', '#aaa99b', [cx, cy + .055, z], [1.27, .012, .012])
    }
  } else rounded(b, 'metal', '#444a43', [cx, cy + .02, cz], [layout.width, 0.04, layout.depth])
  for (const x of [-0.99, -0.66, -0.33]) {
    b.cylinder('metal', '#5f665f', [x, 0.99, 0.82], 0.052, 0.052, 0.035, [Math.PI / 2, 0, 0], 20)
    b.box('gold', brass, [x, 1.016, 0.842], [0.008, 0.025, 0.005])
  }
}
