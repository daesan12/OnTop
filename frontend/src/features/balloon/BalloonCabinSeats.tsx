import { CABIN_FLOOR_HEIGHT, CABIN_SEAT_HEIGHT, cabinSeats } from './cabin'

export function BalloonCabinSeats() {
  return <group name="balloon-cabin-seats">
    {cabinSeats.map(({ x, z, yaw }, index) => (
      <group key={index} name={`balloon-cabin-seat-${index + 1}`} position={[x, CABIN_FLOOR_HEIGHT, z]} rotation-y={yaw}>
        <mesh position={[0, .14, 0]} castShadow>
          <boxGeometry args={[.48, .28, .41]} />
          <meshStandardMaterial color="#785137" roughness={.85} />
        </mesh>
        <mesh position={[0, CABIN_SEAT_HEIGHT - .035, 0]} castShadow>
          <boxGeometry args={[.58, .07, .5]} />
          <meshStandardMaterial color="#cf9b62" roughness={.88} />
        </mesh>
        <mesh position={[0, .50, -.22]} castShadow>
          <boxGeometry args={[.56, .36, .075]} />
          <meshStandardMaterial color="#98653f" roughness={.85} />
        </mesh>
      </group>
    ))}
  </group>
}
