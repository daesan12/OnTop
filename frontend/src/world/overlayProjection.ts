import { Camera, Matrix4, Vector3 } from 'three'

/** One camera comparison per frame, shared by all overheads. */
export class OverlayView {
  private world = new Matrix4()
  private projection = new Matrix4()
  changed = true
  revision = 0
  width = 0
  height = 0

  update(camera: Camera, width: number, height: number) {
    this.changed = !this.revision || this.width !== width || this.height !== height
      || !this.world.equals(camera.matrixWorldInverse) || !this.projection.equals(camera.projectionMatrix)
    if (this.changed) {
      this.world.copy(camera.matrixWorldInverse); this.projection.copy(camera.projectionMatrix)
      this.width = width; this.height = height; this.revision++
    }
  }
}

/** Exact projection/clamping results, reused only while every input is unchanged. */
export class OverlayProjection {
  private head = new Matrix4()
  private point = new Vector3()
  private revision = -1
  private offset = 0
  private width = -1
  private height = -1
  private result = { visible: false, x: 0, y: 0, transform: '' }

  project(head: Matrix4, camera: Camera, view: OverlayView, width: number, height: number, offset: number) {
    const changed = view.changed || this.revision !== view.revision || this.offset !== offset || !this.head.equals(head)
    if (changed) {
      // While turning, retain the original arithmetic and avoid maintaining a
      // head-matrix cache that would be invalidated again on the next frame.
      if (view.changed) this.revision = -1
      else { this.head.copy(head); this.offset = offset; this.revision = view.revision }
      this.point.set(0, offset, 0).applyMatrix4(head)
      this.point.project(camera)
      this.result.visible = this.point.z >= -1 && this.point.z <= 1
        && Math.abs(this.point.x) <= 1 && Math.abs(this.point.y) <= 1
    }
    if (this.result.visible && (changed || this.width !== width || this.height !== height)) {
      const halfWidth = width / 2
      this.result.x = Math.max(halfWidth + 8, Math.min(view.width - halfWidth - 8, ((this.point.x + 1) * view.width) / 2))
      this.result.y = Math.max(height + 8, ((1 - this.point.y) * view.height) / 2)
      this.result.transform = `translate3d(${this.result.x.toFixed(1)}px, ${this.result.y.toFixed(1)}px, 0) translate(-50%, -100%)`
    }
    this.width = width; this.height = height
    return this.result
  }
}
