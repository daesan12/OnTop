import { expect, it } from 'vitest'
import { Group, Vector3 } from 'three'
import { createCharacterRig } from '../../src/world/art/CharacterRig'
import { createAvatarMotion } from '../../src/world/avatarMotion'
import { oneCardHoldingPose } from '../../src/game/onecard/heldHand'
import { characterSource } from '../fixtures/characterRig'

for (const variant of ['man', 'girl'] as const) it(`${variant}: holds cards below the face and releases the pose outside One Card`, async () => {
  const rig = createCharacterRig(await characterSource(variant)), motion = createAvatarMotion(rig), figure = new Group()
  figure.add(rig.root)
  const avatar = { connected: true, moving: false, running: false, swimming: false, seatIndex: 1, benchId: '', tableId: 'table',
    fitnessId: '', fitnessStartedAt: 0, telescopeId: '', telescopePitch: 0, emote: '', emoteAt: 0 }
  const pose = { x: 0, y: .8, z: 0, yaw: 0 }
  for (let n = 0; n < 90; n++) motion.apply(avatar, 10000, 1 / 60, pose, figure, null, oneCardHoldingPose)
  const hands = ['L', 'R'].map(side => rig.bones[`hand_${side}` as 'hand_L' | 'hand_R'].getWorldPosition(new Vector3()))
  const headY = rig.bones.head.getWorldPosition(new Vector3()).y
  for (const hand of hands) {
    const worldY = .56 + rig.seatedHipLift - rig.hipHeight + hand.y
    expect(worldY + .18).toBeGreaterThan(1.08)
    expect(hand.y + .18).toBeLessThan(headY + .1)
    expect(hand.z).toBeGreaterThan(.15)
  }
  for (let n = 0; n < 90; n++) motion.apply(avatar, 10000, 1 / 60, pose, figure)
  expect(rig.bones.hand_L.getWorldPosition(new Vector3()).y).toBeLessThan(hands[0]!.y - .1)
  rig.dispose()
})
