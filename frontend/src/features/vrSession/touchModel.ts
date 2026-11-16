import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

/** The same Touch controller silhouette in the park and the kitchen. */
export function createTouchModel() {
  const root = new THREE.Group()
  root.name = 'quest-touch-controller'
  const shell = new THREE.MeshStandardMaterial({ color: '#eeede5', roughness: .65 })
  const face = new THREE.MeshStandardMaterial({ color: '#252c2b', roughness: .8 })
  const control = new THREE.MeshStandardMaterial({ color: '#858b84', roughness: .65 })
  function part(geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(x, y, z)
    root.add(mesh)
    return mesh
  }
  part(new THREE.CylinderGeometry(.035, .045, .16, 12), shell, 0, -.07, .025).rotation.x = .25
  part(new RoundedBoxGeometry(.09, .035, .12, 2, .012), face, 0, .01, 0)
  part(new THREE.TorusGeometry(.105, .012, 8, 28), shell, 0, .075, -.06).rotation.x = -.45
  part(new THREE.CylinderGeometry(.012, .012, .01, 12), control, -.02, .035, 0)
  for (const z of [-.02, .009]) part(new THREE.CylinderGeometry(.008, .008, .006, 10), control, .02, .03, z)
  return root
}

export function disposeTouchModel(model: THREE.Group) {
  const materials = new Set<THREE.Material>()
  for (const part of model.children) {
    if (!(part instanceof THREE.Mesh)) continue
    part.geometry.dispose()
    materials.add(part.material as THREE.Material)
  }
  materials.forEach(material => material.dispose())
  model.removeFromParent()
}
