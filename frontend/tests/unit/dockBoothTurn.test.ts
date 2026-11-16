import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { Box3, BufferGeometry, Float32BufferAttribute, Group, Matrix4, Mesh, MeshBasicMaterial, Object3D, Quaternion, Raycaster, Uint32BufferAttribute, Vector3 } from 'three'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { removeDockRearRopes, turnDockBooth } from '../../park-renewal-preview/assetSizing'

type Gltf = {
  nodes: { name?: string; matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[]; mesh?: number; children?: number[] }[]
  meshes: { primitives: { attributes: Record<string, number>; indices?: number }[] }[]
  accessors: { bufferView: number; byteOffset?: number; componentType: number; count: number; type: string }[]
  bufferViews: { byteOffset?: number; byteStride?: number; byteLength: number; extensions?: { EXT_meshopt_compression?: { byteOffset?: number; byteLength: number; byteStride: number; count: number; mode: string; filter?: string } } }[]
  scenes: { nodes: number[] }[]; scene?: number
}

/** Loads the live (optimized) dock GLB's geometry with node names, without textures or a browser. */
await MeshoptDecoder.ready
function dock(): Group {
  const file = readFileSync(new URL('../../park-renewal-preview/models/duck-dock-3-optimized.glb', import.meta.url))
  const length = file.readUInt32LE(12), bin = 20 + length + 8
  const doc = JSON.parse(file.subarray(20, 20 + length).toString()) as Gltf
  // EXT_meshopt_compression: decode each compressed view from the binary chunk.
  const views = doc.bufferViews.map(view => {
    const m = view.extensions?.EXT_meshopt_compression
    if (!m) return file.subarray(bin + (view.byteOffset ?? 0), bin + (view.byteOffset ?? 0) + view.byteLength)
    const out = new Uint8Array(m.count * m.byteStride), source = file.subarray(bin + (m.byteOffset ?? 0), bin + (m.byteOffset ?? 0) + m.byteLength)
    MeshoptDecoder.decodeGltfBuffer(out, m.count, m.byteStride, source, m.mode, m.filter ?? 'NONE')
    return Buffer.from(out.buffer)
  })
  const read = (id: number) => {
    const a = doc.accessors[id]!, view = doc.bufferViews[a.bufferView]!, size = a.type === 'VEC3' ? 3 : a.type === 'VEC2' ? 2 : 1
    const width = a.componentType === 5126 || a.componentType === 5125 ? 4 : a.componentType === 5123 ? 2 : 1
    const bytes = views[a.bufferView]!, stride = view.extensions?.EXT_meshopt_compression?.byteStride ?? view.byteStride ?? size * width
    const offset = a.byteOffset ?? 0, out: number[] = []
    for (let i = 0; i < a.count; i++) for (let k = 0; k < size; k++) {
      const at = offset + i * stride + k * width
      out.push(a.componentType === 5126 ? bytes.readFloatLE(at) : width === 4 ? bytes.readUInt32LE(at) : width === 2 ? bytes.readUInt16LE(at) : bytes[at]!)
    }
    return out
  }
  const material = new MeshBasicMaterial()
  const build = (id: number): Object3D => {
    const n = doc.nodes[id]!, node = new Group()
    node.name = n.name ?? ''
    if (n.matrix) node.applyMatrix4(new Matrix4().fromArray(n.matrix))
    else node.applyMatrix4(new Matrix4().compose(new Vector3().fromArray(n.translation ?? [0, 0, 0]),
      new Quaternion().fromArray(n.rotation ?? [0, 0, 0, 1]), new Vector3().fromArray(n.scale ?? [1, 1, 1])))
    if (n.mesh !== undefined) for (const p of doc.meshes[n.mesh]!.primitives) {
      const g = new BufferGeometry()
      g.setAttribute('position', new Float32BufferAttribute(read(p.attributes.POSITION!), 3))
      if (p.attributes.NORMAL !== undefined) g.setAttribute('normal', new Float32BufferAttribute(read(p.attributes.NORMAL), 3))
      if (p.indices !== undefined) g.setIndex(new Uint32BufferAttribute(read(p.indices), 1))
      const mesh = new Mesh(g, material)
      mesh.name = node.name
      node.add(mesh)
    }
    for (const child of n.children ?? []) node.add(build(child))
    return node
  }
  const root = new Group()
  for (const id of doc.scenes[doc.scene ?? 0]!.nodes) root.add(build(id))
  root.updateMatrixWorld(true)
  return root
}

const bounds = (root: Object3D, name: string) => {
  root.updateMatrixWorld(true)
  const box = new Box3()
  root.traverse(o => { if (o instanceof Mesh && o.name === name) box.expandByObject(o) })
  return box
}
const hits = (root: Object3D, from: Vector3, direction: Vector3, far: number) => {
  root.updateMatrixWorld(true)
  return new Raycaster(from, direction.normalize(), 0, far).intersectObject(root, true)
}

describe('선착장 부스 방향', () => {
  const original = dock()
  const turned = dock()
  removeDockRearRopes(turned)
  turnDockBooth(turned)

  it('간판·현수막·카운터가 호수(-Z) 대신 진입로(+Z)를 본다', () => {
    expect(turned.userData.boothTurnedTriangles).toBeGreaterThan(100)
    const before = bounds(original, 'rental_sign_dock_sign_lettering'), after = bounds(turned, 'rental_sign_dock_sign_lettering')
    expect(before.max.z).toBeLessThan(-1)
    expect(after.min.z).toBeGreaterThan(1)
    expect(after.min.y).toBeCloseTo(before.min.y, 6)
    // Lettering still reads left to right from its new viewing side (rotated, not mirrored).
    expect(after.min.x).toBeCloseTo(-before.max.x, 6)
    const banners = bounds(turned, 'duck_banners_dock_red')
    expect(banners.min.z).toBeGreaterThan(.5)
    // Looking at the booth from the land side now meets the sign face first.
    const fromLand = hits(turned, new Vector3(0, 2.75, 3), new Vector3(0, 0, -1), 3)[0]
    expect(fromLand?.object.name).toMatch(/^rental_sign/)
    expect(hits(turned, new Vector3(0, 2.75, -3), new Vector3(0, 0, 1), 1.7).some(h => h.object.name.startsWith('rental_sign'))).toBe(false)
  })

  it('지붕·데크·손가락 데크·앞 기둥은 그대로다', () => {
    for (const name of ['removable_hanok_roof_dock_tile', 'removable_hanok_roof_dock_tileLight']) {
      expect(bounds(turned, name).equals(bounds(original, name))).toBe(true)
    }
    for (const [x, z] of [[0, 1.6], [-3.65, -3], [3.65, -3], [-4, 1.6]] as const) {
      const floor = (root: Object3D) => hits(root, new Vector3(x, 2, z), new Vector3(0, -1, 0), 3)
        .find(h => h.point.y < .8)?.point.y
      expect(floor(turned)).toBeCloseTo(floor(original)!, 6)
    }
  })

  it('부스 뒤(이제 앞) 통로는 사람 높이에서 막히지 않는다', () => {
    for (const y of [.9, 1.25, 1.7]) {
      const blocking = hits(turned, new Vector3(-2.6, y, 1.6), new Vector3(1, 0, 0), 5.2)
      expect(blocking.map(h => `${h.object.name}@${h.point.x.toFixed(2)}`), `y=${y}`).toEqual([])
    }
  })
})
