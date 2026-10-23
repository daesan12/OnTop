import { FishBreadCart, VrHanokBooth } from './ActivityProps'
import { TraditionalMailbox } from './TraditionalMailbox'
import { VR_ZONE, VR_COURSE_PADS, VR_PAGODA } from '../../config'
import { StonePagoda } from './StonePagoda'
import { SurfaceMaterial } from './SurfaceMaterial'

export function ParkActivities() {
  return (
    <group name="park-activity-zones">
      <FishBreadCart />
      <group name="vr-reserved-zone">
        <mesh position={[VR_ZONE.x, 0.035, VR_ZONE.z]} receiveShadow>
          <boxGeometry args={[VR_ZONE.width, 0.06, VR_ZONE.depth]} />
          <SurfaceMaterial
            kind="stone"
            mapping="box"
            color="#b7bfae"
            strength={0.2}
          />
        </mesh>
        <VrHanokBooth />
        <StonePagoda anchor={VR_PAGODA} />
        {VR_COURSE_PADS.map((p, i) => (
          <group key={i} position={[p.x, 0, p.z]} name={`future-jump-pad-${i}`}>
            <mesh
              position={[0, p.height - p.thickness / 2, 0]}
              receiveShadow
              castShadow
            >
              <boxGeometry args={[p.width, p.thickness, p.depth]} />
              <meshStandardMaterial
                color={['#7a9f8d', '#be945d', '#6b969d', '#b5755b'][i % 4]}
                roughness={0.9}
              />
            </mesh>
          </group>
        ))}
      </group>
      <TraditionalMailbox />
    </group>
  )
}
