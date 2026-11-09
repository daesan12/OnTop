export const jumpPrepareMs = 70
export const ropeGroundGap = 0.017
const revolution = Math.PI * 2

export type JumpTiming = { startedAt: number; flightMs: number; peak: number }
export type JudgementSettings = { ropeWidth: number; clearanceMargin: number; perfectWindowMs: number }
export type PassJudgement = {
  at: number
  kind: 'perfect' | 'good' | 'miss'
  inputLeadMs: number | null
  footHeight: number
  requiredHeight: number
}

export function sampleFlightHeight(progress: number, peak: number) {
  return progress > 0 && progress < 1 ? 4 * peak * progress * (1 - progress) : 0
}

/** The bottom of each full turn is the same phase as the rendered rope's lowest center. */
export function advanceRope(angle: number, from: number, to: number, speed: number) {
  const passages: number[] = []
  if (speed <= 0 || to <= from) return { angle, passages }

  const periodMs = 1000 / speed
  const start = angle / revolution
  const end = start + (to - from) / periodMs
  // Round off integration noise at the full-turn boundary, where angle resets to zero.
  const completed = Math.floor(end + 1e-10)
  for (let turn = 1; turn <= completed; turn++) {
    passages.push(Math.min(to, from + (turn - start) * periodMs))
  }
  return { angle: Math.max(0, end - completed) * revolution, passages }
}

export function requiredFootHeight({ ropeWidth, clearanceMargin }: JudgementSettings) {
  return ropeGroundGap + ropeWidth + clearanceMargin
}

export function judgePass(at: number, jump: JumpTiming | null, settings: JudgementSettings): PassJudgement {
  const requiredHeight = requiredFootHeight(settings)
  const inputLeadMs = jump && jump.startedAt <= at ? at - jump.startedAt : null
  const footHeight = jump && inputLeadMs !== null
    ? sampleFlightHeight((inputLeadMs - jumpPrepareMs) / jump.flightMs, jump.peak)
    : 0
  let kind: PassJudgement['kind'] = 'miss'
  if (jump && inputLeadMs !== null && footHeight >= requiredHeight) {
    const idealLeadMs = jumpPrepareMs + jump.flightMs / 2
    kind = Math.abs(inputLeadMs - idealLeadMs) <= settings.perfectWindowMs ? 'perfect' : 'good'
  }
  return { at, kind, inputLeadMs, footHeight, requiredHeight }
}

export function clearanceWindowMs(peak: number, flightMs: number, settings: JudgementSettings) {
  const ratio = requiredFootHeight(settings) / peak
  if (ratio > 1) return null
  const halfWindow = Math.sqrt(1 - ratio) * flightMs / 2
  const ideal = jumpPrepareMs + flightMs / 2
  return { earliest: ideal + halfWindow, latest: ideal - halfWindow, ideal }
}
