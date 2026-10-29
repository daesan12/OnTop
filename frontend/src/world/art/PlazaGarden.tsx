import { SIMPLE_MAP } from './mapRenderProfile'
import { FOUNTAIN_GARDENS } from '../../config'
import { Instances, seeded, beam, type Part } from './Instances'
import { SurfaceMaterial } from './SurfaceMaterial'
import { BeveledBox } from './BeveledBox'

const wood: Part[] = [],
  soil: Part[] = [],
  shrubs: Part[] = [],
  leaves: Part[] = [],
  trunks: Part[] = []
const random = seeded(5518)
for (const garden of FOUNTAIN_GARDENS) {
  const { x, y, z, yaw } = garden
  const point = (
    dx: number,
    dy: number,
    dz: number,
  ): [number, number, number] => [
    x + dx * Math.cos(yaw) + dz * Math.sin(yaw),
    y + dy,
    z - dx * Math.sin(yaw) + dz * Math.cos(yaw),
  ]
  soil.push({
    p: point(0, 0.3, 0),
    s: [3.6, 0.08, 1.15],
    r: [0, yaw, 0],
    c: '#504936',
  })
  for (let row = 0; row < 4; row++) {
    for (const side of [-1, 1]) {
      wood.push({
        p: point(0, -0.25 + row * 0.15, side * 0.65),
        s: [3.8, 0.14, 0.11],
        r: [0, yaw, 0],
        c: row % 2 ? '#d6cbb7' : '#bdb7a7',
      })
      wood.push({
        p: point(side * 1.85, -0.25 + row * 0.15, 0),
        s: [0.1, 0.14, 1.3],
        r: [0, yaw, 0],
        c: '#bdb7a7',
      })
    }
  }
  for (let i = 0; i < 14; i++) {
    const dx = (random() - 0.5) * 3.3,
      dz = (random() - 0.5) * 0.95
    shrubs.push({
      p: point(dx, 0.52 + random() * 0.2, dz),
      s: [0.32 + random() * 0.2, 0.26 + random() * 0.25, 0.3 + random() * 0.15],
      c: ['#3c6840', '#567d48', '#6f8a4c'][i % 3]!,
    })
    for (let k = 0; k < 4; k++)
      leaves.push({
        p: point(dx, 0.72 + random() * 0.12, dz),
        s: [0.07, 0.6, 0.07],
        r: [Math.sin(k * 1.57) * 0.65, yaw, Math.cos(k * 1.57) * 0.65],
        c: '#8b9e5b',
      })
  }
  const trunk = point(0.6, 0.35, 0),
    tip = point(0.6, 3.5, 0)
  trunks.push(beam(trunk, tip, 0.065, '#81745a'))
  for (let j = 0; j < 7; j++) {
    const a = j * 2.4,
      h = 1.7 + j * 0.24,
      end = point(0.6 + Math.cos(a) * 0.65, h + 0.6, Math.sin(a) * 0.45)
    trunks.push(beam(point(0.6, h, 0), end, 0.025, '#81745a'))
    shrubs.push({
      p: end,
      s: [0.6, 0.8, 0.5],
      c: j % 2 ? '#688753' : '#819561',
    })
  }
}
export function PlazaGarden() {
  return (
    <group name="fountain-planter-garden">
      <Instances
        parts={wood}
        material={
          <SurfaceMaterial
            kind="stone"
            mapping="box"
            meters={0.6}
            strength={0.2}
          />
        }
      >
        <BeveledBox />
      </Instances>
      <Instances parts={soil} shadow={false}>
        <boxGeometry />
      </Instances>
      <Instances
        parts={trunks}
        material={<SurfaceMaterial kind="wood" strength={0.2} />}
      >
        <cylinderGeometry args={[1, 1, 1, 6]} />
      </Instances>
      <Instances
        parts={shrubs}
        material={<meshStandardMaterial roughness={1} />}
      >
        <icosahedronGeometry args={[1, SIMPLE_MAP ? 0 : 1]} />
      </Instances>
      <Instances parts={SIMPLE_MAP ? [] : leaves} shadow={false}>
        <coneGeometry args={[1, 1, 4]} />
      </Instances>
    </group>
  )
}
