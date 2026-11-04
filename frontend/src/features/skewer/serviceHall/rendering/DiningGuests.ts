import * as THREE from 'three'
import { CUSTOMER_ASSETS_V5 } from '../../../bungeoppang/customerAssetsV5'
import { CustomerModelPoolV5, instantiateCustomerV5 } from '../../../bungeoppang/customerModelV5'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { FLOOR_DEPTH_SCALE } from './HallFloor'

// Skewer-owned proportions. Never change the original bungeoppang metadata or GLBs.
export const DINING_GUEST_HEIGHTS = [1.82, 2.12, 2.12, 2.08, 1.82, 2.10] as const
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
  private depth = new THREE.Matrix4().makeScale(1, 1, 1 / FLOOR_DEPTH_SCALE)
  labelHeight = 2.1
  constructor(source: GLTF, readonly variant: number) {
    this.actor = instantiateCustomerV5(source, { id: CUSTOMER_ASSETS_V5[variant].id, height: DINING_GUEST_HEIGHTS[variant] })
    this.root.add(this.actor.root)
    this.root.name = `bungeoppang-dining-${CUSTOMER_ASSETS_V5[variant].id}`
    this.actor.root.traverse(o => { if (o instanceof THREE.Bone) this.bones.set(o.name.replace('mixamorig:', '').replace('mixamorig', ''), o) })
    this.root.updateMatrixWorld(true)
    for (const [i, side] of ['Left', 'Right'].entries()) this.footHeights[i] = this.localPosition(side + 'Foot').y
    this.base.copy(this.actor.root.position)
    this.root.matrixAutoUpdate = false
  }
  private localPosition(name: string) {
    const bone = this.bones.get(name)
    if (!bone) throw new Error(`Missing dining joint: ${name}`)
    return this.root.worldToLocal(bone.getWorldPosition(new THREE.Vector3()))
  }
  /** Aim a joint in world space: imported rigs have different local axes and rest rotations. */
  private aim(name: string, child: string, target: THREE.Vector3) {
    const bone = this.bones.get(name)!, end = this.bones.get(child)!
    this.root.updateMatrixWorld(true)
    bone.getWorldPosition(this.p); end.getWorldPosition(this.q)
    this.direction.copy(target).sub(this.p).normalize()
    this.delta.setFromUnitVectors(this.q.sub(this.p).normalize(), this.direction)
    bone.getWorldQuaternion(this.rotation); bone.parent!.getWorldQuaternion(this.parentRotation)
    bone.quaternion.copy(this.parentRotation.invert().multiply(this.delta).multiply(this.rotation))
    bone.updateMatrixWorld(true)
  }
  update(dt: number, seated: boolean, moving: boolean, eating: boolean, reduced: boolean, yaw: number) {
    // Cancel only the hall's floor depth stretch, before the character's facing rotation.
    this.root.matrix.copy(this.correction.copy(this.inverseTurn.makeRotationY(-yaw)).multiply(this.depth).multiply(this.turn.makeRotationY(yaw)))
    this.actor.root.position.copy(this.base)
    this.actor.play(moving && !reduced ? 'walk' : 'idle', reduced)
    this.actor.update(reduced ? 0 : dt, 0, 1)
    this.root.updateMatrixWorld(true)
    if (!seated) return
    this.time += reduced ? 0 : dt
    const hips = this.localPosition('Hips')
    this.actor.root.position.y += DINING_SEAT_HEIGHT + .12 - hips.y
    this.labelHeight = DINING_GUEST_HEIGHTS[this.variant] + this.actor.root.position.y + .25
    this.root.updateMatrixWorld(true)
    for (const [i, side] of ['Left', 'Right'].entries()) {
      const hip = this.localPosition(side + 'UpLeg'), knee = this.localPosition(side + 'Leg'), ankle = this.localPosition(side + 'Foot')
      const upper = hip.distanceTo(knee), lower = knee.distanceTo(ankle)
      const foot = new THREE.Vector3(hip.x, this.footHeights[i], hip.z + upper * .93)
      const axis = foot.clone().sub(hip), distance = axis.length(); axis.normalize()
      const along = (upper * upper - lower * lower + distance * distance) / (2 * distance)
      const bend = Math.sqrt(Math.max(0, upper * upper - along * along))
      const outward = new THREE.Vector3(0, -axis.z, axis.y).negate()
      const targetKnee = hip.clone().addScaledVector(axis, along).addScaledVector(outward, bend)
      // Keep the shoe's evaluated idle orientation while flexing the two leg bones.
      const shoe = this.bones.get(side + 'Foot')!, shoeRotation = shoe.getWorldQuaternion(new THREE.Quaternion())
      this.aim(side + 'UpLeg', side + 'Leg', this.root.localToWorld(targetKnee))
      this.aim(side + 'Leg', side + 'Foot', this.root.localToWorld(foot))
      shoe.quaternion.copy(shoe.parent!.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(shoeRotation))
      const shoulder = this.localPosition(side + 'Arm')
      const elbow = shoulder.clone().add(new THREE.Vector3(i ? .04 : -.04, -.22, .13))
      const hand = shoulder.clone().add(new THREE.Vector3(i ? -.10 : .10, -.28 + (eating && !reduced ? Math.sin(this.time * 2.8 + i) * .045 : 0), .39))
      this.aim(side + 'Arm', side + 'ForeArm', this.root.localToWorld(elbow))
      this.aim(side + 'ForeArm', side + 'Hand', this.root.localToWorld(hand))
    }
    this.root.updateMatrixWorld(true)
    this.root.userData.seatGap = this.localPosition('Hips').y - .12 - DINING_SEAT_HEIGHT
    this.root.userData.footGaps = ['Left', 'Right'].map((side, i) => this.localPosition(side + 'Foot').y - this.footHeights[i])
  }
  dispose() { this.actor.dispose(); this.root.removeFromParent() }
}
