import { hipRoof, PropBuilder, type XYZ } from './propGeometry'
function fish(b: PropBuilder, p: XYZ, s: number) {
  const at = (x: number, y: number, z: number): XYZ => [
    p[0] + x * s,
    p[1] + y * s,
    p[2] + z * s,
  ]
  b.ball('gold', '#f8ac35', at(0, 0, 0), [0.68 * s, 0.34 * s, 0.24 * s])
  b.ball('gold', '#ffc65a', at(-0.42, 0.04, 0.015), [
    0.34 * s,
    0.35 * s,
    0.25 * s,
  ])
  b.cylinder(
    'gold',
    '#e89621',
    at(0.78, 0, 0),
    0.33 * s,
    0,
    0.5 * s,
    [0, 0, Math.PI / 2],
    3,
  )
  b.cylinder(
    'gold',
    '#f8bd43',
    at(0.05, 0.36, 0),
    0,
    0.3 * s,
    0.35 * s,
    [0, 0, -0.3],
    3,
  )
  for (const side of [-1, 1]) {
    b.ball('paint', '#fff2c5', at(-0.52, 0.13, side * 0.22), [
      0.09 * s,
      0.09 * s,
      0.03 * s,
    ])
    b.ball('metal', '#30251c', at(-0.55, 0.13, side * 0.247), [
      0.043 * s,
      0.05 * s,
      0.012 * s,
    ])
    for (let row = 0; row < 3; row++)
      for (let col = 0; col < 4; col++)
        b.ring(
          'gold',
          '#ffda7c',
          at(-0.15 + col * 0.16, row * 0.14 - 0.14, side * 0.22),
          0.08 * s,
          0.012 * s,
        )
  }
  b.ring('gold', '#d9881d', at(-0.74, -0.03, 0.04), 0.065 * s, 0.025 * s, [
    0,
    Math.PI / 2,
    0,
  ])
}
function cartArt() {
  const b = new PropBuilder()
  b.box('wood', '#9e3425', [0, 0.79, 0], [3.65, 1.03, 2.08])
  for (const side of [-1, 1]) {
    b.box('wood', '#bc4430', [0, 0.8, side * 1.052], [3.3, 0.77, 0.035])
    for (const y of [0.31, 1.27])
      b.box('gold', '#dca650', [0, y, side * 1.08], [3.75, 0.08, 0.09])
    for (const x of [-1.76, 1.76])
      b.box('wood', '#9c683b', [x, 0.8, side * 1.08], [0.12, 0.94, 0.12])
    for (let i = 0; i < 9; i++)
      b.box(
        'wood',
        '#a63a29',
        [-1.5 + i * 0.375, 0.8, side * 1.077],
        [0.018, 0.81, 0.012],
      )
  }
  b.box('wood', '#b97e3a', [0, 1.35, 0], [3.95, 0.14, 2.35])
  b.box('gold', '#e8b663', [0, 1.43, 1.13], [3.95, 0.045, 0.06])
  for (const x of [-1.72, 1.72])
    for (const z of [-0.92, 0.92]) {
      b.cylinder('wood', '#996336', [x, 2.13, z], 0.065, 0.085, 1.5)
      b.cylinder('gold', '#d6a254', [x, 1.47, z], 0.1, 0.1, 0.12)
    }
  hipRoof(b, 4.25, 2.6, 2.93, 0.48, true)
  fish(b, [0, 3.72, 0], 1.05)
  // Sloped fabric stripes and rounded scalloped valance.
  for (let i = 0; i < 14; i++) {
    const x = -1.9 + ((i + 0.5) * 3.8) / 14,
      c = i % 2 ? '#f7d79a' : '#ed923e'
    b.box('paint', c, [x, 2.67, 1.06], [3.8 / 14, 0.055, 0.76], [0.24, 0, 0])
    b.box('paint', c, [x, 2.5, 1.42], [3.8 / 14, 0.19, 0.04])
    b.ball('paint', c, [x, 2.405, 1.42], [3.8 / 28, 0.085, 0.026])
  }
  b.box('wood', '#963c26', [0, 3.03, 1.29], [3.45, 0.52, 0.16])
  for (const y of [2.76, 3.3])
    b.box('gold', '#ecb358', [0, y, 1.39], [3.58, 0.055, 0.06])
  for (const x of [-1.82, 1.82]) {
    b.curve(
      'metal',
      '#513d2b',
      [
        [x, 2.95, 0.94],
        [x * 1.1, 2.93, 1.15],
        [x * 1.1, 2.77, 1.15],
      ],
      0.025,
    )
    b.ball('glow', '#e78526', [x * 1.1, 2.48, 1.15], [0.16, 0.28, 0.16])
    for (const y of [2.2, 2.76])
      b.cylinder('gold', '#aa6b28', [x * 1.1, y, 1.15], 0.13, 0.13, 0.055)
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4
      b.curve(
        'gold',
        '#d6a352',
        [
          [x * 1.1 + Math.cos(a) * 0.09, 2.23, 1.15 + Math.sin(a) * 0.09],
          [x * 1.1 + Math.cos(a) * 0.162, 2.48, 1.15 + Math.sin(a) * 0.162],
          [x * 1.1 + Math.cos(a) * 0.09, 2.73, 1.15 + Math.sin(a) * 0.09],
        ],
        0.009,
        8,
      )
    }
  }
  for (const x of [-1.27, 1.27])
    for (const z of [-1.09, 1.09]) {
      b.cylinder(
        'metal',
        '#242b2c',
        [x, 0.43, z],
        0.43,
        0.43,
        0.16,
        [Math.PI / 2, 0, 0],
        20,
      )
      const front = z + Math.sign(z) * 0.09
      b.ring('gold', '#d3a15b', [x, 0.43, front], 0.34, 0.035)
      b.cylinder('gold', '#b98c46', [x, 0.43, front], 0.09, 0.09, 0.05, [
        Math.PI / 2,
        0,
        0,
      ])
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4
        b.curve(
          'gold',
          '#a98b57',
          [
            [x, 0.43, front],
            [x + Math.cos(a) * 0.33, 0.43 + Math.sin(a) * 0.33, front],
          ],
          0.018,
          1,
        )
      }
    }
  b.box('metal', '#42494a', [-0.65, 1.52, 0], [1.55, 0.2, 1.35])
  for (let i = 0; i < 6; i++)
    fish(
      b,
      [-1.1 + (i % 3) * 0.46, 1.65, -0.36 + Math.floor(i / 3) * 0.65],
      0.23,
    )
  b.box('metal', '#aaa99c', [0.97, 1.62, -0.1], [0.92, 0.37, 0.76])
  b.box('metal', '#353b39', [0.97, 1.64, 0.29], [0.72, 0.19, 0.025])
  for (const x of [0.65, 1.23])
    b.cylinder('gold', '#b79559', [x, 1.81, 0.31], 0.045, 0.045, 0.04, [
      Math.PI / 2,
      0,
      0,
    ])
  for (const x of [-1.5, 1.48]) {
    b.cylinder('paint', '#e5c584', [x, 1.72, -0.65], 0.11, 0.09, 0.45)
    b.cylinder('paint', '#9a4d28', [x, 1.98, -0.65], 0.035, 0.035, 0.1)
  }
  // Rear shelves and shutters remain visible when walking around the cart.
  for (const y of [0.63, 0.95, 1.7])
    b.box('wood', '#a67a45', [0, y, -1.04], [3.2, 0.06, 0.23])
  b.box('paint', '#f6d5a1', [0, 0.79, 1.09], [1.55, 0.58, 0.035])
  return b.finish()
}
// Retain the earlier procedural source without allocating unused geometry.
export const createFishCartArt = cartArt
function boothArt() {
  const b = new PropBuilder([12, 8], 'vr-booth')
  // The thin stone apron stays below the existing auto-step height.
  b.box('stone', '#b5b6ae', [0, 0.07, 0], [12.5, 0.14, 8.6])
  for (let x = -6; x <= 6; x += 0.6)
    for (const z of [-4.23, 4.23])
      b.box('stone', '#d0caba', [x, 0.07, z], [0.57, 0.14, 0.3])
  for (const side of [-1, 1]) {
    b.box('wood', '#7a5140', [side * 6.2, 0.5, -0.2], [0.15, 1, 8.2])
    for (let z = -4; z < 3.9; z += 0.45)
      b.box('wood', '#8f6548', [side * 6.2, 1.85, z], [0.14, 1.7, 0.07])
    for (const y of [1.08, 2.65, 3.64])
      b.box('wood', '#ac784d', [side * 6.2, y, -0.2], [0.2, 0.16, 8.4])
  }
  b.box('wood', '#5c4141', [0, 1.6, -4.3], [12.5, 3.2, 0.2])
  for (const x of [-6.05, 6.05])
    for (const z of [-4.12, 3.65]) {
      b.cylinder('stone', '#c6c1b2', [x, 0.2, z], 0.32, 0.36, 0.4)
      b.cylinder('wood', '#a56c47', [x, 1.98, z], 0.19, 0.24, 3.56)
      for (const y of [0.43, 3.55])
        b.cylinder('gold', '#bd945d', [x, y, z], 0.25, 0.25, 0.13)
    }
  for (const z of [-4.1, 3.65]) {
    b.box('wood', '#98603e', [0, 3.6, z], [12.5, 0.3, 0.3])
    b.box('paint', '#365e56', [0, 3.83, z], [12.7, 0.17, 0.38])
    for (let x = -5.7; x < 6; x += 0.7)
      b.box('gold', '#c2a26a', [x, 3.78, z + 0.21], [0.14, 0.09, 0.04])
    for (let x = -5.8; x < 6; x += 0.6)
      b.ball('glow', '#f7d59a', [x, 3.44, z], [0.055, 0.055, 0.055])
  }
  hipRoof(b, 13.5, 9.8, 3.89, 2.15)
  for (const x of [-3, 0, 3]) {
    b.box('metal', '#303640', [x, 0.5, -2], [1.8, 1, 1])
    b.box('paint', '#40375d', [x, 0.6, -1.49], [1.55, 0.68, 0.015])
    b.box('metal', '#1e2935', [x, 1.25, -2], [0.5, 0.5, 0.4])
    b.box('metal', '#4a5160', [x, 1.57, -2], [0.85, 0.52, 0.12], [-0.18, 0, 0])
    b.box(
      'paint',
      '#a4c5e2',
      [x, 1.61, -1.91],
      [0.66, 0.32, 0.02],
      [-0.18, 0, 0],
    )
    b.box('paint', '#ebebdf', [x, 1.06, -1.73], [0.42, 0.17, 0.25])
    b.box('metal', '#3c4152', [x, 1.08, -1.58], [0.28, 0.09, 0.02])
    b.box('gold', '#7fa9cf', [x, 0.98, -1.48], [1.55, 0.025, 0.02])
  }
  return b.finish()
}
export const vrBoothArt = boothArt()
