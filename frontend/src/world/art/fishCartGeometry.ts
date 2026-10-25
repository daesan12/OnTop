import { BufferGeometry, ExtrudeGeometry, Float32BufferAttribute, Path, Shape } from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { PropBuilder, type PropFinish, type XYZ } from './propGeometry'

const cream = '#eddfbc', red = '#963f3a', iron = '#30332f', brass = '#b49a63'
function rounded(b: PropBuilder, k: PropFinish, color: string, p: XYZ, s: XYZ, r = 0.015) {
  b.add(k, new RoundedBoxGeometry(...s, 2, r), color, p)
}
function fish() {
  const s = new Shape()
  s.moveTo(-0.12, 0.025); s.lineTo(-0.21, 0.085); s.lineTo(-0.19, 0)
  s.lineTo(-0.21, -0.085); s.lineTo(-0.12, -0.025)
  s.bezierCurveTo(-0.07, -0.10, 0.11, -0.10, 0.17, -0.025)
  s.quadraticCurveTo(0.21, 0, 0.17, 0.025)
  s.bezierCurveTo(0.11, 0.10, -0.07, 0.10, -0.12, 0.025)
  s.closePath(); return s
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

function griddle(b: PropBuilder, detailed: boolean) {
  rounded(b, 'metal', '#888f88', [-0.66, 1.12, 0.03], [1.31, 0.08, 0.83], 0.025)
  rounded(b, 'stone', '#171b1b', [-0.66, 1.166, 0.03], [1.23, 0.012, 0.74], 0.012)
  if (detailed) {
    const plate = new Shape()
    plate.moveTo(-0.6, -0.35); plate.lineTo(0.6, -0.35); plate.lineTo(0.6, 0.35); plate.lineTo(-0.6, 0.35); plate.closePath()
    for (const x of [-0.40, 0, 0.40]) for (const z of [-0.175, 0.175]) {
      const points = fish().getPoints(16).map(p => { p.multiplyScalar(0.79); p.x += x; p.y += z; return p })
      const hole = new Path(points); plate.holes.push(hole)
    }
    b.add('metal', new ExtrudeGeometry(plate, { depth: 0.045, bevelEnabled: true, bevelSize: 0.004,
      bevelThickness: 0.004, bevelSegments: 1, curveSegments: 12 }), '#444a43', [-0.66, 1.17, 0.03], [1, 1, 1], [-Math.PI / 2, 0, 0])
    for (const x of [-1.21, -0.11]) {
      b.curve('metal', '#c3c5b9', [[x, 1.16, 0.39], [x, 1.23, 0.49], [x + 0.07, 1.23, 0.49]], 0.019, 12)
    }
  } else rounded(b, 'metal', '#444a43', [-0.66, 1.19, 0.03], [1.2, 0.04, 0.7])
  for (const x of [-0.99, -0.66, -0.33]) {
    b.cylinder('metal', '#5f665f', [x, 0.99, 0.82], 0.052, 0.052, 0.035, [Math.PI / 2, 0, 0], 20)
    b.box('gold', brass, [x, 1.016, 0.842], [0.008, 0.025, 0.005])
  }
}
function bread(b: PropBuilder, x: number, z: number, detailed: boolean, index: number) {
  b.add('stone', new ExtrudeGeometry(fish(), { depth: 0.045, bevelEnabled: true, bevelSize: 0.012,
    bevelThickness: 0.012, bevelSegments: 2, curveSegments: detailed ? 12 : 4 }),
    index % 2 ? '#be813c' : '#ce984e', [x, 1.225, z], [0.76, 0.76, 0.76], [-Math.PI / 2, 0, 0])
  if (!detailed) return
  b.ball('stone', '#724827', [x + 0.10, 1.267, z - 0.025], [0.009, 0.005, 0.009])
  for (const dx of [-0.05, 0, 0.05]) b.curve('paint', '#a86f38', [
    [x + dx - 0.016, 1.269, z - 0.042], [x + dx + 0.008, 1.272, z], [x + dx - 0.016, 1.269, z + 0.042],
  ], 0.003, 8)
  b.curve('paint', '#a86f38', [[x - 0.13, 1.269, z - 0.044], [x - 0.105, 1.269, z], [x - 0.13, 1.269, z + 0.044]], 0.003, 8)
}
function build(detailed: boolean) {
  const b = new PropBuilder([16, 10])
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
    rounded(b, 'paint', cream, [0, 0.71, side * 0.69], [2.85, 0.52, 0.045], 0.015)
    for (const x of [-1.42, 1.42]) {
      rounded(b, 'wood', '#78543b', [x, 0.73, side * 0.72], [0.10, 0.74, 0.085])
      b.cylinder('metal', '#545a50', [x, 1.91, side * 0.62], 0.027, 0.027, 1.76, [0, 0, 0], 16)
      b.cylinder('gold', brass, [x, 1.13, side * 0.62], 0.040, 0.040, 0.12)
    }
    rounded(b, 'wood', '#78543b', [0, 0.44, side * 0.72], [2.87, 0.10, 0.08])
    rounded(b, 'wood', '#78543b', [0, 0.99, side * 0.72], [2.87, 0.09, 0.08])
    if (detailed) for (let i = 0; i < 11; i++) {
      b.box('wood', '#b08760', [-1.3 + i * 0.26, 0.70, side * 0.718], [0.009, 0.42, 0.009])
    }
  }
  rounded(b, 'metal', '#b8b9a5', [0, 1.075, 0.02], [3.14, 0.09, 1.66], 0.028)
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
  for (const x of [0.42, 1.46]) for (const z of [-0.42, 0.26]) b.cylinder('gold', brass, [x, 1.48, z], 0.012, 0.012, 0.59)
  for (const y of [1.19, 1.77]) {
    for (const z of [-0.42, 0.26]) b.box('gold', brass, [0.94, y, z], [1.065, 0.018, 0.018])
    for (const x of [0.42, 1.46]) b.box('gold', brass, [x, y, -0.08], [0.018, 0.018, 0.69])
  }
  if (detailed) {
    let i = 0
    for (const x of [0.60, 0.94, 1.28]) for (const z of [-0.25, 0.04]) bread(b, x, z, true, i++)
    // Paper bags, a wooden prep board, tongs and folded serving papers.
    for (let n = 0; n < 3; n++) {
      const x = 1.15 + n * 0.08, height = 0.36 + n * 0.025
      rounded(b, 'tile', '#c5ab7c', [x, 1.30, 0.57], [0.15, height, 0.09], 0.006)
      rounded(b, 'tile', '#dcc69a', [x, 1.30 + height / 2, 0.57], [0.155, 0.028, 0.095], 0.005)
      b.box('tile', '#b49a6d', [x + 0.047, 1.30, 0.617], [0.004, height - 0.035, 0.002])
    }
    rounded(b, 'wood', '#b98f5b', [0.16, 1.145, 0.56], [0.25, 0.035, 0.40], 0.012)
    b.curve('metal', '#abb0a5', [[0.10, 1.175, 0.45], [0.15, 1.20, 0.61], [0.20, 1.175, 0.45]], 0.009, 12)
    for (let n = 0; n < 5; n++) b.box('tile', '#efeadb', [0.55, 1.14 + n * 0.007, 0.58], [0.25, 0.005, 0.27])
    for (const x of [-1.42, 1.42]) for (const z of [-0.72, 0.72]) for (const y of [0.49, 0.93]) {
      b.cylinder('gold', brass, [x, y, z + Math.sign(z) * 0.046], 0.013, 0.013, 0.006, [Math.PI / 2, 0, 0])
    }
  } else {
    for (const x of [0.65, 1.1]) bread(b, x, -0.05, false, 0)
  }
  canopy(b, detailed)
  rounded(b, 'wood', '#654934', [0, 2.43, 1.05], [2.22, 0.35, 0.07], 0.018)
  b.box('glow', '#ffdf9a', [0.94, 1.746, -0.08], [0.82, 0.015, 0.045])
  b.box('glow', '#ffdf9a', [0, 2.73, 0.56], [2.55, 0.018, 0.035])
  return b.finish()
}
export const fishCartArt = { near: build(true), far: build(false) }
const glass = new PropBuilder()
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
  c.font = `700 ${h * 0.105}px "Malgun Gothic", sans-serif`
  c.fillText('팥 붕어빵', w / 2, h * 0.38); c.fillText('슈크림 붕어빵', w / 2, h * 0.56)
  c.font = `${h * 0.068}px "Malgun Gothic", sans-serif`; c.fillText('따뜻한 한 입', w / 2, h * 0.81)
}
