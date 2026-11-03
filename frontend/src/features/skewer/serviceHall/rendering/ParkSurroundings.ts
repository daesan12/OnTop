import * as THREE from 'three'
import { RestaurantSet } from './RestaurantSet'
import { HALL_STYLE } from './HallStyle'

/** 식당 양옆의 목재 상판·석조 아치 다리. 게임 이동 영역과는 분리된 연출이다. */
export class ParkSurroundings {
  private readonly geometries: THREE.BufferGeometry[] = []
  private readonly batches: THREE.InstancedMesh[] = []
  readonly batchCounts: { meshes: number; batches: number }
  constructor(art: RestaurantSet) {
    const a = art, r = a.place(a.root, new THREE.Group(), 0, 0, 0)
    r.name = 'restaurant-stone-bridges'
    a.place(r, a.box(24.5, 2.5, 15.2, '#777565', .08), 0, -1.4, 0)
    // 주변 조경을 제거하고 깊이만 구분하는 잔잔한 수면을 둔다.
    const water = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), a.material(HALL_STYLE.water, 0, .86))
    this.geometries.push(water.geometry); water.rotation.x = -Math.PI / 2; water.position.y = -2.85; water.receiveShadow = true; r.add(water)
    // Quiet surface marks sit outside the playable floor; no particles or extra lights.
    for (const side of [-1, 1]) for (let i = 0; i < 5; i++) {
      const ripple = a.box(1.3 + i % 3 * .5, .008, .045, '#486976', .004)
      ripple.castShadow = ripple.receiveShadow = false
      a.place(r, ripple, side * (14 + i % 2 * 1.8), -2.83, -5.5 + i * 3.0)
    }
    for (const side of [-1, 1]) {
      const bridge = a.place(r, new THREE.Group(), side * 12.3, 0, 1.8)
      if (side < 0) bridge.rotation.y = Math.PI
      bridge.name = side < 0 ? 'left-arched-bridge' : 'right-arched-bridge'
      a.place(bridge, a.box(22, .22, 3.6, '#604833', .04), 11, -.30, 0)
      for (let i = 0; i < 55; i++) a.place(bridge, a.box(.375, .11, 3.45, ['#a2794a', '#b68c57', '#956c43'][i % 3], .025), .2 + i * .4, -.135, 0)
      for (const z of [-1.9, 1.9]) {
        // 아치 구멍을 실제 형상으로 뚫어 건너편 수면이 보이도록 한다.
        for (let bay = 0; bay < 4; bay++) {
          const outline = new THREE.Shape()
          outline.moveTo(0, 0); outline.lineTo(5.5, 0); outline.lineTo(5.5, -2.5)
          outline.lineTo(4.65, -2.5); outline.lineTo(4.65, -2.1)
          outline.absarc(2.75, -2.1, 1.9, 0, Math.PI, false)
          outline.lineTo(.85, -2.5); outline.lineTo(0, -2.5); outline.closePath()
          const geometry = new THREE.ExtrudeGeometry(outline, { depth: .40, bevelEnabled: true, bevelSize: .035, bevelThickness: .035, bevelSegments: 1, steps: 1, curveSegments: 12 })
          this.geometries.push(geometry)
          const arch = new THREE.Mesh(geometry, a.material('#827f6e', 0, .88)); arch.castShadow = arch.receiveShadow = true
          a.place(bridge, arch, bay * 5.5, -.36, z - .2)
          for (let wedge = 0; wedge < 9; wedge++) {
            const angle = Math.PI * (wedge + .5) / 9
            const stone = a.box(.56, .20, .48, wedge % 2 ? '#a29b83' : '#938e79', .025)
            stone.rotation.z = angle - Math.PI / 2
            a.place(bridge, stone, bay * 5.5 + 2.75 + 2.02 * Math.cos(angle), -2.46 + 2.02 * Math.sin(angle), z)
          }
        }
        for (let i = 0; i < 19; i++) {
          for (let row = 0; row < 2; row++) a.place(bridge, a.box(1.13, .26, .43, (i + row) % 2 ? '#817b68' : '#918772', .025), .58 + i * 1.16, .02 + row * .27, z)
          a.place(bridge, a.box(1.17, .17, .64, '#815342', .04), .58 + i * 1.16, .49, z)
        }
      }
    }
    // 입구 대기열을 지지하는 작은 앞쪽 석재 테라스.
    a.place(r, a.box(24.6, 2.4, 2.3, '#77715f', .07), 0, -1.48, 8.7)
    for (let i = 0; i < 8; i++) a.place(r, a.box(3.02, .08, 2.2, i % 2 ? '#b9ad90' : '#c4b89a', .03), -10.76 + i * 3.075, -.22, 8.7)
    this.batchCounts = this.batchRepeatingProps(r)
  }
  /** Static planks and rail blocks share geometry/material; retain exact transforms. */
  private batchRepeatingProps(root: THREE.Group) {
    root.updateWorldMatrix(true, true)
    const inverse = root.matrixWorld.clone().invert(), groups = new Map<string, THREE.Mesh[]>()
    root.traverse(object => {
      if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return
      const key = `${object.geometry.uuid}:${object.material.uuid}:${object.castShadow}:${object.receiveShadow}`
      const list = groups.get(key) ?? []; list.push(object); groups.set(key, list)
    })
    let meshes = 0
    for (const list of groups.values()) {
      if (list.length < 2) continue
      const first = list[0], batch = new THREE.InstancedMesh(first.geometry, first.material, list.length)
      batch.name = 'bridge-repeating-props'; batch.castShadow = first.castShadow; batch.receiveShadow = first.receiveShadow
      list.forEach((mesh, i) => { batch.setMatrixAt(i, new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld)); mesh.removeFromParent() })
      batch.instanceMatrix.needsUpdate = true; root.add(batch); this.batches.push(batch); meshes += list.length
    }
    return { meshes, batches: this.batches.length }
  }
  dispose() { this.batches.forEach(batch => batch.dispose()); this.geometries.forEach(geometry => geometry.dispose()) }
}
