export const manholeDurationMs = 2300

const launchMs = 300
const exitShaftMs = 490
const turnMs = 960
const birdExitMs = 1920
const impactMs = 1820
const closedLid = { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0 }

function ease(value: number) {
  return value * value * (3 - 2 * value)
}

function arc(t: number) {
  return 4 * t * (1 - t)
}

export function sampleManholeDistraction(elapsed: number, direction: -1 | 1) {
  if (elapsed <= 0) return { lid: closedLid, bird: null }
  let lid = closedLid
  if (elapsed < launchMs) {
    const t = elapsed / launchMs
    const shake = Math.sin(t * Math.PI * 7) * Math.sin(t * Math.PI)
    lid = { ...closedLid, y: Math.abs(shake) * 0.021, roll: shake * 0.058, pitch: -shake * 0.036 }
  } else if (elapsed < impactMs) {
    const t = (elapsed - launchMs) / (impactMs - launchMs)
    const swing = Math.sin(t * Math.PI)
    lid = {
      x: -direction * 0.63 * swing ** 0.8,
      y: 1.16 * arc(t),
      z: -0.19 * swing,
      pitch: 0.65 * swing * Math.cos(3.5 * t),
      yaw: direction * 2 * Math.PI * ease(t),
      roll: -direction * 0.46 * swing,
    }
  } else if (elapsed < 2180) {
    const bounce = elapsed < 2050
      ? 0.087 * arc((elapsed - impactMs) / (2050 - impactMs))
      : 0.021 * arc((elapsed - 2050) / 130)
    lid = { ...closedLid, y: bounce, roll: direction * bounce * 1.6, pitch: bounce * -1.1 }
  }

  if (elapsed < exitShaftMs || elapsed >= birdExitMs) return { lid, bird: null }
  const rise = Math.min(1, (elapsed - exitShaftMs) / (turnMs - exitShaftMs))
  const escape = Math.max(0, (elapsed - turnMs) / (birdExitMs - turnMs))
  const beat = (elapsed - exitShaftMs) * 0.001 * 2 * Math.PI * 9.2
  const spread = ease(Math.min(1, Math.max(0, (rise - 0.38) / 0.58)))
  return {
    lid,
    bird: {
      rise, approach: escape ** 1.48, spread,
      flap: Math.sin(beat),
      oppositeFlap: Math.sin(beat + 0.49),
      wobble: Math.sin(beat * 0.38),
    },
  }
}
