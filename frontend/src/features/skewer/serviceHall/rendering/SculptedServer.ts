import * as THREE from 'three'
import { SculptedChef } from './SculptedChef'
import type { ToyPose } from './ToyPeople'
import { RESTAURANT_ACTOR_HEIGHT } from './CharacterScale'

export const SCULPTED_SERVER_URL = '/art/skewer/characters/server-pink-v2.glb'
type Joint = { bone: THREE.Bone; rest: THREE.Quaternion; axis: THREE.Vector3 }

/** Presentation only: navigation, collision and carried items remain owned by the hall. */
export class SculptedServer {
  readonly root = new THREE.Group()
  readonly avatar: SculptedChef
  private phase = 0
  private stride = 0
  private carryBlend = 0
  private cleanBlend = 0
  private readonly joints = new Map<string, Joint>()
  private readonly rotation = new THREE.Quaternion()
  private readonly parentRotation = new THREE.Quaternion()
  private readonly inverseParent = new THREE.Quaternion()
  private readonly origin = new THREE.Vector3()
  private readonly direction = new THREE.Vector3()
  private readonly target = new THREE.Vector3()
  private readonly soles: { mesh: THREE.SkinnedMesh; index: number }[] = []

  static async load() {
    const avatar = await SculptedChef.load({ url: SCULPTED_SERVER_URL, name: 'skewer-sculpted-server', height: RESTAURANT_ACTOR_HEIGHT })
    try { return new SculptedServer(avatar) }
    catch (error) { avatar.dispose(); throw error }
  }

  constructor(avatar: SculptedChef) {
    this.avatar = avatar
    this.root.name = 'skewer-server-placement'
    this.root.add(avatar.root)
    this.root.updateMatrixWorld(true)
    avatar.model.traverse(object => {
      if (!(object instanceof THREE.Bone)) return
      const parentRotation = object.parent!.getWorldQuaternion(new THREE.Quaternion()).invert()
      this.joints.set(object.name, { bone: object, rest: object.quaternion.clone(), axis: new THREE.Vector3(1, 0, 0).applyQuaternion(parentRotation) })
    })
    for (const name of ['tripo1_Left_Limb_0', 'tripo1_Right_Limb_0', 'bone_8', 'tripo0_Right_Limb_0']) {
      if (!this.joints.has(name)) throw new Error('Unsupported skewer server skeleton')
    }
    // Keep a small set of sole vertices for floor contact during the walk cycle.
    avatar.model.traverse(object => {
      if (!(object instanceof THREE.SkinnedMesh)) return
      const cells = new Map<string, { index: number; y: number }>()
      for (let index = 0; index < object.geometry.attributes.position.count; index++) {
        object.getVertexPosition(index, this.target).applyMatrix4(object.matrixWorld)
        if (this.target.y > .06) continue
        const key = `${Math.round(this.target.x * 12)}:${Math.round(this.target.z * 12)}`
        if (!cells.has(key) || cells.get(key)!.y > this.target.y) cells.set(key, { index, y: this.target.y })
      }
      cells.forEach(({ index }) => this.soles.push({ mesh: object, index }))
    })
  }

  pose(dt: number, state: ToyPose, yaw: number) {
    const delta = Math.max(0, Math.min(dt, .05)), blend = 1 - Math.exp(-delta * 16)
    const moving = !!state.moving && !state.reduced
    this.phase += moving || (state.cleaning && !state.reduced) ? delta * 10 : 0
    this.stride += ((moving ? 1 : 0) - this.stride) * blend
    if (state.reduced) this.stride = 0
    this.carryBlend += ((state.carrying ? 1 : 0) - this.carryBlend) * blend
    this.cleanBlend += ((state.cleaning ? 1 : 0) - this.cleanBlend) * blend
    const wave = Math.sin(this.phase) * this.stride
    // The provider's retarget failed. These small, game-owned joint poses use the
    // generated skin rather than moving a rigid model or charging for another job.
    this.joints.forEach(joint => joint.bone.quaternion.copy(joint.rest))
    this.avatar.root.rotation.set(0, yaw, 0)
    this.avatar.root.position.y = Math.abs(wave) * .035
    for (const [side, sign] of [['Left', 1], ['Right', -1]] as const) {
      const swing = wave * .28 * sign, knee = Math.max(0, wave * sign) * .28
      this.rotate(`tripo1_${side}_Limb_0`, swing)
      this.rotate(`tripo1_${side}_Limb_1`, knee)
      this.rotate(`tripo1_${side}_Limb_3`, -swing - knee)
    }
    this.rotate('tripoSpine_0', this.cleanBlend * .12)
    this.root.updateMatrixWorld(true)
    // Shoulder/elbow names are mapped to this GLB, not guessed by left/right labels.
    for (const [shoulder, elbow, hand, sign] of [
      ['bone_8', 'tripo0_Left_Limb_0', 'tripo0_Left_Limb_1', 1],
      ['tripo0_Right_Limb_0', 'tripo0_Right_Limb_1', 'tripo0_Right_Limb_2', -1],
    ] as const) {
      const action = this.carryBlend
      const swing = wave * sign * .08 * (1 - action)
      this.aim(shoulder, elbow, sign * .37, .84, .15 + action * .12 + swing)
      const sweep = state.reduced ? 0 : Math.sin(this.phase * 1.4) * .05
      const cleaning = this.cleanBlend * (sign > 0 ? 1 : .55)
      this.aim(elbow, hand, sign * .44 + cleaning * sweep, .66 + action * .34 + cleaning * .06, .16 + action * .35 + cleaning * .33 + swing)
    }
    this.root.updateMatrixWorld(true)
    const floorY = this.root.getWorldPosition(this.origin).y
    let lowest = floorY
    for (const { mesh, index } of this.soles) {
      mesh.getVertexPosition(index, this.target).applyMatrix4(mesh.matrixWorld)
      lowest = Math.min(lowest, this.target.y)
    }
    this.avatar.root.position.y += floorY - lowest
    this.root.updateMatrixWorld(true)
  }

  private rotate(name: string, angle: number) {
    const joint = this.joints.get(name)
    if (joint) joint.bone.quaternion.copy(this.rotation.setFromAxisAngle(joint.axis, angle)).multiply(joint.rest)
  }

  private aim(name: string, endName: string, x: number, y: number, z: number) {
    const joint = this.joints.get(name), end = this.joints.get(endName)
    if (!joint || !end) return
    joint.bone.getWorldPosition(this.origin)
    end.bone.getWorldPosition(this.direction).sub(this.origin).normalize()
    this.avatar.root.localToWorld(this.target.set(x, y, z)).sub(this.origin).normalize()
    this.rotation.setFromUnitVectors(this.direction, this.target)
    joint.bone.parent!.getWorldQuaternion(this.parentRotation)
    this.rotation.premultiply(this.inverseParent.copy(this.parentRotation).invert()).multiply(this.parentRotation)
    joint.bone.quaternion.premultiply(this.rotation)
    joint.bone.updateWorldMatrix(false, true)
  }

  dispose() { this.root.removeFromParent(); this.avatar.dispose() }
}
