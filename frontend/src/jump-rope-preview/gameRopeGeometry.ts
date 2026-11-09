import { BufferAttribute, BufferGeometry, DynamicDrawUsage, Vector3 } from 'three'

const sections = 36
const sides = 8
const ringAngles = Array.from({ length: sides }, (_, side) => {
  const angle = side / sides * Math.PI * 2
  return [Math.cos(angle), Math.sin(angle)] as const
})

export function ropeCenter(
  out: Vector3, angle: number, avatarX: number, avatarZ: number, avatarScale: number,
  curvature: number, sag: number, radius: number,
) {
  const lowest = radius + 0.017
  const highest = 1.8 * avatarScale + 0.25
  const lift = (1 - Math.cos(angle)) / 2
  return out.set(
    avatarX,
    Math.max(lowest, lowest + (highest - lowest) * lift - sag * Math.sin(angle) ** 2),
    avatarZ - (0.58 + curvature * 0.62) * Math.sin(angle),
  )
}

export function createGameRopeGeometry() {
  const position = new BufferAttribute(new Float32Array((sections + 1) * sides * 3), 3).setUsage(DynamicDrawUsage)
  const normal = new BufferAttribute(new Float32Array(position.array.length), 3).setUsage(DynamicDrawUsage)
  const geometry = new BufferGeometry()
  const indices: number[] = []
  for (let section = 0; section < sections; section++) {
    for (let side = 0; side < sides; side++) {
      const a = section * sides + side
      const b = section * sides + (side + 1) % sides
      indices.push(a, b, a + sides, b, b + sides, a + sides)
    }
  }
  geometry.setIndex(indices)
  geometry.setAttribute('position', position)
  geometry.setAttribute('normal', normal)
  const tangent = new Vector3(), radial = new Vector3(), bitangent = new Vector3()

  function update(left: Vector3, right: Vector3, center: Vector3, radius: number) {
    const span = right.x - left.x
    const middle = Math.min(0.76, Math.max(0.24, (center.x - left.x) / span))
    for (let section = 0; section <= sections; section++) {
      const t = section / sections
      const end = t < middle ? left : right
      const inverseSpan = t < middle ? 1 / middle : 1 / (1 - middle)
      const distance = (t - middle) * inverseSpan
      const weight = distance * distance
      // Each half eases into a common, level tangent at the center. Its height
      // stays between the grip and center, even when the grips nod out of phase.
      const x = left.x + span * t
      const y = center.y + (end.y - center.y) * weight
      const z = center.z + (end.z - center.z) * weight
      tangent.set(span, 2 * distance * inverseSpan * (end.y - center.y), 2 * distance * inverseSpan * (end.z - center.z)).normalize()
      radial.set(tangent.y, -tangent.x, 0).normalize()
      bitangent.crossVectors(tangent, radial)

      ringAngles.forEach(([cos, sin], side) => {
        const nx = radial.x * cos + bitangent.x * sin
        const ny = radial.y * cos + bitangent.y * sin
        const nz = radial.z * cos + bitangent.z * sin
        const vertex = section * sides + side
        normal.setXYZ(vertex, nx, ny, nz)
        position.setXYZ(vertex, x + nx * radius, y + ny * radius, z + nz * radius)
      })
    }
    position.needsUpdate = normal.needsUpdate = true
  }

  return { geometry, update }
}
