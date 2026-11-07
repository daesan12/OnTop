import * as THREE from 'three'
import type { RestaurantSet } from '../serviceHall/rendering/RestaurantSet'
import type { Part } from '../../../world/art/Instances'
import { parkExteriorGeometry, type ExteriorRegion } from './parkExteriorGeometry'

/** Read-only scenery made from the current park's canonical geometry and tree placements. */
export class ChefCourtyard {
  readonly root = new THREE.Group()
  private disposed = false
  private geometry = new Set<THREE.BufferGeometry>()
  private materials = new Set<THREE.Material>()
  private batches: THREE.InstancedMesh[] = []
  private region?: ExteriorRegion
  private readonly clip = new THREE.Plane()
  private readonly localClip = new THREE.Plane(new THREE.Vector3(0, 0, 1), -14)
  constructor(a: RestaurantSet) { a.root.add(this.root); this.root.name = 'current-park-exterior'; void this.load().catch(() => { this.root.userData.source = 'unavailable' }) }
  private material(color: string, vertexColors = false) {
    const m = new THREE.MeshStandardMaterial({ color, vertexColors, roughness: .9, side: THREE.DoubleSide, clippingPlanes: [this.clip] })
    this.materials.add(m); return m
  }
  private mesh(source: THREE.BufferGeometry, color: string, vertexColors = false) {
    const geometry = parkExteriorGeometry(source, this.region!); this.geometry.add(geometry)
    const mesh = new THREE.Mesh(geometry, this.material(color, vertexColors)); this.root.add(mesh); return mesh
  }
  private instances(parts: readonly Part[], shape: THREE.BufferGeometry) {
    const region = this.region!
    parts = parts.filter(part => Math.abs(part.p[0] - region.x) < region.halfWidth && part.p[2] >= region.z && part.p[2] <= region.z + region.depth)
    this.geometry.add(shape)
    const mesh = new THREE.InstancedMesh(shape, this.material('#ffffff'), parts.length), transform = new THREE.Object3D()
    parts.forEach((part, i) => { transform.position.set(...part.p); transform.scale.set(...part.s); transform.rotation.set(...(part.r ?? [0, 0, 0])); transform.updateMatrix(); mesh.setMatrixAt(i, transform.matrix); mesh.setColorAt(i, new THREE.Color(part.c)) })
    this.root.add(mesh); this.batches.push(mesh)
  }
  private async load() {
    const [scene, paths, trees, layout, pagoda] = await Promise.all([
      import('../../../layout-preview/sceneGeometry'), import('../../../layout-preview/landscapeGeometry'),
      import('../../../layout-preview/existingTreeModel'), import('../../../layout-preview/layout'), import('../../../world/art/StonePagoda'),
    ])
    if (this.disposed) return
    this.region = { x: layout.SITES.vr.x, z: layout.SITES.vr.z, halfWidth: 70, depth: 120 }
    this.mesh(scene.lawn, '#a8bc87'); this.mesh(paths.pathPaving, '#d8cfb8')
    for (const art of [scene.gardenArt, scene.cityArt, scene.detailArt, paths.plazaArt, paths.fenceArt])
      for (const geometry of Object.values(art)) if (geometry) this.mesh(geometry, '#ffffff', true)
    for (const [trunks, crowns] of [[scene.trunks, scene.crowns], [scene.shoreTrunks, scene.shoreCrowns]]) {
      const parts = trees.existingTreeModel(trunks, crowns).parts
      this.instances(parts.wood, new THREE.CylinderGeometry(1, 1, 1, 7))
      this.instances(parts.crowns, new THREE.IcosahedronGeometry(1, 1))
      this.instances(parts.cones, new THREE.ConeGeometry(1, 1, 7))
    }
    const stone = pagoda.cloneStonePagodaGeometry(); this.geometry.add(stone)
    const tower = new THREE.Mesh(stone, this.material('#ffffff', true)); tower.position.set(layout.SITES.pagoda.x, 0, layout.SITES.pagoda.z); this.root.add(tower)
    // Keep park scale/placement canonical, translated beyond the restaurant's terrace.
    this.root.position.set(-layout.SITES.vr.x, -.3, 14 - layout.SITES.vr.z)
    this.root.userData.source = 'current-park-geometry'
  }
  update() {
    // The terrace clip follows the whole kitchen in immersive VR too.
    const parent = this.root.parent
    if (parent) { parent.updateWorldMatrix(true, false); this.clip.copy(this.localClip).applyMatrix4(parent.matrixWorld) }
  }
  dispose() { this.disposed = true; this.root.removeFromParent(); this.batches.forEach(m => m.dispose()); this.geometry.forEach(g => g.dispose()); this.materials.forEach(m => m.dispose()) }
}
