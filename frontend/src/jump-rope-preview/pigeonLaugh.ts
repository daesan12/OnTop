const audienceDelays = [95, 170, 230, 285]
const audiencePitch = [1.65, 1.72, 1.62, 1.69]
const audienceLift = [0.079, 0.069, 0.083, 0.074]
const resting = { pitch: 0, lean: 0, headLift: 0, headForward: 0, jaw: 0, lift: 0, lidLift: 0 }

function ease(t: number) {
  const x = Math.min(1, Math.max(0, t))
  return x * x * (3 - 2 * x)
}

export function samplePigeonLaugh(role: 'holder' | 'audience', index: number, elapsedMs: number, durationMs: number, strength = 1) {
  const holding = role === 'holder'
  const delay = holding ? index * 65 : (audienceDelays[index] ?? 285)
  const age = elapsedMs - delay
  if (age <= 0 || elapsedMs >= durationMs) return resting

  const releaseMs = 245
  const lean = ease(age / 105) * ease((durationMs - elapsedMs) / releaseMs)
  const beatLength = Math.max(1, durationMs - delay - 105 - releaseMs)
  const beatProgress = Math.min(1, Math.max(0, (age - 105) / beatLength))
  const beats = holding ? 2 + index : 2 + index % 2
  const bounce = Math.sin(Math.PI * beats * beatProgress) ** 2 * (1 - beatProgress * 0.35)
  const pitch = holding ? 1.64 + index * 0.065 : (audiencePitch[index] ?? 1.65)
  const raisedPitch = Math.min(1.78, pitch * strength) * (0.97 + bounce * 0.03)
  const lift = holding ? 0.072 - index * 0.01 : (audienceLift[index] ?? 0.074)
  return {
    pitch: -lean * raisedPitch,
    lean,
    // Keep the head above the neck when the face rolls past vertical.
    headLift: lean * (1 - Math.cos(raisedPitch)) * 0.116,
    headForward: lean * Math.sin(raisedPitch) * 0.075,
    jaw: holding ? 0 : lean * (0.21 + bounce * 0.16),
    lift: lift * bounce,
    lidLift: -0.017 * lean,
  }
}
