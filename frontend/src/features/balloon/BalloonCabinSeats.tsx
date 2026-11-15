import { CABIN_BENCH_DEPTH, CABIN_BENCH_WIDTH, CABIN_FLOOR_HEIGHT, CABIN_SEAT_HEIGHT, cabinBenches } from './cabin'

export function BalloonCabinSeats() {
  return <group name="balloon-cabin-benches">
    {cabinBenches.map(({ z, yaw }) => (
      <group key={z} name="balloon-cabin-bench" position={[0, CABIN_FLOOR_HEIGHT, z]} rotation-y={yaw}>
        {[-.66, .66].map(x => (
          <mesh key={x} position={[x, .135, 0]} castShadow>
            <boxGeometry args={[.12, .27, .32]} />
            <meshStandardMaterial color="#785137" roughness={.85} />
          </mesh>
        ))}
        <mesh position={[0, CABIN_SEAT_HEIGHT - .035, 0]} castShadow receiveShadow>
          <boxGeometry args={[CABIN_BENCH_WIDTH, .07, CABIN_BENCH_DEPTH]} />
          <meshStandardMaterial color="#cf9b62" roughness={.88} />
        </mesh>
        <mesh position={[0, .43, -.16]} castShadow>
          <boxGeometry args={[CABIN_BENCH_WIDTH - .05, .18, .075]} />
          <meshStandardMaterial color="#98653f" roughness={.85} />
        </mesh>
      </group>
    ))}
  </group>
}
