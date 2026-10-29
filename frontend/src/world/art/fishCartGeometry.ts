import { BufferGeometry, ExtrudeGeometry, Float32BufferAttribute, Path, Shape } from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { PropBuilder, type PropFinish, type XYZ } from './propGeometry'
import { FISH_CART_GRILL } from '../../config/fishCart'
import { createFishCartShape as fish } from './fishCartShape'
import { createSculptedFish } from './fishBreadGeometry'

const cream = '#eddfbc', red = '#963f3a', iron = '#30332f', brass = '#b49a63'
function rounded(b: PropBuilder, k: PropFinish, color: string, p: XYZ, s: XYZ, r = 0.015) {
  b.add(k, new RoundedBoxGeometry(...s, 2, r), color, p)
}
function canopy(b: PropBuilder, detailed: boolean) {
  const strips = 10, segments = detailed ? 24 : 8
  for (let i = 0; i < strips; i++) {
    const vertices: number[] = []
    const x0 = -1.84 + i * 3.68 / strips, x1 = x0 + 3.68 / strips
    const point = (x: number, z: number): XYZ => [x, 2.78 + 0.24 * Math.cos(z / 1.12 * Math.PI / 2), z]
    for (let j = 0; j < segments; j++) {
      const z0 = -1.12 + j * 2.24 / segments, z1 = z0 + 2.24 / segments
      const a = point(x0, z0), d = point(x0, z1), c = point(x1, z0), e = point(x1, z1)
      vertices.push(...a, ...d, ...c, ...c, ...d, ...e)
    }
    const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(vertices, 3)); g.computeVertexNormals()
    b.add('tile', g, i % 2 ? cream : red)
    // A separate scalloped fabric valance gives the awning thickness and a proper hem.
    for (const side of [-1, 1]) {
      const width = 3.68 / strips, s = new Shape()
      s.moveTo(-width / 2, 0); s.lineTo(width / 2, 0); s.lineTo(width / 2, -0.12)
      s.quadraticCurveTo(0, -0.23, -width / 2, -0.12); s.closePath()
      b.add('tile', new ExtrudeGeometry(s, { depth: 0.014, bevelEnabled: false, curveSegments: detailed ? 10 : 3 }),
        i % 2 ? cream : red, [(x0 + x1) / 2, 2.79, side * 1.12], [1, 1, 1], [0, side < 0 ? Math.PI : 0, 0])
    }
  }
  for (const x of [-1.43, 1.43]) b.curve('metal', iron, Array.from({ length: 17 }, (_, i): XYZ => {
    const z = -1.1 + i * 2.2 / 16
    return [x, 2.76 + 0.24 * Math.cos(z / 1.12 * Math.PI / 2), z]
  }), 0.027, 24)
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
function build(detailed: boolean) {
  const b = new PropBuilder([16, 10], `fish-cart-${detailed}`)
  // Axles, steel chassis and four independently readable rubber wheels.
  rounded(b, 'metal', iron, [0, 0.36, 0], [2.97, 0.12, 1.36], 0.025)
  for (const x of [-1.16, 1.16]) {
    b.cylinder('metal', '#686960', [x, 0.25, 0], 0.035, 0.035, 1.64, [Math.PI / 2, 0, 0])
    for (const side of [-1, 1]) {
      const z = side * 0.79
      b.cylinder('stone', '#262b28', [x, 0.24, z], 0.235, 0.235, 0.14, [Math.PI / 2, 0, 0], detailed ? 32 : 12)
      b.cylinder('metal', '#c5bfa8', [x, 0.24, z + side * 0.076], 0.145, 0.145, 0.014, [Math.PI / 2, 0, 0], 24)
      b.cylinder('gold', brass, [x, 0.24, z + side * 0.088], 0.046, 0.046, 0.027, [Math.PI / 2, 0, 0])
      if (detailed) for (let i = 0; i < 6; i++) {
        const angle = i * Math.PI / 3
        b.cylinder('metal', '#464d45', [x + Math.cos(angle) * 0.10, 0.24 + Math.sin(angle) * 0.10, z + side * 0.086],
          0.016, 0.016, 0.008, [Math.PI / 2, 0, 0])
      }
    }
  }
  rounded(b, 'wood', '#9e7150', [0, 0.70, 0], [3.0, 0.67, 1.36], 0.025)
  for (const side of [-1, 1]) {
    rounded(b, 'paint', red, [0, 0.71, side * 0.69], [2.85, 0.52, 0.045], 0.015)
    for (const x of [-1.42, 1.42]) {
      rounded(b, 'wood', '#78543b', [x, 0.73, side * 0.72], [0.10, 0.74, 0.085])
      b.cylinder('metal', '#545a50', [x, 1.91, side * 0.62], 0.027, 0.027, 1.76, [0, 0, 0], 16)
      b.cylinder('gold', brass, [x, 1.13, side * 0.62], 0.040, 0.040, 0.12)
      if (detailed) {
        rounded(b, 'metal', '#353b39', [x, .93, side * .775], [.16, .16, .022], .012)
        for (const dx of [-.047, .047]) for (const dy of [-.047, .047])
          b.cylinder('metal', '#b1ac97', [x + dx, .93 + dy, side * .79], .011, .011, .012, [Math.PI / 2, 0, 0], 8)
      }
    }
    rounded(b, 'wood', '#78543b', [0, 0.44, side * 0.72], [2.87, 0.10, 0.08])
    rounded(b, 'wood', '#78543b', [0, 0.99, side * 0.72], [2.87, 0.09, 0.08])
    if (detailed) for (let i = 0; i < 11; i++) {
      b.box('wood', '#b08760', [-1.3 + i * 0.26, 0.70, side * 0.718], [0.009, 0.42, 0.009])
    }
  }
  rounded(b, 'metal', '#a9b1b2', [0, 1.075, 0.02], [3.14, 0.09, 1.66], 0.028)
  rounded(b, 'wood', '#9b7150', [0, 1.025, 0.02], [3.16, 0.045, 1.68], 0.014)
  // Front name plate, separate corner joints and a hanging menu.
  rounded(b, 'wood', '#78543b', [0, 0.70, 0.755], [1.73, 0.43, 0.065], 0.025)
  rounded(b, 'gold', brass, [0, 0.70, 0.792], [1.65, 0.355, 0.018], 0.015)
  rounded(b, 'wood', '#624530', [-1.35, 1.65, 0.72], [0.48, 0.64, 0.05], 0.018)
  b.curve('metal', iron, [[-1.50, 2.06, 0.70], [-1.50, 1.97, 0.70], [-1.48, 1.94, 0.70]], 0.007, 8)
  b.curve('metal', iron, [[-1.20, 2.06, 0.70], [-1.20, 1.97, 0.70], [-1.22, 1.94, 0.70]], 0.007, 8)
  griddle(b, detailed)
  // Display tray and fine brass glazing frame.
  rounded(b, 'metal', '#a8ada0', [0.94, 1.17, -0.08], [1.06, 0.075, 0.69], 0.025)
  // Two staggered serving shelves; personal stock uses five stable anchors on each tier.
  for (const [y, z] of [[1.24, .16], [1.535, -.15]]) {
    rounded(b, 'metal', '#c4c8b8', [.88, y!, z!], [1.12, .025, .28], .012)
    b.box('gold', brass, [.88, y! + .025, z! - .14], [1.12, .035, .012])
    for (let i = 0; i < 5; i++) b.box('gold', '#948166', [.47 + i * .205, y! + .016, z!], [.006, .004, .23])
    for (const side of [-1, 1]) {
      b.cylinder('metal', '#b7b7aa', [.88, y! + .027, z! + side * .14], .01, .01, 1.12, [0, 0, Math.PI / 2], 16)
      b.box('wood', '#95653d', [.88, y! - .024, z! + side * .15], [1.16, .04, .028])
    }
    if (detailed) for (let i = 0; i < 17; i++)
      b.cylinder('metal', '#868d88', [.36 + i * .065, y! + .017, z!], .0025, .0025, .255, [Math.PI / 2, 0, 0], 6)
  }
  for (const x of [.34, 1.44]) {
    rounded(b, 'wood', '#9d7048', [x, 1.41, -.30], [.045, .48, .045], .008)
    b.curve('metal', '#5c625b', [[x, 1.35, -.3], [x, 1.51, -.07], [x, 1.53, .01]], .012, 8)
  }
  for (const x of [0.42, 1.46]) for (const z of [-0.42, 0.26]) b.cylinder('gold', brass, [x, 1.48, z], 0.012, 0.012, 0.59)
  for (const y of [1.19, 1.77]) {
    for (const z of [-0.42, 0.26]) b.box('gold', brass, [0.94, y, z], [1.065, 0.018, 0.018])
    for (const x of [0.42, 1.46]) b.box('gold', brass, [x, y, -0.08], [0.018, 0.018, 0.69])
  }
  if (detailed) {
    // Rolled edges, side handles and lower slats distinguish wood from the steel work surface.
    for (const z of [-.82, .86]) b.cylinder('metal', '#d4cbb1', [0, 1.117, z], .016, .016, 3.11, [0, 0, Math.PI / 2], 24)
    for (const x of [-1.64, 1.64]) {
      b.curve('metal', iron, [[x, .75, -.4], [x, 1.01, -.4], [x, 1.01, .45], [x, .75, .45]], .029, 16)
      b.cylinder('wood', '#ab7848', [x, 1.01, .025], .036, .036, .62, [Math.PI / 2, 0, 0], 20)
    }
    for (let i = 0; i < 9; i++) b.box('wood', '#956b45', [-1.28 + i * .32, .38, 0], [.27, .035, 1.26])
    // Small ribbed batter dispenser and steel ingredient pans on the preparation edge.
    for (const [x, color] of [[-1.38, '#e1cf98'], [-1.17, '#993e35']] as const) {
      b.lathe('tile', color, [x, 1.12, -.58], [[0, 0], [.065, 0], [.072, .02], [.072, .20], [.043, .23], [.022, .24], [.008, .32]])
      b.ring('metal', '#9b9e8c', [x, 1.34, -.58], .04, .005, [Math.PI / 2, 0, 0])
    }
    for (const x of [-1.42, 1.42]) for (const z of [-0.72, 0.72]) for (const y of [0.49, 0.93]) {
      b.cylinder('gold', brass, [x, y, z + Math.sign(z) * 0.046], 0.013, 0.013, 0.006, [Math.PI / 2, 0, 0])
    }
  }
  b.box('glow', '#ffdf9a', [0.94, 1.746, -0.08], [0.82, 0.015, 0.045])
  return b.finish()
}
export const fishCartArt = { near: build(true), far: build(false) }
// These props yield their counter space to the personal, interactive ingredient vessels.
function preparation() {
  const b = new PropBuilder([12, 8])
  for (let n = 0; n < 3; n++) {
    const x = 1.15 + n * .08, height = .36 + n * .025
    rounded(b, 'tile', '#c5ab7c', [x, 1.30, .57], [.15, height, .09], .006)
    rounded(b, 'tile', '#dcc69a', [x, 1.30 + height / 2, .57], [.155, .028, .095], .005)
    b.box('tile', '#b49a6d', [x + .047, 1.30, .617], [.004, height - .035, .002])
  }
  rounded(b, 'wood', '#b98f5b', [.16, 1.145, .56], [.25, .035, .40], .012)
  b.curve('metal', '#abb0a5', [[.10, 1.175, .45], [.15, 1.20, .61], [.20, 1.175, .45]], .009, 12)
  for (let n = 0; n < 5; n++) b.box('tile', '#efeadb', [.55, 1.14 + n * .007, .58], [.25, .005, .27])
  return b.finish()
}
export const fishCartPreparationArt = { near: preparation(), far: {} }
function stock(detailed: boolean) {
  const b = new PropBuilder([12, 8])
  const bread = detailed ? createSculptedFish(.46) : new ExtrudeGeometry(fish(.46), { depth: .025, bevelEnabled: false, curveSegments: 3 })
  if (!detailed) bread.rotateX(-Math.PI / 2)
  for (let i = 0; i < 10; i++) b.add('stone', bread.clone(), i % 2 ? '#d7a158' : '#e4b16b',
    [.47 + i % 5 * .205, i < 5 ? 1.265 : 1.56, i < 5 ? .16 : -.15], [1, 1, 1], [0, 0, 0], false, true)
  bread.dispose()
  return b.finish()
}
export const fishCartStockArt = { near: stock(true), far: stock(false) }
// Keep overhead parts out of the body batches so the local cooking camera can see the grill.
function buildCanopy(detailed: boolean) {
  const b = new PropBuilder([16, 10], `fish-cart-canopy-${detailed}`)
  canopy(b, detailed)
  rounded(b, 'wood', '#654934', [0, 2.43, 1.05], [2.22, 0.35, 0.07], 0.018)
  b.box('glow', '#ffdf9a', [0, 2.73, 0.56], [2.55, 0.018, 0.035])
  if (detailed) {
    for (const x of [-1.44, 1.44]) for (const z of [-1.02, 1.02]) {
      rounded(b, 'wood', '#96653e', [x, 2.64, z], [.09, .38, .09], .012)
      rounded(b, 'metal', '#333733', [x, 2.76, z + Math.sign(z) * .055], [.16, .16, .025], .012)
      b.cylinder('gold', brass, [x, 2.76, z + Math.sign(z) * .072], .025, .025, .018, [Math.PI / 2, 0, 0], 12)
    }
    // A hanging copper shade and ribbed warm paper lantern frame the sign.
    for (const x of [-1.70, 1.70]) {
      b.curve('metal', iron, [[x, 2.79, .3], [x, 2.55, .3], [x, 2.43, .3]], .014, 10)
      b.lathe('gold', '#b97c43', [x, 2.22, .3], [[.16, 0], [.15, .035], [.09, .18], [.065, .20]])
      b.ball('glow', '#ffe8b6', [x, 2.23, .3], [.11, .06, .11])
    }
    for (let i = 0; i <= 10; i++) b.curve('tile', '#d4b895', Array.from({ length: 13 }, (_, j): XYZ => {
      const z = -1.1 + j * 2.2 / 12;
      return [-1.84 + i * 3.68 / 10, 2.784 + .24 * Math.cos(z / 1.12 * Math.PI / 2), z];
    }), .003, 18)
  }
  return b.finish()
}
export const fishCartCanopyArt = { near: buildCanopy(true), far: buildCanopy(false) }
const glass = new PropBuilder([12, 8], 'fish-cart-glass')
glass.box('tile', '#ffffff', [0.94, 1.48, 0.26], [1.02, 0.56, 0.006])
glass.box('tile', '#ffffff', [0.94, 1.48, -0.42], [1.02, 0.56, 0.006])
for (const x of [0.42, 1.46]) glass.box('tile', '#ffffff', [x, 1.48, -0.08], [0.006, 0.56, 0.65])
glass.box('tile', '#ffffff', [0.94, 1.77, -0.08], [1.05, 0.006, 0.69])
export const cartGlass = glass.finish().tile!

