export const missShockMs = 500

const resting = { intensity: 0, sway: 0, pitch: 0, roll: 0, xray: 0, stiffness: 0 }
export type MissShockPose = typeof resting

export function sampleMissShock(ageMs: number) {
  if (ageMs <= 0 || ageMs >= missShockMs) return resting

  const fade = Math.min(1, ageMs / 45, (missShockMs - ageMs) / 230)
  const intensity = fade * fade * (3 - 2 * fade)
  // A single local exposure, followed by the last few sparks and the recovery pose.
  const exposure = Math.min(1, ageMs / 36, Math.max(0, (410 - ageMs) / 105))
  const tremor = Math.sin(ageMs * 0.064) + Math.sin(ageMs * 0.037) * 0.3
  return {
    intensity,
    sway: 0.033 * tremor * intensity,
    pitch: Math.sin(ageMs * 0.049) * 0.032 * intensity,
    roll: -0.049 * tremor * intensity,
    xray: exposure * exposure * (3 - 2 * exposure),
    stiffness: intensity,
  }
}
