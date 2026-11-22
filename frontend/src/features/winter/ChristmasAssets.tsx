import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AnimationMixer, CylinderGeometry, Mesh, MeshStandardMaterial, SkinnedMesh, TorusGeometry, Vector3, type Object3D } from 'three'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import { useFrame } from '@react-three/fiber'
import { ParkAssetLoader } from '../../world/art/assetLoader'

type AssetId = 'tree' | 'santa' | 'snowman' | 'rudolph' | 'sleigh'
const urls: Record<AssetId, string> = {
  tree: new URL('./assets/tree.glb', import.meta.url).href,
  santa: new URL('./assets/santa.glb', import.meta.url).href,
  snowman: new URL('./assets/snowman.glb', import.meta.url).href,
  rudolph: new URL('./assets/rudolph.glb', import.meta.url).href,
  sleigh: new URL('./assets/sleigh.glb', import.meta.url).href,
}
const pending = new Map<AssetId, Promise<GLTF>>()
function useAsset(id: AssetId) {
  const [loaded, setLoaded] = useState<{ id: AssetId; gltf: GLTF }>()
  useEffect(() => {
    let live = true
    let request = pending.get(id)
    if (!request) {
      request = new ParkAssetLoader().loadAsync(urls[id])
      pending.set(id, request)
    }
    request.then(gltf => { if (live) setLoaded({ id, gltf }) })
      .catch(error => { if (live) console.warn('크리스마스 모델을 불러오지 못해 기본 외관을 표시합니다.', id, error) })
    return () => { live = false }
  }, [id])
  return loaded?.id === id ? loaded.gltf : undefined
}

export function createChristmasInstance(gltf: GLTF, id: AssetId) {
  const scene = clone(gltf.scene)
  scene.name = 'approved-christmas-' + id
  scene.userData.approvedAsset = id
  let skeleton: SkinnedMesh['skeleton'] | undefined
  scene.traverse(object => {
    if (!(object instanceof Mesh)) return
    object.castShadow = true; object.receiveShadow = true
    object.raycast = () => {}
    if (object instanceof SkinnedMesh) {
      object.frustumCulled = false
      if (id === 'rudolph') {
        skeleton ??= object.skeleton
        object.skeleton = skeleton
      }
    }
    if (id === 'tree') {
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      for (const material of materials) if (material instanceof MeshStandardMaterial
        && ['MAT_Star_Emission', 'MAT_StringBulb_Emission'].includes(material.name)) {
        material.emissive.set(0); material.emissiveIntensity = 0
      }
    }
  })
  scene.updateMatrixWorld(true)
  return scene
}

const ringGeometry = new TorusGeometry(.055, .011, 8, 20)
const socketGeometry = new CylinderGeometry(.024, .032, 1, 8)
const ringMaterial = new MeshStandardMaterial({ color: '#b9954c', metalness: .68, roughness: .4 })
function ring(name: string) {
  const marker = new Mesh(ringGeometry, ringMaterial)
  marker.name = name; marker.raycast = () => {}; marker.userData.christmasAttachment = true
  return marker
}
function nearestVertex(scene: Object3D, target: Vector3, harnessOnly = false) {
  let best: { mesh: Mesh; index: number; distance: number } | undefined
  const point = new Vector3()
  scene.traverse(object => {
    if (!(object instanceof Mesh) || object.userData.christmasAttachment) return
    if (harnessOnly) {
      let ancestor: Object3D | null = object, found = false
      while (ancestor && ancestor !== scene) {
        if (ancestor.name.includes('Christmas_Chest_Harness')) { found = true; break }
        ancestor = ancestor.parent
      }
      if (!found) return
    }
    const count = object.geometry.getAttribute('position').count
    for (let index = 0; index < count; index++) {
      object.getVertexPosition(index, point); object.localToWorld(point); scene.worldToLocal(point)
      const distance = point.distanceToSquared(target)
      if (!best || distance < best.distance) best = { mesh: object, index, distance }
    }
  })
  if (!best) throw new Error('승인된 모델의 연결 지점이 없습니다.')
  return best
}

export function ChristmasAsset({ id, fallback }: { id: Exclude<AssetId, 'rudolph'>; fallback: ReactNode }) {
  const gltf = useAsset(id)
  const scene = useMemo(() => {
    if (!gltf) return undefined
    const root = createChristmasInstance(gltf, id)
    if (id === 'sleigh') for (const side of [-1, 1]) {
      const vertex = nearestVertex(root, new Vector3(side * .62, -.1, 1.1))
      const marker = ring(side < 0 ? 'sleigh-tow-left' : 'sleigh-tow-right')
      vertex.mesh.getVertexPosition(vertex.index, marker.position)
      vertex.mesh.localToWorld(marker.position); root.worldToLocal(marker.position)
      // A visible brass socket reaches out of the hull, so the rope starts at
      // the eyelet rather than disappearing inside the sleigh's front trim.
      const socket = new Mesh(socketGeometry, ringMaterial)
      const direction = new Vector3(side * .025, .015, .14)
      socket.position.copy(marker.position).addScaledVector(direction, .5)
      socket.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), direction.clone().normalize())
      socket.scale.y = direction.length()
      socket.raycast = () => {}; socket.name = 'sleigh-tow-socket'
      marker.position.add(direction)
      root.add(socket)
      root.add(marker)
    }
    return root
  }, [gltf, id])
  return scene ? <primitive object={scene} dispose={null} /> : <>{fallback}</>
}

export function ChristmasRudolph({ index, fallback }: { index: number; fallback: ReactNode }) {
  const gltf = useAsset('rudolph')
  const model = useMemo(() => {
    if (!gltf) return undefined
    const scene = createChristmasInstance(gltf, 'rudolph')
    const mixer = new AnimationMixer(scene)
    const action = mixer.clipAction(gltf.animations[0]!)
    const attachments = [-1, 1].map(side => {
      const vertex = nearestVertex(scene, new Vector3(side * .31, .015, .37), true)
      const marker = ring(side < 0 ? 'harness-left' : 'harness-right')
      scene.add(marker)
      return { ...vertex, marker, side }
    })
    return { scene, mixer, action, attachments, moving: false, point: new Vector3() }
  }, [gltf])
  useEffect(() => () => {
    model?.mixer.stopAllAction()
  }, [model])
  useFrame(() => {
    if (!model) return
    const state = model.scene.parent?.userData
    const moving = state?.moving === true
    if (moving) {
      if (!model.moving) model.action.reset().play()
      model.mixer.setTime((Number(state?.elapsed) || 0) / 1000 + index * .09)
    } else if (model.moving) model.mixer.stopAllAction()
    model.moving = moving
    model.scene.updateWorldMatrix(true, true)
    for (const { mesh, index, marker, side } of model.attachments) {
      mesh.getVertexPosition(index, model.point); mesh.localToWorld(model.point)
      model.scene.worldToLocal(model.point); model.point.x += side * .025
      marker.position.copy(model.point)
    }
  }, -.4)
  return model ? <primitive object={model.scene} dispose={null} /> : <>{fallback}</>
}
