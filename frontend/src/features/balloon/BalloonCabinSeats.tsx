import { Shape, Vector2 } from 'three'
import { CABIN_BENCH_INNER, CABIN_BENCH_OUTER, CABIN_BENCH_RUNS, CABIN_FLOOR_HEIGHT, CABIN_SEAT_HEIGHT, cabinBenches } from './cabin'

const benchSlab = { depth: .07, bevelEnabled: false }
const slabBase = CABIN_SEAT_HEIGHT - benchSlab.depth
const supportBottom = -.07
const supportTop = slabBase + .02

function benchCorner(side: number, apothem: number) {
  const angle = side * Math.PI / 4
  const radius = apothem / Math.cos(Math.PI / 8)
  return new Vector2(-Math.sin(angle) * radius, Math.cos(angle) * radius)
}

// One outline per run removes the coincident end faces at the miter joints.
const benchTops = CABIN_BENCH_RUNS.map(sides => {
  const corners = [sides[0] - .5, ...sides.map(side => side + .5)]
  const top = new Shape([
    ...corners.map(side => benchCorner(side, CABIN_BENCH_OUTER)),
    ...corners.reverse().map(side => benchCorner(side, CABIN_BENCH_INNER)),
  ])
  top.closePath()
  return top
})

export function BalloonCabinSeats() {
  return <group name="balloon-cabin-benches" position-y={CABIN_FLOOR_HEIGHT}>
    {benchTops.map((top, i) => (
      <mesh key={CABIN_BENCH_RUNS[i]![0]} name="balloon-cabin-bench" position-y={slabBase} rotation-x={-Math.PI / 2} castShadow receiveShadow>
        <extrudeGeometry args={[top, benchSlab]} />
        <meshStandardMaterial color="#cf9b62" roughness={.88} />
      </mesh>
    ))}
    {cabinBenches.map(({ x, z, yaw }) => (
      <group key={yaw} position={[x, 0, z]} rotation-y={yaw}>
        {[-.32, .32].map(x => (
          <mesh key={x} position={[x, (supportBottom + supportTop) / 2, 0]} castShadow>
            <boxGeometry args={[.12, supportTop - supportBottom, .32]} />
            <meshStandardMaterial color="#785137" roughness={.85} />
          </mesh>
        ))}
      </group>
    ))}
  </group>
}
