import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { BufferGeometry, Float32BufferAttribute, Matrix4, Mesh, Vector3, type Object3D } from 'three'
import { RoofSnowCache, type SnowProtectedArea } from './RoofSnowCache'
export type { SnowProtectedArea } from './RoofSnowCache'

const alwaysVisible = () => true
const noProtectedAreas: readonly SnowProtectedArea[] = []

/** 원본의 위를 향한 삼각형만 복사한다. 기와·간판·벽과 기존 재질은 그대로 유지한다. */
export function snowRoofGeometry(root: Object3D, protectedAreas: readonly SnowProtectedArea[] = []) {
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
      // Combined pavilion meshes can contain furniture and raised floors. Never copy those onto a game surface.
      if (protectedAreas.some(p => Math.min(a.y, b.y, c.y) <= p.topY
        && Math.max(a.x, b.x, c.x) >= p.x - p.radius && Math.min(a.x, b.x, c.x) <= p.x + p.radius
        && Math.max(a.z, b.z, c.z) >= p.z - p.radius && Math.min(a.z, b.z, c.z) <= p.z + p.radius)) continue
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

export function RoofSnow({ visible = alwaysVisible, protectedAreas = noProtectedAreas }: {
  visible?: () => boolean; protectedAreas?: readonly SnowProtectedArea[]
}) {
  const protectedSignature = useMemo(() => JSON.stringify(protectedAreas), [protectedAreas])
  const scene = useThree(state => state.scene)
  const state = useRef({ elapsed: 1, cache: null as RoofSnowCache | null })
  useEffect(() => {
    const cache = new RoofSnowCache(scene, noProtectedAreas, snowRoofGeometry)
    state.current.cache = cache
    return () => { cache.dispose(); state.current.cache = null }
  }, [scene])
  useEffect(() => { state.current.cache?.protect(protectedAreas) }, [protectedSignature, protectedAreas])
  useFrame((_, dt) => {
    const s = state.current, cache = s.cache
    if (!cache) return
    const show = visible()
    cache.show(show)
    if (!show) return
    s.elapsed += dt
    if (s.elapsed < .25) return
    s.elapsed = 0
    cache.processOne()
  })
  return null
}
