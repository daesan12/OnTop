import { BufferGeometry, Mesh, MeshLambertMaterial, type Object3D } from 'three'

const buildings = /^(facility-(pavilion|fortune|lottery|bread|pigeon|cafe|dock|gacha|mole|arcade|vr|folk|shooting|fishing-shop|rest-\d+)|paired-rental-.+)$/
const roofs = new Set(['garden-stone-pagoda', 'jump-course-entrance-pagoda', 'balloon-station-model', 'forty-metre-tower'])
export interface SnowProtectedArea { x: number; z: number; radius: number; topY: number }
type BuildRoof = (root: Object3D, protectedAreas: readonly SnowProtectedArea[]) => BufferGeometry | Generator<void, BufferGeometry>

/** 최초 한 번 수집한 뒤 추가·제거된 하위 트리만 관찰한다. 적설 자체의 변경은 무시한다. */
export class RoofSnowCache {
  private readonly nodes = new Set<Object3D>()
  private readonly roots = new Map<Object3D, Mesh | undefined>()
  private readonly dirty = new Set<Object3D>()
  private readonly meshes = new Map<Mesh, BufferGeometry>()
  private readonly material = new MeshLambertMaterial({ color: '#edf5f1', polygonOffset: true, polygonOffsetFactor: -1 })
  private shown = true
  private pending?: { root: Object3D; steps: Generator<void, BufferGeometry> }
  get busy() { return !!this.pending }
  constructor(scene: Object3D, private protectedAreas: readonly SnowProtectedArea[], private readonly build: BuildRoof) {
    this.attach(scene)
  }
  private invalidate = (node: Object3D) => {
    for (let parent: Object3D | null = node; parent; parent = parent.parent) {
      if (this.roots.has(parent)) {
        this.dirty.add(parent)
        if (this.pending?.root === parent) this.pending = undefined
      }
    }
  }
  private added = (event: { child: Object3D; target: Object3D }) => {
    if (event.child.userData.winterSnow) return
    this.attach(event.child); this.invalidate(event.target)
  }
  private removed = (event: { child: Object3D; target: Object3D }) => {
    if (event.child.userData.winterSnow) return
    this.detach(event.child); this.invalidate(event.target)
  }
  private attach(node: Object3D) {
    if (node.userData.winterSnow || this.nodes.has(node)) return
    this.nodes.add(node)
    if (buildings.test(node.name) || roofs.has(node.name)) { this.roots.set(node, undefined); this.dirty.add(node) }
    if (node instanceof Mesh && !node.userData.distanceProxy) {
      for (let parent: Object3D | null = node; parent; parent = parent.parent) {
        if (this.roots.has(parent)) { this.meshes.set(node, node.geometry); break }
      }
    }
    node.addEventListener('childadded', this.added)
    node.addEventListener('childremoved', this.removed)
    for (const child of node.children) this.attach(child)
  }
  private detach(node: Object3D) {
    if (!this.nodes.delete(node)) return
    if (node instanceof Mesh) this.meshes.delete(node)
    node.removeEventListener('childadded', this.added)
    node.removeEventListener('childremoved', this.removed)
    for (const child of [...node.children]) this.detach(child)
    const snow = this.roots.get(node)
    if (this.pending?.root === node) this.pending = undefined
    this.roots.delete(node); this.dirty.delete(node)
    snow?.removeFromParent(); snow?.geometry.dispose()
  }
  protect(areas: readonly SnowProtectedArea[]) {
    this.protectedAreas = areas
    this.pending = undefined
    for (const root of this.roots.keys()) this.dirty.add(root)
  }
  show(visible: boolean) {
    if (this.shown === visible) return
    this.shown = visible
    for (const snow of this.roots.values()) if (snow) snow.visible = visible
  }
  /** 초기 로딩과 경쟁하지 않도록 변경된 지붕 하나만 준비한다. 대기 중에는 트리 탐색이 없다. */
  processOne() {
    // FacilityGeometry는 Mesh를 유지한 채 geometry만 교체한다. 캐시된 포인터만 비교한다.
    for (const [mesh, geometry] of this.meshes) if (mesh.geometry !== geometry) {
      this.meshes.set(mesh, mesh.geometry); this.invalidate(mesh)
    }
    const install = (root: Object3D, geometry: BufferGeometry) => {
      const previous = this.roots.get(root)
      previous?.removeFromParent(); previous?.geometry.dispose()
      const snow = new Mesh(geometry, this.material)
      snow.name = 'winter-roof-snow'; snow.userData.winterSnow = true; snow.receiveShadow = true
      snow.visible = this.shown; snow.raycast = () => {}
      root.add(snow); this.roots.set(root, snow)
    }
    if (!this.pending) for (const root of this.dirty) {
      this.dirty.delete(root)
      const built = this.build(root, this.protectedAreas)
      if (built instanceof BufferGeometry) { install(root, built); return true }
      this.pending = { root, steps: built }
      break
    }
    const task = this.pending
    if (!task) return false
    const deadline = performance.now() + 2
    do {
      const result = task.steps.next()
      if (result.done) {
        this.pending = undefined
        install(task.root, result.value)
        return true
      }
    } while (performance.now() < deadline)
    return false
  }
  dispose() {
    this.pending = undefined
    for (const node of this.nodes) {
      node.removeEventListener('childadded', this.added)
      node.removeEventListener('childremoved', this.removed)
    }
    this.nodes.clear()
    for (const snow of this.roots.values()) { snow?.removeFromParent(); snow?.geometry.dispose() }
    this.roots.clear(); this.dirty.clear(); this.meshes.clear(); this.material.dispose()
  }
}
