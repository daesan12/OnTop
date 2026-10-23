import {
  Color,
  DynamicDrawUsage,
  type InstancedMesh,
  type Matrix4,
} from 'three'

/** Compact only drawable parts. Bird identity, rather than slot, owns its tint. */
export class CompactInstances {
  private ids: Int32Array
  private count = 0
  private colorsChanged = false

  constructor(private mesh: InstancedMesh) {
    this.ids = new Int32Array(mesh.instanceMatrix.count).fill(-1)
    mesh.instanceMatrix.setUsage(DynamicDrawUsage)
    // Allocate colors before shader warmup, even when the first frame is empty.
    const white = new Color('white')
    for (let i = 0; i < this.ids.length; i++) mesh.setColorAt(i, white)
    mesh.instanceColor!.setUsage(DynamicDrawUsage)
    mesh.count = 0
  }

  begin() {
    this.count = 0
    this.colorsChanged = false
  }

  write(id: number, matrix: Matrix4, color: Color) {
    const slot = this.count++
    this.mesh.setMatrixAt(slot, matrix)
    if (this.ids[slot] !== id) {
      this.ids[slot] = id
      this.mesh.setColorAt(slot, color)
      this.colorsChanged = true
    }
  }

  finish() {
    const mesh = this.mesh
    mesh.count = this.count
    mesh.visible = this.count > 0
    if (!this.count) return
    mesh.instanceMatrix.clearUpdateRanges()
    mesh.instanceMatrix.addUpdateRange(0, this.count * 16)
    mesh.instanceMatrix.needsUpdate = true
    if (this.colorsChanged) {
      mesh.instanceColor!.clearUpdateRanges()
      mesh.instanceColor!.addUpdateRange(0, this.count * 3)
      mesh.instanceColor!.needsUpdate = true
    }
    // Flight/movement can cross the old bounds; never cache a stale culling sphere.
    mesh.computeBoundingSphere()
  }
}
