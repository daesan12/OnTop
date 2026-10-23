import {
  Box3,
  Color,
  Frustum,
  Matrix4,
  Object3D,
  Vector3,
  type BufferGeometry,
  type Camera,
  type InstancedMesh,
} from 'three'
import type { Part } from './Instances'

interface Sector {
  bounds: Box3
  matrices: Float32Array
  colors: Float32Array
  count: number
}

/** Static source data, compacted into one draw; only tiny, non-shadow-casting props. */
export class DetailBatch {
  readonly bounds = new Box3()
  private readonly sectors: Sector[] = []
  private readonly selected: Uint8Array
  private readonly frustum = new Frustum()
  private readonly projection = new Matrix4()
  private readonly worldBounds = new Box3()
  private readonly cameraPosition = new Vector3()
  private dirty = true

  constructor(parts: readonly Part[], geometry: BufferGeometry, cellSize = 12) {
    geometry.computeBoundingBox()
    const groups = new Map<string, Part[]>()
    for (const part of parts) {
      const key = `${Math.floor(part.p[0] / cellSize)},${Math.floor(part.p[2] / cellSize)}`
      const group = groups.get(key)
      if (group) group.push(part)
      else groups.set(key, [part])
    }
    const object = new Object3D(),
      color = new Color(),
      bounds = new Box3()
    for (const group of groups.values()) {
      const sector: Sector = {
        bounds: new Box3(),
        count: group.length,
        matrices: new Float32Array(group.length * 16),
        colors: new Float32Array(group.length * 3),
      }
      group.forEach((part, i) => {
        object.position.set(...part.p)
        object.scale.set(...part.s)
        object.rotation.set(...(part.r ?? [0, 0, 0]))
        object.updateMatrix()
        object.matrix.toArray(sector.matrices, i * 16)
        color.set(part.c).toArray(sector.colors, i * 3)
        bounds.copy(geometry.boundingBox!).applyMatrix4(object.matrix)
        // Include the origin as the distance fade shrinks geometry towards it.
        bounds.expandByPoint(object.position)
        sector.bounds.union(bounds)
      })
      this.sectors.push(sector)
      this.bounds.union(sector.bounds)
    }
    this.selected = new Uint8Array(this.sectors.length)
  }

  /** Called after CameraRig (-0.5), before rendering. No React updates or frame allocations. */
  update(mesh: InstancedMesh, camera: Camera, range: number): boolean {
    camera.updateWorldMatrix(true, false)
    mesh.updateWorldMatrix(true, false)
    this.cameraPosition.setFromMatrixPosition(camera.matrixWorld)
    this.projection.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    )
    this.frustum.setFromProjectionMatrix(
      this.projection,
      camera.coordinateSystem,
    )
    let changed = this.dirty
    for (let i = 0; i < this.sectors.length; i++) {
      this.worldBounds
        .copy(this.sectors[i]!.bounds)
        .applyMatrix4(mesh.matrixWorld)
      const selected = Number(
        this.worldBounds.distanceToPoint(this.cameraPosition) <= range &&
          this.frustum.intersectsBox(this.worldBounds),
      )
      if (this.selected[i] !== selected) changed = true
      this.selected[i] = selected
    }
    if (!changed) return false
    this.dirty = false
    let offset = 0
    for (let i = 0; i < this.sectors.length; i++) {
      if (!this.selected[i]) continue
      const sector = this.sectors[i]!
      mesh.instanceMatrix.array.set(sector.matrices, offset * 16)
      mesh.instanceColor!.array.set(sector.colors, offset * 3)
      offset += sector.count
    }
    mesh.count = offset
    // Keep the original, conservative mesh bounds. Empty/partial batches must
    // be discoverable when the camera returns; don't recompute from compacted data.
    if (offset) {
      mesh.instanceMatrix.clearUpdateRanges()
      mesh.instanceMatrix.addUpdateRange(0, offset * 16)
      mesh.instanceMatrix.needsUpdate = true
      mesh.instanceColor!.clearUpdateRanges()
      mesh.instanceColor!.addUpdateRange(0, offset * 3)
      mesh.instanceColor!.needsUpdate = true
    }
    return true
  }
}
