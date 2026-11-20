import {
  BufferGeometry, CylinderGeometry, Euler, Float32BufferAttribute, LatheGeometry,
  Quaternion, Shape, ShapeGeometry, SphereGeometry, TorusGeometry, Vector2, Vector3,
} from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { PropBuilder } from '../../world/art/propGeometry'

type Point = [number, number, number]
export type HolidayKind = 'snowman' | 'gifts' | 'santa'
const snow = '#f4f8fc', red = '#c82e3b', gold = '#e6b443', coal = '#20242b'

/** Hand-authored meshes following the user's three image references; no raster images or stock marks. */
export function createHolidayArt(kind: HolidayKind) {
  const b = new PropBuilder([20, 14])
  const add = (geometry: BufferGeometry, color: string, position: Point, scale: Point = [1, 1, 1],
    rotation: Point = [0, 0, 0], finish: 'paint' | 'wood' | 'gold' = 'paint') =>
    b.add(finish, geometry, color, position, scale, rotation, false, true)
  const ball = (color: string, p: Point, s: Point) => add(new SphereGeometry(1, 20, 14), color, p, s)
  const box = (color: string, p: Point, s: Point, r: Point = [0, 0, 0], finish: 'paint' | 'gold' = 'paint') =>
    add(new RoundedBoxGeometry(...s, 2, Math.min(.025, Math.min(...s) / 3)), color, p, [1, 1, 1], r, finish)
  const cylinder = (color: string, p: Point, top: number, bottom: number, h: number,
    r: Point = [0, 0, 0], finish: 'paint' | 'wood' | 'gold' = 'paint') =>
    add(new CylinderGeometry(top, bottom, h, 24), color, p, [1, 1, 1], r, finish)
  const ring = (color: string, p: Point, radius: number, tube: number, r: Point = [0, 0, 0]) =>
    add(new TorusGeometry(radius, tube, 8, 32), color, p, [1, 1, 1], r)
  const beam = (color: string, from: Point, to: Point, radius: number) => {
    const a = new Vector3(...from), end = new Vector3(...to), direction = end.clone().sub(a)
    const rotation = new Euler().setFromQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.clone().normalize()))
    add(new CylinderGeometry(radius * .75, radius, direction.length(), 8), color,
      a.add(end).multiplyScalar(.5).toArray(), [1, 1, 1], [rotation.x, rotation.y, rotation.z], 'wood')
  }

  if (kind === 'snowman') {
    ball(snow, [0, .73, 0], [.8, .76, .77])
    ball('#f9fbff', [0, 1.51, 0], [.56, .57, .54])
    ball(snow, [0, 2.22, 0], [.38, .38, .36])
    const tilt: Point = [0, 0, -.13]
    cylinder(coal, [0, 2.59, 0], .46, .46, .075, tilt)
    cylinder('#292b31', [.025, 2.80, 0], .285, .27, .4, tilt)
    cylinder(red, [.01, 2.66, 0], .279, .277, .085, tilt)
    ring(red, [0, 1.90, 0], .34, .09, [Math.PI / 2, 0, 0])
    box(red, [.29, 1.65, .48], [.22, .7, .085], [0, 0, .11])
    box('#a31d30', [.09, 1.75, .49], [.18, .48, .08], [0, 0, -.16])
    for (let i = 0; i < 6; i++) cylinder(red, [.19 + i * .037, 1.275 + i * .004, .48], .012, .012, .13)
    for (const x of [-.135, .135]) ball(coal, [x, 2.29, .324], [.043, .047, .034])
    for (const x of [-.235, .235]) ball('#e9cbd0', [x, 2.15, .28], [.055, .035, .016])
    for (let i = 0; i < 7; i++) {
      const angle = i / 6 * Math.PI, x = Math.cos(angle) * .21, y = 2.13 - Math.sin(angle) * .12
      ball(coal, [x, y, Math.sqrt(.36 ** 2 - x ** 2 - (y - 2.22) ** 2) + .018], [.024, .025, .022])
    }
    cylinder('#ed8c27', [0, 2.19, .48], .008, .075, .32, [Math.PI / 2, 0, 0])
    for (const [y, z] of [[1.72, .49], [1.42, .545], [1.09, .69]]) ball(coal, [0, y!, z!], [.07, .072, .048])
    for (const side of [-1, 1]) {
      beam('#795033', [side * .45, 1.65, 0], [side * 1.14, 2.05, .015], .038)
      beam('#795033', [side * 1.03, 1.99, .015], [side * 1.19, 2.34, .02], .025)
      beam('#795033', [side * 1.07, 2.01, .015], [side * 1.42, 2.12, .04], .024)
      beam('#795033', [side * 1.22, 2.07, .03], [side * 1.39, 2.29, .035], .021)
    }
  } else if (kind === 'gifts') {
    const star = () => {
      const shape = new Shape()
      for (let i = 0; i < 10; i++) {
        const a = i * Math.PI / 5, r = i % 2 ? .013 : .03
        if (i === 0) shape.moveTo(Math.sin(a) * r, Math.cos(a) * r)
        else shape.lineTo(Math.sin(a) * r, Math.cos(a) * r)
      }
      shape.closePath(); return new ShapeGeometry(shape)
    }
    const bow = (x: number, y: number, z: number, color: string, size: number) => {
      for (let side = 0; side < 4; side++) {
        const vertices: number[] = [], indices: number[] = [], angle = side * Math.PI / 2 + .3
        for (let i = 0; i <= 24; i++) {
          const t = i / 24 * Math.PI * 2, distance = (1 - Math.cos(t)) * size * .27
          const h = Math.sin(t) * size * .21 + (1 - Math.cos(t)) * size * .11
          for (const edge of [-1, 1]) vertices.push(x + Math.cos(angle) * distance - Math.sin(angle) * edge * size * .075,
            y + h, z + Math.sin(angle) * distance + Math.cos(angle) * edge * size * .075)
          if (i < 24) { const k = i * 2; indices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3) }
        }
        const g = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(vertices, 3)).setIndex(indices)
        g.computeVertexNormals(); add(g, color, [0, 0, 0], [1, 1, 1], [0, 0, 0], 'gold')
      }
      ball(color, [x, y + .025, z], [size * .12, size * .09, size * .12])
    }
    const gift = (p: Point, s: Point, paper: string, ribbon: string, pattern: string) => {
      const [x, y, z] = p, [w, h, d] = s, band = Math.min(w, d) * .16
      box(paper, p, s)
      box(ribbon, p, [band, h + .018, d + .018], [0, 0, 0], 'gold')
      box(ribbon, p, [w + .018, h + .022, band], [0, 0, 0], 'gold')
      for (let xx = -w / 2 + .08; xx < w / 2 - .03; xx += .13) {
        if (Math.abs(xx) < band * .8) continue
        for (let yy = -h / 2 + .08; yy < h / 2 - .03; yy += .14) add(star(), pattern, [x + xx, y + yy, z + d / 2 + .004])
      }
      for (let zz = -d / 2 + .08; zz < d / 2 - .03; zz += .13) {
        if (Math.abs(zz) < band * .8) continue
        for (let yy = -h / 2 + .08; yy < h / 2 - .03; yy += .14)
          add(star(), pattern, [x + w / 2 + .004, y + yy, z + zz], [1, 1, 1], [0, Math.PI / 2, 0])
      }
      bow(x, y + h / 2 + .035, z, ribbon, Math.min(w, d) * .8)
    }
    gift([-.35, .2, .22], [1.4, .38, .5], '#2d6c8b', gold, '#c8e0dc')
    gift([-.65, .48, -.22], [.54, .94, .52], '#bf2634', gold, '#e9bc80')
    gift([.02, .58, -.32], [.52, 1.14, .5], '#823b85', gold, '#e4b46b')
    gift([-.75, .55, .29], [.5, .32, .45], '#f1e9df', red, '#af3347')
    gift([.07, .35, .12], [.65, .66, .58], '#f5e9df', red, '#b32c45')
    gift([.68, .25, .14], [.74, .48, .64], '#c52637', gold, '#f4d99c')
    gift([.68, .71, .10], [.48, .42, .48], '#28617c', red, '#c4dce5')
    gift([-.03, .18, .62], [.46, .34, .43], '#953d8f', red, '#f3c56b')
  } else {
    for (const x of [-.19, .19]) {
      ball('#181c23', [x, .13, .055], [.17, .14, .26])
      cylinder(red, [x, .33, 0], .115, .105, .28)
    }
    const coat = [[0, .36], [.4, .36], [.46, .43], [.47, .7], [.43, 1.13], [.29, 1.4], [0, 1.46]]
    add(new LatheGeometry(coat.map(p => new Vector2(...p as [number, number])), 24), red, [0, 0, 0], [1, 1, .78])
    const belt = new LatheGeometry([[.475, .50], [.475, .61], [.46, .61], [.46, .50]].map(p => new Vector2(...p as [number, number])), 32)
    add(belt, coal, [0, 0, 0], [1, 1, .79])
    for (const x of [-.105, .105]) box(gold, [x, .555, .388], [.032, .16, .035], [0, 0, 0], 'gold')
    for (const y of [.49, .62]) box(gold, [0, y, .388], [.22, .03, .035], [0, 0, 0], 'gold')
    for (const y of [.76, .95, 1.14]) ball(gold, [0, y, .35], [.047, .047, .025])
    for (const side of [-1, 1]) {
      const from = new Vector3(side * .25, 1.29, 0), to = new Vector3(side * .54, .68, .035)
      const d = to.clone().sub(from), r = new Euler().setFromQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.clone().normalize()))
      cylinder(red, from.add(to).multiplyScalar(.5).toArray(), .16, .125, d.length(), [r.x, r.y, r.z])
      cylinder(gold, [side * .53, .70, .032], .132, .132, .055, [r.x, r.y, r.z], 'gold')
      ball('#efb5b0', [side * .56, .60, .045], [.115, .13, .11])
    }
    ball('#eab7af', [0, 1.74, 0], [.265, .275, .245])
    ball(snow, [0, 1.48, .115], [.29, .29, .22])
    for (let i = 0; i < 7; i++) {
      const a = i / 6 * Math.PI
      ball('#f8faf9', [Math.cos(a) * .215, 1.5 - Math.sin(a) * .20, .22], [.095, .1, .075])
    }
    for (const x of [-.095, .095]) {
      ball(coal, [x, 1.80, .23], [.018, .021, .014])
      ball(snow, [x, 1.64, .255], [.115, .055, .055])
    }
    ball('#e6a29c', [0, 1.70, .285], [.06, .053, .045])
    const hat = new CylinderGeometry(0, .285, .64, 24, 8), positions = hat.getAttribute('position')
    for (let i = 0; i < positions.count; i++) {
      const t = (positions.getY(i) + .32) / .64
      positions.setX(i, positions.getX(i) - .11 * t * t)
    }
    hat.computeVertexNormals(); add(hat, red, [0, 2.30, 0])
    ring(snow, [0, 1.995, 0], .274, .058, [Math.PI / 2, 0, 0])
    ball(snow, [-.11, 2.68, 0], [.12, .12, .12])
    // A tied green present sack beside the lowered hand, and a brass handbell in the other.
    ball('#17452f', [.58, .4, -.14], [.34, .42, .3])
    ball('#1f5137', [.55, .76, -.13], [.14, .20, .13])
    ring('#ae8a42', [.55, .74, -.13], .112, .025, [Math.PI / 2, 0, 0])
    cylinder('#5c4230', [-.56, .49, .055], .04, .04, .16)
    add(new LatheGeometry([[0, .28], [.055, .28], [.07, .22], [.1, .12], [.17, .04], [.18, .01],
      [.135, 0], [.07, .10], [0, .14]].map(p => new Vector2(...p as [number, number])), 24),
      gold, [-.56, .16, .055], [1, 1, 1], [0, 0, 0], 'gold')
    ball('#9d6a24', [-.56, .17, .055], [.04, .055, .04])
  }
  return b.finish()
}
