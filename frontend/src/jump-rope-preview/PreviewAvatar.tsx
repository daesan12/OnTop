import { useEffect, useMemo } from 'react'
import { useLoader } from '@react-three/fiber'
import { ParkAssetLoader } from '../world/art/assetLoader'
import { characterUrls } from '../world/art/characterAssets'
import { createClipPose } from '../world/art/characterClips'
import { defaultLook, type CharacterVariant } from '../world/art/characterLook'
import { createSafeCharacterRig } from '../world/art/safeCharacterRig'

export function PreviewAvatar({ variant = 'man' }: { variant?: CharacterVariant }) {
  const source = useLoader(ParkAssetLoader, characterUrls[variant === 'girl' ? 1 : 0]!)
  const { rig, floorOffset } = useMemo(() => {
    const rig = createSafeCharacterRig(source, defaultLook(variant), new Map([[variant, source]]))
    rig.reset()
    createClipPose().ground(0, 0, 0, rig.set)
    for (let frame = 0; frame < 5; frame++) rig.apply(0.1)
    return { rig, floorOffset: rig.groundShift() }
  }, [source, variant])

  useEffect(() => () => rig.dispose(), [rig])

  return (
    <group position-y={floorOffset}>
      <primitive object={rig.root} dispose={null} />
    </group>
  )
}
