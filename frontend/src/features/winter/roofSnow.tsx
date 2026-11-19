import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferGeometry, Float32BufferAttribute, Matrix4, Mesh, MeshLambertMaterial, Vector3, type Object3D } from 'three'

const buildings = /^(facility-(pavilion|fortune|lottery|bread|pigeon|cafe|dock|gacha|mole|arcade|vr|folk|shooting|fishing-shop|rest-\d+)|paired-rental-.+)$/
const roofs = new Set(['garden-stone-pagoda', 'jump-course-entrance-pagoda', 'balloon-station-model', 'forty-metre-tower'])

/** 원본의 위를 향한 삼각형만 복사한다. 기와·간판·벽과 기존 재질은 그대로 유지한다. */
export function snowRoofGeometry(root: Object3D) {
  root.updateWorldMatrix(true, true)
  const inverse = new Matrix4().copy(root.matrixWorld).invert(), vertices: number[] = []
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), ab = new Vector3(), ac = new Vector3()
  const floor = new Vector3().setFromMatrixPosition(root.matrixWorld).y + 2
  root.traverse(node => {
    if (!(node instanceof Mesh) || node.userData.winterSnow || node.userData.distanceProxy) return
    const p = node.geometry.getAttribute('position'), index = node.geometry.index
    if (!p) return
    const count = index?.count ?? p.count
    for (let i = 0; i < count; i += 3) {
      a.fromBufferAttribute(p, index ? index.getX(i) : i).applyMatrix4(node.matrixWorld)
      b.fromBufferAttribute(p, index ? index.getX(i + 1) : i + 1).applyMatrix4(node.matrixWorld)
      c.fromBufferAttribute(p, index ? index.getX(i + 2) : i + 2).applyMatrix4(node.matrixWorld)
      ab.subVectors(b, a); ac.subVectors(c, a); ab.cross(ac).normalize()
      if (ab.y < .48 || Math.min(a.y, b.y, c.y) < floor) continue
      for (const v of [a, b, c]) {
        v.y += .055
        v.applyMatrix4(inverse)
        vertices.push(v.x, v.y, v.z)
      }
    }
  })
  const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(vertices, 3))
  geometry.computeVertexNormals()
  return geometry
}

export function RoofSnow() {
  const state = useRef({ elapsed: 1, roots: new Map<Object3D, { signature: string; mesh: Mesh }>(),
    material: new MeshLambertMaterial({ color: '#edf5f1', polygonOffset: true, polygonOffsetFactor: -1 }) })
  useEffect(() => () => {
    for (const { mesh } of state.current.roots.values()) { mesh.removeFromParent(); mesh.geometry.dispose() }
    state.current.roots.clear(); state.current.material.dispose()
  }, [])
  useFrame(({ scene }, dt) => {
    const s = state.current
    s.elapsed += dt
    if (s.elapsed < .25) return
    s.elapsed = 0
    const roots: Object3D[] = []
    scene.traverse(node => { if (buildings.test(node.name) || roofs.has(node.name)) roots.push(node) })
    // 한 프레임에 건물 하나씩 준비해서 입장 로딩과 경쟁하지 않는다.
    for (const root of roots) {
      const parts: string[] = []
      root.traverse(node => { if (node instanceof Mesh && !node.userData.winterSnow) parts.push(node.geometry.uuid) })
      const signature = parts.join(','), previous = s.roots.get(root)
      if (!signature || previous?.signature === signature) continue
      const geometry = snowRoofGeometry(root)
      previous?.mesh.removeFromParent(); previous?.mesh.geometry.dispose()
      const mesh = new Mesh(geometry, s.material)
      mesh.name = 'winter-roof-snow'; mesh.userData.winterSnow = true; mesh.receiveShadow = true
      mesh.raycast = () => {}
      root.add(mesh); s.roots.set(root, { signature, mesh })
      break
    }
    for (const [root, { mesh }] of s.roots) if (!root.parent) {
      mesh.removeFromParent(); mesh.geometry.dispose(); s.roots.delete(root)
    }
  })
  return null
}
