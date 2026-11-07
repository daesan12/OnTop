import { expect, it } from 'vitest'
import { Group, SkinnedMesh, Vector3 } from 'three'
import { drawnVertices } from '../../src/world/art/characterLook'
import { characterSource } from '../fixtures/characterRig'
import { createCharacterRig } from '../../src/world/art/CharacterRig'
import { createAvatarMotion } from '../../src/world/avatarMotion'
import { createCarryMotion } from '../../src/world/avatarCarryMotion'
import { createCarryClearance, carryBodiesOverlap } from '../../src/world/carryClearance'
import type { AvatarSnapshot } from '../../src/network/worldClient'

const carryId = 'carry'
const carrierCarry = { carryId, partnerId: 'target', role: 'CARRIER' as const }
const targetCarry = { carryId, partnerId: 'carrier', role: 'CARRIED' as const }
const makeAvatar = (carry: AvatarSnapshot['carry']) => ({ connected: true, moving: true, running: true, swimming: false,
  seatIndex: -1, benchId: '', tableId: '', fitnessId: '', fitnessStartedAt: 0, telescopeId: '', telescopePitch: 0,
  emote: '', emoteAt: 0, carry })

for (const name of ['man', 'girl', 'skins/ssafy-black-male-v3'] as const) {
  it(`${name}: preserves raised-back support while running, ducks under the overhead throw and joins flight at 30/60fps`, async () => {
    const source = await characterSource(name)
    for (const fps of [30, 60]) {
      const carrierRig = createCharacterRig(source), targetRig = createCharacterRig(source)
      const carrier = new Group(), carried = new Group(), carrierFigure = new Group(), carriedFigure = new Group()
      carrierFigure.name = 'figure-carrier'
      carrier.add(carrierFigure); carrierFigure.add(carrierRig.root)
      carried.add(carriedFigure); carriedFigure.add(targetRig.root)
      const rigs = new Map([['carrier', { root: carrier }], ['target', { root: carried }]])
      const own = makeAvatar(carrierCarry), other = makeAvatar(targetCarry), avatars = new Map([['carrier', own], ['target', other]])
      const carry = createCarryMotion(), ownMotion = createAvatarMotion(carrierRig), otherMotion = createAvatarMotion(targetRig)
      const pose = { x: 0, y: .84, z: 0, yaw: 0 }, flight = { current: { ...pose, y: 2.54 } }
      const hip = new Vector3(), left = new Vector3(), right = new Vector3(), hand = new Vector3()
      let now = 0
      const step = (age?: number) => {
        now += 1000 / fps
        carrier.position.set(pose.x, pose.y - .8, pose.z); carrier.rotation.y = pose.yaw
        carried.position.set(flight.current.x, flight.current.y - .8, flight.current.z); carried.rotation.y = pose.yaw
        carry.update(avatars, now)
        const beat = carry.get('target'), throwAge = beat?.releasedAt !== null ? beat?.age : undefined
        ownMotion.apply(own, now, 1 / fps, pose, carrierFigure, null, undefined, age === undefined ? null : flight, throwAge)
        otherMotion.apply(other, now, 1 / fps, flight.current, carriedFigure, null, undefined, null, throwAge)
        carry.place(rigs)
        targetRig.bones.hips.getWorldPosition(hip)
        return hip.clone()
      }
      for (let frame = 0; frame < fps; frame++) {
        pose.x = frame * .04; pose.yaw = Math.sin(frame / fps) * .7
        step()
        carrierRig.bones.upperArm_L.getWorldPosition(left); carrierRig.bones.upperArm_R.getWorldPosition(right)
        left.add(right).multiplyScalar(.5)
        const delta = hip.clone().sub(left).applyAxisAngle(new Vector3(0, 1, 0), -pose.yaw)
        expect(delta.x).toBeCloseTo(.06, 4)
        expect(delta.y).toBeCloseTo(.33, 4)
        expect(delta.z).toBeCloseTo(-.35, 4)
      }
      for (const side of ['L', 'R'] as const) {
        expect(carrierRig.bones[`upperArm_${side}`].rotation.x).toBeCloseTo(2.35, 5)
        expect(carrierRig.bones[`lowerArm_${side}`].rotation.x).toBeCloseTo(.4, 5)
      }
      carrierRig.bones.hand_L.getWorldPosition(hand)
      expect(hand.clone().sub(hip).length()).toBeLessThan(.5)
      const hands = ['L', 'R'].map(side => carrier.getObjectByName(`hand_${side}`)!.getWorldPosition(new Vector3()))
      const point = new Vector3()
      let supportGap = Infinity
      carried.updateMatrixWorld(true)
      carried.traverse(mesh => {
        if (!(mesh instanceof SkinnedMesh) || !mesh.name.startsWith('near-')) return
        for (const index of drawnVertices(mesh.geometry)) {
          mesh.getVertexPosition(index, point); mesh.localToWorld(point)
          for (const supportingHand of hands) supportGap = Math.min(supportGap, point.distanceTo(supportingHand))
        }
      })
      // A hand must remain near the displayed skin, not merely near an abstract anchor.
      expect(supportGap).toBeLessThan(.18)
      const held = hip.clone()
      own.carry = null; other.carry = { ...targetCarry, role: 'THROWN' }
      const launchYaw = pose.yaw
      const start = step(0), positions: Vector3[] = [start]
      expect(start.distanceTo(held)).toBeLessThan(.15)
      for (let frame = 1; frame <= Math.ceil(fps * .85); frame++) {
        const age = frame / fps
        // Continue steering the carrier after release; support and hands keep the original flight direction.
        pose.yaw = launchYaw + age * 2
        flight.current.x = pose.x + Math.sin(launchYaw) * 14 * age
        flight.current.z = Math.cos(launchYaw) * 14 * age
        flight.current.y = 2.54 + 8 * age - 15 * age * age
        positions.push(step(age))
        if (age > .15 && age < .3) {
          expect(carrierRig.bones.spine.rotation.x).toBeGreaterThan(.35)
          expect(carrierRig.bones.head.rotation.x).toBeGreaterThan(.15)
        }
        if (age < .16) {
          carrierRig.bones.upperArm_L.getWorldPosition(left); carrierRig.bones.upperArm_R.getWorldPosition(right)
          const delta = hip.clone().sub(left.add(right).multiplyScalar(.5)).applyAxisAngle(new Vector3(0, 1, 0), -pose.yaw - carrierFigure.rotation.y)
          expect(delta.z).toBeLessThan(-.35)
          expect(delta.y).toBeGreaterThan(.33)
        } else if (frame % Math.max(1, Math.floor(fps / 12)) === 0) {
          // Refit the actual skinned pose independently, without the production padding.
          const a = createCarryClearance(carrier, 0), b = createCarryClearance(carried, 0)
          a.update(); b.update()
          expect(carryBodiesOverlap(a, b), `${fps}fps overhead at ${age}s`).toBe(false)
        }
      }
      // The longer overhead windup joins a flight that has already advanced on the server.
      expect(Math.max(...positions.slice(1).map((point, i) => point.distanceTo(positions[i]!)))).toBeLessThan(1.6)
      expect(carried.position.toArray()).toEqual([flight.current.x, flight.current.y - .8, flight.current.z])
      expect(carry.get('carrier')).toBeUndefined()
      carrierRig.dispose(); targetRig.dispose()
    }
  })
}

it('does not invent a windup for drops, changed relationships, disconnected players or flight-only late joins', () => {
  for (const mode of ['drop', 'changed', 'disconnected', 'removed', 'late'] as const) {
    const carry = createCarryMotion(), own = makeAvatar(carrierCarry), other = makeAvatar(targetCarry)
    const avatars = new Map([['carrier', own], ['target', other]])
    if (mode !== 'late') carry.update(avatars, 0)
    own.carry = null
    other.carry = mode === 'drop' ? null : { ...targetCarry, carryId: mode === 'changed' ? 'new' : carryId, role: 'THROWN' }
    if (mode === 'disconnected') other.connected = false
    if (mode === 'removed') avatars.delete('target')
    carry.update(avatars, 16)
    expect(carry.get('carrier')).toBeUndefined(); expect(carry.get('target')).toBeUndefined()
  }
})
