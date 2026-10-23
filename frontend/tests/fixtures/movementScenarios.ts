import { LAKE, MOVEMENT, STEPPING_STONES, SWIMMING } from '../../src/config'

/** Synthetic approved WORLD_STATE samples for FE QA only.
 * These are not server physics, a runtime movement mock, or invented grounded/velocity DTOs.
 */
export const movementScenarios = {
  walk: { x: -10, y: 0.8, z: 21, yaw: Math.PI, moving: true, running: false, swimming: false },
  run: { x: -10, y: 0.8, z: 20, yaw: Math.PI, moving: true, running: true, swimming: false },
  jump: { x: -10, y: 2, z: 20, yaw: Math.PI, moving: false, running: false, swimming: false },
  land: { x: -10, y: 0.8, z: 20, yaw: Math.PI, moving: false, running: false, swimming: false },
  swim: { x: LAKE.x, y: LAKE.surfaceY + SWIMMING.floatOffset, z: LAKE.z,
    yaw: Math.PI, moving: true, running: false, swimming: true },
  fastSwim: { x: LAKE.x + 0.5, y: LAKE.surfaceY + SWIMMING.floatOffset, z: LAKE.z - 0.5,
    yaw: Math.PI, moving: true, running: true, swimming: true },
  stone: { x: STEPPING_STONES[12]!.x, y: STEPPING_STONES[12]!.top + MOVEMENT.halfHeight + MOVEMENT.radius + MOVEMENT.offset,
    z: STEPPING_STONES[12]!.z, yaw: Math.PI, moving: false, running: false, swimming: false },
} as const
