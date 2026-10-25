// Dev-server-only camera and scene inspection; not imported by production.
import { _roots } from '@react-three/fiber'
import { Box3, Mesh, Vector3, type LOD, type Object3D } from 'three'
import { MAILBOX, MINI_PROPS } from '../../src/config/parkPlan'
const root = () => _roots.get(document.querySelector('canvas')!)!.store
let release: (() => void) | undefined
export function propsView(kind: 'mailbox' | 'cart', far = false) {
  release?.()
  const p = kind === 'mailbox' ? MAILBOX : MINI_PROPS[0]
  const store = root()
  release = store.getState().internal.subscribe({ current: ({ camera }) => {
    const scale = far ? 15 : 1
    camera.position.set(p.x + (kind === 'mailbox' ? 1.7 : 3.9) * scale, kind === 'mailbox' ? 1.6 : 2.8,
      p.z + (kind === 'mailbox' ? 2.7 : 4.7) * scale)
    camera.lookAt(p.x, kind === 'mailbox' ? 0.95 : 1.5, p.z)
    camera.updateMatrixWorld()
  } }, 0.5, store)
}
export function releasePropsView() { release?.(); release = undefined }
export function propsDetailView(kind: 'mailbox' | 'cart') {
  release?.()
  const p = kind === 'mailbox' ? MAILBOX : MINI_PROPS[0], store = root()
  release = store.getState().internal.subscribe({ current: ({ camera }) => {
    camera.position.set(p.x + (kind === 'mailbox' ? 0.3 : 0.6), kind === 'mailbox' ? 1.2 : 1.65,
      p.z + (kind === 'mailbox' ? 1.6 : 2.4))
    camera.lookAt(p.x - (kind === 'cart' ? 0.15 : 0), kind === 'mailbox' ? 1.05 : 1.43, p.z)
    camera.updateMatrixWorld()
  } }, 0.5, store)
}
export function propsProbe(kind: 'mailbox' | 'cart') {
  const { scene } = root().getState()
  const group = scene.getObjectByName(kind === 'mailbox' ? 'feedback-mailbox' : 'fish-bread')!
  const bounds = new Box3().setFromObject(group)
  const lod = group.getObjectByName(kind === 'mailbox' ? 'mailbox-craft' : 'fish-cart-craft') as LOD | undefined
  const count = (object: Object3D | undefined) => { let sum = 0; object?.traverse(o => {
    if (o instanceof Mesh) sum += (o.geometry.index?.count ?? o.geometry.getAttribute('position').count) / 3
  }); return sum }
  let meshes = 0, triangles = 0
  group.traverse(o => { if (o instanceof Mesh) {
    let parent: Object3D | null = o
    while (parent && parent !== group) { if (!parent.visible) return; parent = parent.parent }
    meshes++; triangles += (o.geometry.index?.count ?? o.geometry.getAttribute('position').count) / 3
  } })
  return { position: group.getWorldPosition(new Vector3()).toArray(), min: bounds.min.toArray(), max: bounds.max.toArray(),
    meshes, triangles, lod: lod?.getCurrentLevel(), nearTriangles: count(lod?.levels[0]?.object), farTriangles: count(lod?.levels[1]?.object),
    signs: group.children.flatMap(o => o.name === 'code-fish-cart' ? o.children.filter(c => c.name.startsWith('prop-sign-')).map(c => c.name) : []),
    code: !!group.getObjectByName(kind === 'mailbox' ? 'code-mailbox' : 'code-fish-cart') }
}
