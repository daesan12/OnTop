import * as THREE from 'three'
import { RestaurantSet } from './RestaurantSet'
import { characterLook, dressCharacter } from './CharacterAppearance'
import { DiningGuests, type DiningGuest } from './DiningGuests'

export type ToyPose = { moving?: boolean; carrying?: boolean; cleaning?: boolean; eating?: boolean; seated?: boolean; reduced?: boolean }
/** Game-owned rounded figures. Shared geometry, simple silhouettes and explicit seat contact. */
export class ToyPeople {
  private geometry = new Map<string, THREE.BufferGeometry>()
  private guests: { actor: ToyActor; variant: number }[] = []
  private library?: DiningGuests
  private disposed = false
  readonly guestsReady: Promise<boolean>
  constructor(private art: RestaurantSet) {
    this.guestsReady = DiningGuests.load().then(library => {
      if (this.disposed) { library.dispose(); return false }
      this.library = library
      this.guests.forEach(({ actor, variant }) => actor.applyDiningGuest(library.create(variant)))
      return true
    }).catch(() => false) // Keep existing guests usable if the optional asset fails to load.
  }
  mesh(shape: 'ball' | 'body' | 'limb' | 'hair' | 'smile' | 'ring', color: string) {
    let g = this.geometry.get(shape)
    if (!g) {
      g = shape === 'body' ? new THREE.CapsuleGeometry(.29, .30, 5, 12)
        : shape === 'limb' ? new THREE.CapsuleGeometry(.1, .15, 4, 10)
        : shape === 'hair' ? new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI * .38)
        : shape === 'ring' ? new THREE.TorusGeometry(.12, .014, 6, 24)
        : shape === 'smile' ? new THREE.TorusGeometry(.07, .012, 5, 12, Math.PI)
        : new THREE.SphereGeometry(1, 20, 14)
      this.geometry.set(shape, g)
    }
    const mesh = new THREE.Mesh(g, this.art.material(color, 0, .78)); mesh.castShadow = mesh.receiveShadow = true; return mesh
  }
  create(index: number, role: 'guest' | 'server' | 'chef' = 'guest', seated = false): ToyActor {
    const actor = new ToyActor(this, this.art, index, role, seated)
    if (role === 'guest') {
      const variant = characterLook(index, role).variant
      this.guests.push({ actor, variant })
      if (this.library) actor.applyDiningGuest(this.library.create(variant))
    }
    return actor
  }
  dispose() {
    this.disposed = true; this.guests.forEach(({ actor }) => actor.disposeGuest()); this.library?.dispose(); this.guests.length = 0
    this.geometry.forEach(g => g.dispose()); this.geometry.clear()
  }
}

