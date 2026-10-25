import { ExtrudeGeometry, Shape } from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { PropBuilder, type PropFinish, type XYZ } from './propGeometry'

function rounded(b: PropBuilder, kind: PropFinish, color: string, p: XYZ, size: XYZ, radius = 0.015) {
  b.add(kind, new RoundedBoxGeometry(...size, 2, radius), color, p)
}
function bodyShape() {
  const s = new Shape()
  s.moveTo(-0.405, 0.29); s.lineTo(0.405, 0.29); s.lineTo(0.405, 1.46)
  s.bezierCurveTo(0.405, 1.8973333333333333, -0.405, 1.8973333333333333, -0.405, 1.46)
  s.closePath()
  return s
}
function build(detailed: boolean) {
  const b = new PropBuilder([16, 10])
  const enamel = '#a82b31', dark = '#6d2028', brass = '#be9a58'
  rounded(b, 'metal', '#343936', [0, 0.065, 0], [0.9, 0.13, 0.74], 0.035)
  rounded(b, 'metal', '#50504a', [0, 0.15, 0], [0.79, 0.07, 0.65], 0.018)
  rounded(b, 'paint', dark, [0, 0.235, 0], [0.68, 0.17, 0.55], 0.025)
  const shell = new ExtrudeGeometry(bodyShape(), {
    depth: 0.58, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012,
    bevelSegments: detailed ? 3 : 1, curveSegments: detailed ? 24 : 8, steps: 1,
  })
  // Smooth the rolled crown's side normals without rounding the flat front/back panels.
  const positions = shell.getAttribute('position'), normals = shell.getAttribute('normal')
  for (let i = 0; i < positions.count; i++) {
    if (positions.getY(i) <= 1.46 || Math.abs(normals.getZ(i)) > 0.05) continue
    const x = positions.getX(i) / (0.405 ** 2), y = (positions.getY(i) - 1.46) / (0.328 ** 2)
    const length = Math.hypot(x, y)
    normals.setXYZ(i, x / length, y / length, 0)
  }
  b.add('paint', shell, enamel, [0, 0, -0.29])
  // Distinct cap seam, bottom skirt and protective feet.
  rounded(b, 'paint', dark, [0, 0.32, 0], [0.845, 0.07, 0.624], 0.02)
  rounded(b, 'gold', brass, [0, 0.355, 0.307], [0.72, 0.012, 0.008], 0.003)
  // Black inset opening is protected by a red overhanging rain hood.
  rounded(b, 'stone', '#211c1d', [0, 1.292, 0.303], [0.57, 0.077, 0.025], 0.012)
  rounded(b, 'metal', '#3c3430', [0, 1.252, 0.321], [0.59, 0.018, 0.05], 0.006)
  rounded(b, 'paint', '#ba3c3d', [0, 1.36, 0.334], [0.67, 0.055, 0.11], 0.018)
  rounded(b, 'gold', brass, [0, 1.338, 0.387], [0.61, 0.009, 0.006], 0.002)
  // Service door has its own inset shadow and a red enamel raised face.
  rounded(b, 'stone', '#482025', [0, 0.792, 0.301], [0.675, 0.75, 0.022], 0.028)
  rounded(b, 'paint', '#b5363a', [0, 0.792, 0.318], [0.635, 0.708, 0.027], 0.024)
  rounded(b, 'gold', brass, [0, 1.555, 0.305], [0.672, 0.235, 0.027], 0.022)
  if (detailed) {
    for (const x of [-0.30, 0.30]) for (const y of [0.48, 1.1]) {
      b.cylinder('gold', brass, [x, y, 0.339], 0.011, 0.011, 0.01, [Math.PI / 2, 0, 0], 12)
      b.box('stone', '#65513a', [x, y, 0.345], [0.012, 0.002, 0.002])
    }
    for (const y of [0.59, 0.99]) {
      for (const offset of [-0.035, 0, 0.035]) b.cylinder('gold', brass, [-0.337, y + offset, 0.33], 0.018, 0.018, 0.027)
    }
    b.cylinder('metal', '#d1b77d', [0.245, 0.78, 0.345], 0.037, 0.037, 0.024, [Math.PI / 2, 0, 0], 24)
    b.cylinder('stone', '#28252a', [0.245, 0.786, 0.359], 0.008, 0.008, 0.003, [Math.PI / 2, 0, 0])
    b.box('stone', '#28252a', [0.245, 0.773, 0.361], [0.009, 0.019, 0.002])
    // An actual raised envelope emblem on the lower door, rather than a baked blurry decal.
    rounded(b, 'gold', brass, [-0.035, 0.85, 0.34], [0.32, 0.21, 0.012], 0.012)
    rounded(b, 'paint', '#a82b31', [-0.035, 0.85, 0.349], [0.29, 0.18, 0.007], 0.01)
    b.curve('gold', brass, [[-0.175, 0.93, 0.356], [-0.035, 0.835, 0.356], [0.105, 0.93, 0.356]], 0.005, 12)
    for (const side of [-1, 1]) {
      for (const y of [0.58, 0.64, 0.70]) rounded(b, 'paint', dark, [side * 0.419, y, -0.03], [0.007, 0.014, 0.2], 0.003)
      for (const z of [-0.25, 0.25]) b.cylinder('metal', '#b1aaa0', [side * 0.345, 0.135, z], 0.021, 0.021, 0.02)
    }
    // A hairline seam follows the curved crown at both ends.
    for (const z of [-0.30, 0.30]) b.curve('paint', dark, Array.from({ length: 25 }, (_, i): XYZ => {
      const a = Math.PI * i / 24
      return [0.407 * Math.cos(a), 1.46 + 0.328 * Math.sin(a), z]
    }), 0.006, 32)
    rounded(b, 'gold', brass, [0, 0.52, 0.34], [0.4, 0.085, 0.01], 0.008)
  }
  return b.finish()
}
export const mailboxArt = { near: build(true), far: build(false) }

export function mailboxTitle(c: CanvasRenderingContext2D, w: number, h: number) {
  c.fillStyle = '#f0e5c7'; c.fillRect(0, 0, w, h)
  c.strokeStyle = '#b08b48'; c.lineWidth = 12; c.strokeRect(14, 14, w - 28, h - 28)
  c.fillStyle = '#79232d'; c.textAlign = 'center'; c.textBaseline = 'middle'
  c.font = `700 ${h * 0.52}px "Malgun Gothic", sans-serif`; c.fillText('소리함', w / 2, h * 0.40)
  c.font = `600 ${h * 0.15}px Georgia, serif`; c.fillText('ON TOP  ·  LETTERS', w / 2, h * 0.81)
}
export function mailboxNote(c: CanvasRenderingContext2D, w: number, h: number) {
  c.fillStyle = '#c1a36c'; c.fillRect(0, 0, w, h)
  c.fillStyle = '#573b28'; c.textAlign = 'center'; c.textBaseline = 'middle'
  c.font = `700 ${h * 0.45}px "Malgun Gothic", sans-serif`; c.fillText('여러분의 이야기를 들려주세요', w / 2, h / 2, w * 0.9)
}
