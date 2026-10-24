// Dev-server-only visual QA; never imported by product modules.
import { _roots } from '@react-three/fiber'
import { Mesh, Vector3, type BufferAttribute, type InstancedMesh } from 'three'
import { BUNG_GRILL } from '../../src/features/bungeoppang/bungeoppangView'
import { environmentFrame } from '../../src/world/environmentState'
export function m14Probe() {
  const store = [..._roots.values()][0]!.store.getState(), scene = store.scene
  const grill = scene.getObjectByName('bungeoppang-personal-grill')
  let bytes = 0; const geometries = new Set(), materials = new Set(), batches: { count: number; triangles: number }[] = []
  grill?.traverse(o => {
    if (!(o instanceof Mesh)) return
    if (!geometries.has(o.geometry)) {
      geometries.add(o.geometry)
      for (const a of Object.values(o.geometry.attributes)) bytes += (a as BufferAttribute).array.byteLength
      bytes += o.geometry.index?.array.byteLength ?? 0
    }
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m)
    if ('isInstancedMesh' in o) {
      const m = o as InstancedMesh
      bytes += m.instanceMatrix.array.byteLength + (m.instanceColor?.array.byteLength ?? 0)
      batches.push({ count: m.count, triangles: (m.geometry.index?.count ?? m.geometry.attributes.position!.count) / 3 })
    }
  })
  const cartMaterials: { name: string; visible: boolean }[] = []
  scene.getObjectByName('fish-bread')?.traverse(o => {
    if (!(o instanceof Mesh)) return
    for (const m of Array.isArray(o.material) ? o.material : [o.material])
      if (['Cream fascia', 'Readable Korean sign atlas'].includes(m.name)) cartMaterials.push({ name: m.name, visible: o.visible })
  })
  return { present: !!grill, geometries: geometries.size, materials: materials.size, bytesEstimate: bytes, batches, cartMaterials,
    daylight: environmentFrame.daylight, night: environmentFrame.night,
    camera: store.camera.position.toArray(), fov: 'fov' in store.camera ? store.camera.fov : null,
    slots: BUNG_GRILL.slots.map(([x,z]) => {
      const p = new Vector3(x, BUNG_GRILL.top + .02, z).project(store.camera)
      return { x: (p.x + 1) * store.size.width / 2, y: (1 - p.y) * store.size.height / 2, depth: p.z }
    }) }
}
