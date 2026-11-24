import { Box3, Mesh, MeshStandardMaterial, Vector3, type BufferGeometry, type Object3D } from 'three'

export const TREE_WARM_WHITE = '#fff1d2'

/** Weld the faceted emitter seams before finding each disconnected bulb's centre. */
export function bulbCentres(geometry: BufferGeometry): Vector3[] {
  const positions = geometry.getAttribute('position'), parents = Array.from({ length: positions.count }, (_, i) => i)
  const find = (i: number): number => {
    while (parents[i] !== i) { parents[i] = parents[parents[i]!]!; i = parents[i]! }
    return i
  }
  const join = (a: number, b: number) => { parents[find(a)] = find(b) }
  const welded = new Map<string, number>(), point = new Vector3()
  for (let i = 0; i < positions.count; i++) {
    point.fromBufferAttribute(positions, i)
    const key = point.toArray().map(v => Math.round(v * 100000)).join(',')
    const previous = welded.get(key)
    if (previous === undefined) welded.set(key, i); else join(i, previous)
  }
  const index = geometry.getIndex(), count = index?.count ?? positions.count
  for (let i = 0; i < count; i += 3) {
    const a = index ? index.getX(i) : i
    join(a, index ? index.getX(i + 1) : i + 1); join(a, index ? index.getX(i + 2) : i + 2)
  }
  const bounds = new Map<number, Box3>()
  for (let i = 0; i < positions.count; i++) {
    const id = find(i), box = bounds.get(id) ?? new Box3()
    box.expandByPoint(point.fromBufferAttribute(positions, i)); bounds.set(id, box)
  }
  return [...bounds.values()].map(box => box.getCenter(new Vector3()))
}

export function treeLighting(root: Object3D): { bulbs: Vector3[]; star: Vector3 | null; materials: MeshStandardMaterial[] } {
  const bulbs: Vector3[] = [], materials: MeshStandardMaterial[] = []
  let star: Vector3 | null = null
  root.updateMatrixWorld(true)
  root.traverse(object => {
    if (!(object instanceof Mesh)) return
    let owner: Object3D | null = object, starHousing = false
    while (owner && owner !== root) {
      if (['Star_Gold_Housing', 'Star_Woven_Lattice'].includes(owner.name)) { starHousing = true; break }
      owner = owner.parent
    }
    const source = Array.isArray(object.material) ? object.material : [object.material]
    const copies = source.map(material => {
      if (!(material instanceof MeshStandardMaterial)
        || !starHousing && !['MAT_Star_Emission', 'MAT_StringBulb_Emission'].includes(material.name)) return material
      const copy = material.clone()
      copy.emissive.set(0); copy.emissiveIntensity = 0; materials.push(copy)
      const local = (point: Vector3) => root.worldToLocal(object.localToWorld(point))
      if (material.name === 'MAT_Star_Emission') {
        object.geometry.computeBoundingBox()
        star = local(object.geometry.boundingBox!.getCenter(new Vector3()))
      } else if (!starHousing) bulbs.push(...bulbCentres(object.geometry).map(local))
      return copy
    })
    object.material = Array.isArray(object.material) ? copies : copies[0]!
  })
  return { bulbs, star, materials }
}

export function setTreeLighting(materials: readonly MeshStandardMaterial[], lit: boolean) {
  for (const material of materials) {
    material.emissive.set(lit ? TREE_WARM_WHITE : '#000000')
    material.emissiveIntensity = lit ? material.name === 'MAT_Star_Emission' ? 4.5
      : material.name === 'MAT_StringBulb_Emission' ? 3.5 : 1.8 : 0
    material.toneMapped = !lit; material.needsUpdate = true
  }
}
