import {
  Box3,
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  Mesh,
  Raycaster,
  Vector3,
  type Intersection,
  type BufferGeometry,
  type Material,
  type Object3D,
} from 'three'
import { raycastStaticSurface } from './art/staticSurface'

export const cameraOcclusion = {
  focus: { value: new Vector3() },
  strength: { value: 0 },
}
export const OCCLUSION_FADE = {
  opacity: 0.18,
  focusClearance: 0.25,
  releaseDelay: 0.12,
  fadeOutSpeed: 10,
  restoreSpeed: 5.5,
} as const

/** Frame-rate independent easing; reversals start at the current opacity. */
export function advanceOcclusionFade(
  value: number,
  blocked: boolean,
  delta: number,
) {
  const target = blocked ? 1 : 0
  const speed = blocked
    ? OCCLUSION_FADE.fadeOutSpeed
    : OCCLUSION_FADE.restoreSpeed
  const next = target + (value - target) * Math.exp(-speed * Math.max(0, delta))
  return Math.abs(next - target) < 0.001 ? target : next
}
interface Entry {
  source: Mesh
  index: number
  bounds: Box3
  amount: number
  lastBlocked: number
  seen: number
  original: Material | Material[]
  matrix?: Matrix4
  proxy?: InstancedMesh
  materials?: Material[]
  opacity: { value: number }
}
interface SourceStamp {
  geometry: BufferGeometry
  count: number
  matrix: Matrix4
}
const cellSize = 8
const hiddenMatrix = new Matrix4().makeScale(0, 0, 0)
const tint = new Color()

function eligible(node: Object3D): node is Mesh {
  if (
    !(node instanceof Mesh) ||
    node.userData.cameraFadeProxy ||
    node.userData.keepOpaque
  )
    return false
  if (
    node instanceof InstancedMesh &&
    node.instanceMatrix.usage === DynamicDrawUsage
  )
    return false
  // Animated subtrees and game input own their transforms/materials. Water/glass
  // and tiny, dynamically compacted decoration keep their own render pipeline.
  for (let p: Object3D | null = node; p; p = p.parent)
    if (
      p.userData.keepOpaque ||
      p.name.startsWith('table-') ||
      [
        'fitness-garden',
        'advertising-balloon',
        'reference-fountain',
        'observation-telescopes',
      ].includes(p.name)
    )
      return false
  const materials = Array.isArray(node.material)
    ? node.material
    : [node.material]
  return materials.every(
    (m) =>
      !m.transparent &&
      m.type !== 'ShaderMaterial' &&
      m.type !== 'RawShaderMaterial',
  )
}
function visible(node: Object3D) {
  for (let p: Object3D | null = node; p; p = p.parent)
    if (!p.visible) return false
  return true
}

/** Only obstructing parts leave the opaque batch. One-instance transparent proxies
 * sort independently back-to-front; other instances keep depth writes and batching.
 * A spatial grid avoids raycasting every leaf/tile on every animation frame. */
export class CameraOcclusionFader {
  private sources = new Map<Mesh, SourceStamp>()
  private entries: Entry[] = []
  private grid = new Map<string, Entry[]>()
  private active = new Set<Entry>()
  private raycaster = new Raycaster()
  private probe = new Mesh()
  private instanceMatrix = new Matrix4()
  private intersections: Intersection[] = []
  private hit = new Vector3()
  private clock = 0
  private frame = 0

