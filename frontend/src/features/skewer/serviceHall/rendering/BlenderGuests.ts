import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

export const BLENDER_GUESTS_URL = '/art/skewer/characters/guests-blender-v1.glb'
export const GUEST_PARTS = ['head', 'body', 'armL', 'armR', 'handL', 'handR', 'legL', 'legR', 'shoeL', 'shoeR'] as const
export type GuestParts = Record<typeof GUEST_PARTS[number], THREE.Object3D>

/** One shared asset per hall; clones share immutable geometry and materials. */
export class BlenderGuests {
  private constructor(private source: THREE.Group) {}

  static async load() {
    const { scene } = await new GLTFLoader().loadAsync(BLENDER_GUESTS_URL)
    const library = new BlenderGuests(scene)
    try {
      for (let variant = 0; variant < 8; variant++) {
        for (const part of GUEST_PARTS) {
          if (!scene.getObjectByName(`guest_${variant}_${part}`)) throw new Error('Incomplete Blender guest asset')
        }
      }
      scene.traverse(object => {
        if (object instanceof THREE.Mesh) object.castShadow = object.receiveShadow = true
      })
      return library
    } catch (error) { library.dispose(); throw error }
  }

  clone(variant: number): GuestParts {
    return Object.fromEntries(GUEST_PARTS.map(part => [part, this.source.getObjectByName(`guest_${variant}_${part}`)!.clone(true)])) as GuestParts
  }

  dispose() {
    const geometry = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>()
    this.source.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return
      geometry.add(object.geometry)
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material)
    })
    geometry.forEach(value => value.dispose()); materials.forEach(value => value.dispose())
    this.source.clear()
  }
}
