import type { RefObject } from 'react'
import { BALLOON_DOOR_X } from '../../../park-renewal-preview/plan'
import { BalloonCabinControls, type LocalCabinInput } from './BalloonCabinControls'
import { BalloonCabinSeats } from './BalloonCabinSeats'
import { CABIN_FLOOR_HEIGHT } from './cabin'

export function BalloonCabin({ doorOpen, local, pilot }: {
  doorOpen: boolean
  local?: RefObject<LocalCabinInput>
  pilot?: string
}) {
  return <>
    <BalloonCabinSeats />
    <BalloonCabinControls local={local} pilot={pilot} />
    <group name="balloon-cabin-door" position={[BALLOON_DOOR_X, CABIN_FLOOR_HEIGHT, .49]}>
      <group name="balloon-cabin-door-leaf" rotation-y={doorOpen ? Math.PI / 2 : 0}>
        <mesh position={[0, .28, -.49]} castShadow receiveShadow>
          <boxGeometry args={[.09, .56, .89]} />
          <meshStandardMaterial color="#ad7842" roughness={.9} />
        </mesh>
        <mesh position={[0, .55, -.49]} castShadow>
          <boxGeometry args={[.15, .10, .91]} />
          <meshStandardMaterial color="#83532e" roughness={.84} />
        </mesh>
        <mesh position={[-.055, .38, -.83]}>
          <boxGeometry args={[.04, .08, .14]} />
          <meshStandardMaterial color="#c79b53" roughness={.6} metalness={.35} />
        </mesh>
      </group>
    </group>
  </>
}
