import { BatchedMesh, type BufferGeometry, type Object3D } from 'three'

/** Stable instance/geometry identities for the existing per-part camera fade.
 * Rendering uses multi-draw; CPU ray tests still use each original small mesh. */
export class FadeBatchedMesh extends BatchedMesh {
  readonly sourceGeometries = new Map<number, BufferGeometry>()
  private readonly geometryIds: number[] = []
  isDisposed = false
  readonly fadeProxies = new Map<number, Object3D>()

  override addGeometry(geometry: BufferGeometry, vertices = -1, indices = -1) {
    const id = super.addGeometry(geometry, vertices, indices)
    this.sourceGeometries.set(id, geometry)
    return id
  }
  override addInstance(geometryId: number) {
    const id = super.addInstance(geometryId)
    this.geometryIds[id] = geometryId
    return id
  }
  sourceGeometryAt(index: number) {
    return this.sourceGeometries.get(this.geometryIds[index]!)!
  }
  override setVisibleAt(index: number, visible: boolean) {
    super.setVisibleAt(index, visible)
    const proxy = this.fadeProxies.get(index)
    if (proxy) proxy.visible = visible && proxy.userData.cameraFadeActive === true
    return this
  }
  override dispose() {
    if (this.isDisposed) return
    this.isDisposed = true
    this.fadeProxies.clear()
    super.dispose()
    for (const geometry of this.sourceGeometries.values()) geometry.dispose()
  }
}
