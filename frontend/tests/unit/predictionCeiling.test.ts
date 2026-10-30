import { expect, it } from 'vitest'
import RAPIER from '@dimforge/rapier3d-compat'
import { createPredictionPhysics } from '../../src/network/predictionPhysics'
import { MOVEMENT, groundHeight } from '../../src/config'

it('actual Rapier ceiling contact clears the upward impulse instead of pinning the avatar to the ceiling', async () => {
  const simulation = await createPredictionPhysics()
  try {
    const pose = { x: -10, y: groundHeight(-10, 42) + MOVEMENT.halfHeight + MOVEMENT.radius + .04, z: 42, yaw: 0 }
    const world = (simulation as unknown as { world: RAPIER.World }).world
    world.createCollider(RAPIER.ColliderDesc.cuboid(2, .1, 2)
      .setTranslation(pose.x, pose.y + MOVEMENT.halfHeight + MOVEMENT.radius + .25 + .1, pose.z))
    simulation.reset(pose, 0, true)
    const heights: number[] = []
    for (let frame = 0; frame < 20; frame++) {
      simulation.step({ dx: 0, dz: 0, run: false, jump: frame === 0 }, 1 / 60)
      heights.push(simulation.pose().y)
    }
    const peak = Math.max(...heights)
    expect(peak - pose.y).toBeGreaterThan(.1)
    expect(peak - pose.y).toBeLessThan(.3)
    expect(heights.at(-1)).toBeLessThan(peak - .1)
  } finally { simulation.dispose() }
})
