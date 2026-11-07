import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { FoodModels, foodPositions } from '../../foodModels'
import type { IngredientId } from '../../game'
import { TABLES, START, STATIONS, ROOM } from '../plan'
import { DISHWASHING_PREVIEW } from '../previewModel'
import type { HallView, Dish, DirtyDishes } from '../previewModel'
import { RestaurantSet } from './RestaurantSet'
import { RestaurantPost } from './RestaurantPost'
import { TowerRestaurant } from './TowerRestaurant'
import { ToyPeople } from './ToyPeople'
import { GuestJourney } from './GuestJourney'
import { SculptedChef } from './SculptedChef'
import { SculptedServer } from './SculptedServer'
import type { ToyActor } from './ToyPeople'
import { HALL_STYLE } from './HallStyle'
import { HallMotion } from './HallMotion'
import { createHallFloor, FLOOR_COLUMNS, FLOOR_ROWS, FLOOR_DEPTH_SCALE } from './HallFloor'
type Actor = ToyActor
const SEAT = .49, TOP = .96
/** New serving-first room. Layout coordinates and live meshes share one world space. */
export class ServiceScene {
  private readonly serverMotion = new HallMotion()
  private sculptedChef: SculptedChef | null = null
  private sculptedServer: SculptedServer | null = null
  private readonly scene = new THREE.Scene()
  private readonly art = new RestaurantSet()
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
  private readonly camera = new THREE.OrthographicCamera(-20, 20, 12, -12, .1, 180)
  private readonly post: RestaurantPost
  private readonly environment: THREE.WebGLRenderTarget
  private readonly foods = new FoodModels()
  private readonly geometry = new Set<THREE.BufferGeometry>()
  private readonly materials = new Set<THREE.Material>()
  private readonly textures = new Set<THREE.Texture>()
  private readonly parkInstances: THREE.InstancedMesh[] = []
  private readonly labelTextures = new Map<string, THREE.CanvasTexture>()
  private readonly tableDishes = new Map<number, THREE.Group>()
  private readonly tableSignatures = new Map<number, string>()
  private readonly guests = new Map<number, Actor[]>()
  private readonly journeys = new Map<Actor, GuestJourney>()
  private readonly queue = new Map<number, THREE.Group>()
  private readonly actors: Actor[] = []
  private readonly people = new ToyPeople(this.art)
  private tower: TowerRestaurant | null = null
  private guestElapsed?: number
  private guestTimeBudget = 0
  private server: Actor | null = null
  private readonly carry = new THREE.Group()
  private readonly pass = new THREE.Group()
  private readonly storage = new THREE.Group()
  private storageKey = ''
  private readonly washerRack = new THREE.Group()
  private readonly washerWater = new THREE.Group()
  private washerLamp: THREE.Mesh | null = null
  private washerKey = ''
  private carryKey = ''; private passKey = ''; private disposed = false; private last = 0
  private readonly observer: ResizeObserver
  private readonly projection = new THREE.Vector3()
  private readonly reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  constructor(private readonly host: HTMLElement, private readonly step: (dt: number) => HallView, private readonly notice: (text: string) => void) {
    this.scene.scale.z = FLOOR_DEPTH_SCALE
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = .96
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.scene.background = new THREE.Color('#b1ac99'); this.renderer.domElement.setAttribute('aria-label', '석탑 안의 꼬치집: 1인석 세 곳, 2인석 세 곳')
    this.renderer.domElement.setAttribute('role', 'img'); host.appendChild(this.renderer.domElement)
    // Serving routes must read like an Overcooked stage, not a frontal restaurant illustration.
    this.camera.position.set(0, 39, 43); this.camera.lookAt(0, 1.5, -3); this.camera.updateMatrixWorld()
    this.host.dataset.camera = 'orthographic-whole-venue-40deg'
    const generator = new THREE.PMREMGenerator(this.renderer), room = new RoomEnvironment()
    this.environment = generator.fromScene(room, .04); room.dispose(); generator.dispose(); this.scene.environment = this.environment.texture; this.scene.environmentIntensity = .26
    this.scene.add(new THREE.HemisphereLight('#fff0dc', '#647078', .90))
    const key = new THREE.DirectionalLight('#ffe9ce', 2.7); key.position.set(-8, 15, 5); key.castShadow = true
    key.shadow.radius = 4; key.shadow.mapSize.set(1024, 1024); Object.assign(key.shadow.camera, { left: -17, right: 17, top: 18, bottom: -18, far: 55 }); key.shadow.normalBias = .025; key.shadow.bias = -.00015
    const fill = new THREE.DirectionalLight('#c7d9e5', .55); fill.position.set(6, 9, -6); this.scene.add(key, fill)
    this.post = new RestaurantPost(this.renderer, this.scene, this.camera, .48, .58, false)
    this.scene.add(this.art.root); this.buildPark(); this.buildRoom(); this.buildTables(); this.buildKitchen(); this.buildEntry(); this.tower = new TowerRestaurant(this.art); this.host.dataset.promenadeGuests = '0'; this.host.dataset.building = 'cutaway-tower'
    this.scene.add(this.carry); this.pass.position.set(STATIONS.pickup.x, 1.14, ROOM.counterZ + .60); this.scene.add(this.pass)
    this.storage.position.set(STATIONS.storage.x, 1.16, ROOM.counterZ + .08); this.scene.add(this.storage)
    // Solid, low-detail materials keep the serving routes legible at game scale.
    this.observer = new ResizeObserver(this.resize); this.observer.observe(host); this.resize()
    this.host.dataset.inputMode = 'keyboard-only'
    this.renderer.domElement.addEventListener('webglcontextlost', this.contextLost)
    this.art.batchStatic(new Set<THREE.Object3D>([this.washerWater, this.washerLamp!])); this.buildPeople(); this.renderer.setAnimationLoop(this.render)
  }
  private mesh(geometry: THREE.BufferGeometry, material: THREE.Material) {
    this.geometry.add(geometry); this.materials.add(material); const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = mesh.receiveShadow = true; return mesh
  }
  private label(text: string, width: number, height: number, fontSize = 65, transparent = false, ink?: string) {
    const key = JSON.stringify([text, fontSize, transparent, ink])
    let texture = this.labelTextures.get(key)
    if (!texture) {
      const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 256
      const ctx = canvas.getContext('2d')!
      if (!transparent) { ctx.fillStyle = '#fff0ce'; ctx.fillRect(0, 0, 512, 256); ctx.strokeStyle = '#a77a43'; ctx.lineWidth = 14; ctx.strokeRect(6, 6, 500, 244) }
      ctx.fillStyle = ink ?? (transparent ? '#ffe6ac' : '#2b3d2d'); ctx.font = `800 ${fontSize}px "Malgun Gothic",sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 256, 130, 470)
      texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; this.textures.add(texture); this.labelTextures.set(key, texture)
    }
    const plane = this.mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false, transparent, depthWrite: !transparent }))
    plane.castShadow = false; return plane
  }
  private plant(x: number, z: number, scale = 1) {
    const root = this.art.place(this.art.root, new THREE.Group(), x, 0, z); root.scale.setScalar(scale)
    this.art.place(root, this.art.box(.60, .46, .60, '#684329', .06), 0, .23, 0)
    for (let i = 0; i < 18; i++) {
      const leaf = this.mesh(new THREE.SphereGeometry(.12, 7, 5), this.art.material(i % 3 ? '#527239' : '#829149'))
      leaf.scale.set(.55, 2.7, 1); leaf.rotation.z = Math.sin(i * 2.4) * .85
      this.art.place(root, leaf, Math.sin(i * 2.4) * .32, .70 + i % 4 * .09, Math.cos(i * 2.4) * .28)
    }
  }
  private buildRoom() {
    const a = this.art, r = a.root
    a.place(r, a.box(ROOM.width + .15, .46, ROOM.depth + .15, '#4c4c48', .18), 0, -.30, 0)
    // A shallow stone curb marks the unchanged play boundary without enclosing the sides.
    for (const x of [-12.15, 12.15]) a.place(r, a.box(.30, .22, 15.3, '#929080', .045), x, .03, 0)
    const floor = createHallFloor(a); r.add(floor.root); this.textures.add(floor.texture)
    this.host.dataset.floorGrid = `${FLOOR_COLUMNS}x${FLOOR_ROWS}`
    this.host.dataset.floorTileCount = String(floor.tiles.count)
    this.host.dataset.artStyle = 'warm-stone-cartoon'
    a.place(r, a.box(23.8, 2.55, .25, '#67442f', .04), 0, 1.25, ROOM.back + .1)
    for (let x = -11.5; x < 12; x += .65) a.place(r, a.box(.028, 2.4, .035, '#4e3225', .006), x, 1.2, ROOM.back + .25)
    for (const x of [-11.8, -6, 0, 6, 11.8]) a.place(r, a.box(.28, 2.1, .30, '#543722'), x, 1.02, ROOM.back + .2)
    a.place(r, a.box(23.8, .20, .34, '#543722'), 0, 2.05, ROOM.back + .2)
    // Indigo noren and red lanterns stay behind/peripheral to the playable floor.
    for (let i = 0; i < 4; i++) {
      a.place(r, a.box(.86, .95, .045, '#344837', .025), -1.4 + i * .94, 1.83, ROOM.back + .4)
    }
    for (const z of ROOM.plantRows) for (const x of [-ROOM.plantX, ROOM.plantX]) this.plant(x, z, .7)
    for (const x of [-11.6, 11.6]) for (const z of [.8, 5.8]) {
      const postX = x + Math.sign(x) * .35
      a.place(r, a.box(.14, 2.25, .14, '#554636', .025), postX, 1.1, z)
      a.place(r, a.box(.60, .12, .14, '#554636', .025), x + Math.sign(x) * .12, 2.16, z)
      a.place(r, a.box(.34, .16, .34, '#898779', .035), postX, .04, z)
    }
    for (const [x, z] of [[-8, ROOM.back + .55], [5.7, ROOM.back + .55], [10.9, ROOM.back + .55], [-11.6, .8], [11.6, .8], [-11.6, 5.8], [11.6, 5.8]]) this.redLantern(x, z)
    this.host.dataset.tables = '6'; this.host.dataset.seatMix = '3-single-3-double'; this.host.dataset.roomSize = `${ROOM.width}x${ROOM.depth}`
  }
  /** Decorative park scenery only; the shared serving coordinates and collision bounds stay unchanged. */
  private buildPark() {
    this.host.dataset.surroundings = 'stone-pagoda'
    const a = this.art
    a.place(a.root, a.box(52, .35, 30, '#aaa590', .02), 0, -.57, 0)
    for (const side of [-1, 1]) {
      a.place(a.root, a.box(1.5, 3.6, 20, '#aaa58e', .05), side * 14.4, 1.2, -.3)
      a.place(a.root, a.box(2.1, .26, 20.5, '#858675', .04), side * 14.4, 3.05, -.3)
    }
  }
  private redLantern(x: number, z: number) {
    const a = this.art, root = a.place(a.root, new THREE.Group(), x, 1.65, z)
    const shade = a.cylinder(.24, .65, '#e8b66f'); shade.material = a.material('#e8b66f', 0, .85); shade.material.emissive.set('#ffa655'); shade.material.emissiveIntensity = .32; root.add(shade)
    for (let i = 0; i < 8; i++) a.place(root, a.cylinder(.244, .012, '#ab6934'), 0, -.27 + i * .075, 0)
    for (const y of [-.35, .35]) a.place(root, a.cylinder(.21, .055, '#3d2e24'), 0, y, 0)
    a.place(root, a.box(.055, .30, .055, '#543722'), 0, .49, 0)
    const light = new THREE.PointLight('#ffc382', 4, 4.5, 2); a.place(root, light, 0, -.35, .25)
  }
  private chair(x: number, z: number, yaw: number) {
    const a = this.art, root = a.place(a.root, new THREE.Group(), x, 0, z); root.rotation.y = yaw
    for (const xx of [-.31, .31]) for (const zz of [-.25, .25]) a.place(root, a.box(.14, .46, .14, '#65432f', .06), xx, .23, zz)
    a.place(root, a.box(.90, .13, .82, '#b07c50', .10), 0, .435, 0)
    a.place(root, a.box(.80, .055, .72, '#344b39', .07), 0, SEAT + .025, 0)
    for (const xx of [-.35, .35]) a.place(root, a.box(.14, .95, .14, '#855b3d', .06), xx, .70, -.33)
    a.place(root, a.box(.85, .45, .18, '#344b39', .09), 0, .95, -.33)
    for (const xx of [-.40, .40]) a.place(root, a.box(.10, .09, .72, '#a47149', .04), xx, .73, 0)
    a.contact(a.root, x, z, 1.15, 1.1, .36)
  }
  private buildTables() {
    const a = this.art
    for (const t of TABLES) {
      const root = a.place(a.root, new THREE.Group(), t.x, 0, t.z); root.name = `dining-table-${t.id}`
      if (t.shape === 'round') {
        // Rounded lip catches the key light rather than a hard cylinder edge.
        const profile = [[0, 0], [.89, 0], [.96, .035], [.98, .09], [.98, .17], [.95, .22], [.88, .24], [0, .24]]
        const top = this.mesh(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 32), a.material(HALL_STYLE.wood, 0, .80))
        a.place(root, top, 0, TOP - .24, 0)
        a.place(root, a.cylinder(.23, .75, '#815535'), 0, .40, 0)
        a.place(root, a.box(1.12, .13, .86, '#815535', .06), 0, .08, 0)
      } else {
        a.place(root, a.box(3.00, .28, 2.08, HALL_STYLE.woodEdge, .12), 0, TOP - .16, 0)
        for (let plank = 0; plank < 4; plank++) {
          const board = a.box(2.92, .10, .49, plank % 2 ? HALL_STYLE.wood : HALL_STYLE.woodLight, .045)
          board.material = a.material(plank % 2 ? HALL_STYLE.wood : HALL_STYLE.woodLight, 0, .80)
          a.place(root, board, 0, TOP - .05, -.75 + plank * .5)
        }
        for (const x of [-1.15, 1.15]) for (const z of [-.70, .70]) a.place(root, a.box(.23, .88, .23, '#815535', .09), x, .44, z)
      }
      // A standing number plaque is readable from the lower camera, without floor text.
      a.place(root, a.box(.53, .34, .08, '#4b3021', .03), t.capacity === 1 ? .38 : -1.0, TOP + .17, t.capacity === 1 ? .40 : .70)
      const tableNumber = this.label(String(t.id).padStart(2, '0'), .47, .28, 145); a.place(root, tableNumber, t.capacity === 1 ? .38 : -1.0, TOP + .17, t.capacity === 1 ? .445 : .745)
      a.chopsticks(root, t.capacity === 1 ? .40 : .87, TOP, -.43, .40)
      a.lantern(root, t.capacity === 1 ? .25 : .8, TOP + .20, -.25, .38)
      const dishes = a.place(root, new THREE.Group(), 0, TOP + .01, 0); this.tableDishes.set(t.id, dishes)
      t.seats.forEach(s => this.chair(s.x, s.z, s.yaw)); a.contact(a.root, t.x, t.z, t.capacity === 1 ? 2.1 : 3.6, 2.1)
    }
  }
  private bottle() {
    const a = this.art, root = new THREE.Group()
    a.place(root, a.cylinder(.115, .31, '#ecdfc6', .13), 0, .16, 0); a.place(root, a.cylinder(.055, .16, '#ecdfc6', .045), 0, .38, 0)
    a.place(root, a.cylinder(.058, .045, '#55768a'), 0, .46, 0); a.place(root, a.box(.14, .13, .025, '#43697b', .01), 0, .19, .115)
    return root
  }
  private buildKitchen() {
    const a = this.art, r = a.place(a.root, new THREE.Group(), 0, 0, ROOM.counterZ)
    a.place(r, a.box(10.15, 1.00, 1.25, '#633d28', .06), -.25, .5, 0)
    a.place(r, a.box(10.35, .18, 1.45, HALL_STYLE.wood, .09), -.25, 1.05, 0)
    for (let i = 0; i < 8; i++) { const x = -4.6 + i * 1.22; a.place(r, a.box(1.09, .68, .045, '#8c5b37', .04), x, .51, .66); a.place(r, a.box(.28, .035, .06, '#dbb877'), x, .77, .70) }
    for (const x of [STATIONS.orders.x, STATIONS.pickup.x]) a.place(r, a.box(1.6, .065, .72, '#eee1c2', .08), x, 1.14, .25)
    for (let i = 0; i < 3; i++) a.place(r, a.box(.63, .025, .46, '#fff8e4', .015), STATIONS.orders.x + i * .025, 1.19 + i * .025, .25 - i * .025)
    const grill = a.place(r, new THREE.Group(), -8.5, 0, -.05)
    a.place(grill, a.box(2.5, 1.0, 1.3, '#433f37', .07), 0, .5, 0)
    a.place(grill, a.box(2.65, .16, 1.4, '#737267', .06), 0, 1.06, 0)
    a.place(grill, a.box(2.2, .04, .90, '#6c2c1a'), 0, 1.16, 0)
    for (let i = 0; i < 14; i++) a.place(grill, a.box(.045, .035, .95, '#363b35', .007), -.99 + i * .15, 1.20, 0)
    for (let i = 0; i < 8; i++) {
      const ember = a.box(.14, .06, .12, '#ed7632'); ember.material = a.material('#ed7632'); ember.material.emissive.set('#ff6e16'); ember.material.emissiveIntensity = .9
      a.place(grill, ember, -.85 + i % 4 * .55, 1.18, i < 4 ? -.25 : .25)
    }
    a.place(grill, this.skewer(['tomato', 'cheese', 'pepper', 'shrimp', 'cheese', 'beef']), -.35, 1.39, -.2)
    const fridge = a.place(r, new THREE.Group(), STATIONS.fridge.x, 0, 0)
    a.place(fridge, a.box(1.68, 2.2, 1.35, '#293d36', .09), 0, 1.1, 0)
    const inside = a.box(1.43, 1.76, .10, '#adc8c7'); inside.material = a.material('#86a5aa', .1, .3); inside.material.emissive.set('#496e83'); inside.material.emissiveIntensity = .5; a.place(fridge, inside, 0, 1.1, .70)
    for (const y of [.25, .80, 1.35]) { a.place(fridge, a.box(1.40, .04, .35, '#758d86'), 0, y, .82); for (const x of [-.43, 0, .43]) a.place(fridge, this.bottle(), x, y + .04, .85) }
    a.place(fridge, a.box(.055, .80, .07, '#d7c49d'), .65, 1.1, 1.0)
    a.place(fridge, this.label('사케', .8, .25, 90), 0, 2.0, .70)
    const light = new THREE.PointLight('#9bd9f1', 3, 3.5, 2); a.place(r, light, STATIONS.fridge.x, 1.5, .7)
    // Back-wall sake shelves and plates are outside the walkable zone.
    for (const side of [-1, 1]) {
      const shelf = a.place(a.root, new THREE.Group(), side * 5, 0, ROOM.back + .55)
      for (const x of [-1.05, 1.05]) a.place(shelf, a.box(.12, 1.9, .5, '#543722'), x, .95, 0)
      for (const y of [.35, .95, 1.6]) {
        a.place(shelf, a.box(2.2, .10, .60, '#94643d'), 0, y, 0)
        for (let i = 0; i < 4; i++) a.place(shelf, this.bottle(), -.75 + i * .48, y + .06, 0)
      }
    }
    a.dishes(r, -4.5, 1.16, .15, 5, .8); a.jar(r, 4.1, 1.16, .1, .8, '#55412f')
    const storage = a.place(r, new THREE.Group(), STATIONS.storage.x, 0, 0)
    storage.name = 'skewer-storage-counter'
    a.place(storage, a.box(2.65, 1.0, 1.5, '#815b3d', .07), 0, .5, 0)
    a.place(storage, a.box(2.78, .14, 1.62, '#8f5935', .07), 0, 1.06, 0)
    for (const x of [-.83, 0, .83]) {
      a.place(storage, a.box(.74, .70, .045, '#9f7450', .035), x, .52, .77)
      a.place(storage, a.box(.24, .035, .055, '#d8bb82'), x, .80, .80)
    }
    a.place(storage, this.label('꼬치 보관', 1.06, .27, 71), 0, .51, .805)
    for (const x of [-.84, 0, .84]) for (const z of [-.4, 0, .4]) a.place(storage, a.box(.77, .015, .30, '#b8b49a', .02), x, 1.14, z)
    this.buildWasher()
  }
  private buildWasher() {
    const a = this.art, root = a.place(a.root, new THREE.Group(), STATIONS.washer.x, 0, ROOM.counterZ)
    root.name = 'automatic-dishwasher'
    a.place(root, a.box(1.70, 1.18, 1.40, '#a8b8af', .09), 0, .60, 0)
    a.place(root, a.box(1.82, .12, 1.5, '#d5ddd0', .07), 0, 1.23, 0)
    a.place(root, a.box(1.46, .78, .08, '#596f6c', .07), 0, .56, .72)
    a.place(root, a.box(1.23, .47, .035, '#31565d', .05), 0, .60, .77)
    a.place(root, a.box(1.23, .055, .13, '#d5ddd0', .025), 0, 1.07, .80)
    for (const x of [-.65, .65]) a.place(root, a.box(.12, .14, .16, '#344946'), x, .07, .48)
    this.washerLamp = a.place(root, a.cylinder(.065, .025, '#7c9f76'), .60, 1.30, .20)
    a.place(root, this.label('식기 세척', 1.13, .25, 74), 0, .26, .78)
    // A tray on top shows actual batch contents; the front window animates only while washing.
    a.place(root, a.box(1.45, .09, .88, '#567d7a', .045), 0, 1.34, -.10)
    a.place(root, this.washerRack, 0, 1.40, -.10)
    a.place(root, this.washerWater, 0, .60, .80)
    for (let i = 0; i < 5; i++) {
      const bubble = this.mesh(new THREE.SphereGeometry(.045 + i % 2 * .018, 10, 6), a.material('#a0c7c5', .05, .25))
      a.place(this.washerWater, bubble, -.45 + i * .22, 0, 0)
    }
    this.washerWater.visible = false
  }
  private dirtyBundle(bundle: DirtyDishes) {
    const a = this.art, root = new THREE.Group(); root.name = `dirty-dishes-${bundle.id}`
    a.dishes(root, 0, 0, 0, bundle.settings + 1, 1.14)
    const y = .08 + bundle.settings * .04
    a.bowl(root, .06, y, .015, .77)
    for (let i = 0; i < 4; i++) a.place(root, a.box(.035, .012, .04, '#946334', .005), Math.sin(i * 2.4) * .13, y + .065, Math.cos(i * 2.4) * .09)
    a.place(root, this.art.box(.43, .025, .025, '#936b43'), -.04, y + .15, -.02).rotation.y = -.45
    return root
  }
  private buildEntry() {
    const a = this.art, r = a.root
    for (const side of [-1, 1]) { a.place(r, a.box(9.1, .40, .16, '#65432c'), side * 7.3, .20, ROOM.front); a.place(r, a.box(9.2, .10, .25, '#a16c41'), side * 7.3, .43, ROOM.front) }
    a.place(r, a.box(24.0, .20, 3.1, '#aaa895', .08), 0, -.11, ROOM.front + 1.3)
    for (let col = 0; col < 12; col++) for (let row = 0; row < 2; row++) a.place(r, a.box(1.96, .03, 1.42, (col + row) % 2 ? '#d3cdb9' : '#c7c0ac', .02), -11 + col * 2, .005, ROOM.front + .72 + row * 1.46)
    a.place(r, a.box(5.2, .035, 1.55, '#344637', .045), 0, .04, ROOM.queueZ)
    for (const x of [-2.8, 2.8]) { this.plant(x, ROOM.front + .25, .8); a.lantern(r, x, 1.35, ROOM.front + .25, .9) }
  }
  private buildPeople() {
    const actor = (index: number, x: number, z: number, yaw: number, role: 'guest' | 'server' | 'chef' = 'guest', seated = false) => {
      const person = this.people.create(index, role, seated); person.root.position.x = x; person.root.position.z = z; person.root.rotation.y = yaw; this.scene.add(person.root); this.actors.push(person); return person
    }
    TABLES.forEach(t => this.guests.set(t.id, t.seats.map((seat, index) => actor(t.id + index, seat.x, seat.z, seat.yaw, 'guest', true))))
    this.guests.forEach(list => list.forEach((actor, index) => this.journeys.set(actor, new GuestJourney(actor, index === 0))))
    this.server = actor(1, START.x, START.z, 0, 'server'); this.server.root.add(this.carry)
    this.host.dataset.serverModel = 'loading'
    void SculptedServer.load().then(server => {
      if (this.disposed) { server.dispose(); return }
      server.root.position.copy(this.server!.root.position)
      // Cancel the floor-only depth scaling before rotating the visual model.
      server.root.scale.z = 1 / FLOOR_DEPTH_SCALE
      this.scene.add(server.root)
      this.sculptedServer = server
      this.server!.setBodyVisible(false)
      this.host.dataset.serverModel = 'sculpted'
    }).catch(() => {
      if (!this.disposed) { this.host.dataset.serverModel = 'unavailable'; this.notice('서빙 캐릭터를 불러오지 못했어요. 새로고침해 주세요.') }
    })
    const ring = this.mesh(new THREE.RingGeometry(.40, .57, 40), new THREE.MeshBasicMaterial({ color: '#ffd052', transparent: true, opacity: .95, depthWrite: false, toneMapped: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = .035; ring.castShadow = false; this.server.root.add(ring)
    const chefFallback = actor(0, 0, ROOM.counterZ - 1.28, 0, 'chef')
    this.host.dataset.chefModel = 'loading'
    void SculptedChef.load().then(chef => {
      if (this.disposed) { chef.dispose(); return }
      chef.root.position.copy(chefFallback.root.position)
      chef.root.rotation.copy(chefFallback.root.rotation)
      // Floor depth correction must not stretch the imported character.
      chef.root.scale.z = 1 / FLOOR_DEPTH_SCALE
      this.scene.add(chef.root)
      this.sculptedChef = chef
      chefFallback.root.visible = false
      this.host.dataset.chefModel = 'sculpted'
    }).catch(() => {
      if (!this.disposed) this.host.dataset.chefModel = 'unavailable'
    })
    for (let party = 1; party <= 3; party++) {
      const group = new THREE.Group(); this.queue.set(party, group)
      for (let i = 0; i < 2; i++) group.add(actor(i + party, (party - 2) * 1.75 + i * .72, ROOM.queueZ, Math.PI * .85).root)
      this.scene.add(group)
    }
    this.host.dataset.ready = 'true'; this.host.dataset.seatCapacity = '9'; this.host.dataset.characterStyle = 'rounded-toy'; this.inspectContacts()
    this.host.dataset.guestModel = 'loading'
    void this.people.guestsReady.then(loaded => {
      if (this.disposed) return
      this.host.dataset.guestModel = loaded ? 'bungeoppang' : 'unavailable'
      this.inspectContacts()
    })
  }
  private inspectContacts() {
    this.host.dataset.seatGaps = JSON.stringify([...this.guests.values()].flatMap(people => people.map(person => person.seatGap())))
  }
  private skewer(recipe: IngredientId[]) {
    const root = new THREE.Group(), p = foodPositions(recipe), offset = recipe.length ? -(p[0] + p.at(-1)!) / 2 : 0
    const bamboo = this.art.cylinder(.009, 1.3, '#b78b40'); bamboo.rotation.z = Math.PI / 2; root.add(bamboo)
    recipe.forEach((id, i) => { const f = this.foods.create(id); f.position.x = p[i] + offset; root.add(f) })
    root.traverse(object => { if (object instanceof THREE.Mesh) object.castShadow = true }); return root
  }
  private plate(dish: Dish, scale: number) {
    const root = new THREE.Group(); root.scale.setScalar(scale)
    this.art.place(root, this.art.box(1.46, .05, .48, '#eee0c5', .06), 0, .02, 0)
    this.art.place(root, this.skewer(dish.recipe), 0, .16, 0)
    const flag = this.label(`${String(dish.table).padStart(2, '0')}`, .26, .22, 135); this.art.place(root, flag, .56, .27, -.08)
    return root
  }
  private update(view: HallView, dt: number) {
    if (this.guestElapsed !== undefined) this.guestTimeBudget = view.elapsed < this.guestElapsed ? 0 : this.guestTimeBudget + view.elapsed - this.guestElapsed
    const guestDt = Math.max(0, Math.min(dt, this.guestTimeBudget))
    this.guestTimeBudget -= guestDt
    this.guestElapsed = view.elapsed
    if (this.server) {
      this.serverMotion.update(view.position, dt, view.finished)
      const actor = this.server, moving = this.serverMotion.moving
      actor.root.rotation.y = this.serverMotion.yaw
      actor.root.position.set(this.serverMotion.position.x, 0, this.serverMotion.position.z); actor.pose(dt, { moving, carrying: !!(view.carry.length || view.sake || view.dirtyDishes.length), cleaning: !!view.clean, reduced: this.reduced })
      if (this.sculptedServer) {
        this.sculptedServer.root.position.copy(actor.root.position)
        this.sculptedServer.pose(dt, { moving, carrying: !!(view.carry.length || view.sake || view.dirtyDishes.length), cleaning: !!view.clean, reduced: this.reduced }, actor.root.rotation.y)
      }
    }
    for (const table of view.tables) {
      const people = this.guests.get(table.id); people?.forEach((actor, index) => this.journeys.get(actor)!.update(index < table.people, table.status === 'eating', guestDt, this.reduced, table.arrivalRemaining))
      const signature = JSON.stringify([table.status, table.bill?.dishes.map(d => d.delivered), table.bill?.sakeDelivered])
      if (this.tableSignatures.get(table.id) === signature) continue
      this.tableSignatures.set(table.id, signature); const root = this.tableDishes.get(table.id)!; root.clear()
      if (table.status === 'dirty') {
        for (const x of [-.28, .19]) { const bowl = this.art.bowl(root, x, .02, .07, .75); bowl.rotation.z = x * .35 }
        for (let i = 0; i < 10; i++) this.art.place(root, this.art.box(.045, .02, .04, i % 2 ? '#a27239' : '#785330', .005), Math.sin(i * 2.4) * .45, .03, Math.cos(i * 2.4) * .35)
        const bottle = this.bottle(); bottle.rotation.z = Math.PI / 2; bottle.scale.setScalar(.75); this.art.place(root, bottle, .21, .10, -.24)
      } else if (table.status === 'eating' && table.bill) {
        table.bill.dishes.forEach((d, i) => this.art.place(root, this.plate(d, .60), 0, .02, i ? .32 : -.18))
        this.art.place(root, this.bottle(), -.45, .01, .12)
      } else if (table.bill) table.bill.dishes.filter(d => d.delivered).forEach((d, i) => this.art.place(root, this.plate(d, .60), 0, .02, i ? .32 : -.18))
    }
    // Visible slots follow queue order, not party ids which change as new customers arrive.
    this.queue.forEach((root, slot) => {
      const party = view.queue[slot - 1]; root.visible = !!party
      root.children.forEach((person, index) => { person.visible = !!party && index < party.size })
    })
    this.actors.filter(actor => actor.root.visible && !actor.seated && actor.role === 'guest').forEach(actor => actor.pose(guestDt, { reduced: this.reduced }))
    const carryKey = `${view.carry.map(d => d.id)}:${view.sake}:${view.dirtyDishes.map(d => d.id)}`
    if (carryKey !== this.carryKey) {
      this.carryKey = carryKey; this.carry.clear()
      if (view.carry.length || view.sake) this.art.place(this.carry, this.art.box(1.65, .05, .85, '#704b32', .10), 0, 1.0, .62)
      view.carry.forEach((d, i) => this.art.place(this.carry, this.plate(d, .72), i ? .37 : -.37, 1.05, .72))
      for (let i = 0; i < view.sake; i++) { const b = this.bottle(); b.scale.setScalar(.7); this.art.place(this.carry, b, i ? .48 : -.48, 1.04, .36) }
      if (view.dirtyDishes.length) {
        this.art.place(this.carry, this.art.box(1.40, .10, .82, '#567d7a', .08), 0, 1.0, .62)
        view.dirtyDishes.forEach((bundle, i) => this.art.place(this.carry, this.dirtyBundle(bundle), view.dirtyDishes.length === 1 ? 0 : i ? .34 : -.34, 1.07, .62))
      }
    }
    const washerKey = view.washer.load.map(d => d.id).join(',')
    if (washerKey !== this.washerKey) {
      this.washerKey = washerKey; this.washerRack.clear()
      view.washer.load.forEach((bundle, i) => this.art.place(this.washerRack, this.dirtyBundle(bundle), view.washer.load.length === 1 ? 0 : i ? .36 : -.36, .01, 0))
      if (this.washerLamp) this.washerLamp.material = this.art.material(view.washer.load.length ? '#dfa54e' : '#7c9f76')
    }
    this.washerWater.visible = view.washer.load.length > 0
    if (this.washerWater.visible) this.washerWater.children.forEach((bubble, i) => { bubble.position.y = this.reduced ? 0 : Math.sin(view.elapsed * 4 + i * 1.7) * .12 })
    this.host.dataset.carryMode = view.dirtyDishes.length ? 'dirty' : view.carry.length || view.sake ? 'food' : 'empty'
    this.host.dataset.dirtyCount = String(view.dirtyDishes.length)
    this.host.dataset.washer = view.washer.load.length ? 'washing' : 'idle'
    this.host.dataset.washProgress = String(Math.round((1 - view.washer.remaining / DISHWASHING_PREVIEW.cycleSeconds) * 100))
    const passKey = view.pass.map(d => d.id).join(',')
    if (passKey !== this.passKey) { this.passKey = passKey; this.pass.clear(); view.pass.forEach((d, i) => this.art.place(this.pass, this.plate(d, .77), i ? .68 : -.68, .01, 0)) }
    const storageKey = view.stored.map(d => d.id).join(',')
    if (storageKey !== this.storageKey) {
      this.storageKey = storageKey; this.storage.clear()
      view.stored.slice(0, 9).forEach((dish, index) => this.art.place(this.storage, this.plate(dish, .5), (index % 3 - 1) * .84, .01, (Math.floor(index / 3) - 1) * .4))
    }
    this.host.dataset.storedCount = String(view.stored.length)
    this.project('orders', STATIONS.orders.x, 1.45, -6.2); this.project('pickup', STATIONS.pickup.x, 1.45, -6.2); this.project('fridge', STATIONS.fridge.x, 2.5, -5.9)
    this.project('storage', STATIONS.storage.x, 1.45, -6.2)
    this.project('washer', STATIONS.washer.x, 2.1, -6.0)
    TABLES.forEach(t => {
      this.project(`table-${t.id}`, t.x, TOP, t.z)
      // 테이블 상판 안쪽에 고정해 손님 키와 관계없이 통로를 비워 둔다.
      this.project(`bubble-${t.id}`, t.x, TOP + .08, t.z + .12)
    })
    this.project('queue', 0, 2.45, ROOM.queueZ)
    this.project('action', view.position.x + (view.position.x > 0 ? -1.6 : 1.6), 2.35, view.position.z + .15)
    this.project('queue-feet', 0, 0, ROOM.queueZ + .3)
    const actionY = parseFloat(this.host.style.getPropertyValue('--hall-action-y'))
    this.host.style.setProperty('--hall-action-y', `${Math.max(8, Math.min(85, actionY))}%`)
  }
  private project(name: string, x: number, y: number, z: number) {
    this.projection.set(x, y, z * FLOOR_DEPTH_SCALE).project(this.camera)
    this.host.style.setProperty(`--hall-${name}-x`, `${(this.projection.x + 1) * 50}%`); this.host.style.setProperty(`--hall-${name}-y`, `${(1 - this.projection.y) * 50}%`)
  }
  private resize = () => {
    const root = this.host.parentElement
    if (!root || this.disposed) return
    const viewport = root.getBoundingClientRect(); if (!viewport.width || !viewport.height) return
    const spacious = viewport.width >= 1100 && viewport.height >= 650
      || viewport.width >= 850 && viewport.height >= 450 && viewport.height <= 600
    // 홀과 입구가 구도의 기준이다. 뒤쪽 석탑은 화면 위로 잘려도 되며 HUD와 겹칠 수 있다.
    const corners = [
      ...[-12.2, 12.2].map(x => new THREE.Vector3(x, 2.8, -7.5)),
      ...[-11.6, 11.6].map(x => new THREE.Vector3(x, 0, 6.7)),
      ...[-3.2, 3.2].map(x => new THREE.Vector3(x, 0, 8.8)),
    ]
    // 확정 시안 A: 가구 옆면과 서빙 동선을 함께 보여주는 40도 평행투영.
    const angle = THREE.MathUtils.degToRad(40)
    this.camera.up.set(0, 1, 0)
    this.host.dataset.camera = 'orthographic-whole-venue-40deg'
    this.camera.position.set(0, .7 + 60 * Math.sin(angle), 60 * Math.cos(angle)); this.camera.lookAt(0, .7, 0); this.camera.updateMatrixWorld()
    const fit = (width: number, height: number) => {
      const ratio = width / height
      const pose = (span: number) => { this.camera.left = -span * ratio; this.camera.right = span * ratio; this.camera.top = span; this.camera.bottom = -span; this.camera.updateProjectionMatrix() }
      let low = 6, high = 100
      for (let i = 0; i < 20; i++) {
        const distance = (low + high) / 2; pose(distance)
        const fits = corners.every(corner => { const p = corner.clone(); p.z *= FLOOR_DEPTH_SCALE; p.project(this.camera); return Math.abs(p.x) < (spacious ? .93 : .82) && p.y < (spacious ? .82 : .94) && p.y > (spacious ? -.87 : -.80) })
        if (fits) high = distance; else low = distance
      }
      pose(high)
    }
    // Measure against the full viewport first, so reserving a bottom dock cannot
    // oscillate the ResizeObserver between layouts. X is independent of depth in this camera.
    fit(viewport.width, viewport.height)
    const edge = new THREE.Vector3(-12.4, 0, 0).project(this.camera)
    const gutter = (edge.x + 1) * viewport.width / 2
    root.dataset.inventoryLayout = spacious ? 'corners' : gutter - 24 >= 144 ? 'sides' : 'bottom'
    root.style.setProperty('--service-inventory-width', `${Math.min(240, Math.floor(gutter - 24))}px`)
    const { width, height } = this.host.getBoundingClientRect()
    if (!width || !height) return
    fit(width, height)
    this.renderer.setSize(width, height, false); this.post.resize(width, height)
  }
  private contextLost = (event: Event) => { event.preventDefault(); this.notice('3D 화면 연결이 중단됐어요. 새로고침해 주세요.') }
  private render = () => {
    if (this.disposed) return
    const now = performance.now(), dt = this.last ? Math.max(0, (now - this.last) / 1000) : 0; this.last = now
    // Native rendering and controller sampling stay out of React's component updates.
    this.update(this.step(dt), Math.min(.05, dt)); this.post.render()
  }
  dispose() {
    this.disposed = true; this.renderer.setAnimationLoop(null); this.observer.disconnect(); this.renderer.domElement.removeEventListener('webglcontextlost', this.contextLost)
    this.sculptedServer?.dispose(); this.sculptedChef?.dispose(); this.tower?.dispose(); this.parkInstances.forEach(mesh => mesh.dispose())
    this.people.dispose(); this.geometry.forEach(g => g.dispose()); this.materials.forEach(m => m.dispose()); this.textures.forEach(t => t.dispose()); this.labelTextures.clear(); this.foods.dispose(); this.art.dispose(); this.post.dispose(); this.environment.dispose(); this.renderer.dispose(); this.renderer.domElement.remove()
  }
}
