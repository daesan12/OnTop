import { Component, Suspense, useEffect, useMemo, type ReactNode } from 'react'
import { Canvas, useLoader } from '@react-three/fiber'
import { Box3, Group, Vector3 } from 'three'
import { ParkAssetLoader } from '../../world/art/assetLoader'
import { characterUrls } from '../../world/art/CharacterRig'
import { createSkinPreviewRig } from './previewRig'
import type { SkinDefinition } from './api'

class PreviewBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? <p role="alert">모델을 표시하지 못했어요. 공개하지 말고 파일을 확인해주세요.</p> : this.props.children }
}
function Model({ url, definition, onLoaded }: { url: string; definition: SkinDefinition; onLoaded: () => void }) {
  const [gltf, male, female] = useLoader(ParkAssetLoader, [url, ...characterUrls])
  const model = useMemo(() => {
    const variants = definition.compatibility === 'ANY' ? ['man', 'girl'] as const : [definition.compatibility === 'FEMALE' ? 'girl' as const : 'man' as const]
    const rigs: ReturnType<typeof createSkinPreviewRig>[] = [], group = new Group()
    try {
      variants.forEach((variant, i) => {
        const rig = createSkinPreviewRig(gltf!, (variant === 'girl' ? female : male)!, definition, variant); rigs.push(rig)
        const object = rig.root, bounds = new Box3().setFromObject(object), size = bounds.getSize(new Vector3()), center = bounds.getCenter(new Vector3()), wrapper = new Group()
        object.position.sub(center); wrapper.add(object); wrapper.scale.setScalar((variants.length === 2 ? 1.9 : 2.7) / Math.max(size.x, size.y, size.z, .01))
        wrapper.position.x = variants.length === 2 ? (i ? .75 : -.75) : 0; group.add(wrapper)
      })
      return { group, rigs }
    } catch (error) { rigs.forEach(rig => rig.dispose()); throw error }
  }, [gltf, male, female, definition])
  useEffect(() => { onLoaded() }, [onLoaded])
  useEffect(() => () => model.rigs.forEach(rig => rig.dispose()), [model])
  return <primitive object={model.group} dispose={null}/>
}
export function SkinPreview({ url, definition, onLoaded }: { url: string; definition: SkinDefinition; onLoaded: () => void }) {
  return <PreviewBoundary key={url}><Suspense fallback={<p role="status">모델을 불러오고 있어요…</p>}>
    <Canvas camera={{ position: [0, .1, 4.5], fov: 38 }} dpr={1} frameloop="demand" gl={{ alpha: true }}>
      <ambientLight intensity={1.6}/><directionalLight position={[3, 4, 5]} intensity={2.5}/>
      <Model url={url} definition={definition} onLoaded={onLoaded}/>
    </Canvas>
  </Suspense></PreviewBoundary>
}
