import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { FoodModels, foodPositions, assembledFoodScale } from '../foodModels'
import { INGREDIENTS, availablePieces } from '../game'
import type { IngredientId } from '../game'
import { RestaurantSet } from '../serviceHall/rendering/RestaurantSet'
import { RestaurantPost } from '../serviceHall/rendering/RestaurantPost'
import { menuSkewerIllustration } from '../serviceHall/menuSkewerIllustration'
import { insertionReady } from './model'
import type { ChefView, ChefAction, ChefJob } from './model'
import { chefPresentation } from './chefPresentation'
import { ChefHall } from './ChefHall'
import { INITIAL_PANTRY } from '../cooperativeMenu'

export type ChefMode = 'pc' | 'vr'
type Pick = { ingredient: IngredientId } | { action: 'thread' | 'unthread' | 'submit' | 'stick' | 'coop' } | { slot: number }
type Held = { ingredient: IngredientId; root: THREE.Group }
const HOME = new THREE.Vector3(0, 1.25, .48), TIP = new THREE.Vector3(1.3, 0, 0)
const COUNTER_TOP = 1.02
const orderSlotX = (slot: number) => -.99 + slot * 1.98

/** One real 3D kitchen for desktop and immersive WebXR; rendering/input stay outside React. */
export class ChefScene {
  // Wood is the approved PC/VR default. Other samples remain local previews only.
  private readonly labelStyle = (() => {
    const preview = import.meta.env.DEV ? new URLSearchParams(location.search).get('labels') : null
    return preview === 'menu' || preview === 'minimal' ? preview : 'wood'
  })()
  private readonly scene = new THREE.Scene()
  private readonly kitchen = new THREE.Group()
  private readonly world = new RestaurantSet()
  private readonly foods = new FoodModels()
  private readonly hall = new ChefHall()
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  private readonly camera = new THREE.PerspectiveCamera(48, 1, .05, 45)
  private readonly dolly = new THREE.Group()
  private readonly post: RestaurantPost
  private readonly env: THREE.WebGLRenderTarget
  private readonly geometry = new Set<THREE.BufferGeometry>()
  private readonly materials = new Set<THREE.Material>()
  private readonly textures = new Set<THREE.Texture>()
  private readonly pickables: THREE.Mesh[] = []
  private readonly ray = new THREE.Raycaster()
  private readonly v = new THREE.Vector3(); private readonly v2 = new THREE.Vector3(); private readonly q = new THREE.Quaternion()
  private readonly skewer = new THREE.Group(); private readonly assembled = new THREE.Group(); private readonly pass = new THREE.Group()
  private readonly halos = new Map<IngredientId, THREE.Group>()
  private readonly pantryGroups = new Map<IngredientId, THREE.Group>()
  private readonly board = document.createElement('canvas')
  private readonly boardTexture: THREE.CanvasTexture
  private readonly boardRoot = new THREE.Group()
  private readonly spatialControls = new THREE.Group()
  private readonly passFurniture = new THREE.Group()
  private readonly grillStation = new THREE.Group()
  private readonly clockHousing = new THREE.Group()
  private readonly passGlow = new THREE.Group()
  private readonly undoHint = new THREE.Group()
  private undoTarget!: THREE.Mesh
  private undoRing!: THREE.Mesh
  private submitHint!: THREE.Mesh
  private hover: Pick | null = null
  private pointerPosition: THREE.Vector2 | null = null
  private arrivals: { root: THREE.Group; started: number }[] = []
  private previousCompleted = 0
  private previousOrders: ChefJob[] = []
  private receiptMotion: { previous: ChefJob[]; started: number } | null = null
  private readonly receiptClips: THREE.Mesh[] = []
  private sound: AudioContext | null = null
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
  private readonly orderImages = new Map<string, HTMLImageElement>()
  private readonly timerCanvas = document.createElement('canvas')
  private readonly submitCanvas = document.createElement('canvas')
  private submitTexture!: THREE.CanvasTexture
  private readonly coopCanvas = document.createElement('canvas')
  private coopTexture?: THREE.CanvasTexture
  private coopPanel?: THREE.Group
  private actionSignature = ''; private feedback = ''; private feedbackUntil = 0
  private readonly timerTexture: THREE.CanvasTexture
  private readonly clock: THREE.Mesh
  private readonly previewControllers = new THREE.Group()
  private readonly controllers: THREE.XRTargetRaySpace[] = []
  private readonly held = new Map<number, Held>()
  private readonly onEndListeners: (() => void)[] = []
  private readonly observer: ResizeObserver
  private readonly marker: THREE.Mesh
  private view: ChefView; private mode: ChefMode; private disposed = false; private session: XRSession | null = null
  private owner: number | null = null; private signature = ''; private passSignature = ''; private boardSignature = ''; private timerSecond = -1; private last = 0; private frame = 0
  constructor(private host: HTMLElement, initial: ChefView, mode: ChefMode, private step: (dt: number) => ChefView, private action: (action: ChefAction) => void, private notice: (s: string) => void, private xrChanged: (active: boolean) => void) {
    this.view = initial; this.mode = mode; this.previousCompleted = initial.completed ?? 0; this.previousOrders = initial.visible.map(job => ({ ...job, recipe: [...job.recipe] }))
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = .9
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.xr.enabled = true; this.renderer.xr.setReferenceSpaceType('local-floor')
    this.renderer.domElement.setAttribute('role', 'img'); this.renderer.domElement.setAttribute('aria-label', '실제 3D 요리 주방과 여섯 가지 음식 재료')
    this.renderer.domElement.tabIndex = 0
    this.renderer.domElement.addEventListener('webglcontextlost', this.contextLost); this.renderer.domElement.addEventListener('pointerdown', this.pointer)
    this.renderer.domElement.addEventListener('pointermove', this.pointerMove); this.renderer.domElement.addEventListener('pointerleave', this.pointerLeave)
    host.append(this.renderer.domElement); this.scene.background = new THREE.Color('#b5c5b7'); this.scene.add(this.kitchen, this.dolly); this.kitchen.add(this.world.root)
    this.dolly.add(this.camera)
    const pmrem = new THREE.PMREMGenerator(this.renderer), room = new RoomEnvironment()
    this.env = pmrem.fromScene(room, .04); room.dispose(); pmrem.dispose(); this.scene.environment = this.env.texture; this.scene.environmentIntensity = .18
    this.scene.add(new THREE.HemisphereLight('#ffe8bf', '#4b3a28', 1.05))
    const key = new THREE.DirectionalLight('#ffe3b2', 2.5); key.position.set(-3, 7, 3); key.castShadow = true
    key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, far: 20 }); key.shadow.normalBias = .012
    const fill = new THREE.DirectionalLight('#cbd7d4', .45); fill.position.set(4, 5, -3); this.scene.add(key, fill)
    this.post = new RestaurantPost(this.renderer, this.scene, this.camera, .11)
    this.buildKitchen(); this.kitchen.add(this.hall.root, this.skewer, this.pass); this.skewer.position.copy(HOME); this.skewer.add(this.assembled)
    const stick = this.world.cylinder(.012, 2.6, '#ad763c'); stick.rotation.z = Math.PI / 2; this.skewer.add(stick)
    const handle = this.world.cylinder(.07, .42, '#744323'); handle.rotation.z = Math.PI / 2; this.world.place(this.skewer, handle, -1.51, 0, 0)
    this.hitBox(this.skewer, new THREE.Vector3(0, 0, 0), new THREE.Vector3(2.95, .17, .17), { action: 'stick' })
    const markerMat = new THREE.MeshBasicMaterial({ color: '#f6c965', transparent: true, opacity: .9 })
    this.marker = this.mesh(new THREE.TorusGeometry(.065, .006, 8, 36), markerMat); this.marker.rotation.y = Math.PI / 2; this.marker.position.copy(TIP); this.skewer.add(this.marker)
    this.hitBox(this.skewer, TIP, new THREE.Vector3(.24, .26, .26), { action: 'thread' })
    this.board.width = 1536; this.board.height = 720; this.boardTexture = this.texture(this.board)
    this.boardRoot.position.set(-.45, 2.35, -2.18); this.kitchen.add(this.boardRoot)
    this.world.place(this.boardRoot, this.world.box(4.18, .075, .10, '#6a4b32', .01), 0, .50, -.025)
    for (let i = 0; i < 2; i++) {
      const material = new THREE.MeshStandardMaterial({ color: '#6c6254', metalness: .55, roughness: .35 })
      const clip = this.mesh(new THREE.BoxGeometry(.16, .12, .045), material)
      this.world.place(this.boardRoot, clip, orderSlotX(i), .48, .065); this.receiptClips.push(clip)
    }
    const boardFace = this.mesh(new THREE.PlaneGeometry(3.97, 1.83), new THREE.MeshBasicMaterial({ map: this.boardTexture, toneMapped: false, transparent: true })); boardFace.position.z = .03; this.boardRoot.add(boardFace)
    for (let i = 0; i < 2; i++) this.hitBox(this.boardRoot, new THREE.Vector3(orderSlotX(i), .12, .04), new THREE.Vector3(1.82, .75, .06), { slot: i })
    this.timerCanvas.width = 1200; this.timerCanvas.height = 240; this.timerTexture = this.texture(this.timerCanvas)
    this.world.root.add(this.clockHousing); this.clockHousing.position.set(-.45, 3.18, -2.42)
    this.world.place(this.clockHousing, this.world.box(2.80, .59, .12, '#4c3424', .035), 0, 0, 0)
    for (const x of [-1.22, 1.22]) this.world.place(this.clockHousing, this.world.box(.055, .25, .07, '#795335'), x, .39, -.04)
    this.clock = this.mesh(new THREE.PlaneGeometry(2.65, .49), new THREE.MeshBasicMaterial({ map: this.timerTexture, toneMapped: false })); this.world.place(this.clockHousing, this.clock, 0, 0, .065)
    this.undoTarget = this.hitBox(this.skewer, new THREE.Vector3(), new THREE.Vector3(.29, .30, .30), { action: 'unthread' })
    this.undoRing = this.mesh(new THREE.TorusGeometry(.18, .008, 8, 32), new THREE.MeshBasicMaterial({ color: '#ffe4a0', toneMapped: false })); this.undoRing.position.z = .16; this.undoHint.add(this.undoRing)
    this.world.place(this.undoHint, this.sign('트리거 · 빼기', .65, .13), 0, .30, .10)
    this.skewer.add(this.undoHint)
    this.world.place(this.previewControllers, this.controllerModel(), -.72, 1.00, 1.28).rotation.set(-.5, .4, -.2)
    this.world.place(this.previewControllers, this.controllerModel(), 1.12, 1.05, 1.20).rotation.set(-.5, -.5, .2)
    this.kitchen.add(this.previewControllers); this.setupControllers(); this.setMode(mode)
    this.world.wood([this.world.material('#b77b43'), this.world.material('#825030'), this.world.material('#744323')], undefined, true)
    this.observer = new ResizeObserver(this.resize); this.observer.observe(host); this.resize()
    this.renderer.setAnimationLoop(this.render); host.dataset.ready = 'true'; host.dataset.geometry = 'live-three-kitchen'
  }
  private mesh(g: THREE.BufferGeometry, m: THREE.Material) { this.geometry.add(g); this.materials.add(m); const mesh = new THREE.Mesh(g, m); mesh.castShadow = mesh.receiveShadow = true; return mesh }
  private texture(canvas: HTMLCanvasElement) { const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy()); this.textures.add(texture); return texture }
  private sign(text: string, w: number, h: number, shortcut?: string, nameplate = false) {
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = Math.round(1024 * h / w)
    const texture = this.texture(canvas), ctx = canvas.getContext('2d')!
    const paint = () => {
      if (this.disposed) return
      const width = canvas.width, height = canvas.height
      if (nameplate && ['wood', 'menu', 'minimal'].includes(this.labelStyle ?? '')) {
        const style = this.labelStyle, key = /^\d$/.test(text), pad = height * .075
        ctx.clearRect(0, 0, width, height)
        if (style !== 'minimal') {
          ctx.fillStyle = style === 'wood' ? '#513728' : '#faf1df'
          ctx.fillRect(0, 0, width, height)
          ctx.strokeStyle = style === 'wood' ? '#b68b5c' : '#a58b6a'; ctx.lineWidth = height * .018
          ctx.strokeRect(pad, pad, width - 2 * pad, height - 2 * pad)
          if (style === 'wood') {
            ctx.strokeStyle = '#c59a6730'; ctx.lineWidth = 1
            for (let i = 1; i < 8; i++) { ctx.beginPath(); ctx.moveTo(0, i * height / 8); ctx.lineTo(width, i * height / 8 + 2); ctx.stroke() }
          }
        }
        const left = !key && text !== '전달대' ? height * .68 : pad, right = pad
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.font = `700 ${height * (key ? .65 : .51)}px "Malgun Gothic", sans-serif`
        if (style === 'minimal') { ctx.strokeStyle = '#33271e'; ctx.lineWidth = height * .035; ctx.lineJoin = 'round'; ctx.strokeText(text, left + (width - left - right) / 2, height * .52, width - left - right) }
        ctx.fillStyle = style === 'menu' ? '#3b3026' : '#fff0d0'
        ctx.fillText(text, left + (width - left - right) / 2, height * .52, width - left - right)
        texture.needsUpdate = true
        return
      }
      const wood = ctx.createLinearGradient(0, 0, 0, height)
      wood.addColorStop(0, '#f0d9af'); wood.addColorStop(.5, '#e6c99a'); wood.addColorStop(1, '#d9b985')
      ctx.fillStyle = wood; ctx.fillRect(0, 0, width, height)
      // Quiet horizontal grain: enough to read as a cedar plaque without competing with the name.
      ctx.strokeStyle = '#8f602b12'; ctx.lineWidth = 1.5
      for (let i = 0; i < 14; i++) {
        const y = (i + .5) * height / 14
        ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(width * .3, y - 5, width * .7, y + 6, width, y - 2); ctx.stroke()
      }
      ctx.fillStyle = '#36251b'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.font = `700 ${Math.round(height * .61)}px ChefMyeongjo, "Malgun Gothic", serif`
      const left = shortcut ? height * .70 : width * .07, right = width * .07
      ctx.fillText(text, left + (width - left - right) / 2, height * .53, width - left - right)
      if (shortcut) {
        const size = height * .40, x = height * .17, y = (height - size) / 2
        ctx.fillStyle = '#a4402e'; ctx.fillRect(x, y, size, size)
        ctx.strokeStyle = '#efc6a9'; ctx.lineWidth = 2; ctx.strokeRect(x + 5, y + 5, size - 10, size - 10)
        ctx.fillStyle = '#fff1d6'; ctx.font = `700 ${Math.round(size * .72)}px "Malgun Gothic", sans-serif`
        ctx.fillText(shortcut, x + size / 2, height * .51, size * .8)
      }
      texture.needsUpdate = true
    }
    paint()
    // Canvas does not repaint automatically when the bundled Korean font finishes loading.
    void document.fonts.load('700 120px ChefMyeongjo').then(paint).catch(() => undefined)
    const face = this.mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false, transparent: nameplate && this.labelStyle === 'minimal' }))
    face.castShadow = false; face.receiveShadow = false
    return face
  }
  private hitBox(parent: THREE.Object3D, p: THREE.Vector3, size: THREE.Vector3, pick: Pick) {
    const target = this.mesh(new THREE.BoxGeometry(size.x, size.y, size.z), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }))
    target.castShadow = target.receiveShadow = false; target.position.copy(p); target.userData.pick = pick; parent.add(target); this.pickables.push(target); return target
  }
  private counterSign(text: string, width: number, height: number, x: number, z: number, parent: THREE.Group = this.world.root, shortcut?: string) {
    const alternative = ['wood', 'menu', 'minimal'].includes(this.labelStyle ?? '')
    const a = this.world, tilt = alternative ? -.3 : -.6, footHeight = .035
    const stand = a.place(parent, new THREE.Group(), x, COUNTER_TOP, z)
    if (this.labelStyle !== 'minimal') a.place(stand, a.box(width + .025, footHeight, .15, '#68452d', .01), 0, footHeight / 2, 0)
    // Anchor the bottom edge above the counter, including the tilted backing's thickness.
    const centerY = footHeight + height / 2 * Math.cos(tilt) + .012
    const back = a.place(stand, this.labelStyle === 'minimal' ? new THREE.Group() : a.box(width + .012, height + .012, .024, alternative ? '#68452d' : '#ac7d49', .006), 0, centerY, 0)
    back.rotation.x = tilt
    const label = this.sign(text, width, height, shortcut, true)
    label.position.z = .015; back.add(label)
    return new THREE.Vector3(x, COUNTER_TOP + centerY, z)
  }
  private buildKitchen() {
    const a = this.world, r = a.root
    // An enclosed kitchen with one serving hatch. The park is visible only beyond
    // that hatch, including when the headset turns toward a side or rear wall.
    a.place(r, a.box(9.2, .12, 9.2, '#744323'), 0, -.07, 1)
    for (const side of [-1, 1]) {
      const wall = a.place(r, a.box(.22, 6.8, 9.2, '#c9b99b'), side * 4.55, 3.4, 1)
      wall.castShadow = false
      a.place(r, a.box(.25, 1.05, 9.2, '#67452f'), side * 4.51, .525, 1)
      a.place(r, a.box(.27, .08, 9.2, '#916b43'), side * 4.50, 1.08, 1)
      // Solid front wings join the side walls; shelves sit against these walls.
      const wing = a.place(r, a.box(1.4, 6.8, .24, '#c9b99b'), side * 3.9, 3.4, -3.5)
      wing.castShadow = false
      for (const z of [-3.4, .4, 4.4]) a.place(r, a.box(.16, 6.8, .16, '#67452f'), side * 4.39, 3.4, z)
    }
    const lintel = a.place(r, a.box(6.4, 3.3, .24, '#c9b99b'), 0, 5.15, -3.5)
    lintel.castShadow = false
    a.place(r, a.box(6.4, .70, .24, '#67452f'), 0, .35, -3.5)
    a.place(r, a.box(6.55, .08, .30, '#916b43'), 0, .74, -3.4)
    const rear = this.mesh(new THREE.PlaneGeometry(9.2, 6.8), new THREE.MeshStandardMaterial({ color: '#c9b99b', roughness: .8 }))
    rear.rotation.y = Math.PI; rear.castShadow = false
    a.place(r, rear, 0, 3.4, 5.5)
    // Only the interior face renders: the responsive desktop camera can rise
    // above the ceiling without a roof obscuring the workbench.
    const ceiling = this.mesh(new THREE.PlaneGeometry(9.2, 9.2), new THREE.MeshStandardMaterial({ color: '#b19b78', roughness: .8 }))
    ceiling.rotation.x = Math.PI / 2; ceiling.castShadow = false
    a.place(r, ceiling, 0, 6.8, 1)
    for (const x of [-4.4,4.4]) a.place(r, a.box(.3, 3.6, .16, '#b49b74'), x, 1.8, -3.5)
    for (const x of [-4.3, 4.3]) a.place(r, a.box(.12, 3.7, .22, '#633b23'), x, 1.8, -3.38)
    a.place(r, a.box(8.6, .12, .23, '#633b23'), 0, 3.15, -3.38)
    for (const x of [-3.8, 3.8]) {
      // Open shelves and tiled prep alcoves frame the view without closing off the hall.
      a.place(r, a.box(1.48, 2.2, .12, '#ded4b9'), x, 2.05, -3.40)
      for (let row = 0; row < 6; row++) for (let col = 0; col < 4; col++)
        a.place(r, a.box(.35, .32, .025, (row + col) % 4 ? '#e4ddc8' : '#c7cdb9', .007), x - .55 + col * .365, 1.15 + row * .34, -3.325)
      // Shallow shelves with one level front edge: avoid a deep diagonal side
      // silhouette at the edges of the wide kitchen view.
      for (const y of [2.35, 3.05]) {
        a.place(r, a.box(1.48, .06, .44, '#744323', .008), x, y, -3.10)
        a.place(r, a.box(1.48, .11, .035, '#825030', .005), x, y - .025, -2.875)
      }
      a.dishes(r, x - .42, 2.40, -3.10, 5, .8)
      a.bowl(r, x + .08, 2.4, -3.10, .9)
      a.jar(r, x + .48, 2.4, -3.10, .6, '#927046')
      a.jar(r, x - .35, 3.09, -3.10, .75, '#d3c0a0')
      a.jar(r, x + .2, 3.09, -3.10, .8, '#6b775e')
      a.tools(r, x, 2.18, -3.05, .85)
      a.place(r, a.box(1.42, .93, .76, '#254735'), x, .47, -2.95)
      a.place(r, a.box(1.48, .08, .90, '#b77b43'), x, .97, -2.9)
      a.pot(r, x + .28, 1.02, -2.9, 1.1)
      a.place(r, a.box(.55, .035, .40, '#c5965f'), x - .4, 1.03, -2.85)
      const strip = a.place(r, a.box(1.25, .025, .08, '#ffdea0'), x, 2.27, -2.96)
      strip.material = a.material('#ffdea0'); strip.material.emissive.set('#ffd49a'); strip.material.emissiveIntensity = .7
    }
    for (const x of [-3.5, 3.5]) { a.lantern(r, x, 2.3, -2.1, 1.1); a.place(r, new THREE.PointLight('#ffbd70', 3, 4, 2), x, 2.2, -1.9) }
    const lanternShade = a.material('#efbc70', 0, .6); lanternShade.color.set('#c44b31'); lanternShade.emissive.set('#ef6527'); lanternShade.emissiveIntensity = .55
    a.place(r, a.box(8.6, .12, .15, '#664028'), 0, 3.5, -3.2)
    a.place(r, a.box(7.2, .90, 2.65, '#825030'), 0, .45, -.22)
    a.place(r, a.box(7.45, .12, 2.85, '#b77b43', .04), 0, .96, -.22)
    for (const x of [-2.8, -1.4, 0, 1.4, 2.8]) { a.place(r, a.box(1.22, .62, .04, '#744323'), x, .45, 1.12); a.place(r, a.box(.27, .025, .04, '#d4b47b'), x, .66, 1.16) }
    // A dark ceramic plate separates pale shrimp/cheese from the warm wooden counter.
    a.place(r, a.box(3.65, .065, .84, '#454c48', .055), -.20, 1.05, .47)
    a.place(r, a.box(3.78, .05, .94, '#333c38', .055), -.20, 1.01, .47)
    for (const x of [-1.23, 1.10]) { a.place(r, a.cylinder(.025, .14, '#a88b56'), x, 1.15, .48); a.place(r, a.box(.16, .025, .10, '#a88b56', .015), x, 1.23, .48) }
    for (const [i, item] of INGREDIENTS.entries()) {
      const x = -2.52 + i * .87, z = -.63
      const station = a.place(r, new THREE.Group(), x, 0, 0)
      this.pantryGroups.set(item.id, station)
      const bowl = a.place(station, new THREE.Group(), 0, 1.02, z)
      a.place(bowl, a.box(.79, .12, .68, '#d1bd96', .055), 0, .02, 0)
      a.place(bowl, a.box(.71, .015, .60, '#f4e6c9', .03), 0, .085, 0)
      for (const side of [-1, 1]) { a.place(bowl, a.box(.79, .17, .04, '#eadfc7', .012), 0, .14, side * .32); a.place(bowl, a.box(.04, .17, .64, '#eadfc7', .012), side * .375, .14, 0) }
      for (let j = 0; j < 7; j++) {
        const food = this.foods.create(item.id); food.scale.setScalar(1.75); food.rotation.set(.2, j % 2 ? .2 : -.3, 0)
        a.place(bowl, food, (j % 3 - 1) * .19, .18 + Math.floor(j / 3) * .035, (Math.floor(j / 3) - 1) * .15)
      }
      this.counterSign(item.name, .75, .21, 0, -.17, station)
      const number = this.sign(String(i + 1), .14, .14, undefined, true)
      const alternative = ['wood', 'menu', 'minimal'].includes(this.labelStyle ?? '')
      number.rotation.x = alternative ? -.3 : -.6; a.place(r, number, x - .29, alternative ? 1.17 : 1.16, -.09)
      const ring = a.place(station, new THREE.Group(), 0, 1.25, z)
      const gold = new THREE.MeshBasicMaterial({ color: '#ffd468', toneMapped: false })
      for (const side of [-1, 1]) { a.place(ring, this.mesh(new THREE.BoxGeometry(.83, .014, .016), gold), 0, 0, side * .352); a.place(ring, this.mesh(new THREE.BoxGeometry(.016, .014, .72), gold), side * .406, 0, 0) }
      this.halos.set(item.id, ring)
      this.hitBox(station, new THREE.Vector3(0, 1.25, z), new THREE.Vector3(.80, .36, .70), { ingredient: item.id })
    }
    a.chopsticks(r, -3.25, 1.02, -.9, 1.2); a.dishes(r, -3.27, 1.02, .1, 5, 1.0)
    r.add(this.grillStation)
    const grill = a.place(this.grillStation, a.box(.85, .12, 1.1, '#303a34'), 3.0, 1.06, .35)
    for (let i = 0; i < 9; i++) a.place(grill, a.box(.027, .025, .93, '#9c9c85'), -.34 + i * .085, .08, 0)
    a.pot(this.grillStation, 3.15, 1.02, .95, .7)
    r.add(this.passFurniture)
    const pass = a.place(this.passFurniture, a.box(1.65, .09, .77, '#744323'), 2.59, 1.10, -1.22)
    for (const x of [-.41, .41]) {
      a.place(pass, a.box(.75, .045, .53, '#eee1c4', .025), x, .08, 0)
      const glow = a.place(this.passGlow, new THREE.Group(), 2.59 + x, 1.21, -1.22)
      const gold = new THREE.MeshBasicMaterial({ color: '#efca85', toneMapped: false })
      for (const side of [-1, 1]) {
        a.place(glow, this.mesh(new THREE.BoxGeometry(.77, .012, .014), gold), 0, 0, side * .28)
        a.place(glow, this.mesh(new THREE.BoxGeometry(.014, .012, .56), gold), side * .385, 0, 0)
      }
    }
    const passSign = a.place(this.passFurniture, this.labelStyle === 'minimal' ? new THREE.Group() : a.box(.73, .20, .045, this.labelStyle === 'wood' || this.labelStyle === 'menu' ? '#68452d' : '#ac7d49', .012), 2.59, 1.49, -1.48)
    a.place(passSign, this.sign('전달대', .70, .18, undefined, true), 0, 0, .025)
    if (this.labelStyle !== 'minimal') for (const x of [-.27, .27]) a.place(this.passFurniture, a.box(.035, .24, .04, '#68452d'), 2.59 + x, 1.28, -1.49)
    this.passFurniture.add(this.spatialControls); this.spatialControls.add(this.passGlow)
    this.submitCanvas.width = 768; this.submitCanvas.height = 190; this.submitTexture = this.texture(this.submitCanvas)
    this.submitHint = this.mesh(new THREE.PlaneGeometry(1.12, .28), new THREE.MeshBasicMaterial({ map: this.submitTexture, transparent: true, side: THREE.DoubleSide, toneMapped: false })); a.place(this.spatialControls, this.submitHint, 2.59, 1.96, -1.10)
    this.hitBox(this.spatialControls, new THREE.Vector3(2.59, 1.30, -1.22), new THREE.Vector3(1.65, .27, .75), { action: 'submit' })
    if (this.view.cooperative) {
      this.coopCanvas.width = 768; this.coopCanvas.height = 190; this.coopTexture = this.texture(this.coopCanvas)
      this.coopPanel = new THREE.Group(); r.add(this.coopPanel)
      const greeting = this.mesh(new THREE.PlaneGeometry(1.6, .32), new THREE.MeshBasicMaterial({ map: this.coopTexture, toneMapped: false }))
      a.place(this.coopPanel, greeting, 2.59, 1.76, -1.43)
      this.hitBox(this.coopPanel, new THREE.Vector3(2.59, 1.76, -1.43), new THREE.Vector3(1.65, .33, .12), { action: 'coop' })
    }
  }
  private recipe(ids: readonly IngredientId[], scale: number) {
    const group = new THREE.Group(), positions = foodPositions(ids)
    for (const [i, id] of ids.entries()) { const food = this.foods.create(id); food.scale.setScalar(scale * assembledFoodScale(ids)); food.position.x = (positions[i] + .06) * scale; group.add(food) }
    group.traverse(o => { if (o instanceof THREE.Mesh) o.castShadow = true }); return group
  }
  private paintBoard() {
    const ctx = this.board.getContext('2d')!, v = this.view, presentation = chefPresentation(v)
    ctx.clearRect(0, 0, 1536, 720)
    const result = v.cooperative?.result
    if (result) {
      ctx.fillStyle = '#f5ecda'; ctx.fillRect(0, 0, 1536, 720)
      ctx.fillStyle = '#463324'; ctx.textAlign = 'center'; ctx.font = '700 74px "Malgun Gothic",sans-serif'; ctx.fillText('영업 완료!', 768, 160)
      ctx.font = '700 105px "Malgun Gothic",sans-serif'; ctx.fillText(`팀 점수 ${result.score.toLocaleString('ko-KR')}점`, 768, 310, 1400)
      ctx.font = '700 43px "Malgun Gothic",sans-serif'; ctx.fillText(result.reward, 768, 425, 1400); ctx.fillText(result.ranking, 768, 510, 1400)
      ctx.font = '700 35px "Malgun Gothic",sans-serif'; ctx.fillText('오른쪽 「공원으로」 버튼을 선택해요', 768, 640, 1400)
      this.boardTexture.needsUpdate = true; return
    }
    const drawReceipt = (job: ChefJob | undefined, slot: number, alpha = 1, dy = 0) => {
      const x = 36 + slot * 768, selected = !!job && job.id === v.selectedJob
      ctx.save(); ctx.globalAlpha = alpha; ctx.translate(0, dy)
      ctx.fillStyle = job ? '#fff7e8' : '#e1d8c8'
      ctx.beginPath(); ctx.moveTo(x, 164); ctx.lineTo(x + 696, 164); ctx.lineTo(x + 696, 452)
      for (let edge = 696; edge >= 0; edge -= 16) { ctx.lineTo(x + edge - 8, 464); ctx.lineTo(x + Math.max(0, edge - 16), 452) }
      ctx.closePath(); ctx.fill()
      if (selected) {
        ctx.strokeStyle = '#b78036'; ctx.lineWidth = 5; ctx.stroke()
        ctx.fillStyle = '#d2a45b'; ctx.fillRect(x, 164, 696, 7)
      }
      if (!job) {
        ctx.textAlign = 'center'; ctx.fillStyle = '#79674f'; ctx.font = '500 34px "Malgun Gothic",sans-serif'
        ctx.fillText('주문표를 기다려요', x + 348, 330); ctx.restore(); return
      }
      // A table number and the actual assembled skewer are the only receipt contents.
      ctx.fillStyle = selected ? '#80572f' : '#706252'; ctx.beginPath(); ctx.roundRect(x + 20, 182, 80, 55, 10); ctx.fill()
      ctx.textAlign = 'center'; ctx.fillStyle = '#fff5df'; ctx.font = '700 43px "Malgun Gothic",sans-serif'
      ctx.fillText(String(job.table).padStart(2, '0'), x + 60, 225)
      const key = job.recipe.join(','); let image = this.orderImages.get(key)
      if (!image) {
        image = new Image(); this.orderImages.set(key, image)
        image.onload = () => { if (!this.disposed) this.paintBoard() }
        image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(menuSkewerIllustration(job.recipe, false, true))
      }
      if (image.complete && image.naturalWidth) {
        const scale = Math.min(670 / image.naturalWidth, 208 / image.naturalHeight)
        const width = image.naturalWidth * scale, height = image.naturalHeight * scale
        ctx.drawImage(image, x + (696 - width) / 2, 238 + (208 - height) / 2, width, height)
      }
      ctx.restore()
    }
    const motion = this.receiptMotion
    if (motion) {
      const t = Math.min(1, (performance.now() - motion.started) / 480), out = Math.min(1, t / .38)
      motion.previous.forEach((job, slot) => {
        if (!v.visible.some(next => next.id === job.id)) drawReceipt(job, slot, 1 - out, -150 * out)
      })
      const enter = Math.max(0, (t - .38) / .62), ease = 1 - Math.pow(1 - enter, 3)
      for (let i = 0; i < 2; i++) {
        const job = v.visible[i], previousSlot = job ? motion.previous.findIndex(old => old.id === job.id) : -1
        if (previousSlot >= 0) drawReceipt(job, previousSlot + (i - previousSlot) * ease)
        else drawReceipt(job, i, ease, -45 * (1 - ease))
      }
    } else for (let i = 0; i < 2; i++) drawReceipt(v.visible[i], i)
    const coop = v.cooperative
    const routine = /하나를 (꽂|뺐)|주문표를 선택|접시.*(놓았|제출했|수령했)/.test(v.message)
    const status = coop?.speech ? '어서 오세요!' : this.feedback || (presentation.blocked ? presentation.title : routine ? '' : v.message)
    if (status) {
      ctx.fillStyle = '#f9edda'; ctx.beginPath(); ctx.roundRect(200, 490, 1136, 58, 14); ctx.fill()
      ctx.fillStyle = '#69492f'; ctx.font = '700 30px "Malgun Gothic",sans-serif'; ctx.textAlign = 'center'; ctx.fillText(status, 768, 529, 1080)
    }
    this.boardTexture.needsUpdate = true
    this.host.dataset.orderImageCount = String([...this.orderImages.values()].filter(image => image.complete && image.naturalWidth).length)
  }
  private showNotice(text: string) { this.feedback = text; this.feedbackUntil = performance.now() + 4000; this.notice(text) }
  private paintActions() {
    const p = chefPresentation(this.view), coop = this.view.cooperative
    const coopLabel = coop?.phase === 'FINISHED' ? '공원으로' : coop?.paused ? '연결 복구 중' : coop?.greeting ? coop.answered ? '친구의 인사 대기' : '어서 오세요!' : coop?.phase === 'WAITING' ? '준비 완료' : '함께 영업 중'
    const signature = `${this.mode}:${!!this.session}:${p.submitLabel}:${p.submitReady}:${this.view.pass.length}:${coopLabel}`
    if (signature === this.actionSignature) return
    this.actionSignature = signature
    const paint = (canvas: HTMLCanvasElement, texture: THREE.CanvasTexture, label: string, sub: string, active: boolean) => {
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = active ? '#a84d32' : '#62452f'; ctx.fillRect(0, 0, 768, 190)
      ctx.strokeStyle = active ? '#d4916c' : '#9c7854'; ctx.lineWidth = 8; ctx.strokeRect(4, 4, 760, 182)
      ctx.fillStyle = active ? '#fff0d1' : '#ead8b9'; ctx.textAlign = 'center'; ctx.font = '700 53px "Malgun Gothic",sans-serif'; ctx.fillText(label, 384, 85, 720)
      ctx.font = '700 30px "Malgun Gothic",sans-serif'; ctx.fillText(sub, 384, 144, 720); texture.needsUpdate = true
    }
    paint(this.submitCanvas, this.submitTexture, p.submitReady ? '완성 접시 놓기' : p.submitLabel, `트리거 · 전달대 ${this.view.pass.length} / 2`, p.submitReady)
    if (this.coopTexture) paint(this.coopCanvas, this.coopTexture, coopLabel, coop?.phase === 'PLAYING' && !coop.greeting ? '완성한 접시를 전달해요' : '트리거로 선택', !!coop?.greeting && !coop.answered && !coop.paused)
  }
  private paintClock() {
    const ctx = this.timerCanvas.getContext('2d')!, s = Math.ceil(this.view.seconds)
    ctx.clearRect(0, 0, 1200, 240)
    ctx.fillStyle = '#302c27'; ctx.beginPath(); ctx.roundRect(4, 4, 1192, 232, 24); ctx.fill()
    ctx.strokeStyle = '#9b744e'; ctx.lineWidth = 5; ctx.stroke()
    const entries = [
      ['남은 시간', String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0')],
      ['팀 점수', (this.view.cooperative?.score ?? 0).toLocaleString('ko-KR') + '점'],
      ['요리 완료', String(this.view.completed ?? 0) + '개'],
    ]
    entries.forEach(([label, value], i) => {
      const x = 200 + i * 400
      ctx.textAlign = 'center'; ctx.fillStyle = '#d1bd96'; ctx.font = '30px "Malgun Gothic",sans-serif'; ctx.fillText(label, x, 66)
      ctx.fillStyle = '#ffe8ba'; ctx.font = '700 72px "Malgun Gothic",sans-serif'; ctx.fillText(value, x, 164, 360)
      if (i > 0) { ctx.strokeStyle = '#766044'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(i * 400, 38); ctx.lineTo(i * 400, 196); ctx.stroke() }
    })
    this.timerTexture.needsUpdate = true
  }

  setMode(mode: ChefMode) {
    this.mode = mode
    this.passFurniture.position.set(.15, .05, 1.5)
    this.pass.position.copy(this.passFurniture.position)
    this.grillStation.visible = false
    if (this.session) return
    const bounds = this.host.getBoundingClientRect(), fit = Math.max(1, 1.5 / Math.max(.25, bounds.width / Math.max(1, bounds.height)))
    // Keep the preview camera and target on the same X axis so horizontal
    // shelving stays horizontal. Immersive XR still uses the headset pose.
    this.dolly.position.set(0, 0, 0); this.camera.position.set(.15, 2.35, 3.25)
    const targetY = 1.35
    this.camera.position.sub(this.v.set(.15, targetY, -.55)).multiplyScalar(fit).add(this.v); this.camera.lookAt(.15, targetY, -.55)
    this.camera.fov = 65; this.camera.updateProjectionMatrix(); this.host.dataset.mode = mode
  }
  private activate(pick: Pick) {
    if (chefPresentation(this.view).blocked && !('action' in pick && pick.action === 'coop')) return
    if ('ingredient' in pick) this.action({ type: 'select', ingredient: pick.ingredient })
    else if ('slot' in pick) { if (this.receiptMotion) return; const job = this.view.visible[pick.slot]; if (job) this.action({ type: 'choose', id: job.id }) }
    else if (pick.action === 'coop') {
      if (this.view.cooperative?.phase === 'FINISHED') this.action({ type: 'exit' })
      else if (this.view.cooperative?.greeting && !this.view.cooperative.answered) this.action({ type: 'greet' })
      else if (this.view.cooperative?.phase === 'WAITING') this.action({ type: 'ready' })
    }
    else if (pick.action !== 'stick') this.action({ type: pick.action })
  }
  private pointer = (event: PointerEvent) => {
    if (event.button !== 0 || this.session) return
    this.unlockSound()
    const r = this.renderer.domElement.getBoundingClientRect(); this.ray.setFromCamera(new THREE.Vector2((event.clientX - r.left) / r.width * 2 - 1, 1 - (event.clientY - r.top) / r.height * 2), this.camera)
    const hit = this.ray.intersectObjects(this.visiblePickables(), false)[0]; if (hit) this.activate(hit.object.userData.pick)
  }
  private pointerMove = (event: PointerEvent) => {
    const r = this.renderer.domElement.getBoundingClientRect()
    this.pointerPosition = new THREE.Vector2((event.clientX - r.left) / r.width * 2 - 1, 1 - (event.clientY - r.top) / r.height * 2)
  }
  private pointerLeave = () => { this.pointerPosition = null }
  private unlockSound() {
    try {
      this.sound ??= new AudioContext()
      if (this.sound.state === 'suspended') void this.sound.resume().catch(() => undefined)
    } catch { /* Sound must never prevent interaction. */ }
  }
  private completionSound() {
    if (!this.sound || this.sound.state !== 'running') return
    for (const [delay, frequency] of [[0, 660], [.09, 880]]) {
      const oscillator = this.sound.createOscillator(), gain = this.sound.createGain(), start = this.sound.currentTime + delay
      oscillator.type = 'sine'; oscillator.frequency.value = frequency
      gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(.025, start + .01); gain.gain.exponentialRampToValueAtTime(.0001, start + .15)
      oscillator.connect(gain); gain.connect(this.sound.destination); oscillator.start(start); oscillator.stop(start + .16)
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect() }
    }
  }
  private updateSpatialFocus(now: number) {
    const vr = this.mode === 'vr' || !!this.session, p = chefPresentation(this.view)
    const lastPosition = foodPositions(this.view.skewer).at(-1)
    this.undoTarget.visible = vr && !p.blocked && lastPosition !== undefined
    if (lastPosition !== undefined) {
      this.undoTarget.position.set((lastPosition + .06) * 2.1, .02, .04)
      this.undoHint.position.copy(this.undoTarget.position)
    }
    this.scene.updateMatrixWorld(true)
    this.hover = null
    if (vr && this.session) {
      for (let i = 0; i < this.controllers.length; i++) {
        if (this.held.has(i)) continue
        const hit = this.controllerHit(i)
        if (hit) { this.hover = hit.object.userData.pick; if (this.hover && 'action' in this.hover) break }
      }
    } else if (vr && this.pointerPosition) {
      this.ray.setFromCamera(this.pointerPosition, this.camera)
      this.hover = this.ray.intersectObjects(this.visiblePickables(), false)[0]?.object.userData.pick ?? null
    }
    const focusedAction = this.hover && 'action' in this.hover ? this.hover.action : ''
    this.undoHint.visible = this.undoTarget.visible && focusedAction === 'unthread'
    this.submitHint.visible = vr && focusedAction === 'submit'
    this.passGlow.children.forEach((slot, i) => { slot.visible = vr && i >= this.view.pass.length && (p.submitReady || focusedAction === 'submit') })
    this.host.dataset.focusedAction = focusedAction
    this.host.dataset.completed = String(this.view.completed ?? 0)
    this.host.dataset.passCount = String(this.view.pass.length)
    for (const arrival of this.arrivals) {
      const progress = this.reducedMotion.matches ? 1 : Math.min(1, (now - arrival.started) / 360)
      arrival.root.position.y = Math.sin(progress * Math.PI) * .15
      arrival.root.position.z = (1 - progress) * .28
    }
    this.arrivals = this.arrivals.filter(arrival => now - arrival.started < 360)
  }
  private visiblePickables() { return this.pickables.filter(mesh => { for (let o: THREE.Object3D | null = mesh; o; o = o.parent) if (!o.visible) return false; return true }) }
  private controllerModel() {
    const a = this.world, root = new THREE.Group(); const grip = a.cylinder(.035, .16, '#e5e4dc', .045); grip.rotation.x = .25; a.place(root, grip, 0, -.07, .025)
    a.place(root, a.box(.09, .035, .12, '#252c2b', .02), 0, .01, 0)
    const ring = this.mesh(new THREE.TorusGeometry(.105, .012, 8, 28), a.material('#eeede5')); ring.rotation.x = -.45; a.place(root, ring, 0, .075, -.06)
    a.place(root, a.cylinder(.012, .01, '#858b84'), -.02, .035, 0); return root
  }
  private setupControllers() {
    for (let i = 0; i < 2; i++) {
      const c = this.renderer.xr.getController(i); this.controllers.push(c); this.dolly.add(c)
      const grip = this.renderer.xr.getControllerGrip(i); grip.add(this.controllerModel()); this.dolly.add(grip)
      const line = this.mesh(new THREE.CylinderGeometry(.0015, .0015, 1, 6), new THREE.MeshBasicMaterial({ color: '#7cc9df', transparent: true, opacity: .65 })); line.rotation.x = Math.PI / 2; line.position.z = -.5; c.add(line)
      const start = () => {
        if (this.owner === i || this.held.has(i)) return
        const hit = this.controllerHit(i), pick = hit?.object.userData.pick as Pick | undefined
        if (!pick) return
        if ('ingredient' in pick) {
          if (chefPresentation(this.view).blocked || availablePieces(this.view.skewer, pick.ingredient) <= 0 || !this.view.visible.length) return
          const root = this.foods.create(pick.ingredient); root.scale.setScalar(2.1 * this.kitchen.scale.x); root.rotation.y = Math.PI / 2; root.position.z = -.18; c.add(root); this.held.set(i, { ingredient: pick.ingredient, root }); this.action({ type: 'select', ingredient: pick.ingredient })
          this.showNotice('재료를 꼬치 끝에 맞추고, 고리가 초록색일 때 트리거를 놓으세요.')
        } else this.activate(pick)
      }
      const end = () => {
        const held = this.held.get(i); if (!held) return
        const good = this.heldReady(held), p = chefPresentation(this.view)
        held.root.removeFromParent(); this.held.delete(i)
        if (p.blocked) this.showNotice(p.title)
        else if (good) { this.feedback = ''; this.action({ type: 'thread', ingredient: held.ingredient }) }
        else this.showNotice('꼬치 끝에 재료의 중심과 방향을 맞춰 주세요.')
      }
      const grab = () => { const pick = this.controllerHit(i)?.object.userData.pick as Pick | undefined; if (pick && 'action' in pick && pick.action === 'stick' && this.owner === null && !this.held.has(i)) { c.attach(this.skewer); this.skewer.rotation.set(0, 0, 0); this.skewer.position.set(1.51 * this.kitchen.scale.x, 0, -.12); this.owner = i } }
      const release = () => { if (this.owner === i) this.returnStick() }
      const disconnect = () => { this.held.get(i)?.root.removeFromParent(); this.held.delete(i); release(); if (this.session) this.showNotice('컨트롤러 연결을 확인해 주세요.') }
      c.addEventListener('selectstart', start); c.addEventListener('selectend', end); c.addEventListener('squeezestart', grab); c.addEventListener('squeezeend', release); c.addEventListener('disconnected', disconnect)
      this.onEndListeners.push(() => { c.removeEventListener('selectstart', start); c.removeEventListener('selectend', end); c.removeEventListener('squeezestart', grab); c.removeEventListener('squeezeend', release); c.removeEventListener('disconnected', disconnect) })
    }
  }
  private returnStick() { this.kitchen.attach(this.skewer); this.skewer.position.copy(HOME); this.skewer.rotation.set(0, 0, 0); this.skewer.scale.setScalar(1); this.owner = null }
  private heldReady(held: Held) {
    held.root.getWorldPosition(this.v); this.skewer.localToWorld(this.v2.copy(TIP)); const d = this.v.distanceTo(this.v2)
    held.root.getWorldQuaternion(this.q); const foodAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(this.q)
    this.skewer.getWorldQuaternion(this.q); const stickAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(this.q)
    return insertionReady(d, foodAxis.dot(stickAxis))
  }
  private controllerHit(index: number) {
    const c = this.controllers[index]; c.updateWorldMatrix(true, false); c.getWorldPosition(this.v); c.getWorldQuaternion(this.q)
    this.ray.set(this.v, this.v2.set(0, 0, -1).applyQuaternion(this.q)); this.ray.far = 5; return this.ray.intersectObjects(this.visiblePickables(), false)[0]
  }
  async enterVR() {
    if (this.session) { await this.session.end(); return }
    if (!window.isSecureContext || !navigator.xr) throw new Error('VR은 보안 주소와 WebXR 지원 브라우저가 필요해요. 현재 화면에서는 VR 시점을 미리 볼 수 있어요.')
    this.unlockSound()
    const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor'] })
    if (this.disposed) { await session.end(); return }
    this.session = session; session.addEventListener('end', this.sessionEnded)
    // Authored desktop units become a 1 m-high counter and ~1 m skewer in physical XR meters.
    this.kitchen.scale.setScalar(.4); this.kitchen.position.y = .62
    this.dolly.position.set(0, 0, .95); this.camera.position.set(0, 0, 0); this.camera.rotation.set(0, 0, 0)
    try { await this.renderer.xr.setSession(session); this.renderer.xr.setFoveation(1); this.xrChanged(true); this.timerSecond = -1 }
    catch (e) { await session.end().catch(() => undefined); this.sessionEnded(); throw e }
  }
  private sessionEnded = () => {
    this.session?.removeEventListener('end', this.sessionEnded); this.session = null; this.held.forEach(h => h.root.removeFromParent()); this.held.clear(); this.returnStick(); this.kitchen.scale.setScalar(1); this.kitchen.position.y = 0; this.setMode(this.mode); this.timerSecond = -1; this.xrChanged(false); this.resize()
  }
  private project(name: string, x: number, y: number, z: number) { this.v.set(x, y, z).project(this.camera); this.host.style.setProperty(`--chef-${name}-x`, `${(this.v.x + 1) * 50}%`); this.host.style.setProperty(`--chef-${name}-y`, `${(1 - this.v.y) * 50}%`) }
  private resize = () => { if (this.session || this.disposed) return; const { width, height } = this.host.getBoundingClientRect(); if (!height) return; this.setMode(this.mode); this.camera.aspect = width / height; this.camera.updateProjectionMatrix(); this.renderer.setSize(width, height, false); this.post.resize(width, height) }
  private contextLost = (e: Event) => { e.preventDefault(); this.showNotice('3D 화면 연결이 중단됐어요. 새로고침해 주세요.') }
  private render = () => {
    if (this.disposed) return
    const now = performance.now(), dt = this.last ? Math.min(.1, (now - this.last) / 1000) : 0; this.last = now
    this.view = this.step(this.session && this.session.visibilityState !== 'visible' ? 0 : dt)
    const v = this.view, signature = v.skewer.join(',')
    if (signature !== this.signature) { this.signature = signature; this.assembled.clear(); this.assembled.add(this.recipe(v.skewer, 2.1)) }
    const passSignature = v.pass.map(d => d.id).join(',')
    if (passSignature !== this.passSignature) {
      const previousIds = new Set(this.passSignature.split(','))
      this.passSignature = passSignature; this.pass.clear(); this.arrivals = []
      v.pass.forEach((dish, i) => {
        const arrival = new THREE.Group(); this.pass.add(arrival)
        this.world.place(arrival, this.world.box(.72, .025, .49, '#f5e8cf', .025), 2.18 + i * .82, 1.235, -1.22)
        const scale = .54, root = this.recipe(dish.recipe, scale), positions = foodPositions(dish.recipe)
        const center = ((positions[0] + positions.at(-1)!) / 2 + .06) * scale
        root.position.set(2.18 + i * .82 - center, 1.29, -1.22); arrival.add(root)
        const number = this.sign(`${String(dish.table).padStart(2, '0')}번`, .27, .15)
        number.position.set(2.18 + i * .82, 1.40, -1.12); arrival.add(number)
        if (!previousIds.has(dish.id) && this.mode === 'vr') this.arrivals.push({ root: arrival, started: now })
      })
    }
    if ((v.completed ?? 0) > this.previousCompleted && this.mode === 'vr') { this.completionSound(); this.feedback = '' }
    const submitted = (v.completed ?? 0) > this.previousCompleted
    if (submitted && this.previousOrders.some(old => !v.visible.some(job => job.id === old.id))) {
      this.receiptMotion = this.reducedMotion.matches ? null : { previous: this.previousOrders, started: now }
    }
    this.previousOrders = v.visible.map(job => ({ ...job, recipe: [...job.recipe] }))
    this.previousCompleted = v.completed ?? 0
    if (this.receiptMotion && (this.reducedMotion.matches || now - this.receiptMotion.started >= 480 || v.cooperative?.phase === 'FINISHED')) {
      this.receiptMotion = null; this.boardSignature = ''
    }
    this.host.dataset.orderTransition = String(!!this.receiptMotion)
    this.receiptClips.forEach((clip, i) => {
      const selected = !this.receiptMotion && !!v.visible[i] && v.visible[i].id === v.selectedJob
      ;(clip.material as THREE.MeshStandardMaterial).color.set(selected ? '#d4a347' : '#6c6254')
    })
    if (this.feedback && now > this.feedbackUntil) this.feedback = ''
    this.paintActions()
    const b = `${v.visible.map(j => j.id).join(',')}:${v.selectedJob}:${v.waiting}:${v.message}:${signature}:${JSON.stringify(v.cooperative)}:${this.feedback}:${v.seconds <= 0}:${v.pass.length}:${v.completed ?? 0}`
    if (b !== this.boardSignature || this.receiptMotion) { this.boardSignature = b; this.paintBoard(); this.paintClock() }
    if (Math.ceil(v.seconds) !== this.timerSecond) { this.timerSecond = Math.ceil(v.seconds); this.paintClock() }
    this.boardRoot.visible = true; this.clock.visible = this.boardRoot.visible; this.previewControllers.visible = this.mode === 'vr' && !this.session
    this.spatialControls.visible = this.boardRoot.visible; this.clockHousing.visible = this.boardRoot.visible
    if (this.coopPanel) this.coopPanel.visible = this.boardRoot.visible && !!v.cooperative && (v.cooperative.phase !== 'PLAYING' || !!v.cooperative.greeting || !!v.cooperative.paused)
    this.halos.forEach((ring, id) => { ring.visible = id === v.ingredient })
    const aligned = !chefPresentation(v).blocked && [...this.held.values()].some(h => this.heldReady(h)); (this.marker.material as THREE.MeshBasicMaterial).color.set(aligned ? '#70cb80' : '#f6c965')
    const pantry = this.mode === 'pc' ? v.pantry ?? INITIAL_PANTRY : INITIAL_PANTRY
    pantry.forEach((id, i) => {
      const x = -2.52 + i * .87
      this.pantryGroups.get(id)!.position.x = x
      this.project(`ingredient-${id}`, x, 1.20, -.63)
    })
    this.host.dataset.pantry = pantry.join(',')
    for (let i = 0; i < 2; i++) { this.boardRoot.localToWorld(this.v2.set(orderSlotX(i), .12, .08)); this.project(`order-${i}`, this.v2.x, this.v2.y, this.v2.z) }
    this.hall.update(dt, v.hallSight, !!v.cooperative, !!v.cooperative?.paused || v.cooperative?.phase === 'FINISHED', this.reducedMotion.matches)
    this.host.dataset.hallSource = v.hallSight ? 'server' : v.cooperative ? 'unavailable' : 'demo'
    this.host.dataset.hallServerPosition = JSON.stringify(this.hall.root.userData.serverPosition ?? null)
    this.updateSpatialFocus(now)
    this.undoTarget.getWorldPosition(this.v2); this.project('undo', this.v2.x, this.v2.y, this.v2.z)
    this.passFurniture.localToWorld(this.v2.set(2.59, 1.3, -1.22)); this.project('submit', this.v2.x, this.v2.y, this.v2.z)
    if (this.session) this.renderer.render(this.scene, this.camera)
    else if (++this.frame % 2 === 0 || dt > .025) this.post.render()
  }
  dispose() {
    this.disposed = true; this.renderer.setAnimationLoop(null); this.observer.disconnect(); this.onEndListeners.forEach(fn => fn()); this.renderer.domElement.removeEventListener('pointerdown', this.pointer); this.renderer.domElement.removeEventListener('pointermove', this.pointerMove); this.renderer.domElement.removeEventListener('pointerleave', this.pointerLeave); this.renderer.domElement.removeEventListener('webglcontextlost', this.contextLost)
    if (this.session) { this.session.removeEventListener('end', this.sessionEnded); void this.session.end().catch(() => undefined) }
    if (this.sound) void this.sound.close().catch(() => undefined)
    this.geometry.forEach(g => g.dispose()); this.materials.forEach(m => m.dispose()); this.textures.forEach(t => t.dispose()); this.hall.dispose(); this.foods.dispose(); this.world.dispose(); this.env.dispose(); this.post.dispose(); this.renderer.dispose(); this.renderer.domElement.remove()
  }
}
