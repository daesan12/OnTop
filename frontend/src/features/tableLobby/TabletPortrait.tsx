import { Suspense, useEffect, useMemo } from 'react'
import { Canvas, useLoader } from '@react-three/fiber'
import { ParkAssetLoader } from '../../world/art/assetLoader'
import { characterUrls, createCharacterRig } from '../../world/art/CharacterRig'

function Figure({ character }: { character: 'man' | 'girl' }) {
  const sources = useLoader(ParkAssetLoader, characterUrls)
  const model = useMemo(() => {
    const rig = createCharacterRig(sources[character === 'girl' ? 1 : 0]!)
    rig.reset(); rig.set('upperArm_L', 0, 0, -.95); rig.set('upperArm_R', 0, 0, .95)
    for (let i = 0; i < 12; i++) rig.apply(.1)
    return rig
  }, [sources, character])
  useEffect(() => () => model.dispose(), [model])
  return <primitive object={model.root} dispose={null} />
}
/** Demand-rendered portraits reuse the actual park models, never substitute a user's equipment. */
export function TabletPortrait({ character = 'man' }: { character?: 'man' | 'girl' }) {
  return <Canvas aria-hidden="true" frameloop="demand" dpr={1} gl={{ alpha: true, antialias: true }}
    camera={{ position: [0, 1.35, 2.1], fov: 32, near: .1, far: 10 }}
    onCreated={({ camera }) => camera.lookAt(0, 1.25, 0)}>
    <hemisphereLight args={['#fff7df', '#655c43', 2]} />
    <directionalLight position={[2, 4, 4]} intensity={2} />
    <Suspense fallback={null}><Figure character={character} /></Suspense>
  </Canvas>
}
