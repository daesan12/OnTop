import { ExtrudeGeometry, Shape } from 'three'
import { hipRoof, PropBuilder, type XYZ } from '../../world/art/propGeometry'

/**
 * 공개 추첨 무대의 배치 기준(m). 정면은 +Z, 바닥은 y=0이다.
 * 무대 본체 약 8.2m × 3.6m, 간판 꼭대기 약 6.1m. 좌측 깃발과 우측 결과판까지 폭 약 12m.
 */
export const LIVE_LAYOUT = {
  drum: { y: 2.25, z: .25 },
  /** 지붕 묶음의 앞뒤 위치. 앞 처마(z 0.7)가 간판 뒷면(z 0.89)보다 뒤에 온다 */
  roofZ: -.55,
  wheelX: 1.95,
  display: { position: [0, 2.25, .905] as XYZ, size: [3.2, .96] as const },
  plaque: { position: [0, 3.15, .875] as XYZ, size: [2.7, .5] as const },
  sign: { position: [0, 4.62, 1.125] as XYZ, size: [4.6, 1] as const },
  lanterns: [[-3.25, 3.26, 1.32], [3.25, 3.26, 1.32]] as XYZ[],
  board: { position: [5.35, 0, 1] as XYZ, yaw: -.3, face: { position: [0, 2.3, .078] as XYZ, size: [2.36, 3.26] as const } },
  banner: { position: [-5, 0, 1.8] as XYZ, yaw: .3, face: { position: [.52, 2.38, 0] as XYZ, size: [.92, 1.8] as const } },
} as const

const C = {
  wood: '#6e3823', woodDark: '#4f2618', woodRed: '#7b3826', housing: '#55291b',
  red: '#b3302c', redDeep: '#8c2522', ivory: '#f2e3c4', gold: '#d9a441', goldLight: '#f0c35a',
  stone: '#cbc2b0', stoneLight: '#ddd5c4',
}

/** 전구 하나. seq는 왼쪽→오른쪽 순서(0~1), dist는 이름 창 중심에서의 거리(0~1) */
export interface Bulb { p: XYZ; r: number; seq: number; dist: number }

function star(points = 5, inner = .45, depth = .08) {
  const shape = new Shape()
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : 1, a = Math.PI / 2 + i * Math.PI / points
    if (i) shape.lineTo(Math.cos(a) * r, Math.sin(a) * r)
    else shape.moveTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  const g = new ExtrudeGeometry(shape, { depth, bevelEnabled: false })
  g.translate(0, 0, -depth / 2)
  return g
}

