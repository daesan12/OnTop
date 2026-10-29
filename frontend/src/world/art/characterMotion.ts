import {
  FOUNTAIN,
  GAME_COURT,
  GARDEN_PAGODA,
  groundHeight,
  isOnParkWalkway,
} from '../../config'

export function createGait() {
  return {
    thighL: 0,
    thighR: 0,
    kneeL: 0,
    kneeR: 0,
    ankleL: 0,
    ankleR: 0,
    armL: 0,
    armR: 0,
    elbow: 0,
    lean: 0,
    hipYaw: 0,
    hipRoll: 0,
  }
}
/** Reuses the caller's output; distinct walk/run swing, knee recovery and elbow pose. */
export function sampleGait(
  phase: number,
  movement: number,
  run: number,
  out: ReturnType<typeof createGait>,
) {
  movement = Math.max(0, Math.min(1, movement))
  run = Math.max(0, Math.min(1, run))
  const swing = Math.sin(phase),
    amplitude = 0.38 + 0.24 * run
  out.thighL = swing * amplitude * movement
  out.thighR = -out.thighL
  // A thigh rotating from back to front is in recovery. Knee flexion must peak
  // mid-recovery (cosine), not at the forward end of the thigh swing (sine).
  const recoverL = Math.max(0, -Math.cos(phase))
  const recoverR = Math.max(0, Math.cos(phase))
  out.kneeL = (0.035 + recoverL * recoverL * (0.65 + 0.5 * run)) * movement
  out.kneeR = (0.035 + recoverR * recoverR * (0.65 + 0.5 * run)) * movement
  // Level the planted sole, relax the ankle only while the foot is in the air.
  out.ankleL = -out.thighL - out.kneeL + recoverL * 0.18 * movement
  out.ankleR = -out.thighR - out.kneeR + recoverR * 0.18 * movement
  out.armL = -swing * (0.26 + 0.27 * run) * movement
  out.armR = -out.armL
  out.elbow = -0.08 - (0.12 + 0.65 * run) * movement
  out.lean = 0.085 * run * movement
  out.hipYaw = swing * 0.035 * movement
  out.hipRoll = Math.cos(phase) * 0.018 * movement
  return out
}

/** Decorative paving sits above the physics terrain. Raised physics floors and
 * jumps already carry their own height, so never add paving height to those. */
export function pavingLift(x: number, z: number, actorFoot: number) {
  return Math.max(0, Math.min(0.11, groundHeight(x, z) + pavingHeight(x, z) - actorFoot))
}

/** Height of decorative paving above the terrain; 0 on grass. */
export function pavingHeight(x: number, z: number) {
  let height = 0
  if (Math.hypot(x - FOUNTAIN.x, z - FOUNTAIN.z) < FOUNTAIN.plazaRadius)
    height = 0.035
  else if (isOnParkWalkway(x, z)) height = 0.075
  if (
    Math.abs(x - GARDEN_PAGODA.x) < GARDEN_PAGODA.plazaWidth / 2 &&
    Math.abs(z - GARDEN_PAGODA.z) < GARDEN_PAGODA.plazaWidth / 2
  )
    height = Math.max(height, 0.07)
  if (
    GAME_COURT.rows.some(
      (row) => Math.hypot(Math.abs(x) - GAME_COURT.x, z - row) < 3.6,
    )
  )
    height = Math.max(height, 0.089)
  return height
}
