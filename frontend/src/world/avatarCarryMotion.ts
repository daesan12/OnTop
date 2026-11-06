import { Vector3, type Object3D } from 'three'
import type { AvatarSnapshot } from '../network/worldClient'

export const CARRY_PULL_SECONDS = .16
export const CARRY_RELEASE_SECONDS = .22
export const CARRY_FINISH_SECONDS = .48
export const carryEase = (t: number) => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x) }

type CarryPair = {
  carryId: string; carrierId: string; carriedId: string; releasedAt: number | null; age: number
  carrierRig?: { root: Object3D }; carriedRig?: { root: Object3D }; left?: Object3D; right?: Object3D; hips?: Object3D
}
type PublicAvatar = Pick<AvatarSnapshot, 'carry' | 'connected'>

/** Per-canvas presentation only. The shared clock keeps both bodies on the same throw beat. */
export function createCarryMotion() {
  const pairs = new Map<string, CarryPair>(), participants = new Map<string, CarryPair>()
  const shoulder = new Vector3(), otherShoulder = new Vector3(), hip = new Vector3(), offset = new Vector3()
  const remove = (pair: CarryPair) => {
    pairs.delete(pair.carrierId)
    if (participants.get(pair.carrierId) === pair) participants.delete(pair.carrierId)
    if (participants.get(pair.carriedId) === pair) participants.delete(pair.carriedId)
  }
  return {
    get: (id: string) => participants.get(id),
    update(avatars: ReadonlyMap<string, PublicAvatar>, now: number) {
      for (const [id, avatar] of avatars) {
        const carry = avatar.carry, other = carry && avatars.get(carry.partnerId)
        if (!avatar.connected || carry?.role !== 'CARRIER' || !other?.connected
          || other.carry?.role !== 'CARRIED' || other.carry.partnerId !== id || other.carry.carryId !== carry.carryId) continue
        let pair = pairs.get(id)
        if (pair?.carryId !== carry.carryId) {
          if (pair) remove(pair)
          pair = { carryId: carry.carryId, carrierId: id, carriedId: carry.partnerId, releasedAt: null, age: 0 }
          pairs.set(id, pair); participants.set(id, pair); participants.set(carry.partnerId, pair)
        }
      }
      for (const pair of pairs.values()) {
        const carrier = avatars.get(pair.carrierId), carried = avatars.get(pair.carriedId)
        if (!carrier?.connected || !carried?.connected) { remove(pair); continue }
        const hold = carrier.carry, flight = carried.carry
        if (hold?.role === 'CARRIER' && hold.carryId === pair.carryId
          && hold.partnerId === pair.carriedId && flight?.role === 'CARRIED'
          && flight.carryId === pair.carryId && flight.partnerId === pair.carrierId) {
          pair.releasedAt = null; pair.age = 0; continue
        }
        // A drop, escape, new relation or late join must never invent a throw windup.
        if (carrier.carry || flight?.role !== 'THROWN' || flight.carryId !== pair.carryId
          || flight.partnerId !== pair.carrierId) { remove(pair); continue }
        pair.releasedAt ??= now
        pair.age = Math.max(0, (now - pair.releasedAt) / 1000)
        if (pair.age >= CARRY_FINISH_SECONDS) remove(pair)
      }
    },
    /** Run after all avatar poses, before overlays; frame order and camera visibility do not move the support. */
    place(rigs: ReadonlyMap<string, { root: Object3D }>) {
      for (const pair of pairs.values()) {
        const carrierRig = rigs.get(pair.carrierId), carriedRig = rigs.get(pair.carriedId)
        if (!carrierRig || !carriedRig) continue
        const carrier = carrierRig.root, carried = carriedRig.root
        if (pair.carrierRig !== carrierRig || pair.carriedRig !== carriedRig) {
          pair.carrierRig = carrierRig; pair.carriedRig = carriedRig
          pair.left = carrier.getObjectByName('upperArm_L'); pair.right = carrier.getObjectByName('upperArm_R')
          pair.hips = carried.getObjectByName('hips')
        }
        if (!pair.left || !pair.right || !pair.hips) continue
        pair.left.getWorldPosition(shoulder); pair.right.getWorldPosition(otherShoulder)
        shoulder.add(otherShoulder).multiplyScalar(.5)
        const throwing = pair.releasedAt !== null
        const pull = throwing ? carryEase(pair.age / CARRY_PULL_SECONDS) : 0
        const push = throwing ? carryEase((pair.age - CARRY_PULL_SECONDS) / .1) : 0
        const blend = throwing ? carryEase((pair.age - CARRY_RELEASE_SECONDS) / (CARRY_FINISH_SECONDS - CARRY_RELEASE_SECONDS)) : 0
        // Rest across the upper back, then lift across the shoulders and push toward +Z.
        const z = -.28 + .4 * pull + .4 * push
        offset.set(.06 * (1 - pull), .08 + .12 * Math.sin(pull * Math.PI) - .04 * push, z)
        const yaw = carrier.rotation.y, x = offset.x
        offset.x = x * Math.cos(yaw) + z * Math.sin(yaw)
        offset.z = z * Math.cos(yaw) - x * Math.sin(yaw)
        shoulder.add(offset)
        pair.hips.getWorldPosition(hip)
        // Visitors are an identity parent. This never changes public/predicted poses or collisions.
        carried.position.addScaledVector(shoulder.sub(hip), 1 - blend)
        carried.updateMatrixWorld(true)
      }
    },
  }
}
