import { Component, Suspense, useEffect, useMemo, type ReactNode } from 'react'
import { Canvas, useLoader } from '@react-three/fiber'
import { Box3, Group, Vector3 } from 'three'
import { ParkAssetLoader } from '../../world/art/assetLoader'
import { characterUrls, createCharacterRig } from '../../world/art/CharacterRig'
import { defaultLook, type CharacterVariant } from '../../world/art/characterLook'
import type { SkinAsset } from './api'
import { assertSkinPreviewPieces } from './previewRig'

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? <p role="alert">미리보기에 실패했어요. 파일·부위 연결을 확인해주세요.</p> : this.props.children }
}
function Models({ assets, gender, onReady }: { assets: SkinAsset[]; gender: string; onReady: () => void }) {
  const urls = [...characterUrls, ...assets.flatMap(a => [a.modelUrl, a.femaleModelUrl ?? a.modelUrl])]
  const loaded = useLoader(ParkAssetLoader, urls)
  const result = useMemo(() => {
    const root = new Group(), rigs: ReturnType<typeof createCharacterRig>[] = []
    try {
      const variants: CharacterVariant[] = gender === 'ANY' ? ['man', 'girl'] : [gender === 'FEMALE' ? 'girl' : 'man']
      variants.forEach((variant, i) => {
        const look = defaultLook(variant), sources = new Map<string, typeof loaded[number]>()
        assets.forEach((a, n) => {
          const source = 'set-preview-' + n
          const model = loaded[2 + n * 2 + (variant === 'girl' ? 1 : 0)]!
          assertSkinPreviewPieces(model, a, variant)
          sources.set(source, model)
          for (const slot of a.slots) look[slot] = { source, id: 'a' }
        })
        const whole = assets.findIndex(a => a.wearMode === 'WHOLE')
        const rig = whole >= 0 ? createCharacterRig(loaded[2 + whole * 2 + (variant === 'girl' ? 1 : 0)]!)
          : createCharacterRig(loaded[variant === 'girl' ? 1 : 0]!, look, sources)
        rigs.push(rig)
        const box = new Box3().setFromObject(rig.root), size = box.getSize(new Vector3()), wrapper = new Group()
        rig.root.position.sub(box.getCenter(new Vector3())); wrapper.add(rig.root)
        wrapper.scale.setScalar(2.2 / Math.max(size.x, size.y, size.z, .01))
        wrapper.position.x = variants.length === 2 ? (i ? .72 : -.72) : 0; root.add(wrapper)
      })
      return { root, rigs }
    } catch (error) { rigs.forEach(r => r.dispose()); throw error }
  }, [assets, gender, loaded])
  useEffect(() => { onReady() }, [onReady])
  useEffect(() => () => result.rigs.forEach(r => r.dispose()), [result])
  return <primitive object={result.root} dispose={null}/>
}
export function SkinSetPreview(props: { assets: SkinAsset[]; gender: string; onReady: () => void }) {
  const key = props.gender + props.assets.map(a => a.imageKey).join('|')
  return <Boundary key={key}><Suspense fallback={<p>모델을 불러오고 있어요…</p>}>
    <Canvas camera={{ position: [0, .1, 4.5], fov: 38 }} dpr={1} frameloop="demand" gl={{ alpha: true }}>
      <ambientLight intensity={1.6}/><directionalLight position={[3, 4, 5]} intensity={2.5}/><Models {...props}/>
    </Canvas>
  </Suspense></Boundary>
}
