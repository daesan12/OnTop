import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { INGREDIENTS, SERVING_Z, SKEWER_TIP, availablePieces, canServe, canThread, currentCard, formatTime, transitionText } from './game'
import type { GameState, IngredientId } from './game'
import { paintWorldOrderBoard } from './worldOrderBoard'
import { nextRoundLabel } from './presentation'
import { SkewerSurfaces } from './surfaces'
import { FoodModels, foodPositions, assembledFoodScale } from './foodModels'

export type SceneCommand =
  | { type: 'select'; ingredient: IngredientId }
  | { type: 'thread'; ingredient?: IngredientId }
  | { type: 'start' | 'pause' | 'resume' | 'restart' | 'submit' | 'unthread' | 'cancel' | 'next' | 'greet' | 'sound' | 'home' }

interface SceneCallbacks {
  command: (command: SceneCommand) => void
  xrChanged: (active: boolean) => void
  pause: () => void
  notice: (message: string) => void
}

type WorldAction = 'toggle' | 'submit' | 'unthread' | 'cancel' | 'sound'
type Pick = { ingredient: IngredientId } | { action: WorldAction } | { tip: true } | { stick: true }
type Held = { ingredient: IngredientId; visual: THREE.Group }

const COLORS = { ink: '#243b2e', paper: '#eee6d6', accent: '#b55432', wood: '#ba8d60' }

