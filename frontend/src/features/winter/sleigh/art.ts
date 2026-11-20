import { BoxGeometry, CatmullRomCurve3, CylinderGeometry, Euler, ExtrudeGeometry, IcosahedronGeometry,
  Quaternion, Shape, TorusGeometry, TubeGeometry, Vector3, type BufferGeometry } from 'three'
import { PropBuilder, type PropFinish } from '../../../world/art/propGeometry'
type P = [number, number, number]
const red = '#a91f31', gold = '#e3b957', brown = '#98613d'

/** Original low-poly meshes following the red/gold sleigh and paired reindeer reference. */
export function createSleighArt(deer = false) {
  const b = new PropBuilder([8, 5])
  const add = (g: BufferGeometry, color: string, p: P, s: P = [1, 1, 1], r: P = [0, 0, 0], finish: PropFinish = 'paint') =>
    b.add(finish, g, color, p, s, r, false, true)
  const ball = (c: string, p: P, s: P) => add(new IcosahedronGeometry(1, 1), c, p, s)
  const box = (c: string, p: P, s: P) => add(new BoxGeometry(...s), c, p)
  const beam = (c: string, a: P, z: P, radius: number, finish: PropFinish = 'wood') => {
    const from = new Vector3(...a), to = new Vector3(...z), d = to.clone().sub(from)
    const r = new Euler().setFromQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.clone().normalize()))
    add(new CylinderGeometry(radius * .8, radius, d.length(), 6), c, from.add(to).multiplyScalar(.5).toArray(), [1, 1, 1], [r.x, r.y, r.z], finish)
  }
  if (deer) {
    ball(brown, [0, .2, 0], [.35, .48, .7])
    ball('#b77d4d', [0, .68, .45], [.25, .55, .27])
    ball(brown, [0, 1.05, .67], [.24, .27, .38])
    ball('#dbc59b', [0, .91, .93], [.17, .12, .23])
    ball('#382b28', [0, .97, 1.1], [.105, .095, .075])
    ball('#e5d6b6', [0, .45, .53], [.24, .28, .16])
    ball('#eee0bf', [0, .4, -.7], [.13, .19, .19])
    for (const s of [-1, 1]) {
      ball(brown, [s * .3, 1.27, .61], [.22, .105, .1])
      ball('#1c1d21', [s * .21, 1.1, .8], [.043, .045, .041])
      const a: P = [s * .13, 1.26, .59], tip: P = [s * .48, 1.96, .28]
      beam('#e2cda6', a, tip, .045)
      beam('#e2cda6', [s * .26, 1.55, .46], [s * .57, 1.73, .65], .032)
      beam('#e2cda6', [s * .37, 1.76, .36], [s * .2, 2.01, .5], .029)
    }
    box(red, [0, .5, -.04], [.72, .13, .26])
    box(red, [0, .31, .53], [.55, .39, .1])
    for (const s of [-1, 1]) box(gold, [s * .36, .48, -.04], [.03, .22, .29])
    ball(gold, [0, .28, .62], [.075, .09, .065])
  } else {
    box(red, [0, -.35, -.1], [1.65, .5, 2.75])
    box('#e7b878', [0, -.08, -.3], [1.48, .16, 1.05])
    box(red, [0, .45, -1.15], [1.63, 1.2, .24])
    for (const s of [-1, 1]) {
      const shape = new Shape().moveTo(-1.45, -.45).lineTo(1.4, -.45).lineTo(1.62, .4)
        .quadraticCurveTo(.95, .09, .55, .17).lineTo(-.65, .62).quadraticCurveTo(-1.6, 1.2, -1.45, -.45)
      add(new ExtrudeGeometry(shape, { depth: .14, bevelEnabled: false, curveSegments: 8 }), red,
        [s * .82, 0, 0], [1, 1, 1], [0, -Math.PI / 2, 0])
      const runner = [[s * .77, -.84, -1.7], [s * .77, -.9, -.9], [s * .77, -.9, 1.45],
        [s * .77, -.64, 1.95], [s * .77, -.35, 1.85]] as P[]
      add(new TubeGeometry(new CatmullRomCurve3(runner.map(p => new Vector3(...p))), 28, .045, 6, false), gold, [0, 0, 0], [1, 1, 1], [0, 0, 0], 'gold')
      for (const z of [-1, .9]) beam(gold, [s * .77, -.9, z], [s * .77, -.4, z], .04, 'gold')
      const trim = [[s * .91, .6, -1.4], [s * .91, .72, -1], [s * .91, .3, .45], [s * .91, .35, 1.5]] as P[]
      add(new TubeGeometry(new CatmullRomCurve3(trim.map(p => new Vector3(...p))), 24, .035, 6, false), gold, [0, 0, 0], [1, 1, 1], [0, 0, 0], 'gold')
    }
    ball('#ba2738', [0, .6, -1.5], [.7, .9, .6])
    ball('#cc3540', [.15, 1.35, -1.45], [.3, .45, .28])
    add(new TorusGeometry(.25, .04, 6, 12), gold, [.15, 1.15, -1.45], [1, 1, 1], [Math.PI / 2, 0, 0], 'gold')
    box('#29694c', [-.4, .2, -.9], [.48, .5, .5])
    box(gold, [-.4, .2, -.9], [.09, .51, .51])
  }
  return b.finish()
}

/** Local origins are shoulder/hip and knee, so the hoof follows the bent leg. */
export function createReindeerLegArt(lower = false) {
  const b = new PropBuilder([8, 5])
  b.add('wood', new CylinderGeometry(.055, .065, .44, 6), brown, [0, -.22, 0], [1, 1, 1], [0, 0, 0], false, true)
  if (lower) b.add('paint', new BoxGeometry(.16, .16, .24), '#302a28', [0, -.46, .045], [1, 1, 1], [0, 0, 0], false, true)
  return b.finish()
}