  refresh(root: Object3D) {
    root.updateWorldMatrix(true, true)
    const meshes: Mesh[] = []
    root.traverse((node) => {
      // A non-instanced source temporarily owns a transparent fade material.
      if (this.sources.has(node as Mesh) || eligible(node))
        meshes.push(node as Mesh)
    })
    const changed =
      meshes.length !== this.sources.size ||
      meshes.some((mesh) => {
        const stamp = this.sources.get(mesh)
        return (
          !stamp ||
          stamp.geometry !== mesh.geometry ||
          stamp.count !== (mesh instanceof InstancedMesh ? mesh.count : 1) ||
          !stamp.matrix.equals(mesh.matrixWorld)
        )
      })
    if (!changed) return
    this.dispose()
    const local = new Matrix4(),
      world = new Matrix4()
    for (const source of meshes) {
      source.geometry.computeBoundingBox()
      if (!source.geometry.boundingBox || source.geometry.boundingBox.isEmpty())
        continue
      const count = source instanceof InstancedMesh ? source.count : 1
      this.sources.set(source, {
        geometry: source.geometry,
        count,
        matrix: source.matrixWorld.clone(),
      })
      for (let index = 0; index < count; index++) {
        if (source instanceof InstancedMesh) source.getMatrixAt(index, local)
        else local.identity()
        world.multiplyMatrices(source.matrixWorld, local)
        const bounds = source.geometry.boundingBox.clone().applyMatrix4(world)
        if (bounds.max.y - bounds.min.y < 0.08) continue
        const entry: Entry = {
          source,
          index,
          bounds,
          amount: 0,
          lastBlocked: -Infinity,
          seen: -1,
          original: source.material,
          opacity: { value: 1 },
        }
        this.entries.push(entry)
        for (
          let x = Math.floor(bounds.min.x / cellSize);
          x <= Math.floor(bounds.max.x / cellSize);
          x++
        )
          for (
            let z = Math.floor(bounds.min.z / cellSize);
            z <= Math.floor(bounds.max.z / cellSize);
            z++
          ) {
            const key = `${x},${z}`,
              bucket = this.grid.get(key)
            if (bucket) bucket.push(entry)
            else this.grid.set(key, [entry])
          }
      }
    }
  }

  update(camera: Vector3, focus: Vector3, enabled: boolean, delta: number) {
    this.clock += Math.max(0, delta)
    this.frame++
    const ray = this.raycaster.ray
    ray.origin.copy(camera)
    ray.direction.subVectors(focus, camera)
    const distance = ray.direction.length()
    ray.direction.normalize()
    this.raycaster.near = 0.01
    this.raycaster.far = distance - OCCLUSION_FADE.focusClearance
    if (enabled && this.raycaster.far > this.raycaster.near) {
      for (
        let x = Math.floor(Math.min(camera.x, focus.x) / cellSize);
        x <= Math.floor(Math.max(camera.x, focus.x) / cellSize);
        x++
      )
        for (
          let z = Math.floor(Math.min(camera.z, focus.z) / cellSize);
          z <= Math.floor(Math.max(camera.z, focus.z) / cellSize);
          z++
        ) {
          const bucket = this.grid.get(`${x},${z}`)
          if (!bucket) continue
          for (const entry of bucket) {
            if (entry.seen === this.frame) continue
            entry.seen = this.frame
            if (!visible(entry.source)) continue
            // Bounds only select candidates. A nearby surface or an opening in
            // a large/rotated mesh must not make the entire part transparent.
            if (
              (entry.bounds.containsPoint(camera) ||
                (ray.intersectBox(entry.bounds, this.hit) &&
                  camera.distanceTo(this.hit) < this.raycaster.far)) &&
              this.blocksSight(entry)
            ) {
              entry.lastBlocked = this.clock
              this.active.add(entry)
            }
          }
        }
    }
    for (const entry of this.active) {
      const blocked =
        enabled && this.clock - entry.lastBlocked <= OCCLUSION_FADE.releaseDelay
      entry.amount = advanceOcclusionFade(entry.amount, blocked, delta)
      if (entry.amount === 0) {
        this.restore(entry)
        this.active.delete(entry)
        continue
      }
      if (!entry.materials) this.prepare(entry)
      if (entry.proxy && !entry.proxy.visible) {
        const source = entry.source as InstancedMesh
        source.setMatrixAt(entry.index, hiddenMatrix)
        source.instanceMatrix.addUpdateRange(entry.index * 16, 16)
        source.instanceMatrix.needsUpdate = true
        entry.proxy.visible = true
      } else if (!entry.proxy)
        entry.source.material = Array.isArray(entry.original)
          ? entry.materials!
          : entry.materials![0]!
      entry.opacity.value = 1 - (1 - OCCLUSION_FADE.opacity) * entry.amount
    }
  }

