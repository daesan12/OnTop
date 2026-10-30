import { MeshLambertMaterial, MeshStandardMaterial, type BufferGeometry, type Material, type Mesh, type Side } from 'three'
import type { Surface } from '../../../world/worldAssets'

// Module-owned immutable surfaces survive park remounts. Camera occlusion uses
// private clones, so a fading mesh never changes another mesh's shared material.
const surfaces = new Map<string, MeshLambertMaterial>()
const variants = new WeakMap<Material, WeakMap<BufferGeometry, Map<number, Material>>>()
/** R3F attachment selects a stable material for this renderer variant. Sharing
 * one currentProgram across ordinary / instanced meshes would force reselection. */
export function attachSharedMaterial(parent: Mesh, source: Material) {
  const drawable = parent as Mesh & { isInstancedMesh?: boolean; isSkinnedMesh?: boolean; isBatchedMesh?: boolean }
  const key = (drawable.isInstancedMesh ? 1 : drawable.isSkinnedMesh ? 2 : drawable.isBatchedMesh ? 3 : 0) + (parent.receiveShadow ? 4 : 0)
  // Keep unrelated geometry in separate material/sort groups, matching the
  // existing prop cache. Reordering different layouts can outweigh fewer uploads.
  let geometries = variants.get(source)
  if (!geometries) { geometries = new WeakMap(); variants.set(source, geometries) }
  let choices = geometries.get(parent.geometry)
  if (!choices) { choices = new Map(); geometries.set(parent.geometry, choices) }
  let material = choices.get(key)
  if (!material) { material = source.clone(); choices.set(key, material) }
  const previous = parent.material
  parent.material = material
  return () => { parent.material = previous }
}
export function sharedSurfaceMaterial(kind: Surface, color: string, side: Side, vertexColors: boolean, depthOffset: boolean) {
  const key = JSON.stringify([kind, color, side, vertexColors, depthOffset])
  let material = surfaces.get(key)
  if (!material) {
    material = new MeshLambertMaterial({ color, side, vertexColors,
      polygonOffset: depthOffset, polygonOffsetFactor: 0, polygonOffsetUnits: -1 })
    surfaces.set(key, material)
  }
  return material
}
export const sharedInstanceMaterial = new MeshStandardMaterial({ roughness: .88 })

const metals = new Map<string, MeshStandardMaterial>()
export function sharedOutdoorMetal(finish: 'painted' | 'iron' | 'brass', vertexColors: boolean) {
  const key = `${finish}|${vertexColors}`
  let material = metals.get(key)
  if (!material) {
    material = new MeshStandardMaterial({ vertexColors, flatShading: true, metalness: finish === 'brass' ? .15 : 0, roughness: 1 })
    metals.set(key, material)
  }
  return material
}
