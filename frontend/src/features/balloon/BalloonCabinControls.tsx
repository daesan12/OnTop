import { useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { MathUtils, type Group } from 'three'
import { CABIN_DECK_RISE, cabinSeats } from './cabin'
import { combineFlightInput, stoppedFlightInput } from './controls'
import type { Input } from './flight'
import { useRemoteBalloons } from './remoteRide'

export type LocalCabinInput = { pilot: string; input: Input }

const brass = '#c79b53'
const iron = '#493627'
const directionSeat = cabinSeats[0]
const altitudeSeat = cabinSeats[2]

export function BalloonCabinControls({ local, pilot }: {
  local: RefObject<LocalCabinInput>; pilot?: string
}) {
  const stick = useRef<Group>(null)
  const lever = useRef<Group>(null)
  useFrame((_, delta) => {
    let input = local.current.input
    if (pilot && pilot !== local.current.pilot) {
      const flight = useRemoteBalloons.getState().flights[pilot]
      const controls = flight?.party?.controls
      input = flight?.aboard && !flight.party?.boarding && controls && !controls.returning
        ? combineFlightInput(controls, '', stoppedFlightInput)
        : stoppedFlightInput
    }
    if (stick.current) {
      const tilt = .33 / Math.max(1, Math.hypot(input.x, input.z))
      stick.current.rotation.x = MathUtils.damp(stick.current.rotation.x, input.z * tilt, 15, delta)
      stick.current.rotation.z = MathUtils.damp(stick.current.rotation.z, -input.x * tilt, 15, delta)
    }
    if (lever.current) lever.current.rotation.z = MathUtils.damp(lever.current.rotation.z, input.lift * .53, 13, delta)
  }, -1.7)

  return <group name="balloon-cabin-controls" position-y={CABIN_DECK_RISE}>
    <group position={[directionSeat.x + .39, .94, directionSeat.z + .1]} rotation-y={directionSeat.yaw}>
      <mesh position={[0, 0, -.42]} castShadow>
        <boxGeometry args={[.31, .23, .06]} />
        <meshStandardMaterial color={brass} roughness={.63} metalness={.4} />
      </mesh>
      <mesh position={[0, -.04, -.22]} castShadow>
        <boxGeometry args={[.15, .08, .42]} />
        <meshStandardMaterial color={iron} roughness={.74} />
      </mesh>
      <mesh castShadow>
        <cylinderGeometry args={[.082, .105, .055, 10]} />
        <meshStandardMaterial color={brass} roughness={.57} metalness={.35} />
      </mesh>
      <group ref={stick} name="balloon-direction-handle">
        <mesh position={[0, .113, 0]} castShadow>
          <cylinderGeometry args={[.022, .034, .226, 8]} />
          <meshStandardMaterial color={brass} roughness={.53} metalness={.35} />
        </mesh>
        <mesh position={[0, .225, 0]} castShadow>
          <boxGeometry args={[.19, .058, .07]} />
          <meshStandardMaterial color={iron} roughness={.8} />
        </mesh>
      </group>
    </group>
    <group position={[altitudeSeat.x - .35, 1, altitudeSeat.z - .07]} rotation-y={altitudeSeat.yaw}>
      <mesh position={[.055, 0, -.39]} castShadow>
        <boxGeometry args={[.28, .26, .06]} />
        <meshStandardMaterial color={brass} roughness={.63} metalness={.4} />
      </mesh>
      <mesh position={[.02, 0, -.18]} castShadow>
        <boxGeometry args={[.13, .09, .39]} />
        <meshStandardMaterial color={iron} roughness={.74} />
      </mesh>
      <mesh rotation-x={Math.PI / 2} castShadow>
        <cylinderGeometry args={[.058, .058, .07, 10]} />
        <meshStandardMaterial color={brass} roughness={.57} metalness={.35} />
      </mesh>
      <group ref={lever} name="balloon-altitude-lever">
        <mesh position={[.104, 0, 0]} rotation-z={Math.PI / 2} castShadow>
          <cylinderGeometry args={[.024, .029, .208, 8]} />
          <meshStandardMaterial color={brass} roughness={.53} metalness={.35} />
        </mesh>
        <mesh position={[.207, 0, 0]} castShadow>
          <boxGeometry args={[.065, .078, .115]} />
          <meshStandardMaterial color="#8a4329" roughness={.78} />
        </mesh>
      </group>
    </group>
  </group>
}
