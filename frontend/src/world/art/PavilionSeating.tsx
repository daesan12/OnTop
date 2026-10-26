import { TABLE_SEATS } from '../../config'
import { useMemo } from 'react'
import { Instances, yawPart, type Part } from './Instances'
import { BeveledBox } from './BeveledBox'
import { SurfaceMaterial } from './SurfaceMaterial'

/** Same .56m seat surface and .45m half-depth as the existing server anchors. */
export function timberSeatParts(width: number) {
  const wood: Part[] = [],
    brass: Part[] = []
  const half = width / 2
  // Wide walnut boards, closed apron, framed back and wooden arm rests.
  for (const z of [-0.245, 0, 0.245])
    wood.push({ p: [0, 0.51, z], s: [width, 0.1, 0.23], c: '#b78c63' })
  for (const z of [-0.3, 0.3])
    wood.push({ p: [0, 0.41, z], s: [width - 0.12, 0.15, 0.1], c: '#9d714b' })
  for (const side of [-1, 1]) {
    const x = side * (half - 0.11)
    wood.push(
      { p: [x, 0.28, 0.27], s: [0.13, 0.56, 0.13], c: '#9d714b' },
      { p: [x, 0.65, -0.31], s: [0.13, 1.3, 0.13], c: '#9d714b' },
      { p: [x, 0.765, 0], s: [0.17, 0.1, 0.75], c: '#b78c63' },
      { p: [x, 0.64, 0.27], s: [0.09, 0.2, 0.09], c: '#9d714b' },
    )
    brass.push({ p: [x, 1.29, -0.31], s: [0.14, 0.018, 0.14], c: '#b59b60' })
  }
  wood.push(
    { p: [0, 1.235, -0.31], s: [width - 0.16, 0.13, 0.13], c: '#b78c63' },
    { p: [0, 0.73, -0.31], s: [width - 0.16, 0.1, 0.12], c: '#9d714b' },
    { p: [0, 0.96, -0.31], s: [width - 0.3, 0.33, 0.095], c: '#b18a64' },
  )
  brass.push({
    p: [0, 1.16, -0.254],
    s: [width - 0.42, 0.008, 0.009],
    c: '#b59b60',
  })
  return { wood, brass }
}

function placed(
  parts: readonly Part[],
  x: number,
  y: number,
  z: number,
  yaw: number,
) {
  return parts.map((source) => {
    const [px, py, pz] = source.p
    const part: Part = {
      ...source,
      p: [
        x + px * Math.cos(yaw) + pz * Math.sin(yaw),
        y + py,
        z - px * Math.sin(yaw) + pz * Math.cos(yaw),
      ],
    }
    yawPart(part, yaw)
    return part
  })
}
const chair = timberSeatParts(0.74)
const chairs = { wood: [] as Part[], brass: [] as Part[] }
for (const seat of TABLE_SEATS)
  for (const kind of ['wood', 'brass'] as const)
    chairs[kind].push(...placed(chair[kind], seat.x, 0, seat.z, seat.yaw))

function Seating({ parts }: { parts: typeof chairs }) {
  return (
    <>
      <Instances
        parts={parts.wood}
        material={
          <SurfaceMaterial
            kind="wood"
            mapping="box"
            meters={0.8}
            strength={0.16}
          />
        }
      >
        <BeveledBox />
      </Instances>
      <Instances
        parts={parts.brass}
        shadow={false}
        material={<meshStandardMaterial metalness={0.55} roughness={0.45} />}
      >
        <boxGeometry />
      </Instances>
    </>
  )
}
export function MainTableChairs({ seatCount = 4 }: { seatCount?: number }) {
  const visible = useMemo(() => ({ wood: chairs.wood.slice(0, chairs.wood.length / 4 * seatCount), brass: chairs.brass.slice(0, chairs.brass.length / 4 * seatCount) }), [seatCount])
  return (
    <group name="main-table-timber-chairs">
      <Seating parts={visible} />
    </group>
  )
}
