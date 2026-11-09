import { advanceRope, judgePass, jumpPrepareMs, sampleFlightHeight } from './jumpRopeJudgement'
import type { JudgementSettings, JumpTiming, PassJudgement } from './jumpRopeJudgement'

const landMs = 45
const recoveryMs = 65

type Jump = JumpTiming & { from: Pose }
export type PreviewPass = PassJudgement & { number: number }
export type JumpFrame = {
  phase: 'ready' | 'prepare' | 'air' | 'land' | 'recover'
  progress: number
  height: number
  from?: Pose
}

const ready: JumpFrame = { phase: 'ready', progress: 0, height: 0 }

export type PreviewMotion = {
  angle: number
  lastAt: number | null
  ropeSpeed: number
  passCount: number
  jump: Jump | null
  frame: JumpFrame
}

export function createPreviewMotion(): PreviewMotion {
  return { angle: 0, lastAt: null, ropeSpeed: 0, passCount: 0, jump: null, frame: ready }
}

export function requestJump(motion: PreviewMotion, now: number, peak: number, flightSeconds: number) {
  const current = motion.jump ? sampleJumpFrame(motion.jump, now) : ready
  if (current.phase !== 'ready' && current.phase !== 'recover') return false
  // Start a new preparation from the current recovery pose at the input timestamp.
  motion.jump = { startedAt: now, flightMs: flightSeconds * 1000, peak, from: sampleJumpPose(current) }
  return true
}

export function advancePreviewMotion(motion: PreviewMotion, now: number, ropeSpeed: number, settings: JudgementSettings) {
  const results: PreviewPass[] = []
  if (motion.lastAt !== null) {
    const step = advanceRope(motion.angle, motion.lastAt, now, motion.ropeSpeed)
    motion.angle = step.angle
    for (const at of step.passages) {
      results.push({ ...judgePass(at, motion.jump, settings), number: ++motion.passCount })
    }
  }
  motion.lastAt = now
  motion.ropeSpeed = ropeSpeed

  motion.frame = motion.jump ? sampleJumpFrame(motion.jump, now) : ready
  return results
}

function sampleJumpFrame(jump: Jump, now: number): JumpFrame {
  const elapsed = Math.max(0, now - jump.startedAt)
  const airTime = elapsed - jumpPrepareMs
  const landTime = airTime - jump.flightMs
  const recoveryTime = landTime - landMs

  if (airTime < 0) {
    return { phase: 'prepare', progress: elapsed / jumpPrepareMs, height: 0, from: jump.from }
  }
  if (landTime < 0) {
    const progress = airTime / jump.flightMs
    return { phase: 'air', progress, height: sampleFlightHeight(progress, jump.peak) }
  }
  if (recoveryTime < 0) {
    return { phase: 'land', progress: landTime / landMs, height: 0 }
  }
  if (recoveryTime < recoveryMs) {
    return { phase: 'recover', progress: recoveryTime / recoveryMs, height: 0 }
  }
  return ready
}

type Pose = {
  thigh: number; knee: number; toe: number; shoulder: number; elbow: number; spread: number; lean: number
}

const standing: Pose = { thigh: 0, knee: 0, toe: 0, shoulder: 0, elbow: 0, spread: 0, lean: 0 }
const loaded: Pose = { thigh: -0.4, knee: 0.79, toe: 0, shoulder: 0.31, elbow: -0.32, spread: 0.08, lean: 0.24 }
const extended: Pose = { thigh: -0.026, knee: 0.055, toe: 0, shoulder: -0.31, elbow: -0.41, spread: 0.13, lean: -0.045 }
const tucked: Pose = { thigh: -0.26, knee: 0.67, toe: 0.12, shoulder: -0.23, elbow: -0.64, spread: 0.17, lean: 0.085 }
const contact: Pose = { thigh: -0.083, knee: 0.17, toe: 0, shoulder: -0.09, elbow: -0.38, spread: 0.11, lean: 0.1 }
const absorbed: Pose = { thigh: -0.43, knee: 0.84, toe: 0, shoulder: -0.15, elbow: -0.5, spread: 0.13, lean: 0.25 }

function blendPose(from: Pose, to: Pose, progress: number): Pose {
  const weight = progress * progress * (3 - 2 * progress)
  return {
    thigh: from.thigh + (to.thigh - from.thigh) * weight,
    knee: from.knee + (to.knee - from.knee) * weight,
    toe: from.toe + (to.toe - from.toe) * weight,
    shoulder: from.shoulder + (to.shoulder - from.shoulder) * weight,
    elbow: from.elbow + (to.elbow - from.elbow) * weight,
    spread: from.spread + (to.spread - from.spread) * weight,
    lean: from.lean + (to.lean - from.lean) * weight,
  }
}

export function sampleJumpPose({ phase, progress, from }: JumpFrame): Pose {
  switch (phase) {
    case 'prepare':
      return progress < 0.58
        ? blendPose(from ?? standing, loaded, progress / 0.58)
        : blendPose(loaded, extended, (progress - 0.58) / 0.42)
    case 'air':
      return progress < 0.46
        ? blendPose(extended, tucked, progress / 0.46)
        : blendPose(tucked, contact, (progress - 0.46) / 0.54)
    case 'land':
      return blendPose(contact, absorbed, progress)
    case 'recover':
      return blendPose(absorbed, standing, progress)
    case 'ready':
      return standing
  }
}