function board(c: CanvasRenderingContext2D, w: number, h: number) {
  c.fillStyle = '#f3e6c5'; c.fillRect(0, 0, w, h)
  c.strokeStyle = '#a47745'; c.lineWidth = 10; c.strokeRect(12, 12, w - 24, h - 24)
  c.textAlign = 'center'; c.textBaseline = 'middle'
}
export function cartName(c: CanvasRenderingContext2D, w: number, h: number) {
  board(c, w, h); c.fillStyle = '#843d32'; c.font = `700 ${h * 0.49}px "Malgun Gothic", sans-serif`
  c.fillText('온탑 붕어빵', w / 2, h * 0.43)
  c.fillStyle = '#6c5035'; c.font = `600 ${h * 0.15}px Georgia, serif`; c.fillText('FRESHLY BAKED  ·  ON TOP', w / 2, h * 0.82)
}
export function cartAwning(c: CanvasRenderingContext2D, w: number, h: number) {
  board(c, w, h); c.fillStyle = '#753b31'; c.font = `700 ${h * 0.58}px "Malgun Gothic", sans-serif`
  c.fillText('갓 구운 붕어빵', w / 2, h * 0.52)
}
export function cartMenu(c: CanvasRenderingContext2D, w: number, h: number) {
  c.fillStyle = '#293a32'; c.fillRect(0, 0, w, h)
  c.strokeStyle = '#b9a777'; c.lineWidth = 10; c.strokeRect(18, 18, w - 36, h - 36)
  c.fillStyle = '#f4e9c9'; c.textAlign = 'center'; c.textBaseline = 'middle'
  c.font = `600 ${h * 0.11}px Georgia, serif`; c.fillText('MENU', w / 2, h * 0.15)
  c.font = `700 ${h * 0.09}px "Malgun Gothic", sans-serif`
  for (const [i, item] of ['팥 붕어빵', '슈크림 붕어빵', '피자 붕어빵', '초코 붕어빵'].entries())
    c.fillText(item, w / 2, h * (.32 + i * .13))
  c.font = `${h * 0.058}px "Malgun Gothic", sans-serif`; c.fillText('따뜻한 한 입', w / 2, h * 0.90)
}
