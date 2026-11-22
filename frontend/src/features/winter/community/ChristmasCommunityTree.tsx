import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useThree } from '@react-three/fiber'
import { Box3, Mesh, MeshStandardMaterial, Vector3, type Object3D } from 'three'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { ParkAssetLoader } from '../../../world/art/assetLoader'
import { useWinterCommunity } from './state'
import { TREE_ORNAMENTS, treeOrnamentSlots, type TreeOrnamentKind } from './ornaments'

const treeUrl = new URL('./assets/tree.glb', import.meta.url).href
const requests = new Map<string, Promise<GLTF>>()
function useModel(url: string | null) {
  const [loaded, setLoaded] = useState<{ url: string; gltf: GLTF }>()
  useEffect(() => {
    if (!url) return
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

/** 승인된 12m 트리에 기존 편지 장식과 50개 점등 상태를 연결한다. */
export function ChristmasCommunityTree({ fallback, procedural = false }: { fallback: ReactNode; procedural?: boolean }) {
  const invalidate = useThree(state => state.invalidate)
  const gltf = useModel(procedural ? null : treeUrl), status = useWinterCommunity(s => s.tree)
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
    invalidate()
  }, [model, status?.lit, invalidate])
  useEffect(() => () => { model?.lights.forEach(material => material.dispose()) }, [model])
  const ornaments = useMemo(() => treeOrnamentSlots(status?.ornaments ?? []).flatMap(item => {
    if (procedural) {
      const slot = Number(item.anchor.slice(-3)) - 1, row = Math.floor(slot / 12)
      const y = .8 + row * .9, radius = Math.max(.3, 2.5 * (1 - y / 6.8)) + .12
      const angle = (slot % 12) * Math.PI / 6 + row * .83
      return [{ ...item, position: new Vector3(Math.sin(angle) * radius, y, Math.cos(angle) * radius) }]
    }
    const anchor: Object3D | undefined = model?.root.getObjectByName(item.anchor)
    if (!anchor || !model) return []
    const position = model.root.worldToLocal(anchor.getWorldPosition(new Vector3()))
    return [{ ...item, position }]
  }), [model, status?.ornaments, procedural])
  if (procedural) return <group name="winter-tree-community-display">{fallback}
    {ornaments.map(item => <Ornament key={item.id} kind={item.ornament} position={item.position} />)}
  </group>
  return model ? <group name="winter-tree-community-display"><primitive object={model.root} dispose={null} />
    {ornaments.map(item => <Ornament key={item.id} kind={item.ornament} position={item.position} />)}
  </group> : <>{fallback}</>
}
