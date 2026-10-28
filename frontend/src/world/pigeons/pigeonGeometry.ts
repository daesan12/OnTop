import {
  SphereGeometry,
  MeshStandardMaterial,
  PlaneGeometry,
  ShaderMaterial,
} from 'three'
import { PropBuilder, type XYZ } from '../art/propGeometry'

const body = new PropBuilder([12, 8], 'pigeon-body'),
  head = new PropBuilder([12, 8], 'pigeon-head'),
  folded = new PropBuilder([12, 8], 'pigeon-folded-wing'),
  wing = new PropBuilder([12, 8], 'pigeon-wing'),
  foot = new PropBuilder([12, 8], 'pigeon-foot')
const feather = (
  b: PropBuilder,
  c: string,
  p: XYZ,
  s: XYZ,
  r: XYZ = [0, 0, 0],
) => b.add('paint', new SphereGeometry(1, 10, 6), c, p, s, r)
// Original reference-inspired rock pigeon, about 28cm tall; forward is +Z.
body.add(
  'paint',
  new SphereGeometry(1, 24, 16),
  '#8a8d97',
  [0, 0.137, 0],
  [0.078, 0.1, 0.133],
)
body.add(
  'paint',
  new SphereGeometry(1, 20, 12),
  '#737785',
  [0, 0.2, 0.067],
  [0.047, 0.072, 0.05],
)
for (let i = 0; i < 7; i++)
  feather(
    body,
    i % 2 ? '#555b68' : '#666c78',
    [(i - 3) * 0.014, 0.115, -0.15],
    [0.011, 0.008, 0.097],
    [0.18, 0, (i - 3) * 0.04],
  )
for (let side = -1; side <= 1; side += 2)
  for (let row = 0; row < 3; row++)
    for (let j = 0; j < 5; j++) {
      feather(
        body,
        j % 2 ? '#90949c' : '#858993',
        [side * (0.056 + row * 0.006), 0.12 + row * 0.022, 0.07 - j * 0.032],
        [0.012, 0.016, 0.022],
        [0, side * 0.35, side * 0.2],
      )
    }
// Head geometry is relative to a neck joint so pecking bends the neck naturally.
head.add(
  'paint',
  new SphereGeometry(1, 20, 12),
  '#59616d',
  [0, 0.043, 0.012],
  [0.046, 0.068, 0.046],
)
head.add(
  'paint',
  new SphereGeometry(1, 24, 16),
  '#777d89',
  [0, 0.091, 0.027],
  [0.046, 0.047, 0.049],
)
for (let i = 0; i < 7; i++)
  for (let row = 0; row < 3; row++) {
    const a = (i - 3) * 0.43
    feather(
      head,
      row === 0 ? '#68617e' : i % 2 ? '#437a71' : '#49776e',
      [Math.sin(a) * 0.04, 0.012 + row * 0.016, 0.015 + Math.cos(a) * 0.033],
      [0.012, 0.015, 0.006],
      [0, a, 0],
    )
  }
head.cylinder(
  'paint',
  '#343b45',
  [0, 0.074, 0.086],
  0.001,
  0.017,
  0.048,
  [Math.PI / 2 + 0.25, 0, 0],
  8,
)
head.ball('paint', '#c9bec1', [0, 0.089, 0.069], [0.018, 0.011, 0.016])
for (const s of [-1, 1]) {
  head.ball('paint', '#b0773b', [s * 0.042, 0.1, 0.048], [0.007, 0.013, 0.013])
  head.ball(
    'paint',
    '#171c24',
    [s * 0.048, 0.101, 0.049],
    [0.004, 0.008, 0.008],
  )
  head.ball('paint', '#e1e5e5', [s * 0.05, 0.105, 0.052], [0.002, 0.002, 0.002])
  feather(
    folded,
    '#999da7',
    [s * 0.071, 0.157, -0.026],
    [0.022, 0.061, 0.116],
    [0.15, 0, s * -0.1],
  )
  for (let row = 0; row < 3; row++)
    for (let j = 0; j < 6; j++) {
      feather(
        folded,
        j === 3 || j === 5 ? '#414855' : row % 2 ? '#a5a8b0' : '#8b909c',
        [s * (0.08 + row * 0.006), 0.19 - row * 0.023, -0.012 - j * 0.027],
        [0.008, 0.018, 0.033],
        [0.2, s * 0.1, s * 0.2],
      )
    }
}
// One outstretched wing is mirrored at the two shoulder joints during flight.
feather(
  wing,
  '#8a909d',
  [0.075, 0, -0.018],
  [0.095, 0.018, 0.088],
  [0, 0.15, 0],
)
for (let i = 0; i < 10; i++)
  feather(
    wing,
    i % 2 ? '#6c7482' : '#7b8390',
    [0.075 + i * 0.019, -0.006, -0.055 - i * 0.006],
    [0.019, 0.008, 0.1 - i * 0.003],
    [0, -0.42 + i * 0.055, 0],
  )
for (let row = 0; row < 2; row++)
  for (let i = 0; i < 8; i++)
    feather(
      wing,
      row ? '#444c59' : '#a2a7b0',
      [0.052 + i * 0.023, 0.014, -0.026 - row * 0.03],
      [0.022, 0.007, 0.023],
      [0, -0.3, 0],
    )
foot.cylinder(
  'paint',
  '#a66b69',
  [0, -0.024, 0],
  0.004,
  0.004,
  0.045,
  [0.25, 0, 0],
  6,
)
for (let i = -1; i <= 1; i++) {
  foot.curve(
    'paint',
    '#b57a73',
    [
      [0, -0.045, 0],
      [i * 0.012, -0.054, 0.025],
      [i * 0.019, -0.054, 0.04],
    ],
    0.003,
    4,
  )
  foot.curve(
    'paint',
    '#52515a',
    [
      [i * 0.019, -0.054, 0.04],
      [i * 0.02, -0.054, 0.047],
    ],
    0.002,
    2,
  )
}
foot.curve(
  'paint',
  '#a66b69',
  [
    [0, -0.045, 0],
    [0, -0.054, -0.02],
  ],
  0.003,
  3,
)
const rightWing = wing.finish().paint!
const leftWing = rightWing.clone().scale(-1, 1, 1)
// Reverse winding once; negative instance scales are unsupported by InstancedMesh.
leftWing.setIndex(
  Array.from(
    { length: leftWing.getAttribute('position').count },
    (_, i) => Math.floor(i / 3) * 3 + 2 - (i % 3),
  ),
)
export const pigeonGeometry = {
  body: body.finish().paint!,
  head: head.finish().paint!,
  folded: folded.finish().paint!,
  leftWing,
  rightWing,
  foot: foot.finish().paint!,
  shadow: new PlaneGeometry(1, 1),
}
export const pigeonMaterial = new MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.78,
})
export const pigeonShadowMaterial = new ShaderMaterial({
  transparent: true,
  depthWrite: false,
  vertexShader:
    'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}',
  fragmentShader:
    'varying vec2 vUv;void main(){float d=length((vUv-.5)*2.);gl_FragColor=vec4(.08,.075,.06,pow(max(0.,1.-d*d),2.)*.24);}',
})
