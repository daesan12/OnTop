import { Shape } from 'three'
import { CABIN_BENCH_INNER, CABIN_BENCH_OUTER, CABIN_BENCH_SLOPE, CABIN_FLOOR_HEIGHT, CABIN_SEAT_HEIGHT, cabinBenches } from './cabin'

const halfDepth = (CABIN_BENCH_OUTER - CABIN_BENCH_INNER) / 2
const innerHalfWidth = CABIN_BENCH_INNER * CABIN_BENCH_SLOPE
const outerHalfWidth = CABIN_BENCH_OUTER * CABIN_BENCH_SLOPE
const benchTop = new Shape()
benchTop.moveTo(-outerHalfWidth, halfDepth)
benchTop.lineTo(outerHalfWidth, halfDepth)
benchTop.lineTo(innerHalfWidth, -halfDepth)
benchTop.lineTo(-innerHalfWidth, -halfDepth)
benchTop.closePath()
const benchSlab = { depth: .07, bevelEnabled: false }

export function BalloonCabinSeats() {
  return <group name="balloon-cabin-benches">
    {cabinBenches.map(({ x, z, yaw }) => (
      <group key={yaw} name="balloon-cabin-bench" position={[x, CABIN_FLOOR_HEIGHT, z]} rotation-y={yaw}>
        {[-.32, .32].map(x => (
          <mesh key={x} position={[x, .135, 0]} castShadow>
            <boxGeometry args={[.12, .27, .32]} />
            <meshStandardMaterial color="#785137" roughness={.85} />
          </mesh>
        ))}
        <mesh position={[0, CABIN_SEAT_HEIGHT - benchSlab.depth, 0]} rotation-x={-Math.PI / 2} castShadow receiveShadow>
          <extrudeGeometry args={[benchTop, benchSlab]} />
          <meshStandardMaterial color="#cf9b62" roughness={.88} />
        </mesh>
      </group>
    ))}
  </group>
}