  private blocksSight(entry: Entry) {
    const source = entry.source
    this.probe.geometry = source.geometry
    this.probe.material = entry.original
    this.probe.matrixWorld.copy(source.matrixWorld)
    if (source instanceof InstancedMesh) {
      // Faded instances have a zero-scale source matrix. Test their saved pose,
      // independently of the visible fade proxy and the other batch instances.
      if (entry.matrix) this.instanceMatrix.copy(entry.matrix)
      else source.getMatrixAt(entry.index, this.instanceMatrix)
      this.probe.matrixWorld.multiply(this.instanceMatrix)
    }
    this.intersections.length = 0
    raycastStaticSurface.call(this.probe, this.raycaster, this.intersections)
    return this.intersections.length > 0
  }

  private prepare(entry: Entry) {
    const source = entry.source
    const originals = Array.isArray(entry.original)
      ? entry.original
      : [entry.original]
    entry.materials = originals.map((original) => {
      const material = original.clone()
      const compile = original.onBeforeCompile
      const key = original.customProgramCacheKey()
      material.transparent = true
      material.depthWrite = false
      material.alphaHash = false
      material.alphaToCoverage = false
      material.forceSinglePass = true
      material.onBeforeCompile = function (shader, renderer) {
        compile.call(this, shader, renderer)
        shader.uniforms.parkObjectOpacity = entry.opacity
        shader.fragmentShader =
          `uniform float parkObjectOpacity;\n${shader.fragmentShader}`.replace(
            '#include <opaque_fragment>',
            // After the leaf texture's alpha test: fading must not clip away leaves.
            'diffuseColor.a *= parkObjectOpacity;\n#include <opaque_fragment>',
          )
      }
      material.customProgramCacheKey = () => `${key}|park-smooth-opacity-v2`
      return material
    })
    if (source instanceof InstancedMesh) {
      entry.matrix = new Matrix4()
      source.getMatrixAt(entry.index, entry.matrix)
      const proxy = new InstancedMesh(
        source.geometry,
        Array.isArray(entry.original) ? entry.materials : entry.materials[0],
        1,
      )
      proxy.name = 'camera-fade-proxy'
      proxy.userData.cameraFadeProxy = true
      proxy.setMatrixAt(0, entry.matrix)
      if (source.instanceColor) {
        source.getColorAt(entry.index, tint)
        proxy.setColorAt(0, tint)
      }
      proxy.castShadow = source.castShadow
      proxy.receiveShadow = source.receiveShadow
      proxy.layers.mask = source.layers.mask
      proxy.renderOrder = source.renderOrder
      proxy.raycast = () => {}
      proxy.visible = false
      source.add(proxy)
      entry.proxy = proxy
    }
  }

  private restore(entry: Entry) {
    if (entry.proxy) {
      if (entry.proxy.visible) {
        const source = entry.source as InstancedMesh
        source.setMatrixAt(entry.index, entry.matrix!)
        source.instanceMatrix.addUpdateRange(entry.index * 16, 16)
        source.instanceMatrix.needsUpdate = true
      }
      entry.proxy.visible = false
    } else entry.source.material = entry.original
    entry.amount = 0
    entry.opacity.value = 1
  }

  reset() {
    for (const entry of this.active) this.restore(entry)
    this.active.clear()
  }

  dispose() {
    this.reset()
    for (const entry of this.entries) {
      entry.proxy?.removeFromParent()
      entry.proxy?.dispose()
      for (const material of entry.materials ?? []) material.dispose()
    }
    this.entries.length = 0
    this.sources.clear()
    this.grid.clear()
  }
}
