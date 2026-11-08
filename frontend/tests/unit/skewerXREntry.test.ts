import * as THREE from 'three'
import { afterEach, expect, it, vi } from 'vitest'

vi.mock('../../src/features/vrZone/parkBridge', () => ({ canReachParkVr: () => true,
  parkVrEntrance: { x: 0, y: .8, z: 0, yaw: 0 } }))
import { SkewerXREntry } from '../../src/features/parkXR/SkewerXREntry'

const meshes: THREE.Mesh[] = []
function target() {
  // Exercise Three's real ray/plane intersection without a WebGL or canvas context.
  const entry = Object.create(SkewerXREntry.prototype) as SkewerXREntry
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.2, .3), new THREE.MeshBasicMaterial())
  mesh.updateMatrixWorld(true); meshes.push(mesh)
  Reflect.set(entry, 'mesh', mesh); Reflect.set(entry, 'raycaster', new THREE.Raycaster()); Reflect.set(entry, 'hits', [])
  return { entry, mesh, hit: (x: number, y: number) => entry.hit(new THREE.Vector3(x, y, 1), new THREE.Vector3(0, 0, -1)) }
}
afterEach(() => {
  for (const mesh of meshes.splice(0)) {
    mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose()
  }
})
it('중앙 버튼뿐 아니라 제목과 종이 가장자리도 같은 진입 대상으로 선택한다', () => {
  const { hit } = target()
  for (const [x, y] of [[0, 0], [0, .13], [-.59, .14], [.59, -.14]]) expect(hit(x!, y!)).toBe(true)
})
it('카드 밖과 숨겨진 입구는 선택되지 않는다', () => {
  const { mesh, hit } = target()
  expect(hit(.61, 0)).toBe(false); expect(hit(0, .16)).toBe(false)
  mesh.visible = false
  expect(hit(0, 0)).toBe(false)
})
