import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'

export const SCULPTED_CHEF_URL = '/art/skewer/characters/chef-blue-v2.glb'
export type SculptedModelOptions = { url?: string; name?: string; height?: number; facingYaw?: number }

/** One owned GLTF instance. Game rules and the hall's procedural fallback stay independent. */
export class SculptedChef {
  readonly root = new THREE.Group()
  readonly model: THREE.Group
  readonly animations: readonly THREE.AnimationClip[]
  private readonly mixer: THREE.AnimationMixer
  private readonly walk: THREE.AnimationAction | null
  private walking = false
  private disposed = false

  static async load(options: SculptedModelOptions = {}) {
    const gltf = await new GLTFLoader().loadAsync(options.url ?? SCULPTED_CHEF_URL)
    try { return new SculptedChef(gltf, options) }
    catch (error) { releaseModel(gltf.scene); throw error }
  }

  constructor(gltf: GLTF, options: SculptedModelOptions = {}) {
    this.root.name = options.name ?? 'skewer-sculpted-chef'
    this.model = gltf.scene
    this.animations = gltf.animations
    this.model.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(this.model)
    const height = bounds.max.y - bounds.min.y
    if (!Number.isFinite(height) || height < .001) throw new Error('Invalid skewer chef bounds')
    const center = bounds.getCenter(new THREE.Vector3())
    // Retain the sculpt's proportions; root is used for world placement only.
    const fit = new THREE.Group(), scale = (options.height ?? 2.55) / height
    fit.scale.setScalar(scale)
    // This generated GLB faces +X; the hall actors face +Z.
    fit.rotation.y = options.facingYaw ?? -Math.PI / 2
    this.model.position.x -= center.x
    this.model.position.y -= bounds.min.y
    this.model.position.z -= center.z
    fit.add(this.model); this.root.add(fit)
    this.model.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return
      object.castShadow = object.receiveShadow = true
      // Animated extremities can leave the imported static bounds.
      if (object instanceof THREE.SkinnedMesh) object.frustumCulled = false
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (material instanceof THREE.MeshStandardMaterial && material.map) material.map.anisotropy = 4
      }
    })
    this.mixer = new THREE.AnimationMixer(this.model)
    const clip = gltf.animations.find(candidate => /walk/i.test(candidate.name)) ?? gltf.animations[0]
    this.walk = clip ? this.mixer.clipAction(clip) : null
  }

  update(dt: number, moving = false) {
    if (this.disposed) return
    if (moving !== this.walking) {
      this.walking = moving
      if (moving) this.walk?.reset().play()
      else this.walk?.stop()
    }
    if (moving) this.mixer.update(Math.max(0, Math.min(dt, .05)))
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.model)
    this.root.removeFromParent()
    releaseModel(this.model)
  }
}

function releaseModel(root: THREE.Object3D) {
  const geometry = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>(), skeletons = new Set<THREE.Skeleton>()
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return
    geometry.add(object.geometry)
    if (object instanceof THREE.SkinnedMesh) skeletons.add(object.skeleton)
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material)
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value)
    }
  })
  skeletons.forEach(value => value.dispose())
  geometry.forEach(value => value.dispose()); materials.forEach(value => value.dispose())
  textures.forEach(value => { value.dispose(); if (typeof ImageBitmap !== 'undefined' && value.image instanceof ImageBitmap) value.image.close() })
}
