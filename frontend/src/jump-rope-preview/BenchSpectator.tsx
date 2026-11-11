import { useEffect, useMemo } from 'react'
import { useLoader } from '@react-three/fiber'
import { ParkAssetLoader } from '../world/art/assetLoader'
import { characterUrls } from '../world/art/characterAssets'
import { defaultLook } from '../world/art/characterLook'
import { createSafeCharacterRig } from '../world/art/safeCharacterRig'

export function BenchSpectator({ seat, footHeight }: {
  seat: [number, number, number]
  footHeight: number
}) {
  const source = useLoader(ParkAssetLoader, characterUrls[1]!)
  const { rig, seatContact, footContact } = useMemo(() => {
    const rig = createSafeCharacterRig(source, defaultLook('girl'), new Map([['girl', source]]))
    rig.reset()

    rig.set('upperLeg_L', -1.38)
    rig.set('lowerLeg_L', 1.43)
    rig.set('foot_L', -0.05)
    rig.set('upperLeg_R', -1.41)
    rig.set('lowerLeg_R', 1.43)
    rig.set('foot_R', -0.02)
    rig.set('spine', 0.075)
    rig.set('head', -0.075, 0.2, -0.035)
    rig.set('upperArm_L', -0.23, 0, -0.29)
    rig.set('lowerArm_L', -0.43)
    rig.set('upperArm_R', -0.2, 0, 0.31)
    rig.set('lowerArm_R', -0.48)
    for (let frame = 0; frame < 8; frame++) rig.apply(0.1)

    return {
      rig,
      seatContact: rig.hipHeight - rig.seatedHipLift,
      footContact: -rig.groundShift(),
    }
  }, [source])

  useEffect(() => () => rig.dispose(), [rig])

  // Fit the seated rig to the gap between the slats and the pavement.
  const scale = (seat[1] - footHeight) / (seatContact - footContact)

  return (
    <group name="alley-bench-spectator" position={[seat[0], seat[1] - seatContact * scale, seat[2]]}
      rotation-y={0.5} scale={scale}>
      <primitive object={rig.root} dispose={null} />
    </group>
  )
}
