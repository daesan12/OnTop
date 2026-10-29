import { useLayoutEffect, useState } from 'react'
import { useThree } from '@react-three/fiber'
import { Box3, Color, Frustum, Matrix4, Object3D, type BufferGeometry, type MeshLambertMaterial } from 'three'
import { FadeBatchedMesh } from './FadeBatchedMesh'
import { SpatialInstances, type Part } from './Instances'

export interface SpatialPartBatch { geometry: BufferGeometry; parts: readonly Part[] }
interface Sector { bounds: Box3; ids: number[]; visible: boolean }

/** One submission for solid vegetation, with the original per-part fade identities.
 * Only sector visibility changes rebuild the draw list; never submit the whole forest. */
export class SpatialBatches extends FadeBatchedMesh {
  readonly sectors = new Map<string, Sector>()
  private readonly view = new Matrix4()
  private readonly projection = new Matrix4()
  private readonly world = new Matrix4()
  private readonly projectionView = new Matrix4()
  private readonly frustum = new Frustum()
  private viewValid = false

  constructor(batches: readonly SpatialPartBatch[], material: MeshLambertMaterial) {
    // These untextured Lambert surfaces only consume positions and normals.
    // Non-indexed copies unify the cylinder/cone and faceted crown layouts.
    const geometries = batches.map(({ geometry }) => {
      const copy = geometry.index ? geometry.toNonIndexed() : geometry.clone()
      for (const name of Object.keys(copy.attributes)) if (name !== 'position' && name !== 'normal') copy.deleteAttribute(name)
      copy.computeBoundingBox()
      return copy
    })
    super(batches.reduce((n, b) => n + b.parts.length, 0), geometries.reduce((n, g) => n + g.attributes.position!.count, 0), 0, material)
    this.matrixAutoUpdate = false
    this.frustumCulled = false
    this.perObjectFrustumCulled = false
    this.sortObjects = false
    this.receiveShadow = true
    const object = new Object3D(), color = new Color()
    batches.forEach(({ parts }, i) => {
      const geometry = geometries[i]!, geometryId = this.addGeometry(geometry)
      for (const part of parts) {
        object.position.set(...part.p); object.rotation.set(...(part.r ?? [0, 0, 0])); object.scale.set(...part.s); object.updateMatrix()
        const id = this.addInstance(geometryId)
        this.setMatrixAt(id, object.matrix); this.setColorAt(id, color.set(part.c))
        const key = `${Math.floor(part.p[0] / 24)}:${Math.floor(part.p[2] / 24)}`
        let sector = this.sectors.get(key)
        if (!sector) { sector = { bounds: new Box3(), ids: [], visible: true }; this.sectors.set(key, sector) }
        sector.ids.push(id)
        sector.bounds.union(geometry.boundingBox!.clone().applyMatrix4(object.matrix))
      }
    })
  }

  updateVisibility(frustum: Frustum) {
    for (const sector of this.sectors.values()) {
      const visible = frustum.intersectsBox(sector.bounds)
      if (visible === sector.visible) continue
      sector.visible = visible
      for (const id of sector.ids) this.setVisibleAt(id, visible)
    }
  }

  override onBeforeRender(...args: Parameters<FadeBatchedMesh['onBeforeRender']>) {
    const camera = args[2]
    if (!this.viewValid || !this.view.equals(camera.matrixWorldInverse) || !this.projection.equals(camera.projectionMatrix) || !this.world.equals(this.matrixWorld)) {
      this.viewValid = true
      this.view.copy(camera.matrixWorldInverse); this.projection.copy(camera.projectionMatrix); this.world.copy(this.matrixWorld)
      this.frustum.setFromProjectionMatrix(this.projectionView.multiplyMatrices(this.projection, this.view).multiply(this.world), camera.coordinateSystem, camera.reversedDepth)
      this.updateVisibility(this.frustum)
    }
    super.onBeforeRender(...args)
  }
}

function MultiDraw({ batches, material, shadow, name }: SpatialBatchProps) {
  const [mesh, setMesh] = useState<SpatialBatches | null>(null)
  useLayoutEffect(() => {
    const next = new SpatialBatches(batches, material)
    next.name = name; next.castShadow = shadow
    setMesh(next)
    return () => next.dispose()
  }, [batches, material, name, shadow])
  return mesh ? <primitive key={mesh.uuid} object={mesh} dispose={null} /> : null
}
interface SpatialBatchProps {
  batches: readonly SpatialPartBatch[]
  material: MeshLambertMaterial
  shadow: boolean
  name: string
}
export function SpatialBatchInstances(props: SpatialBatchProps) {
  const supported = useThree(state => state.gl.extensions.has('WEBGL_multi_draw'))
  if (supported) return <MultiDraw {...props} />
  return <>{props.batches.map(({ parts, geometry }) => <SpatialInstances key={geometry.uuid} parts={parts} shadow={props.shadow}
    material={<primitive object={props.material} attach="material" dispose={null} />}>
    <primitive object={geometry} attach="geometry" dispose={null} />
  </SpatialInstances>)}</>
}
