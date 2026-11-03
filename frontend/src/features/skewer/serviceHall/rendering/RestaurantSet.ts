import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

/** Shared, game-owned art direction. All props remain real geometry in both views. */
export const RESTAURANT = {
  wall: '#a59078', timber: '#4a2c20', trim: '#70432b', floor: '#ac7a57',
  table: '#9d6b45', counter: '#8b502e', green: '#214235', ceramic: '#e9dbc1',
} as const

export class RestaurantSet {
  readonly root = new THREE.Group()
  private readonly geometries = new Map<string, THREE.BufferGeometry>()
  private readonly materials = new Map<string, THREE.MeshStandardMaterial>()
  private readonly textures = new Set<THREE.Texture>()
  private disposed = false

  constructor() { this.root.name = 'restaurant-3d-decor' }
  material(color: string, metalness = 0, roughness = .53) {
    const key = `${color}:${metalness}:${roughness}`
    let material = this.materials.get(key)
    if (!material) { material = new THREE.MeshStandardMaterial({ color, metalness, roughness }); this.materials.set(key, material) }
    return material
  }
  private geometry(key: string, create: () => THREE.BufferGeometry) {
    let geometry = this.geometries.get(key)
    if (!geometry) { geometry = create(); this.geometries.set(key, geometry) }
    return geometry
  }
  place<T extends THREE.Object3D>(parent: THREE.Object3D, object: T, x: number, y: number, z: number): T {
    object.position.set(x, y, z); parent.add(object); return object
  }
  box(w: number, h: number, d: number, color: string, r = .025) {
    const mesh = new THREE.Mesh(this.geometry(`b:${w}:${h}:${d}:${r}`, () => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 3, h / 3, d / 3))), this.material(color))
    mesh.castShadow = mesh.receiveShadow = true; return mesh
  }
  cylinder(radius: number, height: number, color: string, top = radius) {
    const mesh = new THREE.Mesh(this.geometry(`c:${radius}:${height}:${top}`, () => new THREE.CylinderGeometry(top, radius, height, 24)), this.material(color))
    mesh.castShadow = mesh.receiveShadow = true; return mesh
  }
  private torus(radius: number, tube: number, color: string) {
    return new THREE.Mesh(this.geometry(`t:${radius}:${tube}`, () => new THREE.TorusGeometry(radius, tube, 8, 32)), this.material(color, .2, .3))
  }
  bowl(parent: THREE.Object3D, x: number, y: number, z: number, scale = 1, color: string = RESTAURANT.ceramic) {
    const root = this.place(parent, new THREE.Group(), x, y, z); root.scale.setScalar(scale)
    const body = new THREE.Mesh(this.geometry('bowl', () => new THREE.LatheGeometry([
      new THREE.Vector2(.08, 0), new THREE.Vector2(.12, .025), new THREE.Vector2(.20, .11), new THREE.Vector2(.205, .14),
      new THREE.Vector2(.185, .145), new THREE.Vector2(.16, .08), new THREE.Vector2(0, .045),
    ], 28)), this.material(color, .05, .24)); body.castShadow = body.receiveShadow = true; root.add(body)
    return root
  }
  dishes(parent: THREE.Object3D, x: number, y: number, z: number, count = 4, scale = 1) {
    const root = this.place(parent, new THREE.Group(), x, y, z); root.scale.setScalar(scale)
    for (let i = 0; i < count; i++) this.place(root, this.cylinder(.24, .035, RESTAURANT.ceramic, .26), 0, .025 + i * .035, 0)
    return root
  }
  pot(parent: THREE.Object3D, x: number, y: number, z: number, scale = 1) {
    const root = this.place(parent, new THREE.Group(), x, y, z); root.scale.setScalar(scale); root.name = 'kitchen-pot'
    const body = this.cylinder(.22, .30, '#38423c'); body.material = this.material('#58615a', .62, .29)
    this.place(root, body, 0, .16, 0)
    this.place(root, this.cylinder(.23, .025, '#69756b'), 0, .32, 0)
    this.place(root, this.cylinder(.04, .05, '#242a26'), 0, .365, 0)
    for (const side of [-1, 1]) { const handle = this.torus(.065, .017, '#30332b'); handle.rotation.y = Math.PI / 2; this.place(root, handle, side * .25, .24, 0) }
    return root
  }
  jar(parent: THREE.Object3D, x: number, y: number, z: number, scale = 1, color = '#49301f') {
    const root = this.place(parent, new THREE.Group(), x, y, z); root.scale.setScalar(scale)
    const body = new THREE.Mesh(this.geometry('jar', () => new THREE.LatheGeometry([
      new THREE.Vector2(0, 0), new THREE.Vector2(.15, 0), new THREE.Vector2(.20, .12), new THREE.Vector2(.18, .3), new THREE.Vector2(.13, .34), new THREE.Vector2(.13, .38), new THREE.Vector2(0, .38),
    ], 24)), this.material(color, .04, .20)); body.castShadow = true; root.add(body)
    this.place(root, this.cylinder(.145, .045, '#35251c'), 0, .40, 0)
    return root
  }
  chopsticks(parent: THREE.Object3D, x: number, y: number, z: number, scale = 1) {
    const root = this.place(parent, new THREE.Group(), x, y, z); root.scale.setScalar(scale)
    this.place(root, this.cylinder(.12, .25, '#68432a'), 0, .125, 0)
    for (let i = 0; i < 13; i++) {
      const stick = this.cylinder(.009, .47, '#c39963'); stick.rotation.z = Math.sin(i * 3) * .16
      this.place(root, stick, Math.sin(i * 2.4) * .065, .36 + i % 3 * .015, Math.cos(i * 2.4) * .065)
    }
    return root
  }
  tools(parent: THREE.Object3D, x: number, y: number, z: number, scale = 1) {
    const root = this.place(parent, new THREE.Group(), x, y, z); root.scale.setScalar(scale); root.name = 'hanging-kitchen-tools'
    this.place(root, this.box(1.35, .035, .04, '#3c3026'), 0, 0, 0)
    for (let i = 0; i < 5; i++) {
      const utensil = new THREE.Group(); this.place(root, utensil, -.52 + i * .26, -.04, .03)
      const loop = this.torus(.034, .008, '#b8aa8b'); this.place(utensil, loop, 0, -.035, 0)
      this.place(utensil, this.cylinder(.014, .29, '#7c6347'), 0, -.22, 0)
      if (i % 2) { const head = this.box(.11, .15, .025, '#a1aaa2'); head.material = this.material('#a1aaa2', .65, .25); this.place(utensil, head, 0, -.42, 0) }
      else { const ladle = this.bowl(utensil, 0, -.44, .02, .37, '#8b9c93'); ladle.rotation.x = .8 }
    }
    return root
  }
  lantern(parent: THREE.Object3D, x: number, y: number, z: number, scale = 1) {
    const root = this.place(parent, new THREE.Group(), x, y, z); root.scale.setScalar(scale)
    const shade = this.cylinder(.20, .50, '#eac082')
    const material = this.material('#efbc70', 0, .6); material.emissive.set('#ffad45'); material.emissiveIntensity = .8; shade.material = material; root.add(shade)
    for (let i = 0; i < 7; i++) this.place(root, this.cylinder(.203, .009, '#a87539'), 0, -.21 + i * .07, 0)
    for (const yy of [-.28, .28]) this.place(root, this.cylinder(.22, .05, RESTAURANT.timber), 0, yy, 0)
    this.place(root, this.cylinder(.009, .45, RESTAURANT.timber), 0, .51, 0)
    return root
  }
  /** A bounded soft contact shadow anchors furnishings without extra shadow-casting lights. */
  contact(parent: THREE.Object3D, x: number, z: number, width: number, depth: number, opacity = .28) {
    let material = this.materials.get('contact') as THREE.MeshStandardMaterial | undefined
    if (!material) {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128
      const ctx = canvas.getContext('2d')!, gradient = ctx.createRadialGradient(64, 64, 15, 64, 64, 63)
      gradient.addColorStop(0, '#1d100bd0'); gradient.addColorStop(.65, '#28170a85'); gradient.addColorStop(1, '#28170a00')
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128)
      const texture = new THREE.CanvasTexture(canvas); this.textures.add(texture)
      material = new THREE.MeshStandardMaterial({ map: texture, transparent: true, opacity, depthWrite: false, roughness: 1 })
      this.materials.set('contact', material)
    }
    const shadow = new THREE.Mesh(this.geometry('contact', () => new THREE.PlaneGeometry(1, 1)), material)
    shadow.rotation.x = -Math.PI / 2; shadow.scale.set(width, depth, 1); this.place(parent, shadow, x, .02, z)
  }
  /** Texture belongs to this set; callbacks never touch a disposed material. */
  wood(materials: THREE.MeshStandardMaterial[], ready?: () => void, horizontal = false) {
    new THREE.TextureLoader().load('/art/materials/wood-color.webp', texture => {
      if (this.disposed) { texture.dispose(); return }
      texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4; this.textures.add(texture)
      if (horizontal) { texture.center.set(.5, .5); texture.rotation = Math.PI / 2 }
      materials.forEach(material => { material.map = texture; material.needsUpdate = true }); ready?.()
    })
  }
  dispose() {
    this.disposed = true; this.geometries.forEach(g => g.dispose()); this.materials.forEach(m => m.dispose()); this.textures.forEach(t => t.dispose()); this.root.removeFromParent()
  }
}
