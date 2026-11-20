import {
  BufferGeometry, CatmullRomCurve3, ConeGeometry, CylinderGeometry, Euler, Float32BufferAttribute,
  Quaternion, SphereGeometry, TubeGeometry, Vector3,
} from 'three'
import { PropBuilder, type PropFinish, type XYZ } from '../../world/art/propGeometry'

/** Evergreen sprays, hanging baubles and scalloped garlands following the user's tree reference. */
export function createChristmasTreeArt() {
  const b = new PropBuilder(), palette = ['#163e2b', '#215332', '#2b6038', '#356b41']
  const add = (g: BufferGeometry, color: string, p: XYZ, s: XYZ = [1, 1, 1],
    r: XYZ = [0, 0, 0], finish: PropFinish = 'paint') => b.add(finish, g, color, p, s, r, false, true)
  const ball = (color: string, p: XYZ, radius: number, finish: PropFinish = 'gold') =>
    add(new SphereGeometry(1, finish === 'glow' ? 8 : 14, finish === 'glow' ? 6 : 10), color, p,
      [radius, radius, radius], [0, 0, 0], finish)
  const radiusAt = (y: number) => Math.max(.08, 2.23 * (1 - (y - .48) / 6.45))
  add(new CylinderGeometry(.16, .23, .85, 12), '#60452f', [0, .425, 0], [1, 1, 1], [0, 0, 0], 'wood')
  add(new ConeGeometry(1.92, 6.35, 32), '#173e29', [0, 3.655, 0])

  for (let tier = 0; tier < 13; tier++) {
    const y = .63 + tier * .47, radius = radiusAt(y), count = Math.max(6, 19 - tier)
    for (let j = 0; j < count; j++) {
      const angle = j * Math.PI * 2 / count + tier * .71, jitter = Math.sin(j * 17.3 + tier * 4.9)
      const reach = radius * (1 + jitter * .035)
      const start = new Vector3(Math.sin(angle) * radius * .72, y + .48, Math.cos(angle) * radius * .72)
      const end = new Vector3(Math.sin(angle) * reach, y + jitter * .065, Math.cos(angle) * reach)
      const direction = end.clone().sub(start), length = direction.length()
      const rotation = new Euler().setFromQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.clone().normalize()))
      const width = .12 + radius * .145
      add(new ConeGeometry(1, 1, 7), palette[(tier + j) % palette.length]!, start.add(end).multiplyScalar(.5).toArray(),
        [width, length, width * .62], [rotation.x, rotation.y, rotation.z])
      // Small upright tips break up the smooth core without adding separate draw calls.
      const tipRadius = radius * .97, tipY = y + .28 + jitter * .035
      add(new ConeGeometry(.12 + radius * .08, .54, 6), palette[(tier + j + 1) % palette.length]!,
        [Math.sin(angle + .09) * tipRadius, tipY, Math.cos(angle + .09) * tipRadius])
      add(new ConeGeometry(.09 + radius * .065, .46, 6), palette[(tier + j + 2) % palette.length]!,
        [Math.sin(angle - .12) * tipRadius, tipY - .12, Math.cos(angle - .12) * tipRadius])
    }
  }
  add(new ConeGeometry(.19, .8, 9), '#235936', [0, 6.53, 0])

  for (let row = 0; row < 9; row++) {
    const y = .66 + row * .655, count = 15 - row
    for (let j = 0; j < count; j++) {
      const angle = j * Math.PI * 2 / count + row * .83, height = y + Math.sin(j * 4.7 + row) * .09
      const radius = radiusAt(height) + .035, size = .115 - row * .006 + (j % 3) * .008
      const position: XYZ = [Math.sin(angle) * radius, height, Math.cos(angle) * radius]
      const color = ['#b82332', '#d9b96d', '#eee3bb'][(j + row * 2) % 3]!
      ball(color, position, size)
      add(new CylinderGeometry(.024, .024, .035, 8), '#b08c45', [position[0], height + size + .012, position[2]],
        [1, 1, 1], [0, 0, 0], 'gold')
    }
  }

  const garland: Vector3[] = [], lights: Vector3[] = []
  for (let i = 0; i <= 360; i++) {
    const t = i / 360, angle = t * Math.PI * 12 + .3
    const y = 6.40 - t * 5.78 - .16 * Math.sin(angle * 3) ** 2, radius = radiusAt(y) + .11
    garland.push(new Vector3(Math.sin(angle) * radius, y, Math.cos(angle) * radius))
    const lightAngle = angle + .13
    lights.push(new Vector3(Math.sin(lightAngle) * (radius + .02), y + .035, Math.cos(lightAngle) * (radius + .02)))
  }
  add(new TubeGeometry(new CatmullRomCurve3(garland), 360, .016, 5, false), '#d5b76d', [0, 0, 0], [1, 1, 1], [0, 0, 0], 'gold')
  add(new TubeGeometry(new CatmullRomCurve3(lights), 360, .007, 4, false), '#3a4b2e', [0, 0, 0])
  for (let i = 0; i < lights.length; i += 4) ball('#ffe3a0', lights[i]!.toArray(), .033, 'glow')

  // Raised front/back centres give the five-point topper a folded metallic surface.
  const star: number[] = [], centreY = 7.20
  for (let i = 0; i < 10; i++) {
    const point = (n: number): XYZ => {
      const a = n * Math.PI / 5, r = n % 2 === 0 ? .48 : .205
      return [Math.sin(a) * r, centreY + Math.cos(a) * r, 0]
    }
    const a = point(i), c = point((i + 1) % 10)
    star.push(0, centreY, .14, ...a, ...c, 0, centreY, -.14, ...c, ...a)
  }
  const topper = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(star, 3))
  topper.computeVertexNormals(); add(topper, '#e9dfbf', [0, 0, 0], [1, 1, 1], [0, 0, 0], 'gold')
  add(new CylinderGeometry(.032, .032, .35, 10), '#cbb676', [0, 6.88, 0], [1, 1, 1], [0, 0, 0], 'gold')
  return b.finish()
}