function buildMachine() {
  const body = new PropBuilder()
  const lanterns = new PropBuilder()
  /** 닉네임 창 금색 테두리. 당첨 순간 따로 밝히려고 분리한다. */
  const frame = new PropBuilder()
  /** 지붕은 간판 뒤로 물려 앞 처마가 간판 글자를 가리지 않게 한다. */
  const roof = new PropBuilder()
  /** 전구는 하나씩 순차 점등해야 하므로 위치만 모아 인스턴스로 그린다. 금색 소켓은 고정 모형에 넣는다. */
  const bulbs: Bulb[] = []
  const bulb = (_: number, p: XYZ, r = .07, socket = true) => {
    bulbs.push({ p, r, seq: 0, dist: 0 })
    if (socket) body.cylinder('gold', '#b8862f', [p[0], p[1], p[2] - r * .6], r * 1.45, r * 1.45, .03, [Math.PI / 2, 0, 0], 8)
  }

  // 2단 돌 기단, 앞 계단, 빨간 카펫
  body.box('stone', C.stone, [0, .14, .1], [8.2, .28, 3.6])
  body.box('stone', C.stoneLight, [0, .38, 0], [7.6, .2, 3.1])
  for (const [y, z, h, d] of [[.1, 2.2, .2, .6], [.36, 1.72, .16, .34], [.62, 1.3, .28, .5]] as const) {
    body.box('stone', '#e2dccd', [0, y, z], [2.9, h, d])
    body.box('paint', C.red, [0, y + h / 2 + .006, z], [1.7, .014, d])
    body.box('paint', '#9d2a26', [0, y, z + d / 2 + .006], [1.7, h, .014])
  }
  body.box('paint', C.red, [0, .856, .5], [1.7, .014, 1.1])

  // 무대 바닥과 앞면 전구
  body.box('wood', C.wood, [0, .665, -.2], [7.2, .37, 2.5])
  body.box('paint', '#9c2b25', [0, .665, 1.06], [7.2, .3, .03])
  body.box('gold', C.gold, [0, .855, 1.075], [7.26, .05, .06])
  body.box('gold', C.gold, [0, .49, 1.075], [7.26, .04, .06])
  for (let i = 0, x = -3.3; x <= 3.31; x += .5, i++) if (Math.abs(x) > 1.6) bulb(i, [x, .665, 1.1], .06)

  // 뒷벽, 붉은 안벽, 옆벽
  body.box('wood', C.housing, [0, 2.45, -.95], [6.4, 3.2, .9])
  body.box('paint', C.redDeep, [0, 2.45, -.48], [6, 3.1, .04])
  for (const x of [-2.55, 2.55]) body.box('gold', '#c9953c', [x, 2.45, -.45], [.05, 2.9, .02])
  for (const s of [-1, 1]) body.box('wood', '#64301f', [s * 3.12, 2.45, -.15], [.26, 3.2, 1.5])

  // 기둥과 등롱
  for (const s of [-1, 1]) {
    const x = s * 3.25
    body.box('wood', C.woodRed, [x, 2.6, .75], [.44, 3.5, .44])
    body.box('gold', C.gold, [x, .92, .75], [.54, .14, .54])
    body.box('gold', C.gold, [x, 4.38, .75], [.54, .1, .54])
    for (const y of [2, 3.2]) body.box('gold', '#e2b14f', [x, y, .75], [.48, .06, .48])
    body.box('wood', C.woodDark, [x, 3.78, 1.05], [.08, .08, .62])
    body.box('wood', C.woodDark, [x, 3.66, 1.32], [.03, .2, .03])
    for (const y of [3.53, 2.99]) body.box('wood', C.woodDark, [x, y, 1.32], [.46, .07, .46])
    for (const [dx, dz] of [[-.2, -.2], [.2, -.2], [-.2, .2], [.2, .2]] as const)
      body.box('wood', C.woodDark, [x + dx, 3.26, 1.32 + dz], [.04, .5, .04])
    body.box('paint', '#c0392b', [x, 2.86, 1.32], [.05, .2, .05])
    lanterns.box('glow', '#ffe0a0', [x, 3.26, 1.32], [.36, .48, .36])
    // 옆 휘장과 금색 끈
    for (let i = 0; i < 4; i++)
      body.box('paint', i % 2 ? C.ivory : C.red, [s * (2.62 + i * .1), 2.35, .58 - i * .02], [.11, 2.7, .08])
    body.box('gold', C.gold, [s * 2.77, 1.9, .64], [.42, .06, .06])
  }

  // 위 휘장
  body.box('paint', '#9d2a26', [0, 3.86, .6], [6.1, .16, .08])
  body.box('gold', C.gold, [0, 3.95, .62], [6.1, .03, .06])
  for (let i = 0; i < 10; i++) body.ball('paint', i % 2 ? C.ivory : C.red, [-2.7 + i * .6, 3.72, .6], [.32, .17, .08])

  // 추첨통 받침과 큰 전구 6개
  body.box('wood', '#5a2c1d', [0, 1.22, .35], [4.6, .62, 1.1])
  body.box('gold', C.gold, [0, 1.555, .35], [4.7, .05, 1.16])
  body.box('paint', '#7c2520', [0, 1.2, .91], [4.4, .44, .02])
  for (const s of [-1, 1]) body.box('gold', '#c9953c', [s * LIVE_LAYOUT.wheelX, 1.8, LIVE_LAYOUT.drum.z], [.26, .5, .26])
  for (let i = 0; i < 6; i++) {
    const x = -1.75 + i * .7
    body.cylinder('gold', C.gold, [x, 1.2, .935], .16, .16, .04, [Math.PI / 2, 0, 0], 8)
    bulb(i, [x, 1.2, .97], .12, false)
  }

  // 가로 추첨통과 닉네임 창 틀
  const { y: dy0, z: dz0 } = LIVE_LAYOUT.drum
  body.cylinder('paint', '#f2e1bd', [0, dy0, dz0], .62, .62, 3.6, [0, 0, Math.PI / 2], 16)
  for (const x of [-1.5, 1.5]) body.cylinder('gold', C.gold, [x, dy0, dz0], .66, .66, .1, [0, 0, Math.PI / 2], 16)
  const { position: [dx, dy, dz], size: [dw, dh] } = LIVE_LAYOUT.display
  body.box('wood', '#3a1d12', [dx, dy, dz - .03], [dw + .06, dh + .06, .05])
  for (const s of [-1, 1]) {
    frame.box('gold', '#e0ad48', [dx, dy + s * (dh / 2 + .05), dz + .02], [dw + .26, .1, .1])
    frame.box('gold', '#e0ad48', [s * (dw / 2 + .08), dy, dz + .02], [.1, dh + .2, .1])
    // 테두리 위아래 작은 전구 줄. 당첨 순간 가장 먼저 켜진다.
    for (let i = 0, x = -1.44; x <= 1.45; x += .36, i++) bulb(i, [x, dy + s * (dh / 2 + .05), dz + .1], .04, false)
  }

  // 발표 현판
  const { position: [px, py, pz], size: [pw, ph] } = LIVE_LAYOUT.plaque
  body.box('wood', '#4a2116', [px, py, pz - .05], [pw + .2, ph + .14, .1])
  for (const s of [-1, 1]) {
    body.box('gold', C.gold, [px, py + s * (ph / 2 + .07), pz - .01], [pw + .3, .05, .1])
    body.box('gold', C.gold, [px + s * (pw / 2 + .12), py, pz - .01], [.05, ph + .19, .1])
    body.box('gold', '#c9953c', [s * 1, 3.62, pz - .06], [.04, .3, .04])
  }

  // 지붕(간판 뒤 z 0.7까지)과 상단 간판
  hipRoof(roof, 7.4, 2.5, 3.98, .85, true)
  const { position: [sx, sy, sz], size: [sw, sh] } = LIVE_LAYOUT.sign
  body.box('paint', '#6d1d1b', [sx, sy, sz - .12], [sw + .3, sh + .2, .22])
  for (const s of [-1, 1]) {
    // 간판을 지붕 처마에 고정하는 금색 받침
    body.box('gold', '#b8862f', [s * 1.6, sy - .1, .8], [.1, .5, .22])
    body.box('gold', C.gold, [sx, sy + s * (sh / 2 + .1), sz - .08], [sw + .45, .1, .26])
    body.box('gold', C.gold, [sx + s * (sw / 2 + .2), sy, sz - .08], [.1, sh + .3, .26])
    body.box('paint', '#7a2620', [s * 3.05, sy - .05, sz - .2], [.95, .72, .16], [0, 0, -s * .2])
    body.add('gold', star(), C.goldLight, [s * 3.08, sy - .03, sz - .08], [.24, .24, 1], [0, 0, -s * .2])
    body.add('gold', star(), C.goldLight, [s * 1.75, sy + sh / 2 + .4, sz - .1], [.22, .22, 1])
    body.ball('gold', C.gold, [s * .66, sy + sh / 2 + .38, sz - .1], [.3, .1, .04])
  }
  for (let i = 0, x = -2.3; x <= 2.31; x += .383, i++) {
    bulb(i, [x, sy + sh / 2 + .1, sz + .07])
    bulb(i + 1, [x, sy - sh / 2 - .1, sz + .07])
  }
  for (const s of [-1, 1]) for (let i = -1; i <= 1; i++) bulb(i + 1, [s * (sw / 2 + .2), sy + i * .3, sz + .07])

  // 간판 위 메달과 매화
  const my = sy + sh / 2 + .48
  body.cylinder('paint', '#b8312b', [0, my, sz - .1], .45, .45, .14, [Math.PI / 2, 0, 0], 16)
  body.ring('gold', '#e8b84f', [0, my, sz - .02], .45, .05)
  for (let i = 0; i < 5; i++) {
    const a = Math.PI / 2 + i * 2 * Math.PI / 5
    body.ball('gold', '#f3cf6e', [Math.cos(a) * .17, my + Math.sin(a) * .17, sz - .01], [.12, .12, .04])
  }
  body.ball('paint', '#b8312b', [0, my, sz + .01], [.07, .07, .03])

  // 뒷면 문양
  const ey = 2.75, ez = -1.42
  body.ring('gold', C.gold, [0, ey, ez], .62, .06)
  for (let i = 0; i < 5; i++) {
    const a = Math.PI / 2 + i * 2 * Math.PI / 5
    body.ball('gold', '#e8b84f', [Math.cos(a) * .28, ey + Math.sin(a) * .28, ez - .02], [.2, .2, .05])
  }
  body.ball('paint', '#b8312b', [0, ey, ez - .04], [.1, .1, .04])
  for (const x of [-2.4, -1.2, 1.2, 2.4]) body.box('gold', '#b98a3a', [x, 2.45, -1.415], [.06, 2.9, .03])
  body.box('gold', '#b98a3a', [0, 1.2, -1.415], [6.2, .06, .03])

  // 선물 상자
  for (const [x, z, size, ribbon] of [[-4.25, 2.55, .55, '#c6312c'], [-3.7, 2.8, .36, C.gold], [4.1, 2.75, .42, '#c6312c']] as const) {
    body.box('paint', '#f6f0e4', [x, size / 2, z], [size, size, size])
    body.box('paint', ribbon, [x, size / 2 + .005, z], [size + .02, size + .01, size * .18])
    body.box('paint', ribbon, [x, size / 2 + .005, z], [size * .18, size + .01, size + .02])
    for (const s of [-1, 1]) body.ball('paint', ribbon, [x + s * size * .16, size + .05, z], [size * .18, size * .12, size * .1])
  }

  const xs = bulbs.map(b => b.p[0]), min = Math.min(...xs), max = Math.max(...xs)
  for (const b of bulbs) {
    b.seq = (b.p[0] - min) / (max - min)
    b.dist = Math.min(1, Math.hypot(b.p[0], b.p[1] - LIVE_LAYOUT.display.position[1]) / 4.2)
  }
  return { body: body.finish(), lanterns: lanterns.finish(), frame: frame.finish(), roof: roof.finish(), bulbs }
}

