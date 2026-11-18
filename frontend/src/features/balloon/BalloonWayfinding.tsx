import { STATION_STAIRS } from '../../../park-renewal-preview/plan'
import { groundSurfaceHeight } from '../../../park-renewal-preview/groundSurface'

const green = '#173b30'
const lanternXs = [-4.02, 4.02]
const lanternZ = STATION_STAIRS.zBottom + .18

function lanternFloor(x: number, z: number, offset: number) {
  return groundSurfaceHeight(x + offset, z + lanternZ) - .02
}

export function BalloonWayfindingLights({ x, z, lit }: { x: number; z: number; lit: boolean }) {
  return <>{lanternXs.map(offset => (
    <pointLight key={offset} position={[x + offset, lanternFloor(x, z, offset) + .66, z + lanternZ + .07]}
      color="#ffc37e" intensity={lit ? 7 : 0} distance={4} decay={2} />
  ))}</>
}

function StairLantern({ position }: { position: [number, number, number] }) {
  return <group name="balloon-stair-lantern" position={position}>
    <mesh position-y={.13}>
      <boxGeometry args={[.46, .26, .46]} />
      <meshStandardMaterial color="#55483a" />
    </mesh>
    <mesh position-y={.46}>
      <boxGeometry args={[.29, .4, .29]} />
      <meshBasicMaterial color="#ffd494" toneMapped={false} />
    </mesh>
    <mesh position-y={.75} rotation-y={Math.PI / 4}>
      <coneGeometry args={[.32, .22, 4]} />
      <meshStandardMaterial color={green} />
    </mesh>
  </group>
}

export function BalloonWayfinding({ x, y, z }: { x: number; y: number; z: number }) {
  return <group name="balloon-wayfinding">
    {lanternXs.map(offset => <StairLantern key={offset} position={[offset, lanternFloor(x, z, offset) - y, lanternZ]} />)}
  </group>
}
