const audienceDelays = [120, 180, 250, 300]
const resting = { pitch: 0, yaw: 0, roll: 0, wing: 0, jaw: 0, bob: 0 }

export function samplePigeonLaugh(role: 'holder' | 'audience', index: number, elapsedMs: number, durationMs: number) {
  const holding = role === 'holder'
  const delay = holding ? index * 65 : (audienceDelays[index] ?? 300)
  const age = elapsedMs - delay
  if (age <= 0 || elapsedMs >= durationMs) return resting

  const progress = age / (durationMs - delay)
  const ramp = Math.min(1, progress / 0.16, (1 - progress) / 0.3)
  const envelope = ramp * ramp * (3 - 2 * ramp)
  const beat = age * (holding ? 0.026 - index * 0.004 : 0.022 + index * 0.003)
  const shake = Math.sin(beat)
  const side = index % 2 === 0 ? 1 : -1
  return {
    pitch: envelope * (holding ? -0.16 + shake * 0.12 : -0.28 + shake * (0.1 + index * 0.025)),
    yaw: envelope * side * (holding ? 0.11 : 0.18) * Math.sin(beat * 0.64),
    roll: envelope * side * (holding ? 0.12 : 0.18) * Math.cos(beat),
    wing: envelope * (0.45 + 0.55 * Math.abs(shake)) * (holding ? 0.24 : 0.34 + index * 0.045),
    jaw: holding ? 0 : envelope * (0.06 + Math.abs(shake) * 0.31),
    bob: holding ? envelope * Math.abs(Math.sin(beat * 0.65)) * 0.055 : 0,
  }
}
