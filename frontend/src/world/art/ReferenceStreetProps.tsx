import { STREET_PLANTERS } from '../../config'
import { PropBuilder } from './propGeometry'
import { PropModel } from './PropModel'
import { crownGeometry, GardenFoliageMaterial } from './ReferenceGarden'
import { Instances, seeded, type Part } from './Instances'
const leaves: Part[] = [],
  flowers: Part[] = []
function scenery() {
  const b = new PropBuilder(),
    rand = seeded(8421)
  for (const p of STREET_PLANTERS) {
    if (p.kind === 'bowl') {
      b.lathe(
        'stone',
        '#c7c1ad',
        [p.x, 0, p.z],
        [
          [0, 0],
          [0.36, 0],
          [0.36, 0.12],
          [0.25, 0.16],
          [0.28, 0.24],
          [0.53, 0.42],
          [0.6, 0.68],
          [0.62, 0.72],
          [0.62, 0.8],
          [0.53, 0.8],
          [0.5, 0.7],
          [0.35, 0.4],
          [0, 0.38],
        ],
      )
      b.cylinder('paint', '#615440', [p.x, 0.7, p.z], 0.5, 0.5, 0.04)
    } else {
      b.box('stone', '#bbb9ae', [p.x, 0.5, p.z], [0.65, 1, 0.65])
      for (const y of [0.08, 0.92])
        b.box('stone', '#d2cdbf', [p.x, y, p.z], [0.76, 0.14, 0.76])
      for (const side of [-1, 1])
        b.box(
          'stone',
          '#a6a697',
          [p.x, 0.52, p.z + side * 0.33],
          [0.46, 0.59, 0.016],
        )
    }
    const y = p.kind === 'bowl' ? 0.86 : 1.08
    for (let i = 0; i < 7; i++) {
      const a = (i * Math.PI * 2) / 7
      leaves.push({
        p: [p.x + Math.cos(a) * 0.25, y, p.z + Math.sin(a) * 0.25],
        s: [0.28, 0.25, 0.28],
        c: i % 2 ? '#75934e' : '#4b713f',
      })
    }
    for (let i = 0; i < 28; i++) {
      const a = rand() * Math.PI * 2,
        r = rand() * 0.42
      flowers.push({
        p: [
          p.x + Math.cos(a) * r,
          y + 0.16 + rand() * 0.15,
          p.z + Math.sin(a) * r,
        ],
        s: [0.065, 0.04, 0.065],
        c: ['#e9ba44', '#f6d977', '#dc81a1', '#f5ced5'][i % 4],
      })
    }
  }
  return b.finish()
}
const art = scenery()
export function ReferenceStreetProps() {
  return (
    <group name="reference-street-planters">
      <PropModel name="street-stone-and-ironwork" art={art} />
      <Instances
        parts={leaves}
        shadow={false}
        material={<GardenFoliageMaterial />}
      >
        <primitive object={crownGeometry} attach="geometry" dispose={null} />
      </Instances>
      <Instances parts={flowers} shadow={false}>
        <sphereGeometry args={[1, 6, 4]} />
      </Instances>
    </group>
  )
}