export class ToyActor {
  readonly root = new THREE.Group()
  private torso = new THREE.Group()
  private head = new THREE.Group()
  private body: THREE.Object3D
  private legs: THREE.Group[] = []
  private knees: THREE.Group[] = []
  private arms: THREE.Group[] = []
  private elbows: THREE.Group[] = []
  private broom = new THREE.Group()
  private phase = 0
  private dining?: DiningGuest
  constructor(factory: ToyPeople, art: RestaurantSet, index: number, readonly role: 'guest' | 'server' | 'chef', readonly seated: boolean) {
    const look = characterLook(index, role)
    const { skin, shirt, pants, shoes } = look
    this.root.name = role === 'guest' ? 'guest-reference-' + look.variant : role + '-reference'
    const ball = (parent: THREE.Object3D, color: string, x: number, y: number, z: number, sx: number, sy = sx, sz = sx) => {
      const m = factory.mesh('ball', color); m.scale.set(sx, sy, sz); art.place(parent, m, x, y, z); return m
    }
    art.place(this.root, this.torso, 0, .72, 0)
    this.body = art.place(this.torso, factory.mesh('body', shirt), 0, .28, 0)
    for (const side of [-1, 1]) {
      const leg = art.place(this.root, new THREE.Group(), side * .17, .65, 0), knee = art.place(leg, new THREE.Group(), 0, -.29, 0)
      const thigh = art.place(leg, factory.mesh('limb', pants), 0, -.13, 0); thigh.scale.set(1.3, 1, 1.3)
      art.place(knee, factory.mesh('limb', pants), 0, -.12, 0)
      ball(knee, '#efe5d5', 0, -.30, .075, .17, .065, .24)
      ball(knee, shoes, 0, -.235, .07, .16, .10, .22)
      art.place(knee, art.box(.24, .035, .09, '#fff1df', .015), 0, -.15, .10)
      if (seated) { leg.rotation.x = -Math.PI / 2; knee.rotation.x = Math.PI / 2 }
      this.legs.push(leg)
      this.knees.push(knee)
      const arm = art.place(this.torso, new THREE.Group(), side * .33, .48, 0), elbow = art.place(arm, new THREE.Group(), 0, -.27, 0)
      const sleeve = art.place(arm, factory.mesh('limb', shirt), 0, -.10, 0); sleeve.scale.set(1.3, .8, 1.3)
      const forearm = art.place(elbow, factory.mesh('limb', skin), 0, -.09, 0); forearm.scale.set(.90, .75, .90)
      ball(elbow, skin, 0, -.23, 0, .12, .135, .12)
      this.arms.push(arm); this.elbows.push(elbow)
    }
    art.place(this.torso, this.head, 0, .95, 0)
    dressCharacter(factory, art, this.head, this.torso, look)
    if (role === 'server') {
      art.place(this.root, this.broom, .40, .05, .50); this.broom.visible = false
      art.place(this.broom, art.box(.50, .10, .20, '#c89449', .04), 0, .06, 0)
      const shaft = art.cylinder(.026, .98, '#8d603c'); shaft.rotation.z = -.3; art.place(this.broom, shaft, .14, .51, 0)
      for (let i = 0; i < 9; i++) art.place(this.broom, art.box(.032, .10, .20, '#e8bd6e', .01), -.21 + i * .052, .01, 0)
    }
    if (seated) {
      this.root.updateMatrixWorld(true)
      this.root.position.y = .5425 - new THREE.Box3().setFromObject(this.body).min.y
      this.pose(0, {})
    }
  }
  applyDiningGuest(guest: DiningGuest) {
    if (this.role !== 'guest') return
    this.dining?.dispose(); this.dining = guest
    this.setBodyVisible(false); this.root.add(guest.root)
    if (this.seated) this.root.position.y = 0
    this.root.userData.guestModel = 'bungeoppang'
    this.pose(0, {})
  }
  disposeGuest() { this.dining?.dispose() }
  get guestFloorY() { return this.dining ? 0 : this.root.position.y }
  orderBubbleHeight() { return this.dining?.labelHeight ?? 2.1 }
  seatGap() { this.root.updateMatrixWorld(true); return this.dining ? this.dining.root.userData.seatGap ?? 0 : new THREE.Box3().setFromObject(this.body).min.y - .5425 }
  /** Keep gameplay attachments (tray, selection ring and broom) when replacing the body. */
  setBodyVisible(visible: boolean) {
    this.torso.visible = visible
    this.legs.forEach(leg => { leg.visible = visible })
  }
  pose(dt: number, state: ToyPose) {
    if (this.dining) { this.dining.update(dt, state.seated ?? this.seated, !!state.moving, !!state.eating, !!state.reduced, this.root.rotation.y); return }
    this.phase += dt; const motion = !state.reduced, wave = motion ? Math.sin(this.phase * 11) : 0
    this.torso.position.y = .72 + (!this.seated && state.moving && motion ? Math.abs(wave) * .045 : 0)
    this.torso.rotation.x = state.cleaning ? .28 : 0
    this.head.rotation.y = this.seated && motion ? Math.sin(this.phase * .7) * .07 : 0
    this.head.rotation.x = -.22
    if (!this.seated) this.legs.forEach((leg, i) => { leg.rotation.x = state.moving && motion ? wave * .43 * (i ? -1 : 1) : 0 })
    this.arms.forEach((arm, i) => {
      arm.rotation.x = state.cleaning ? -1.0 + wave * .08 : state.carrying ? -1.1 : this.seated ? -.75 : state.moving && motion ? wave * .37 * (i ? 1 : -1) : 0
      arm.rotation.z = (i ? -1 : 1) * .08
      this.elbows[i].rotation.x = state.carrying ? -.65 : this.seated ? -.70 + (state.eating && motion ? Math.sin(this.phase * 3) * .12 : 0) : -.05
    })
    this.broom.visible = !!state.cleaning
    this.broom.position.x = .35 + (state.cleaning && motion ? Math.sin(this.phase * 14) * .22 : 0)
  }
}
