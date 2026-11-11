import type { BufferGeometry, Mesh, Object3D } from 'three'

export const parkDetailIds = [
  'jump', 'pagoda', 'fountain', 'bench', 'lamp', 'mailbox', 'ranking', 'notes',
  'telescope', 'table', 'gacha', 'fence', 'fortress', 'boundary', 'city', 'stairs',
] as const

export type ParkDetailId = typeof parkDetailIds[number]

function scope(id: ParkDetailId, root: Object3D) {
  const { name, userData, parent } = root
  switch (id) {
    case 'jump': return name === 'jump-course-entrance-pagoda' || name === 'ten-stage-pagoda-to-lake-course'
    case 'pagoda': return name === 'preserved-pagoda-garden'
    case 'fountain':
      return name === 'reference-fountain' || name === 'fountain-stone-courses-and-flowers' || name === 'fountain-planter-garden'
    case 'bench': return /^(renewal-bench-|bench-fountain-|tower-rest-bench-|fishing-rest-bench-)/.test(name)
    case 'lamp': return name === 'layout-original-park-lamps'
    case 'mailbox': return name === 'feedback-mailbox'
    case 'ranking': return name === 'ranking-board'
    case 'notes': return name === 'tower-notes-mailbox'
    case 'telescope': return name === 'inward-looking-telescope'
    case 'table': return userData.assetId === 'procedural/stone-game-table'
    case 'gacha': return name === 'gacha-timber-gold-and-roof' || name === 'gacha-glass-jar'
    case 'fence':
      return /^(retained-lake-shore-rope-fence|jump-garden-verge-fence-with-open-south-gate|fitness-boundary-with-north-and-south-openings)$/.test(name)
        || (parent?.name === 'finished-hill-stone-edges-and-timber-guards' && parent.children.indexOf(root) === 1)
    case 'fortress':
      return name === 'steep-bank-stone-retaining-faces' || name === 'masonry-retaining-corner-seals'
        || (parent?.name === 'finished-hill-stone-edges-and-timber-guards' && parent.children.indexOf(root) === 0)
    case 'boundary': return name === 'retained-tiled-wall-and-main-gate'
    case 'city': return name === 'reused-city-buildings'
    case 'stairs': return name === 'monument-direct-ascent'
  }
}

function visitMeshes(root: Object3D, id: ParkDetailId, visit: (mesh: Mesh) => void) {
  if (id === 'fountain' && (root.name === 'fountain-jet-height' || root.name === 'water-surface')) return
  const mesh = root as Mesh
  if (mesh.isMesh && !Array.isArray(mesh.material) && mesh.geometry.hasAttribute('position') && !mesh.geometry.userData.leverRange) visit(mesh)
  root.children.forEach(child => visitMeshes(child, id, visit))
}

export function parkDetailMeshes(scene: Object3D, id: ParkDetailId) {
  const groups: { source: BufferGeometry; meshes: Mesh[] }[] = []
  const byGeometry = new Map<BufferGeometry, Mesh[]>()
  scene.traverse(root => {
    if (!scope(id, root)) return
    visitMeshes(root, id, mesh => {
      let meshes = byGeometry.get(mesh.geometry)
      if (!meshes) {
        meshes = []
        byGeometry.set(mesh.geometry, meshes)
        groups.push({ source: mesh.geometry, meshes })
      }
      meshes.push(mesh)
    })
  })
  return groups
}
