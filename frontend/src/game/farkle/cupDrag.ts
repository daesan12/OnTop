import { Plane, Raycaster, Vector2, Vector3, type Camera, type Object3D } from 'three'

/** Table-local projection preserves controls for the opposite seat and scaled tables. */
export class CupDrag {
  readonly target = new Vector3()
  private pointer = new Vector2(); private ray = new Raycaster(); private hit = new Vector3(); private offset = new Vector3()
  private plane: Plane
  constructor(private camera: Camera, private parent: Object3D, worldHeight: number) {
    this.plane = new Plane(new Vector3(0, 1, 0), -worldHeight)
  }
  private project(x: number, y: number, box: DOMRect) {
    if (box.width <= 0 || box.height <= 0) return false
    this.pointer.set((x - box.left) / box.width * 2 - 1, 1 - (y - box.top) / box.height * 2)
    this.ray.setFromCamera(this.pointer, this.camera)
    if (!this.ray.ray.intersectPlane(this.plane, this.hit)) return false
    this.parent.worldToLocal(this.hit); return true
  }
  begin(x: number, y: number, box: DOMRect, position: Vector3) {
    if (!this.project(x, y, box)) return false
    this.offset.copy(position).sub(this.hit); this.target.copy(position); return true
  }
  move(x: number, y: number, box: DOMRect) {
    if (this.project(x, y, box)) this.target.set(Math.max(-0.65, Math.min(0.91, this.hit.x + this.offset.x)), 1.36,
      Math.max(-0.45, Math.min(0.45, this.hit.z + this.offset.z)))
    return this.target
  }
}
