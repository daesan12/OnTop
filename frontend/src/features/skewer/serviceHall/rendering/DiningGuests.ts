import * as THREE from 'three'
import { CUSTOMER_ASSETS_V5 } from '../../../bungeoppang/customerAssetsV5'
import { CustomerModelPoolV5, instantiateCustomerV5 } from '../../../bungeoppang/customerModelV5'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { FLOOR_DEPTH_SCALE } from './HallFloor'
import { RESTAURANT_ACTOR_HEIGHT } from './CharacterScale'

// Skewer-owned proportions. Never change the original bungeoppang metadata or GLBs.
export const DINING_GUEST_HEIGHTS = CUSTOMER_ASSETS_V5.map(() => RESTAURANT_ACTOR_HEIGHT)
export const DINING_SEAT_HEIGHT = .5425

export class DiningGuests {
  private pool = new CustomerModelPoolV5()
  private leases: { release: () => void }[] = []
  private sources: GLTF[] = []
  static async load() {
    const library = new DiningGuests()
    try {
      const leases = CUSTOMER_ASSETS_V5.map(asset => library.pool.acquire(asset))
      library.leases = leases
      library.sources = await Promise.all(leases.map(lease => lease.ready))
      return library
    } catch (error) { library.dispose(); throw error }
  }
  create(index: number) {
    const variant = ((index % this.sources.length) + this.sources.length) % this.sources.length
    return new DiningGuest(this.sources[variant], variant)
  }
  dispose() { this.leases.forEach(lease => lease.release()); this.pool.dispose() }
}

