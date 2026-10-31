import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { IngredientId } from './game'

/** Locally authored food meshes. The same shared geometry is used in bowls,
 * controllers and the assembled skewer; no external models or per-frame baking. */
export class FoodModels {
  private readonly prototypes = new Map<IngredientId, THREE.Group>()
  private readonly geometries = new Set<THREE.BufferGeometry>()
  private readonly materials = new Set<THREE.Material>()
  private readonly textures = new Set<THREE.Texture>()
  private readonly wraps = new Map<'cheese' | 'bacon', THREE.MeshStandardMaterial>()

  private geometry<T extends THREE.BufferGeometry>(geometry: T): T {
    this.geometries.add(geometry)
    return geometry
  }

  private material(color: string, roughness = 0.42, map?: THREE.Texture): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({ color, roughness, map: map ?? null })
    this.materials.add(material)
    return material
  }

  private texture(paint: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 256
    paint(canvas.getContext('2d')!)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    this.textures.add(texture)
    return texture
  }

  wrapMaterial(id: 'cheese' | 'bacon'): THREE.MeshStandardMaterial {
    const existing = this.wraps.get(id)
    if (existing) return existing
    const map = this.texture(ctx => {
      ctx.fillStyle = id === 'cheese' ? '#f6bf4c' : '#b94e38'
      ctx.fillRect(0, 0, 256, 256)
      if (id === 'bacon') {
        // Broad, irregular fat seams along the strip, rather than textile weave.
        for (const [middle, width] of [[27, 24], [101, 32], [191, 38], [251, 12]]) {
          ctx.beginPath()
          for (let x = 0; x <= 256; x += 4) {
            const y = middle + Math.sin(x / 39 + middle) * 7 + Math.sin(x / 17) * 2
            if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
          }
          ctx.strokeStyle = '#f6d5a1'
          ctx.lineWidth = width
          ctx.stroke()
          ctx.strokeStyle = '#e8a278'
          ctx.lineWidth = 4
          ctx.stroke()
        }
      }
      // Deterministic surface flecks: melted cheese pores / browned bacon edges.
      for (let i = 0; i < 160; i++) {
        const x = (i * 73.37) % 256
        const y = (i * 41.61) % 256
        ctx.fillStyle = id === 'cheese' ? (i % 3 ? '#fff0ab24' : '#9b611c20') : '#632a171d'
        ctx.beginPath()
        ctx.ellipse(x, y, 1 + i % 4, 0.7 + i % 2, i, 0, Math.PI * 2)
        ctx.fill()
      }
    })
    const material = this.material('#ffffff', id === 'cheese' ? 0.37 : 0.43, map)
    material.side = THREE.DoubleSide
    this.wraps.set(id, material)
    return material
  }

  create(id: IngredientId): THREE.Group {
    let prototype = this.prototypes.get(id)
    if (!prototype) {
      prototype = new THREE.Group()
      prototype.name = `food-${id}`
      if (id === 'tomato') this.tomato(prototype)
      else if (id === 'pepper') this.pepper(prototype)
      else if (id === 'shrimp') this.shrimp(prototype)
      else if (id === 'beef') this.beef(prototype)
      else prototype.add(new THREE.Mesh(this.geometry(createFoodStrip(0.23, 0.105, id)), this.wrapMaterial(id)))
      this.prototypes.set(id, prototype)
    }
    return prototype.clone(true)
  }

  private tomato(group: THREE.Group): void {
    const skin = this.geometry(new THREE.SphereGeometry(0.074, 28, 18))
    skin.scale(0.94, 0.91, 1)
    group.add(new THREE.Mesh(skin, this.material('#db3820', 0.26)))
    const leaves: THREE.BufferGeometry[] = []
    for (let i = 0; i < 5; i++) {
      const shape = new THREE.Shape()
      shape.moveTo(-0.007, 0)
      shape.quadraticCurveTo(-0.014, 0.023, 0, 0.044)
      shape.quadraticCurveTo(0.009, 0.017, 0.007, 0)
      const leaf = new THREE.ShapeGeometry(shape, 6)
      leaf.rotateX(-Math.PI / 2 + 0.2)
      leaf.rotateY(i * Math.PI * 2 / 5)
      leaf.translate(0, 0.061, 0)
      leaves.push(leaf)
    }
    const calyx = this.material('#466e24', 0.65)
    calyx.side = THREE.DoubleSide
    group.add(new THREE.Mesh(this.geometry(mergeGeometries(leaves)!), calyx))
    leaves.forEach(leaf => leaf.dispose())
    const stem = this.geometry(new THREE.CylinderGeometry(0.003, 0.005, 0.025, 7))
    stem.translate(0, 0.077, 0)
    group.add(new THREE.Mesh(stem, calyx))
  }

  private pepper(group: THREE.Group): void {
    // A real lobed pepper cross-section, with its natural cavity along the shaft.
    const geometry = this.geometry(new THREE.TorusGeometry(0.047, 0.022, 12, 40))
    const positions = geometry.getAttribute('position')
    const color = new THREE.Color()
    const colors: number[] = []
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i)
      const angle = Math.atan2(y, x)
      const lobe = 1 + 0.14 * Math.cos(4 * angle) + 0.04 * Math.sin(3 * angle)
      positions.setXYZ(i, z * 1.9, x * lobe, y * lobe)
      color.set(Math.abs(z) > 0.014 ? '#a2b945' : '#3d771e')
      color.multiplyScalar(0.93 + 0.08 * Math.sin(angle * 7))
      colors.push(color.r, color.g, color.b)
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geometry.computeVertexNormals()
    geometry.rotateY(Math.PI / 2 - 0.22)
    const material = this.material('#ffffff', 0.32)
    material.vertexColors = true
    group.add(new THREE.Mesh(geometry, material))
  }

  private shrimp(group: THREE.Group): void {
    const positions: number[] = [], colors: number[] = [], uv: number[] = [], indices: number[] = []
    const segments = 40, sides = 12
    const color = new THREE.Color()
    for (let i = 0; i <= segments; i++) {
      const u = i / segments
      const angle = -Math.PI * 0.66 + u * Math.PI * 1.49
      const radius = 0.024 * (1 - 0.64 * u) * (1 - 0.08 * Math.cos(u * Math.PI * 16))
      for (let j = 0; j <= sides; j++) {
        const v = j / sides * Math.PI * 2
        positions.push(Math.sin(v) * radius, Math.cos(angle) * (0.046 + Math.cos(v) * radius), Math.sin(angle) * (0.046 + Math.cos(v) * radius))
        color.set(Math.cos(u * Math.PI * 16) > 0.68 ? '#d47443' : '#f1b482')
        color.multiplyScalar(0.92 + Math.sin(v) * 0.08)
        colors.push(color.r, color.g, color.b)
        uv.push(u, j / sides)
        if (i < segments && j < sides) {
          const a = i * (sides + 1) + j, b = a + sides + 1
          indices.push(a, b, a + 1, b, b + 1, a + 1)
        }
      }
    }
    const geometry = this.geometry(new THREE.BufferGeometry())
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()
    geometry.rotateY(Math.PI / 2)
    const material = this.material('#ffffff', 0.38)
    material.vertexColors = true
    group.add(new THREE.Mesh(geometry, material))
    const tail = new THREE.Shape()
    tail.moveTo(-0.012, 0)
    tail.quadraticCurveTo(-0.037, -0.005, -0.031, 0.03)
    tail.lineTo(0, 0.019)
    tail.lineTo(0.029, 0.032)
    tail.quadraticCurveTo(0.035, 0.002, 0.012, 0)
    tail.closePath()
    const fan = this.geometry(new THREE.ExtrudeGeometry(tail, { depth: 0.006, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.002, bevelSegments: 1, steps: 1, curveSegments: 6 }))
    fan.rotateY(Math.PI / 2)
    fan.translate(0, -0.039, 0.027)
    fan.rotateY(Math.PI / 2)
    group.add(new THREE.Mesh(fan, this.material('#c46d36', 0.5)))
  }

  private beef(group: THREE.Group): void {
    const map = this.texture(ctx => {
      ctx.fillStyle = '#955025'
      ctx.fillRect(0, 0, 256, 256)
      for (let i = 0; i < 700; i++) {
        ctx.fillStyle = i % 3 ? '#45211222' : '#e9b77435'
        ctx.fillRect((i * 31.73) % 256, (i * 77.17) % 256, 2 + i % 4, 1 + i % 3)
      }
      for (let i = 0; i < 6; i++) {
        ctx.beginPath()
        ctx.moveTo(-15, i * 48 + 8)
        ctx.bezierCurveTo(70, i * 48 + 25, 100, i * 48 - 30, 270, i * 48 + 22)
        ctx.strokeStyle = '#e1b17a'
        ctx.lineWidth = i % 2 ? 2 : 4
        ctx.stroke()
      }
      ctx.save()
      ctx.translate(128, 128)
      ctx.rotate(-0.5)
      for (let i = -2; i <= 2; i++) {
        ctx.fillStyle = '#492812'
        ctx.fillRect(i * 62, -190, 10, 380)
        ctx.fillStyle = '#6b3618'
        ctx.fillRect(i * 62 + 10, -190, 5, 380)
      }
      ctx.restore()
    })
    const geometry = this.geometry(new RoundedBoxGeometry(0.128, 0.114, 0.132, 4, 0.024))
    const positions = geometry.getAttribute('position')
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i)
      positions.setXYZ(i, x * (1 + 0.07 * Math.sin(z * 45)), y * (1 + 0.09 * Math.cos(x * 40 + z * 15)), z)
    }
    geometry.computeVertexNormals()
    group.add(new THREE.Mesh(geometry, this.material('#ffffff', 0.48, map)))
  }

  dispose(): void {
    this.geometries.forEach(geometry => geometry.dispose())
    this.materials.forEach(material => material.dispose())
    this.textures.forEach(texture => texture.dispose())
    this.prototypes.clear()
  }
}

