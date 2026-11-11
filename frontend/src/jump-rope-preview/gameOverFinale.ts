export const finaleTakeoffMs = 480
export const finaleImpactMs = 1440
export const finaleFlyOutMs = 1790
export const finaleResultMs = 2420

export function finaleStage(age: number) {
  if (age >= finaleResultMs) return 'result'
  return age >= finaleImpactMs ? 'splash' : 'flight'
}

export function sampleFinaleFlight(age: number) {
  if (age < finaleTakeoffMs) return { lean: age / finaleTakeoffMs, path: 0, wing: 0, beat: 0 }
  if (age >= finaleFlyOutMs) return null
  const path = age <= finaleImpactMs
    ? (age - finaleTakeoffMs) / (finaleImpactMs - finaleTakeoffMs) * (2 / 3)
    : 2 / 3 + (age - finaleImpactMs) / (finaleFlyOutMs - finaleImpactMs) / 3
  return {
    lean: 1,
    path,
    wing: Math.min(1, (age - finaleTakeoffMs) / 150),
    beat: Math.sin((age - finaleTakeoffMs) * 0.047),
  }
}