/** Independent skeleton/mixer per person, shared source geometry and textures per visit. */
export class DiningGuest {
  readonly root = new THREE.Group()
  private actor: ReturnType<typeof instantiateCustomerV5>
  private bones = new Map<string, THREE.Object3D>()
  private time = 0
  private footHeights = [0, 0]
  private base = new THREE.Vector3()
  private p = new THREE.Vector3(); private q = new THREE.Vector3(); private direction = new THREE.Vector3()
  private rotation = new THREE.Quaternion(); private parentRotation = new THREE.Quaternion(); private delta = new THREE.Quaternion()
  private correction = new THREE.Matrix4(); private turn = new THREE.Matrix4(); private inverseTurn = new THREE.Matrix4()
  private worldToRoot = new THREE.Matrix4(); private scale = new THREE.Vector3()
  private hip = new THREE.Vector3(); private knee = new THREE.Vector3(); private ankle = new THREE.Vector3()
  private foot = new THREE.Vector3(); private axis = new THREE.Vector3(); private outward = new THREE.Vector3()
  private targetKnee = new THREE.Vector3(); private shoulder = new THREE.Vector3()
  private elbow = new THREE.Vector3(); private hand = new THREE.Vector3(); private shoeRotation = new THREE.Quaternion()
  private poseState = -1; private poseYaw = NaN
  private depth = new THREE.Matrix4().makeScale(1, 1, 1 / FLOOR_DEPTH_SCALE)
  labelHeight = 2.1
  get standingHeight() { return DINING_GUEST_HEIGHTS[this.variant] }
  constructor(source: GLTF, readonly variant: number) {
    this.actor = instantiateCustomerV5(source, { id: CUSTOMER_ASSETS_V5[variant].id, height: DINING_GUEST_HEIGHTS[variant] })
    this.root.add(this.actor.root)
    this.root.name = `bungeoppang-dining-${CUSTOMER_ASSETS_V5[variant].id}`
    this.actor.root.traverse(o => { if (o instanceof THREE.Bone) this.bones.set(o.name.replace('mixamorig:', '').replace('mixamorig', ''), o) })
    this.root.updateMatrixWorld(true)
    this.worldToRoot.copy(this.root.matrixWorld).invert()
    for (const [i, side] of ['Left', 'Right'].entries()) this.footHeights[i] = this.localPosition(side + 'Foot', this.p).y
    this.base.copy(this.actor.root.position)
    this.root.matrixAutoUpdate = false
  }
  private localPosition(name: string, target: THREE.Vector3) {
    const bone = this.bones.get(name)
    if (!bone) throw new Error(`Missing dining joint: ${name}`)
    return target.setFromMatrixPosition(bone.matrixWorld).applyMatrix4(this.worldToRoot)
  }
  /** Aim a joint in world space: imported rigs have different local axes and rest rotations. */
  private aim(name: string, child: string, target: THREE.Vector3) {
    const bone = this.bones.get(name)!, end = this.bones.get(child)!
    // The pose owns the matrix update order. Only the changed bone subtree is dirty.
    this.p.setFromMatrixPosition(bone.matrixWorld); this.q.setFromMatrixPosition(end.matrixWorld)
    this.direction.copy(target).sub(this.p).normalize()
    this.delta.setFromUnitVectors(this.q.sub(this.p).normalize(), this.direction)
    bone.matrixWorld.decompose(this.q, this.rotation, this.scale)
    bone.parent!.matrixWorld.decompose(this.q, this.parentRotation, this.scale)
    bone.quaternion.copy(this.parentRotation.invert().multiply(this.delta).multiply(this.rotation))
    bone.updateMatrixWorld(true)
  }
  update(dt: number, seated: boolean, moving: boolean, eating: boolean, reduced: boolean, yaw: number) {
    const state = Number(seated) | Number(moving) << 1 | Number(eating) << 2 | Number(reduced) << 3
    // A zero-time frame must still apply a new seated/motion/accessibility state.
    if ((dt === 0 || reduced) && state === this.poseState && yaw === this.poseYaw) return
    this.poseState = state; this.poseYaw = yaw
    // Cancel only the hall's floor depth stretch, before the character's facing rotation.
    this.root.matrix.copy(this.correction.copy(this.inverseTurn.makeRotationY(-yaw)).multiply(this.depth).multiply(this.turn.makeRotationY(yaw)))
    this.actor.root.position.copy(this.base)
    this.actor.play(moving && !reduced ? 'walk' : 'idle', reduced)
    this.actor.update(reduced ? 0 : dt, 0, 1)
    this.root.updateWorldMatrix(true, true)
    this.worldToRoot.copy(this.root.matrixWorld).invert()
    if (!seated) return
    this.time += reduced ? 0 : dt
    const hips = this.localPosition('Hips', this.p)
    this.actor.root.position.y += DINING_SEAT_HEIGHT + .12 - hips.y
    this.labelHeight = DINING_GUEST_HEIGHTS[this.variant] + this.actor.root.position.y + .25
    this.root.updateMatrixWorld(true)
    for (const [i, side] of ['Left', 'Right'].entries()) {
      const hip = this.localPosition(side + 'UpLeg', this.hip), knee = this.localPosition(side + 'Leg', this.knee), ankle = this.localPosition(side + 'Foot', this.ankle)
      const upper = hip.distanceTo(knee), lower = knee.distanceTo(ankle)
      const foot = this.foot.set(hip.x, this.footHeights[i], hip.z + upper * .93)
      const axis = this.axis.copy(foot).sub(hip), distance = axis.length(); axis.normalize()
      const along = (upper * upper - lower * lower + distance * distance) / (2 * distance)
      const bend = Math.sqrt(Math.max(0, upper * upper - along * along))
      const outward = this.outward.set(0, -axis.z, axis.y).negate()
      const targetKnee = this.targetKnee.copy(hip).addScaledVector(axis, along).addScaledVector(outward, bend)
      // Keep the shoe's evaluated idle orientation while flexing the two leg bones.
      const shoe = this.bones.get(side + 'Foot')!
      shoe.matrixWorld.decompose(this.q, this.shoeRotation, this.scale)
      this.aim(side + 'UpLeg', side + 'Leg', targetKnee.applyMatrix4(this.root.matrixWorld))
      this.aim(side + 'Leg', side + 'Foot', foot.applyMatrix4(this.root.matrixWorld))
      shoe.parent!.matrixWorld.decompose(this.q, this.parentRotation, this.scale)
      shoe.quaternion.copy(this.parentRotation.invert().multiply(this.shoeRotation)); shoe.updateMatrixWorld(true)
      const shoulder = this.localPosition(side + 'Arm', this.shoulder)
      const elbow = this.elbow.set(i ? .04 : -.04, -.22, .13).add(shoulder)
      const hand = this.hand.set(i ? -.10 : .10, -.28 + (eating && !reduced ? Math.sin(this.time * 2.8 + i) * .045 : 0), .39).add(shoulder)
      this.aim(side + 'Arm', side + 'ForeArm', elbow.applyMatrix4(this.root.matrixWorld))
      this.aim(side + 'ForeArm', side + 'Hand', hand.applyMatrix4(this.root.matrixWorld))
    }
    this.root.userData.seatGap = this.localPosition('Hips', this.p).y - .12 - DINING_SEAT_HEIGHT
    const gaps = this.root.userData.footGaps ??= [0, 0]
    for (const [i, side] of ['Left', 'Right'].entries()) gaps[i] = this.localPosition(side + 'Foot', this.p).y - this.footHeights[i]
  }
  dispose() { this.actor.dispose(); this.root.removeFromParent() }
}
