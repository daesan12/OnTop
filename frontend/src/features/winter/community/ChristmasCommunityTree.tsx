import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Box3, Mesh, MeshStandardMaterial, Vector3, type Object3D } from 'three'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { ParkAssetLoader } from '../../../world/art/assetLoader'
import { useWinterCommunity } from './state'
import { TREE_ORNAMENTS, treeOrnamentSlots, type TreeOrnamentKind } from './ornaments'

const treeUrl = new URL('./assets/tree.glb', import.meta.url).href
const requests = new Map<string, Promise<GLTF>>()
function useModel(url: string) {
  const [loaded, setLoaded] = useState<{ url: string; gltf: GLTF }>()
  useEffect(() => {
    let live = true
    let request = requests.get(url)
    if (!request) { request = new ParkAssetLoader().loadAsync(url); requests.set(url, request) }
    request.then(gltf => { if (live) setLoaded({ url, gltf }) }).catch(error => {
      requests.delete(url)
      if (live) console.warn('겨울 장식을 불러오지 못했습니다.', error)
    })
    return () => { live = false }
  }, [url])
  return loaded?.url === url ? loaded.gltf : undefined
}

function Ornament({ kind, position }: { kind: TreeOrnamentKind; position: Vector3 }) {
  const gltf = useModel(TREE_ORNAMENTS.find(item => item.id === kind)!.model)
  const scene = useMemo(() => {
    if (!gltf) return undefined
    const root = gltf.scene.clone(true), bounds = new Box3().setFromObject(root)
    const size = bounds.getSize(new Vector3()), center = bounds.getCenter(new Vector3())
    const scale = .58 / Math.max(size.x, size.y, size.z)
    root.scale.multiplyScalar(scale)
    root.position.set(-center.x * scale, -bounds.max.y * scale, -center.z * scale)
    root.traverse(object => { if (object instanceof Mesh) { object.raycast = () => {}; object.castShadow = true } })
    return root
  }, [gltf])
  return scene ? <group position={position} rotation={[0, Math.atan2(position.x, position.z), 0]} name={'winter-letter-ornament-' + kind}>
    <primitive object={scene} dispose={null} />
  </group> : null
}

/** 기존 승인된 12m 모델과 Memo_Anchor를 그대로 사용한다. 광원 추가 없이 발광 재질만 점등한다. */
export function ChristmasCommunityTree({ fallback }: { fallback: ReactNode }) {
  const gltf = useModel(treeUrl), status = useWinterCommunity(s => s.tree)
  const model = useMemo(() => {
    if (!gltf) return undefined
    const root = gltf.scene.clone(true), lights: MeshStandardMaterial[] = []
    root.name = 'winter-community-tree-12m'
    root.traverse(object => {
      if (object.name.startsWith('Memo_Anchor_')) object.visible = false
      if (!(object instanceof Mesh)) return
      object.castShadow = true; object.receiveShadow = true; object.raycast = () => {}
      const materials = (Array.isArray(object.material) ? object.material : [object.material]).map(material => {
        if (!(material instanceof MeshStandardMaterial) || !['MAT_Star_Emission', 'MAT_StringBulb_Emission'].includes(material.name)) return material
        const copy = material.clone(); copy.emissive.set(0); copy.emissiveIntensity = 0; lights.push(copy)
        return copy
      })
      object.material = Array.isArray(object.material) ? materials : materials[0]!
    })
    root.updateMatrixWorld(true)
    return { root, lights }
  }, [gltf])
  useEffect(() => {
    for (const material of model?.lights ?? []) {
      material.emissive.set(status?.lit ? '#ffdfa1' : '#000000')
      material.emissiveIntensity = status?.lit ? 3 : 0
      material.toneMapped = !status?.lit; material.needsUpdate = true
    }
  }, [model, status?.lit])
  useEffect(() => () => { model?.lights.forEach(material => material.dispose()) }, [model])
  const ornaments = useMemo(() => treeOrnamentSlots(status?.ornaments ?? []).flatMap(item => {
    const anchor: Object3D | undefined = model?.root.getObjectByName(item.anchor)
    if (!anchor || !model) return []
    const position = model.root.worldToLocal(anchor.getWorldPosition(new Vector3()))
    return [{ ...item, position }]
  }), [model, status?.ornaments])
  return model ? <group name="winter-tree-community-display"><primitive object={model.root} dispose={null} />
    {ornaments.map(item => <Ornament key={item.id} kind={item.ornament} position={item.position} />)}
  </group> : <>{fallback}</>
}
