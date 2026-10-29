import { Box3, BoxGeometry, Color, Frustum, Matrix4, MeshLambertMaterial, MeshStandardMaterial, Object3D, Vector3, type BufferGeometry, type Camera } from 'three'
import { WORLD } from '../../config'
import { WALL, type createWallRoof, type createWallCorner } from './boundaryGeometry'
import { FadeBatchedMesh } from './FadeBatchedMesh'
import type { Part } from './Instances'

type Roof = ReturnType<typeof createWallRoof>
type Corner = ReturnType<typeof createWallCorner>
interface BatchPart { geometry: BufferGeometry; part: Part; section?: number; near?: boolean }
interface Section { center: Vector3; bounds: Box3; near: boolean; visible: boolean; variants: { mesh: FadeBatchedMesh; id: number; near?: boolean }[] }

/** Same 46m LOD and 16% hysteresis as Three.LOD's far level. */
export function boundaryNear(previous: boolean, distance: number) {
  return distance < WALL.nearDistance * (previous ? 1 : .84)
}

export class BoundaryBatches {
  readonly meshes: FadeBatchedMesh[] = []
  readonly sections: Section[] = []
  private readonly cullGroups: Section[] = []
  private readonly view = new Matrix4()
  private readonly projection = new Matrix4()
  private readonly projectionView = new Matrix4()
  private readonly frustum = new Frustum()
  private readonly cameraPosition = new Vector3()
  private viewValid = false
  private readonly materials = [
    new MeshStandardMaterial({ color: '#94988d', flatShading: true, roughness: 1 }),
    new MeshLambertMaterial(),
    new MeshLambertMaterial({ vertexColors: true }),
    new MeshStandardMaterial({ vertexColors: true, roughness: .96 }),
    new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }),
  ]

  constructor(near: Roof, far: Roof, corner: Corner) {
    const groups: BatchPart[][] = this.materials.map(() => [])
    const box = new BoxGeometry(), span = (WORLD.halfSize * 2 - .9) / 8
    const sectionTransform = new Object3D(), local = new Object3D(), combined = new Matrix4()
    const transform = (part: Part): Part => {
      local.position.set(...part.p); local.scale.set(...part.s); local.rotation.set(...(part.r ?? [0, 0, 0])); local.updateMatrix()
      combined.multiplyMatrices(sectionTransform.matrix, local.matrix)
      const p = new Vector3(), s = new Vector3(), q = local.quaternion.clone()
      combined.decompose(p, q, s); local.quaternion.copy(q)
      return { p: p.toArray(), s: s.toArray(), r: [local.rotation.x, local.rotation.y, local.rotation.z], c: part.c }
    }
    for (let side = 0; side < 4; side++) for (let i = 0; i < 8; i++) {
      const yaw = side * Math.PI / 2, x = -WORLD.halfSize + .45 + (i + .5) * span
      sectionTransform.position.set(Math.cos(yaw) * x - Math.sin(yaw) * WORLD.halfSize, 0, -Math.sin(yaw) * x - Math.cos(yaw) * WORLD.halfSize)
      sectionTransform.rotation.set(0, yaw, 0); sectionTransform.updateMatrix()
      const section = this.sections.length
      const group: Section = { center: sectionTransform.position.clone(), bounds: new Box3(), near: false, visible: true, variants: [] }
      this.sections.push(group); this.cullGroups.push(group)
      groups[0]!.push({ geometry: box, section, part: transform({ p: [0, (WALL.bodyTop + WALL.base) / 2, 0], s: [span, WALL.bodyTop - WALL.base, WALL.depth], c: '#ffffff' }) })
      for (const part of [
        { p: [0, .12, 0], s: [span, .24, .77], c: '#999b95' },
        { p: [0, .255, 0], s: [span, .065, .73], c: '#b1b1a6' },
      ] as Part[]) groups[1]!.push({ geometry: box, section, part: transform(part) })
      for (const detailed of [true, false]) {
        const roof = detailed ? near : far
        for (let n = 0; n < 5; n++) {
          const part = transform({ p: [(n - 2) * span / 5, 0, 0], s: [span / 20, 1, 1], c: '#ffffff' })
          groups[2]!.push({ geometry: roof.clay, part, section, near: detailed })
          groups[3]!.push({ geometry: roof.timber, part, section, near: detailed })
          if (roof.ends) groups[4]!.push({ geometry: roof.ends, part, section, near: detailed })
        }
      }
    }
    for (const x of [-1, 1]) for (const z of [-1, 1]) {
      const p: [number, number, number] = [x * WORLD.halfSize, 0, z * WORLD.halfSize]
      const section = this.cullGroups.length
      this.cullGroups.push({ center: new Vector3(...p), bounds: new Box3(), near: false, visible: true, variants: [] })
      groups[0]!.push({ geometry: box, section, part: { p: [p[0], .95, p[2]], s: [.91, 1.9, .91], c: '#ffffff' } })
      const part: Part = { p, s: [1, 1, 1], c: '#ffffff' }
      groups[2]!.push({ geometry: corner.clay, section, part }); groups[4]!.push({ geometry: corner.ends, section, part })
    }
    const object = new Object3D(), color = new Color()
    groups.forEach((parts, index) => {
      const geometries = [...new Set(parts.map(p => p.geometry))]
      const mesh = new FadeBatchedMesh(parts.length, geometries.reduce((n, g) => n + g.getAttribute('position').count, 0), geometries.reduce((n, g) => n + g.index!.count, 0), this.materials[index]!)
      mesh.name = `boundary-multi-draw-${index}`; mesh.matrixAutoUpdate = false; mesh.frustumCulled = false; mesh.receiveShadow = true
      // Opaque parts keep depth writes. Cull 36 static sections rather than
      // sorting/testing 900+ individual tile draws and uploading their list each frame.
      mesh.sortObjects = false; mesh.perObjectFrustumCulled = false
      mesh.onBeforeRender = (...args) => {
        this.updateCamera(args[2])
        FadeBatchedMesh.prototype.onBeforeRender.call(mesh, ...args)
      }
      const ids = new Map(geometries.map(source => {
        const copy = source.clone()
        // These solid materials consume position, normal, and optionally colour.
        // Geometry is unchanged; omit unused UVs to unify the multi-draw buffers.
        for (const name of Object.keys(copy.attributes)) if (!['position', 'normal', ...(index >= 2 ? ['color'] : [])].includes(name)) copy.deleteAttribute(name)
        return [source, mesh.addGeometry(copy)]
      }))
      for (const { geometry, part, section, near: detailed } of parts) {
        object.position.set(...part.p); object.scale.set(...part.s); object.rotation.set(...(part.r ?? [0, 0, 0])); object.updateMatrix()
        const id = mesh.addInstance(ids.get(geometry)!)
        mesh.setMatrixAt(id, object.matrix); mesh.setColorAt(id, color.set(part.c))
        if (section !== undefined) {
          const group = this.cullGroups[section]!
          group.variants.push({ mesh, id, near: detailed })
          if (!geometry.boundingBox) geometry.computeBoundingBox()
          group.bounds.union(geometry.boundingBox!.clone().applyMatrix4(object.matrix))
          mesh.setVisibleAt(id, detailed !== true)
        }
      }
      this.meshes.push(mesh)
    })
    box.dispose()
  }

  private updateCamera(camera: Camera) {
    if (this.viewValid && this.view.equals(camera.matrixWorldInverse) && this.projection.equals(camera.projectionMatrix)) return
    this.viewValid = true
    this.view.copy(camera.matrixWorldInverse); this.projection.copy(camera.projectionMatrix)
    this.frustum.setFromProjectionMatrix(this.projectionView.multiplyMatrices(this.projection, this.view), camera.coordinateSystem, camera.reversedDepth)
    this.cameraPosition.setFromMatrixPosition(camera.matrixWorld)
    this.update(this.cameraPosition, 'zoom' in camera ? Number(camera.zoom) : 1, this.frustum)
  }

  update(camera: Vector3, zoom = 1, frustum?: Frustum) {
    for (const section of this.cullGroups) {
      const near = boundaryNear(section.near, camera.distanceTo(section.center) / zoom)
      const visible = !frustum || frustum.intersectsBox(section.bounds)
      if (near === section.near && visible === section.visible) continue
      section.near = near; section.visible = visible
      for (const variant of section.variants) variant.mesh.setVisibleAt(variant.id, visible && (variant.near === undefined || variant.near === near))
    }
  }
  dispose() {
    for (const mesh of this.meshes) mesh.dispose()
    for (const material of this.materials) material.dispose()
  }
}
