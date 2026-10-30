import { Suspense, useEffect, useLayoutEffect, useMemo } from 'react'
import { Canvas, useLoader, useThree } from '@react-three/fiber'
import { OrthographicCamera } from 'three'
import { ParkAssetLoader } from '../../world/art/assetLoader'
import { characterUrls } from '../../world/art/CharacterRig'
import { createTabletPortrait, fitTabletPortrait } from './portraitFraming'

function Figure({ character }: { character: 'man' | 'girl' }) {
  const sources = useLoader(ParkAssetLoader, characterUrls)
  const model = useMemo(() => createTabletPortrait(sources[character === 'girl' ? 1 : 0]!), [sources, character])
  const camera = useThree(s => s.camera), size = useThree(s => s.size), invalidate = useThree(s => s.invalidate)
  useLayoutEffect(() => {
    if (camera instanceof OrthographicCamera) fitTabletPortrait(camera, model.bounds, size.width, size.height)
    invalidate()
  }, [camera, model, size.width, size.height, invalidate])
  useEffect(() => () => model.rig.dispose(), [model])
  return <primitive object={model.rig.root} dispose={null} />
}
/** Demand-rendered portraits reuse the actual park models, never substitute a user's equipment. */
export function TabletPortrait({ character = 'man' }: { character?: 'man' | 'girl' }) {
  return <Canvas aria-hidden="true" frameloop="demand" dpr={1} gl={{ alpha: true, antialias: true }}
    orthographic camera={{ position: [0, 1, 4], near: .1, far: 10 }}
    resize={{ offsetSize: true, debounce: 0 }} style={{ position: 'absolute', inset: 0 }}>
    <hemisphereLight args={['#fff7df', '#655c43', 2]} />
    <directionalLight position={[2, 4, 4]} intensity={2} />
    <Suspense fallback={null}><Figure character={character} /></Suspense>
  </Canvas>
}
