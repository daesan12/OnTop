import { useMemo } from 'react'
import { OutdoorMetal } from './OutdoorMetal'
import { ReferenceBenchFrames } from './ReferenceBenchFrames'
import { BENCHES, BENCH_YAWS, BENCH_PAVILIONS, LAMPS } from '../../config'
import { Instances, yawPart, type Part } from './Instances'
import { SurfaceMaterial } from './SurfaceMaterial'
import { BeveledBox } from './BeveledBox'
import { NightMaterial } from '../NightLighting'
import { PavilionInterior } from './PavilionInterior'

function furniture(lamps: readonly (readonly [number, number, number])[] = LAMPS, includeBenches = true) {
  const boxes: Part[] = [],
    wood: Part[] = [],
    stone: Part[] = [],
    fasteners: Part[] = [],
    poles: Part[] = [],
    caps: Part[] = [],
    glass: Part[] = []
  for (const [index, [x, y, z]] of (includeBenches ? BENCHES : []).entries()) {
    if (BENCH_PAVILIONS[index]) continue
    const collections = [boxes, wood, fasteners]
    const offsets = collections.map((parts) => parts.length)
    for (let j = 0; j < 5; j++)
      wood.push({
        p: [x, y + 0.53, z - 0.34 + j * 0.17],
        s: [2.8, 0.1, 0.13],
        c: j % 2 ? '#9e6c3e' : '#b7834f',
      })
    for (let j = 0; j < ([6, 7].includes(index) ? 0 : 3); j++)
      wood.push({
        p: [x, y + 0.86 + j * 0.17, z - 0.36],
        s: [2.8, 0.12, 0.075],
        r: [-0.12, 0, 0],
        c: j % 2 ? '#b17b48' : '#9d683d',
      })
    for (const side of [-1, 1]) {
      for (let j = 0; j < 5; j++)
        fasteners.push({
          p: [x + side * 1.04, y + 0.583, z - 0.34 + j * 0.17],
          s: [0.015, 0.004, 0.015],
          c: '#8e8e79',
        })
    }
    const yaw = BENCH_YAWS[index]!,
      c = Math.cos(yaw),
      sn = Math.sin(yaw)
    collections.forEach((parts, j) =>
      parts.slice(offsets[j]).forEach((p) => {
        const dx = p.p[0] - x,
          dz = p.p[2] - z
        p.p = [x + dx * c + dz * sn, p.p[1], z - dx * sn + dz * c]
        yawPart(p, yaw)
      }),
    )
  }
  for (const [x, y, z] of lamps) {
    const metal = '#283233',
      gold = '#a58a53'
    poles.push({ p: [x, y + 1.82, z], s: [0.075, 3.64, 0.075], c: metal })
    for (const [height, radius, depth] of [
      [0.12, 0.13, 0.24],
      [0.32, 0.115, 0.16],
      [0.45, 0.1, 0.1],
      [2.95, 0.105, 0.09],
      [3.25, 0.13, 0.08],
    ])
      poles.push({
        p: [x, y + height, z],
        s: [radius, depth, radius],
        c: height > 2 ? gold : metal,
      })
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4
      poles.push({
        p: [x + Math.cos(a) * 0.073, y + 1.65, z + Math.sin(a) * 0.073],
        s: [0.008, 2.2, 0.008],
        c: metal,
      })
    }
    stone.push({ p: [x, y + 0.065, z], s: [0.38, 0.13, 0.38], c: '#b7b7ae' })
    const triple = Math.abs(x) === 6 && (z === 24 || z === 53)
    const heads = triple
      ? [
          [-0.55, 3.65],
          [0, 4.05],
          [0.55, 3.65],
        ]
      : [[0, 3.77]]
    if (triple)
      for (const side of [-1, 1]) {
        boxes.push({
          p: [x + side * 0.28, y + 3.25, z],
          s: [0.62, 0.075, 0.075],
          c: metal,
        })
        poles.push({
          p: [x + side * 0.55, y + 3.35, z],
          s: [0.035, 0.27, 0.035],
          c: metal,
        })
      }
    for (const [dx, height] of heads) {
      glass.push({
        p: [x + dx, y + height, z],
        s: [0.28, 0.42, 0.28],
        c: '#f7d8a0',
      })
      for (const sx of [-1, 1])
        for (const sz of [-1, 1])
          boxes.push({
            p: [x + dx + sx * 0.155, y + height, z + sz * 0.155],
            s: [0.028, 0.47, 0.028],
            c: metal,
          })
      for (const sy of [-1, 1])
        boxes.push({
          p: [x + dx, y + height + sy * 0.24, z],
          s: [0.37, 0.045, 0.37],
          c: metal,
        })
      caps.push({
        p: [x + dx, y + height + 0.34, z],
        s: [0.34, 0.2, 0.34],
        r: [0, Math.PI / 4, 0],
        c: metal,
      })
      poles.push({
        p: [x + dx, y + height + 0.5, z],
        s: [0.03, 0.12, 0.03],
        c: gold,
      })
    }
  }
  return { boxes, wood, stone, fasteners, poles, caps, glass }
}
const parts = furniture()

export function ParkFurniture() {
  return (
    <group name="art-furniture">
      <PavilionInterior />
      <ReferenceBenchFrames />
      <Instances
        parts={parts.wood}
        material={<SurfaceMaterial kind="wood" mapping="box" meters={1.3} />}
      >
        <BeveledBox />
      </Instances>
      <Instances
        parts={parts.stone}
        material={<SurfaceMaterial kind="stone" mapping="box" />}
      >
        <BeveledBox />
      </Instances>
      <Instances
        parts={parts.fasteners}
        shadow={false}
        material={<OutdoorMetal finish="iron" />}
      >
        <cylinderGeometry args={[1, 1, 1, 6]} />
      </Instances>
      <Instances parts={parts.boxes} material={<OutdoorMetal />}>
        <boxGeometry />
      </Instances>
      <Instances parts={parts.poles} material={<OutdoorMetal />}>
        <cylinderGeometry args={[1, 1, 1, 8]} />
      </Instances>
      <Instances parts={parts.caps}>
        <coneGeometry args={[1, 1, 4]} />
      </Instances>
      <Instances
        parts={parts.glass}
        shadow={false}
        material={<NightMaterial />}
      >
        <boxGeometry />
      </Instances>
    </group>
  )
}

/** The same fluted cast-iron lamp, lantern frame and warm glass used in the live park. */
export function ParkLamps({placements}:{placements:readonly (readonly [number,number,number])[]}) {
  const lamps=useMemo(()=>furniture(placements,false),[placements])
  return <group name="layout-original-park-lamps">
    <Instances parts={lamps.stone} material={<SurfaceMaterial kind="stone" mapping="box"/>}><BeveledBox/></Instances>
    <Instances parts={lamps.boxes} material={<OutdoorMetal/>}><boxGeometry/></Instances>
    <Instances parts={lamps.poles} material={<OutdoorMetal/>}><cylinderGeometry args={[1,1,1,8]}/></Instances>
    <Instances parts={lamps.caps}><coneGeometry args={[1,1,4]}/></Instances>
    <Instances parts={lamps.glass} shadow={false} material={<NightMaterial/>}><boxGeometry/></Instances>
  </group>
}
