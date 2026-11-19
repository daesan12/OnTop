import {
  BufferAttribute, BufferGeometry, Color, CylinderGeometry, Group,
  Mesh, MeshLambertMaterial, Vector3,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { WINTER_TREES_ENABLED } from '../src/features/winter/trees'

function willowRandom(seed) {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

// Broad middle rings and rounded ends give the hanging foliage a leaf-like
// silhouette with just a few facets. Drift bends each cluster away from the trunk.
function foliageLobe(x, y, z, width, length, depth, angle, drift, sides) {
  const rings = [[0.13, 0.66], [0.34, 1], [0.62, 0.91], [0.87, 0.53]]
  const positions = []
  const indices = []
  const radialX = Math.cos(angle)
  const radialZ = Math.sin(angle)

  for (const [down, radius] of rings) {
    for (let side = 0; side < sides; side++) {
      const phase = side * Math.PI * 2 / sides + down * 0.25
      const radial = Math.cos(phase) * depth * radius + down * drift
      const tangent = Math.sin(phase) * width * radius
      positions.push(x + radialX * radial - radialZ * tangent, y - length * down, z + radialZ * radial + radialX * tangent)
    }
  }

  const top = positions.length / 3
  positions.push(x, y, z, x + radialX * drift, y - length, z + radialZ * drift)
  for (let side = 0; side < sides; side++) {
    const next = (side + 1) % sides
    indices.push(top, next, side)
    for (let ring = 0; ring < rings.length - 1; ring++) {
      const a = ring * sides + side
      const b = ring * sides + next
      indices.push(a, b, a + sides, b, b + sides, a + sides)
    }
    const bottom = (rings.length - 1) * sides
    indices.push(top + 1, bottom + side, bottom + next)
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geometry.setIndex(indices)
  return geometry
}

function coloredFacets(source, color) {
  const geometry = source.toNonIndexed()
  source.dispose()
  geometry.deleteAttribute('uv')
  geometry.computeVertexNormals()
  const positions = geometry.getAttribute('position')
  const colors = new Float32Array(positions.count * 3)
  for (let i = 0; i < positions.count; i++) color.toArray(colors, i * 3)
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
  return geometry
}

function trunkSegment(from, to, baseRadius, tipRadius, color) {
  const start = new Vector3(...from)
  const end = new Vector3(...to)
  const direction = end.clone().sub(start)
  const geometry = new CylinderGeometry(tipRadius, baseRadius, direction.length() + 0.12, 6)
  geometry.rotateZ(-Math.atan2(direction.x, direction.y))
  geometry.translate((start.x + end.x) / 2, (start.y + end.y) / 2, (start.z + end.z) / 2)
  return coloredFacets(geometry, color)
}

export function createPreviewWillow({ seed = 42, height = 7.8, spread = 8.6, winter = WINTER_TREES_ENABLED } = {}) {
  const random = willowRandom(seed)
  const bark = new Color(winter ? '#766a61' : '#86704e')
  const wood = [
    trunkSegment([0, 0.05, 0], [-0.16, 2.1, 0], 0.47, 0.34, bark),
    trunkSegment([-0.16, 2.1, 0], [0.13, 4.0, 0], 0.35, 0.24, bark),
    trunkSegment([0.13, 4.0, 0], [0.32, 5.95, 0], 0.25, 0.08, bark),
  ]
  const leaves = []
  const foliageColor = new Color(winter ? '#dce8ec' : '#7e9c52')
  const addLobe = (x, y, z, width, length, depth, angle, drift, sides, lightness) => {
    const tone = foliageColor.clone().offsetHSL((random() - 0.5) * 0.045, 0, lightness)
    leaves.push(coloredFacets(foliageLobe(x, y, z, width, length, depth, angle, drift, sides), tone))
  }

  // Overlap the canopy and the pendulous foliage so no bare branch ends
  // project past the outline. Stagger the lower tips to leave gaps at eye level.
  addLobe(0.15, 7.75, 0, 2.35, 2.85, 2.48, 0.2, 0, 8, 0.05)
  for (let i = 0; i < 7; i++) {
    const angle = i * Math.PI * 2 / 7 + (random() - 0.5) * 0.14
    const radius = 1.95 + random() * 0.24
    addLobe(Math.cos(angle) * radius, 6.95 + random() * 0.48, Math.sin(angle) * radius,
      1.53, 2.3, 1.64, angle, 0.26, 6, 0.025 + random() * 0.038)
  }
  for (let i = 0; i < 14; i++) {
    const angle = i * Math.PI * 2 / 14 + (random() - 0.5) * 0.11
    const radius = 2.64 + random() * 0.36
    const length = (i % 3 === 0 ? 3.95 : 3.0) + random() * 0.61
    addLobe(Math.cos(angle) * radius, 6.17 + random() * 0.33, Math.sin(angle) * radius,
      0.95 + random() * 0.15, length, 0.75 + random() * 0.23, angle, 0.48, 5,
      -0.022 + random() * 0.065)
  }

  const group = new Group()
  group.name = 'lakeside-willow-rounded-canopy'
  group.userData.winterTree = winter
  group.scale.set(spread / 8.6, height / 7.8, spread / 8.6)
  for (const [name, parts] of [['willow-trunk', wood], ['willow-foliage', leaves]]) {
    const mesh = new Mesh(mergeGeometries(parts), new MeshLambertMaterial({ vertexColors: true, flatShading: true }))
    mesh.name = name
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
    parts.forEach(part => part.dispose())
  }
  return { group }
}