/** 추첨통 양 끝 금색 바퀴. 회전 속도에 맞춰 돌아간다. 축은 X이고 원점이 축 중심이다. */
function buildWheel() {
  const w = new PropBuilder()
  w.cylinder('gold', C.gold, [0, 0, 0], .98, .98, .3, [0, 0, Math.PI / 2], 16)
  w.cylinder('wood', '#5a2c1d', [0, 0, 0], .74, .74, .32, [0, 0, Math.PI / 2], 16)
  for (let k = 0; k < 4; k++) w.box('gold', C.goldLight, [0, 0, 0], [.36, 1.52, .11], [k * Math.PI / 4, 0, 0])
  w.cylinder('gold', '#f3cf6e', [0, 0, 0], .2, .2, .44, [0, 0, Math.PI / 2], 8)
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4
    for (const s of [-1, 1]) w.ball('gold', '#f6d77f', [s * .16, Math.sin(a) * .86, Math.cos(a) * .86], [.055, .055, .055])
  }
  return w.finish()
}

/** 우측 결과판 받침. 원점은 받침 바닥 중앙, 정면은 +Z */
function buildBoard() {
  const b = new PropBuilder()
  for (const s of [-1, 1]) {
    b.box('wood', '#5b2d1d', [s * 1.2, 2, -.03], [.16, 4, .16])
    b.box('stone', C.stone, [s * 1.2, .08, -.03], [.42, .16, .5])
    b.box('gold', C.gold, [0, 2.3 + s * 1.72, .07], [2.62, .08, .06])
    b.box('gold', C.gold, [s * 1.27, 2.3, .07], [.08, 3.52, .06])
    b.box('tile', '#9e3b2a', [0, 4.28, s * .13], [2.95, .06, .34], [s * .6, 0, 0])
  }
  b.box('wood', '#4d2516', [0, 2.3, 0], [2.5, 3.4, .14])
  b.box('wood', '#5b2d1d', [0, 2.3, -.075], [2.3, 3.2, .02])
  b.box('wood', '#3f1f14', [0, 4.12, 0], [2.8, .1, .42])
  b.box('gold', C.gold, [0, 4.38, 0], [2.95, .05, .06])
  return b.finish()
}

/** 좌측 행사 깃발 받침. 원점은 깃대 바닥 */
function buildBanner() {
  const b = new PropBuilder()
  b.box('stone', C.stone, [0, .08, 0], [.5, .16, .5])
  b.cylinder('gold', C.gold, [0, 1.85, 0], .05, .06, 3.5, [0, 0, 0], 8)
  b.ball('gold', C.goldLight, [0, 3.66, 0], [.1, .14, .1])
  b.box('gold', C.gold, [.52, 3.3, 0], [1.1, .05, .05])
  b.ball('gold', C.goldLight, [1.08, 3.3, 0], [.05, .05, .05])
  return b.finish()
}

export const MACHINE_ART = { ...buildMachine(), wheel: buildWheel(), board: buildBoard(), banner: buildBanner() }