/** Ends of a slice consume its thickness, rather than an empty block-sized slot. */
export function foodPositions(ids: readonly IngredientId[]): number[] {
  const widths = ids.map(id => id === 'cheese' || id === 'bacon' ? 0.018 : 0.14)
  const gap = 0.008
  let cursor = -0.55
  return widths.map(width => {
    const center = cursor + width / 2
    cursor += width + gap
    return center
  })
}

/** Thin, closed edible slice, including thickness and curled irregular edges. */
export function createFoodStrip(length: number, width: number, id: 'cheese' | 'bacon', wrap = false, layer = 0): THREE.BufferGeometry {
  const segments = 32, across = 8
  const positions: number[] = [], uv: number[] = [], indices: number[] = []
  const row = across + 1, sideCount = (segments + 1) * row
  const thickness = id === 'cheese' ? 0.006 : 0.008
  for (let side = 0; side < 2; side++) for (let i = 0; i <= segments; i++) {
    const u = i / segments
    const arch = wrap ? Math.pow(Math.sin(u * Math.PI), 0.36) * (0.087 + layer * 0.025) : 0
    for (let j = 0; j <= across; j++) {
      const v = j / across
      const ripple = Math.sin(u * Math.PI) * Math.sin(u * 13 + v * 5) * (id === 'bacon' ? 0.008 : 0.003)
      const drape = wrap ? Math.sin(u * Math.PI) * Math.pow(Math.abs(v * 2 - 1), 1.5) * 0.027 : 0
      const edge = width * (1 + Math.sin(u * 23) * (id === 'bacon' ? 0.065 : 0.018))
      positions.push(wrap ? u * length : (u - 0.5) * length, arch + ripple - drape + (side === 0 ? 1 : -1) * thickness / 2, (v - 0.5) * edge)
      uv.push(u, v)
      if (i < segments && j < across) {
        const a = side * sideCount + i * row + j, b = a + row
        if (side === 0) indices.push(a, a + 1, b, b, a + 1, b + 1)
        else indices.push(a, b, a + 1, b, b + 1, a + 1)
      }
    }
  }
  const bridge = (a: number, b: number) => indices.push(a, a + sideCount, b, b, a + sideCount, b + sideCount)
  for (let i = 0; i < segments; i++) { bridge(i * row, (i + 1) * row); bridge((i + 1) * row + across, i * row + across) }
  for (let j = 0; j < across; j++) { bridge(j + 1, j); bridge(segments * row + j, segments * row + j + 1) }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}