/** Imperative scene: controller poses/rendering stay outside React's render cycle. */
export class SkewerScene {
  private readonly scene = new THREE.Scene()
  private readonly world = new THREE.Group()
  private readonly camera = new THREE.PerspectiveCamera(46, 1, 0.05, 30)
  private readonly renderer: THREE.WebGLRenderer
  private readonly controls: OrbitControls
  private readonly surfaces: SkewerSurfaces
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  private readonly raycaster = new THREE.Raycaster()
  private readonly pointer = new THREE.Vector2()
  private readonly origin = new THREE.Vector3()
  private readonly direction = new THREE.Vector3()
  private readonly rotation = new THREE.Matrix4()
  private readonly dropPosition = new THREE.Vector3()
  private readonly tipPosition = new THREE.Vector3()
  private readonly foodAxis = new THREE.Vector3()
  private readonly stickAxis = new THREE.Vector3()
  private readonly poseQuaternion = new THREE.Quaternion()
  private readonly pickables: THREE.Mesh[] = []
  private readonly controllers: ReturnType<THREE.WebGLRenderer['xr']['getController']>[] = []
  private readonly held = new Map<number, Held>()
  private readonly geometries = new Map<string, THREE.BufferGeometry>()
  private readonly materials = new Map<string, THREE.MeshStandardMaterial>()
  private readonly ownedMaterials = new Set<THREE.Material>()
  private readonly textures = new Set<THREE.Texture>()
  private readonly foods = new FoodModels()
  private dragVisual: THREE.Group | null = null
  private readonly dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -SKEWER_TIP.y)
  private readonly dragPoint = new THREE.Vector3()
  private readonly skewer = new THREE.Group()
  private readonly assembly = new THREE.Group()
  private readonly inventory = new Map<IngredientId, THREE.Group>()
  private readonly inventoryTargets = new Map<IngredientId, THREE.Mesh>()
  private readonly inventoryRings = new Map<IngredientId, THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>>()
  private readonly inputSources = new Map<number, XRInputSource>()
  private readonly tipMarker: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>
  private alignedHands = new Set<number>()
  private motion: { object: THREE.Object3D; targetX: number; started: number } | null = null
  private lastFrame = 0
  private shadowTexture: THREE.CanvasTexture | null = null
  private shadowMaterial: THREE.MeshBasicMaterial | null = null
  private readonly particles: THREE.Points
  private readonly particlePositions = new Float32Array(24 * 3)
  private burstStarted = -1
  private stickHolder: number | null = null
  private mouseHeld: IngredientId | null = null
  private readonly board: HTMLCanvasElement
  private readonly boardTexture: THREE.CanvasTexture
  private readonly toggleCanvas: HTMLCanvasElement
  private readonly toggleTexture: THREE.CanvasTexture
  private readonly cancelCanvas: HTMLCanvasElement
  private readonly cancelTexture: THREE.CanvasTexture
  private readonly soundCanvas: HTMLCanvasElement
  private readonly soundTexture: THREE.CanvasTexture
  private readonly resizeObserver: ResizeObserver
  private readonly xrPanel = new THREE.Group()
  private state: GameState
  private signature = ''
  private skewerSignature = ''
  private noticeMessage = ''
  private disposed = false
  private calibrate = false
  private session: XRSession | null = null
  private hovered: THREE.Mesh | null = null

  constructor(private readonly host: HTMLElement, state: GameState, private readonly callbacks: SceneCallbacks) {
    this.state = state
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.renderer.xr.enabled = true
    this.renderer.xr.setReferenceSpaceType('local-floor')
    this.renderer.xr.setFramebufferScaleFactor(1)
    this.surfaces = new SkewerSurfaces(this.renderer.capabilities.getMaxAnisotropy(),
      () => this.callbacks.notice('재질 이미지를 불러오지 못해 기본 재질로 표시합니다.'))
    this.renderer.domElement.setAttribute('aria-label', '3D 조리대: 음식을 집어 꼬치 끝에 꽂아주세요.')
    this.renderer.domElement.setAttribute('role', 'img')
    host.appendChild(this.renderer.domElement)
    this.scene.background = new THREE.Color('#34483b')
    this.scene.add(new THREE.HemisphereLight('#fff3dc', '#34483b', 1.45))
    const light = new THREE.DirectionalLight('#fff0d1', 2.7)
    light.position.set(-2, 4, 3)
    const fill = new THREE.DirectionalLight('#d8e6da', 0.65)
    fill.position.set(2, 2.5, -2)
    this.scene.add(light, fill, this.world)
    this.desktopCamera()
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.target.set(0, 0.94, -1.06)
    this.controls.enablePan = false
    this.controls.enableDamping = !this.reducedMotion
    this.controls.dampingFactor = 0.08
    this.controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }
    this.controls.minDistance = 2.1
    this.controls.maxDistance = 3.8
    this.controls.minPolarAngle = 0.55
    this.controls.maxPolarAngle = 1.25
    this.controls.enabled = window.matchMedia('(pointer: fine)').matches
    this.controls.update()
    this.controls.saveState()
    const particleGeometry = this.geometry('celebration', () => {
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(this.particlePositions, 3))
      const colors: number[] = []
      const color = new THREE.Color()
      for (let i = 0; i < 24; i++) { color.set(['#dfbd63', '#9dbb7a', '#f1e6c9'][i % 3]); colors.push(color.r, color.g, color.b) }
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
      return geometry
    })
    const particleMaterial = new THREE.PointsMaterial({ size: 0.018, vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false })
    this.ownedMaterials.add(particleMaterial)
    this.particles = new THREE.Points(particleGeometry, particleMaterial)
    this.particles.position.set(0, 1.08, -0.72)
    this.particles.visible = false
    this.particles.frustumCulled = false
    this.world.add(this.particles)
    const tipMaterial = new THREE.MeshBasicMaterial({ color: '#dfb44e' })
    this.ownedMaterials.add(tipMaterial)
    this.tipMarker = new THREE.Mesh(this.geometry('tip-ring', () => new THREE.TorusGeometry(0.039, 0.005, 8, 24)), tipMaterial)
    this.tipMarker.rotation.y = Math.PI / 2
    this.tipMarker.position.x = SKEWER_TIP.x
    this.assembly.add(this.tipMarker)
    this.buildCounter()

    this.board = this.canvas(1024, 480)
    this.boardTexture = this.texture(this.board)
    const boardMesh = this.panel(this.boardTexture, 2.32, 1.02)
    boardMesh.position.set(0, 1.95, -2)
    this.xrPanel.add(boardMesh)
    this.toggleCanvas = this.canvas(512, 128)
    this.toggleTexture = this.texture(this.toggleCanvas)
    this.soundCanvas = this.canvas(512, 128)
    this.soundTexture = this.texture(this.soundCanvas)
    this.paintButton(this.soundCanvas, '소리 켜짐')
    this.cancelCanvas = this.canvas(512, 128)
    this.cancelTexture = this.texture(this.cancelCanvas)
    const actions = ['toggle', 'submit', 'unthread', 'cancel', 'sound'] as const
    actions.forEach((action, index) => {
      const canvas = action === 'toggle' ? this.toggleCanvas : action === 'sound' ? this.soundCanvas : action === 'cancel' ? this.cancelCanvas : this.canvas(512, 128)
      const texture = action === 'toggle' ? this.toggleTexture : action === 'sound' ? this.soundTexture : action === 'cancel' ? this.cancelTexture : this.texture(canvas)
      if (action !== 'toggle' && action !== 'sound') this.paintButton(canvas, { submit: '서빙 / 인사', unthread: '끝 재료 빼기', cancel: '선택 취소' }[action], action === 'submit')
      const button = this.panel(texture, 0.42, 0.14)
      button.position.set(-0.92 + index * 0.46, 1.22, -1.53)
      this.target(button, { action })
      this.xrPanel.add(button)
    })
    this.xrPanel.visible = false
    this.world.add(this.xrPanel)
    this.setupControllers()
    this.renderer.xr.addEventListener('sessionstart', this.onSessionStart)
    this.renderer.xr.addEventListener('sessionend', this.onSessionEnd)
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown)
    this.renderer.domElement.addEventListener('pointerup', this.onPointerUp)
    this.renderer.domElement.addEventListener('pointercancel', this.onPointerCancel)
    this.renderer.domElement.addEventListener('pointermove', this.onPointerMove)
    this.renderer.domElement.addEventListener('pointerleave', this.onPointerLeave)
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost)
    this.resizeObserver = new ResizeObserver(this.resize)
    this.resizeObserver.observe(host)
    this.resize()
    this.update(state)
    this.renderer.setAnimationLoop(this.render)
  }

  private canvas(width: number, height: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    return canvas
  }

  private texture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    this.textures.add(texture)
    return texture
  }

  private geometry(key: string, create: () => THREE.BufferGeometry): THREE.BufferGeometry {
    let geometry = this.geometries.get(key)
    if (!geometry) { geometry = create(); this.geometries.set(key, geometry) }
    return geometry
  }

  private material(color: string, roughness = 0.65): THREE.MeshStandardMaterial {
    const key = `${color}:${roughness}`
    let material = this.materials.get(key)
    if (!material) {
      material = new THREE.MeshStandardMaterial({ color, roughness })
      this.materials.set(key, material)
      this.ownedMaterials.add(material)
    }
    return material
  }

  private box(w: number, h: number, d: number, color: string, radius = 0.02): THREE.Mesh {
    return new THREE.Mesh(
      this.geometry(`box:${w}:${h}:${d}:${radius}`, () => new RoundedBoxGeometry(w, h, d, 2, radius)),
      this.material(color),
    )
  }

  private cylinder(top: number, bottom: number, height: number, color: string): THREE.Mesh {
    return new THREE.Mesh(
      this.geometry(`cyl:${top}:${bottom}:${height}`, () => new THREE.CylinderGeometry(top, bottom, height, 20)),
      this.material(color),
    )
  }

  private panel(texture: THREE.Texture, width: number, height: number): THREE.Mesh {
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false })
    this.ownedMaterials.add(material)
    return new THREE.Mesh(this.geometry(`plane:${width}:${height}`, () => new THREE.PlaneGeometry(width, height)), material)
  }

  private target(mesh: THREE.Mesh, pick: Pick): void {
    mesh.userData.pick = pick
    this.pickables.push(mesh)
  }

  private roundedOutline(width: number, height: number, radius: number): THREE.Shape {
    const x = width / 2
    const y = height / 2
    const shape = new THREE.Shape()
    shape.moveTo(-x + radius, -y)
    shape.lineTo(x - radius, -y)
    shape.quadraticCurveTo(x, -y, x, -y + radius)
    shape.lineTo(x, y - radius)
    shape.quadraticCurveTo(x, y, x - radius, y)
    shape.lineTo(-x + radius, y)
    shape.quadraticCurveTo(-x, y, -x, y - radius)
    shape.lineTo(-x, -y + radius)
    shape.quadraticCurveTo(-x, -y, -x + radius, -y)
    shape.closePath()
    return shape
  }

  private contactShadow(width: number, depth: number): THREE.Mesh {
    if (!this.shadowTexture) {
      const canvas = this.canvas(128, 128)
      const ctx = canvas.getContext('2d')!
      const gradient = ctx.createRadialGradient(64, 64, 12, 64, 64, 64)
      gradient.addColorStop(0, 'rgba(0,0,0,0.8)')
      gradient.addColorStop(0.55, 'rgba(0,0,0,0.4)')
      gradient.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, 128, 128)
      this.shadowTexture = this.texture(canvas)
      this.shadowMaterial = new THREE.MeshBasicMaterial({ map: this.shadowTexture, color: '#14251a', transparent: true, opacity: 0.36, depthWrite: false })
      this.ownedMaterials.add(this.shadowMaterial)
    }
    const mesh = new THREE.Mesh(this.geometry('contact-shadow', () => new THREE.PlaneGeometry(1, 1)), this.shadowMaterial!)
    mesh.rotation.x = -Math.PI / 2
    mesh.scale.set(width, depth, 1)
    return mesh
  }

  private planarUV(geometry: THREE.BufferGeometry, width: number, depth: number): void {
    const positions = geometry.getAttribute('position')
    const uv = new Float32Array(positions.count * 2)
    for (let i = 0; i < positions.count; i++) {
      uv[i * 2] = positions.getX(i) / width + 0.5
      uv[i * 2 + 1] = positions.getZ(i) / depth + 0.5
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  }

  private ingredient(id: IngredientId): THREE.Group {
    return this.foods.create(id)
  }

  private buildCounter(): void {
    const floor = this.box(12, 0.08, 12, '#405044')
    floor.position.y = -0.05
    this.scene.add(floor)
    const backdrop = new THREE.TextureLoader().load(new URL('./art/restaurant-backdrop.png', import.meta.url).href,
      () => { if (this.disposed) backdrop.dispose() }, undefined,
      () => this.callbacks.notice('배경 이미지를 불러오지 못했어요. 게임은 계속할 수 있습니다.'))
    backdrop.colorSpace = THREE.SRGBColorSpace
    this.textures.add(backdrop)
    const backWall = this.panel(backdrop, 8.4, 4.72)
    backWall.position.set(0, 0.65, -3.9)
    this.world.add(backWall)

    const table = this.box(2.8, 0.11, 1.65, COLORS.wood, 0.035)
    table.material = this.surfaces.material('oak')
    table.position.set(0, 0.78, -1.05)
    const apron = this.box(2.65, 0.62, 1.45, '#906343')
    apron.material = this.surfaces.material('oak')
    apron.position.set(0, 0.41, -1.05)
    this.world.add(table, apron)
    const plateShadow = this.contactShadow(2.18, 0.82)
    plateShadow.position.set(0, 0.838, -0.72)
    this.world.add(plateShadow)
    const plate = this.box(1.9, 0.045, 0.57, '#eee5d1', 0.035)
    plate.material = this.surfaces.material('ceramic')
    plate.position.set(0, 0.86, -0.72)
    this.world.add(plate)
    const plateInset = this.box(1.76, 0.012, 0.43, '#ded7c2')
    plateInset.material = this.surfaces.material('ceramic')
    plateInset.position.set(0, 0.887, -0.72)
    this.world.add(plateInset)
    const rim = new THREE.Mesh(this.geometry('plate-rim', () => {
      const outline = this.roundedOutline(1.9, 0.57, 0.07)
      const hole = this.roundedOutline(1.72, 0.41, 0.055)
      outline.holes.push(new THREE.Path(hole.getPoints().reverse()))
      const geometry = new THREE.ExtrudeGeometry(outline, { depth: 0.019, bevelEnabled: true, bevelSegments: 1, bevelSize: 0.003, bevelThickness: 0.003, steps: 1 })
      geometry.rotateX(-Math.PI / 2)
      this.planarUV(geometry, 1.92, 0.59)
      return geometry
    }), this.surfaces.material('ceramic'))
    rim.position.set(0, 0.888, -0.72)
    this.world.add(rim)

    const bamboo = this.cylinder(0.006, 0.006, 1.6, '#b88d4d')
    bamboo.rotation.z = Math.PI / 2
    bamboo.position.x = -0.1
    this.assembly.position.set(0, SKEWER_TIP.y, SKEWER_TIP.z)
    this.assembly.add(bamboo, this.skewer)
    this.world.add(this.assembly)
    const stickHit = this.cylinder(0.025, 0.025, 1.6, '#b88d4d')
    stickHit.rotation.z = Math.PI / 2
    stickHit.position.x = -0.1
    const invisible = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    this.ownedMaterials.add(invisible)
    stickHit.material = invisible
    this.target(stickHit, { stick: true })
    this.assembly.add(stickHit)
    const tipHit = new THREE.Mesh(this.geometry('tip-hit', () => new THREE.SphereGeometry(0.075, 12, 8)), invisible)
    tipHit.position.x = SKEWER_TIP.x
    this.target(tipHit, { tip: true })
    this.assembly.add(tipHit)

    INGREDIENTS.forEach((item, index) => {
      const x = -1.05 + index * 0.42
      const bowl = new THREE.Mesh(this.geometry('ingredient-bowl', () => new THREE.LatheGeometry([
        new THREE.Vector2(0, 0), new THREE.Vector2(0.11, 0), new THREE.Vector2(0.16, 0.018),
        new THREE.Vector2(0.18, 0.065), new THREE.Vector2(0.183, 0.075), new THREE.Vector2(0.171, 0.079),
        new THREE.Vector2(0.148, 0.043), new THREE.Vector2(0.09, 0.025), new THREE.Vector2(0, 0.025),
      ], 28)), this.surfaces.material('ceramic'))
      bowl.position.set(x, 0.844, -1.4)
      const shadow = this.contactShadow(0.43, 0.38)
      shadow.position.set(x, 0.838, -1.4)
      this.world.add(bowl, shadow)
      const food = this.ingredient(item.id)
      food.position.set(x, 0.965, -1.4)
      food.rotation.y = -0.2
      this.inventory.set(item.id, food)
      this.world.add(food)
      const ringMaterial = new THREE.MeshBasicMaterial({ color: '#9eb879', transparent: true, opacity: 0, depthWrite: false })
      this.ownedMaterials.add(ringMaterial)
      const ring = new THREE.Mesh(this.geometry('inventory-ring', () => new THREE.TorusGeometry(0.184, 0.004, 6, 40)), ringMaterial)
      ring.rotation.x = -Math.PI / 2
      ring.position.set(x, 0.925, -1.4)
      ring.visible = false
      this.inventoryRings.set(item.id, ring)
      this.world.add(ring)
      const label = this.canvas(384, 112)
      const ctx = label.getContext('2d')!
      ctx.fillStyle = COLORS.paper
      ctx.beginPath()
      ctx.roundRect(1, 1, label.width - 2, label.height - 2, 12)
      ctx.fill()
      ctx.strokeStyle = '#b4a68a'
      ctx.lineWidth = 3
      ctx.stroke()
      ctx.fillStyle = '#63794e'
      ctx.beginPath()
      ctx.arc(53, 56, 28, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#f9f0df'
      ctx.font = '600 34px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(item.key, 53, 68)
      ctx.fillStyle = COLORS.ink
      ctx.font = '600 42px "Malgun Gothic", sans-serif'
      ctx.fillText(item.name, 224, 72)
      const tag = this.panel(this.texture(label), 0.32, 0.093)
      tag.position.set(x, 0.9, -1.13)
      tag.rotation.x = -0.35
      this.world.add(tag)
      const hit = this.box(0.36, 0.24, 0.4, item.color)
      const invisible = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
      this.ownedMaterials.add(invisible)
      hit.material = invisible
      hit.position.set(x, 0.98, -1.38)
      this.target(hit, { ingredient: item.id })
      this.inventoryTargets.set(item.id, hit)
      this.world.add(hit)
    })
  }

  private paintButton(canvas: HTMLCanvasElement, text: string, primary = false): void {
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = primary ? COLORS.accent : COLORS.paper
    ctx.beginPath()
    ctx.roundRect(0, 0, canvas.width, canvas.height, 14)
    ctx.fill()
    ctx.fillStyle = primary ? '#fff7e9' : COLORS.ink
    ctx.font = '600 44px "Malgun Gothic", sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(text, canvas.width / 2, 82)
  }

  update(state: GameState): void {
    const previous = this.state
    this.state = state
    const card = currentCard(state)
    if (state.phase === 'result' && previous.phase !== 'result') {
      this.controllers.forEach((_, index) => this.pulse(index, state.feedback === 'success' ? 0.22 : 0.35, state.feedback === 'success' ? 45 : 80))
      if (state.feedback === 'success' && !this.reducedMotion) {
        this.burstStarted = performance.now()
        this.particles.visible = true
      }
    }
    const displaySkewer: readonly IngredientId[] = state.phase === 'ready' ? ['tomato', 'cheese', 'pepper', 'shrimp', 'cheese', 'beef'] : state.skewer
    const skewerSignature = displaySkewer.join(',')
    if (skewerSignature !== this.skewerSignature) {
      this.motion = null
      this.skewerSignature = skewerSignature
      this.skewer.clear()
      const positions = foodPositions(displaySkewer)
      displaySkewer.forEach((id, index) => {
        const food = this.ingredient(id)
        food.scale.multiplyScalar(assembledFoodScale(displaySkewer))
        food.position.x = positions[index]
        this.skewer.add(food)
        if (!this.reducedMotion && index === state.skewer.length - 1 && state.skewer.length === previous.skewer.length + 1) {
          this.motion = { object: food, targetX: food.position.x, started: performance.now() }
          food.position.x = SKEWER_TIP.x
        }
      })
    }
    this.inventory.forEach((group, id) => {
      const available = availablePieces(state.skewer, id) > 0
      group.visible = available
      this.inventoryTargets.get(id)!.visible = available
    })
    if (state.phase !== 'playing' || card.kind !== 'order') { this.clearHeld(); this.returnStick() }
    if (state.phase === 'result' && card.kind === 'order') this.assembly.position.z = SERVING_Z
    else if (!state.skewer.length && this.stickHolder === null) this.assembly.position.z = SKEWER_TIP.z
    // A timer update can arrive between pointerdown and React's select update.
    // Only clear an acknowledged selection, so fast drags keep their food model.
    if ((!state.pending && previous.pending !== null) || state.phase !== 'playing') { this.mouseHeld = null; this.clearDrag() }
    const signature = [state.phase, transitionText(state), formatTime(state.remainingMs), state.score, card.id, state.message, state.skewer.length, this.noticeMessage].join('|')
    if (signature === this.signature) return
    this.signature = signature
    paintWorldOrderBoard(this.board.getContext('2d')!, state, this.noticeMessage)
    this.boardTexture.needsUpdate = true
    this.paintButton(this.toggleCanvas, { ready: '영업 시작', countdown: '일시정지', ending: '마무리 중', playing: '일시정지', paused: '계속 만들기', result: nextRoundLabel(state), finished: '다시 도전' }[state.phase])
    this.toggleTexture.needsUpdate = true
    this.paintButton(this.cancelCanvas, state.phase === 'finished' ? '처음 화면으로' : '선택 취소')
    this.cancelTexture.needsUpdate = true
  }

  setNotice(message: string): void {
    this.noticeMessage = message
    this.update(this.state)
  }

  setMuted(muted: boolean): void {
    this.paintButton(this.soundCanvas, muted ? '소리 꺼짐' : '소리 켜짐')
    this.soundTexture.needsUpdate = true
  }

  private threadPose(held: Held): { distance: number; alignment: number } {
    held.visual.getWorldPosition(this.dropPosition)
    this.tipMarker.getWorldPosition(this.tipPosition)
    held.visual.getWorldQuaternion(this.poseQuaternion)
    this.foodAxis.set(1, 0, 0).applyQuaternion(this.poseQuaternion)
    this.assembly.getWorldQuaternion(this.poseQuaternion)
    this.stickAxis.set(1, 0, 0).applyQuaternion(this.poseQuaternion)
    return { distance: this.dropPosition.distanceTo(this.tipPosition), alignment: this.foodAxis.dot(this.stickAxis) }
  }

  private returnStick(): void {
    if (this.stickHolder === null) return
    this.world.add(this.assembly)
    this.assembly.position.set(0, SKEWER_TIP.y, SKEWER_TIP.z)
    this.assembly.rotation.set(0, 0, 0)
    this.stickHolder = null
  }

  private setupControllers(): void {
    for (let i = 0; i < 2; i++) {
      const controller = this.renderer.xr.getController(i)
      const geometry = this.geometry('ray', () => new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]))
      const material = new THREE.LineBasicMaterial({ color: '#eddcb4', transparent: true, opacity: 0.75 })
      this.ownedMaterials.add(material)
      const ray = new THREE.Line(geometry, material)
      ray.name = 'pointer-ray'
      ray.scale.z = 3
      controller.add(ray)
      controller.addEventListener('connected', event => this.inputSources.set(i, event.data))
      controller.addEventListener('selectstart', () => {
        if (!controller.visible || this.held.has(i) || this.stickHolder === i) return
        const pick = this.controllerHit(i)?.object.userData.pick as Pick | undefined
        if (!pick) return
        if ('ingredient' in pick && this.state.phase === 'playing' && currentCard(this.state).kind === 'order') {
          if (availablePieces(this.state.skewer, pick.ingredient) <= 0 || [...this.held.values()].some(held => held.ingredient === pick.ingredient)) return
          const visual = this.ingredient(pick.ingredient)
          visual.position.set(0, 0, -0.18)
          // Food is pierced along its local X axis, aligned with the controller ray.
          visual.rotation.y = Math.PI / 2
          controller.add(visual)
          this.held.set(i, { ingredient: pick.ingredient, visual })
          this.pulse(i, 0.1, 18)
          this.callbacks.command({ type: 'select', ingredient: pick.ingredient })
          this.callbacks.notice('음식의 중심을 꼬치 끝에 대고 손목으로 방향을 맞추세요. 고리가 초록색이면 놓으세요.')
        } else if ('action' in pick) this.activate(pick.action)
      })
      controller.addEventListener('selectend', () => {
        const held = this.held.get(i)
        if (!held) return
        const pose = this.threadPose(held)
        controller.remove(held.visual)
        this.held.delete(i)
        if (canThread(pose.distance, pose.alignment)) {
          this.pulse(i, 0.25, 35)
          this.callbacks.command({ type: 'thread', ingredient: held.ingredient })
        }
        else {
          this.pulse(i, 0.25, 65)
          this.callbacks.command({ type: 'cancel' })
          this.callbacks.notice(pose.distance > 0.065 ? '꼬치 끝에 닿지 않아 재료를 돌려놓았습니다.' : '음식과 꼬치의 방향이 어긋났어요. 손목 방향을 맞춰주세요.')
        }
      })
      controller.addEventListener('squeezestart', () => {
        if (this.stickHolder !== null || this.held.has(i) || this.state.phase !== 'playing' || currentCard(this.state).kind !== 'order') return
        const pick = this.controllerHit(i)?.object.userData.pick as Pick | undefined
        if (pick && ('stick' in pick || 'tip' in pick)) {
          controller.add(this.assembly)
          this.assembly.position.set(0, -0.03, -0.12)
          this.assembly.rotation.set(0, 0, 0)
          this.stickHolder = i
          this.pulse(i, 0.14, 24)
          this.callbacks.notice('꼬치를 잡았어요. 다른 손으로 음식을 집어 꼬치 끝에 맞춰 끼우세요.')
        }
      })
      controller.addEventListener('squeezeend', () => {
        if (this.stickHolder !== i) return
        this.assembly.getWorldPosition(this.dropPosition)
        this.world.worldToLocal(this.dropPosition)
        this.assembly.getWorldQuaternion(this.poseQuaternion)
        this.stickAxis.set(1, 0, 0).applyQuaternion(this.poseQuaternion)
        const serve = this.state.phase === 'playing' && currentCard(this.state).kind === 'order'
          && this.state.skewer.length > 0 && canServe(this.dropPosition, this.stickAxis.y)
        this.returnStick()
        if (serve) this.callbacks.command({ type: 'submit' })
      })
      controller.addEventListener('disconnected', () => {
        this.inputSources.delete(i)
        const held = this.held.get(i)
        if (held) controller.remove(held.visual)
        this.held.delete(i)
        if (this.stickHolder === i) this.returnStick()
      })
      this.controllers.push(controller)
      this.scene.add(controller)
    }
  }

  private pulse(index: number, strength: number, duration: number): void {
    const gamepad = this.inputSources.get(index)?.gamepad as (Gamepad & {
      hapticActuators?: { pulse: (strength: number, duration: number) => Promise<boolean> }[]
    }) | undefined
    const actuator = gamepad?.hapticActuators?.[0]
    if (actuator) {
      try { void actuator.pulse(strength, duration).catch(() => undefined) } catch { /* Optional hardware. */ }
    }
  }

  private controllerHit(index: number): THREE.Intersection | undefined {
    const controller = this.controllers[index]
    controller.updateWorldMatrix(true, false)
    this.rotation.extractRotation(controller.matrixWorld)
    this.origin.setFromMatrixPosition(controller.matrixWorld)
    this.direction.set(0, 0, -1).applyMatrix4(this.rotation)
    this.raycaster.set(this.origin, this.direction)
    this.raycaster.far = 5
    return this.raycaster.intersectObjects(this.pickables.filter(mesh => mesh.visible), false)[0]
  }

  private activate(action: WorldAction): void {
    if (this.state.phase === 'ending' && action !== 'sound') return
    if (action === 'cancel') this.clearHeld()
    const type = action === 'cancel' && this.state.phase === 'finished' ? 'home' : action === 'toggle'
      ? ({ ready: 'start', countdown: 'pause', ending: 'pause', playing: 'pause', paused: 'resume', result: 'next', finished: 'restart' } as const)[this.state.phase]
      : action === 'submit' && currentCard(this.state).kind === 'greeting' ? 'greet' : action
    this.callbacks.command({ type })
  }

  private pointerHit(event: PointerEvent): THREE.Intersection | undefined {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1)
    this.raycaster.setFromCamera(this.pointer, this.camera)
    this.raycaster.far = 10
    return this.raycaster.intersectObjects(this.pickables.filter(mesh => mesh.visible && mesh.parent !== this.xrPanel), false)[0]
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (this.renderer.xr.isPresenting || event.button !== 0 || this.state.phase !== 'playing' || currentCard(this.state).kind !== 'order') return
    const pick = this.pointerHit(event)?.object.userData.pick as Pick | undefined
    if (pick && 'ingredient' in pick && availablePieces(this.state.skewer, pick.ingredient) > 0) {
      this.mouseHeld = pick.ingredient
      this.clearDrag()
      this.dragVisual = this.ingredient(pick.ingredient)
      this.dragVisual.position.copy(this.inventory.get(pick.ingredient)!.position)
      this.world.add(this.dragVisual)
      this.callbacks.command({ type: 'select', ingredient: pick.ingredient })
      this.renderer.domElement.setPointerCapture(event.pointerId)
    }
  }

  private onPointerUp = (event: PointerEvent): void => {
    if (this.renderer.xr.isPresenting || event.button !== 0) return
    const pick = this.pointerHit(event)?.object.userData.pick as Pick | undefined
    const ingredient = this.mouseHeld ?? this.state.pending
    this.mouseHeld = null
    this.clearDrag()
    if (this.renderer.domElement.hasPointerCapture(event.pointerId)) this.renderer.domElement.releasePointerCapture(event.pointerId)
    if (pick && 'tip' in pick && ingredient) this.callbacks.command({ type: 'thread', ingredient })
  }

  private onPointerMove = (event: PointerEvent): void => {
    if (this.renderer.xr.isPresenting) return
    const hit = this.pointerHit(event)
    if (this.dragVisual && this.raycaster.ray.intersectPlane(this.dragPlane, this.dragPoint)) {
      this.dragVisual.position.copy(this.dragPoint)
      this.dragVisual.position.x = THREE.MathUtils.clamp(this.dragPoint.x, -1.35, 1.35)
      this.dragVisual.position.z = THREE.MathUtils.clamp(this.dragPoint.z, -1.65, -0.32)
    }
    this.hovered = hit?.object instanceof THREE.Mesh ? hit.object : null
    this.renderer.domElement.style.cursor = this.hovered && this.state.phase === 'playing' ? 'pointer' : 'default'
  }
  private onPointerCancel = (): void => {
    this.mouseHeld = null
    this.clearDrag()
    this.callbacks.command({ type: 'cancel' })
  }
  private onPointerLeave = (): void => { this.hovered = null }
  private onContextLost = (event: Event): void => {
    event.preventDefault()
    this.callbacks.pause()
    this.callbacks.notice('3D 연결이 중단되었어요. 페이지를 새로고침해 주세요.')
  }

  private clearDrag(): void {
    if (this.dragVisual) this.world.remove(this.dragVisual)
    this.dragVisual = null
  }

  private clearHeld(): void {
    this.held.forEach((held, index) => this.controllers[index].remove(held.visual))
    this.held.clear()
    this.alignedHands.clear()
  }

  async enterVR(): Promise<void> {
    if (this.disposed) return
    if (!window.isSecureContext) throw new Error('VR은 보안 주소가 필요해요. USB 연결 후 퀘스트에서 http://localhost:5187/skewer.html을 여세요.')
    if (!navigator.xr) throw new Error('이 브라우저는 VR을 지원하지 않아요. 퀘스트 브라우저에서 열어주세요.')
    if (this.session) { await this.session.end(); return }
    const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor'] })
    if (this.disposed) { await session.end(); return }
    this.session = session
    session.addEventListener('visibilitychange', this.onXRVisibility)
    try {
      await this.renderer.xr.setSession(session)
      this.renderer.xr.setFoveation(1)
    } catch (error) {
      session.removeEventListener('visibilitychange', this.onXRVisibility)
      this.session = null
      await session.end().catch(() => undefined)
      throw error
    }
  }

  private onXRVisibility = (): void => {
    if (this.session?.visibilityState !== 'visible') this.callbacks.pause()
  }

  private onSessionStart = (): void => {
    this.controls.enabled = false
    this.calibrate = true
    this.xrPanel.visible = true
    this.callbacks.xrChanged(true)
  }

  private onSessionEnd = (): void => {
    this.session?.removeEventListener('visibilitychange', this.onXRVisibility)
    this.session = null
    this.clearHeld()
    this.returnStick()
    this.xrPanel.visible = false
    this.world.position.set(0, 0, 0)
    this.world.rotation.set(0, 0, 0)
    this.resetView()
    this.controls.enabled = window.matchMedia('(pointer: fine)').matches
    this.resize()
    this.callbacks.pause()
    this.callbacks.xrChanged(false)
  }

  private desktopCamera(): void {
    this.camera.position.set(0, 2.05, 1.35)
    this.camera.lookAt(0, 0.94, -1.06)
    this.camera.updateMatrixWorld()
  }

  resetView(): void {
    if (this.renderer.xr.isPresenting) return
    const damping = this.controls.enableDamping
    this.controls.enableDamping = false
    this.controls.reset()
    this.desktopCamera()
    this.controls.update()
    this.controls.enableDamping = damping
  }

  private resize = (): void => {
    if (this.disposed) return
    const { width, height } = this.host.getBoundingClientRect()
    if (!width || !height) return
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    // WebXR owns its framebuffer dimensions while a session is active.
    if (!this.renderer.xr.isPresenting) {
      this.renderer.setSize(width, height, false)
      // Changing canvas dimensions clears its framebuffer. Paint immediately
      // when entry/result layouts resize, rather than flashing an empty stage.
      this.renderer.render(this.scene, this.camera)
    }
  }

  private render = (): void => {
    if (this.disposed) return
    const now = performance.now()
    const dt = Math.min((now - this.lastFrame) / 1000, 0.05)
    this.lastFrame = now
    if (!this.renderer.xr.isPresenting) this.controls.update()
    if (this.motion) {
      const t = Math.min(1, (now - this.motion.started) / 420)
      // Brief contact compression, followed by a slide down the shaft.
      const slide = Math.max(0, (t - 0.18) / 0.82)
      const ease = 1 - Math.pow(1 - slide, 3)
      const compression = Math.sin(Math.min(t / 0.36, 1) * Math.PI) * 0.1
      this.motion.object.position.x = SKEWER_TIP.x + (this.motion.targetX - SKEWER_TIP.x) * ease
      this.motion.object.scale.set(1 - compression, 1 + compression / 2, 1 + compression / 2)
      if (t >= 1) { this.motion.object.scale.set(1, 1, 1); this.motion = null }
    }
    if (this.particles.visible) {
      const age = (now - this.burstStarted) / 1000
      if (age > 0.85) this.particles.visible = false
      else {
        for (let i = 0; i < 24; i++) {
          const angle = i * 2.399
          this.particlePositions[i * 3] = Math.sin(angle) * age * 0.38
          this.particlePositions[i * 3 + 1] = (0.55 + (i % 5) * 0.06) * age - 1.3 * age * age
          this.particlePositions[i * 3 + 2] = Math.cos(angle) * age * 0.18
        }
        this.particles.geometry.getAttribute('position').needsUpdate = true
      }
    }
    const hoverIds = new Set<IngredientId>()
    const pointerPick = this.hovered?.userData.pick as Pick | undefined
    if (pointerPick && 'ingredient' in pointerPick) hoverIds.add(pointerPick.ingredient)
    if (!this.renderer.xr.isPresenting) this.tipMarker.material.color.set(pointerPick && 'tip' in pointerPick && this.state.pending ? '#8fd275' : '#dfb44e')
    if (this.calibrate && this.renderer.xr.isPresenting) {
      const xrCamera = this.renderer.xr.getCamera()
      xrCamera.getWorldPosition(this.origin)
      xrCamera.getWorldDirection(this.direction)
      this.world.position.set(this.origin.x, this.origin.y - 1.6, this.origin.z)
      this.world.rotation.y = Math.atan2(-this.direction.x, -this.direction.z)
      this.calibrate = false
    }
    if (this.renderer.xr.isPresenting) {
      let aligned = false
      const alignedNow = new Set<number>()
      this.held.forEach((held, index) => {
        const pose = this.threadPose(held)
        if (canThread(pose.distance, pose.alignment)) {
          aligned = true
          alignedNow.add(index)
          if (!this.alignedHands.has(index)) this.pulse(index, 0.12, 18)
        }
      })
      this.alignedHands = alignedNow
      this.tipMarker.material.color.set(aligned ? '#8fd275' : '#dfb44e')
      this.controllers.forEach((controller, index) => {
        if (!controller.visible) return
        const hit = this.controllerHit(index)
        const pick = hit?.object.userData.pick as Pick | undefined
        if (pick && 'ingredient' in pick) hoverIds.add(pick.ingredient)
        const ray = controller.getObjectByName('pointer-ray')
        if (ray) ray.scale.z = hit ? hit.distance : 3
      })
    }
    this.inventory.forEach((group, id) => {
      group.visible = availablePieces(this.state.skewer, id) > 0 && ![...this.held.values()].some(held => held.ingredient === id) && this.mouseHeld !== id
      const highlighted = group.visible && (this.state.pending === id || hoverIds.has(id)) && this.state.phase === 'playing'
      const ease = this.reducedMotion ? 1 : 1 - Math.exp(-14 * dt)
      const ring = this.inventoryRings.get(id)!
      ring.material.opacity += ((highlighted ? 0.85 : 0) - ring.material.opacity) * ease
      ring.visible = ring.material.opacity > 0.01
      const base = 0.965
      group.position.y += (base + (highlighted ? 0.018 : 0) - group.position.y) * ease
    })
    this.renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    this.disposed = true
    this.session?.removeEventListener('visibilitychange', this.onXRVisibility)
    if (this.session) void this.session.end().catch(() => undefined)
    this.renderer.setAnimationLoop(null)
    this.resizeObserver.disconnect()
    this.controls.dispose()
    this.renderer.domElement.removeEventListener('pointerup', this.onPointerUp)
    this.renderer.domElement.removeEventListener('pointercancel', this.onPointerCancel)
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown)
    this.renderer.domElement.removeEventListener('pointermove', this.onPointerMove)
    this.renderer.domElement.removeEventListener('pointerleave', this.onPointerLeave)
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost)
    this.renderer.xr.removeEventListener('sessionstart', this.onSessionStart)
    this.renderer.xr.removeEventListener('sessionend', this.onSessionEnd)
    this.clearHeld()
    this.returnStick()
    this.geometries.forEach(geometry => geometry.dispose())
    this.ownedMaterials.forEach(material => material.dispose())
    this.textures.forEach(texture => texture.dispose())
    this.surfaces.dispose()
    this.foods.dispose()
    this.clearDrag()
    this.scene.clear()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
