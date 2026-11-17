// How an underground encounter plays out (S15P31B105-450). Players walk through in first person and the old
// 1.9 s pop at a fixed anchor was easy to miss, so each scare now has three beats over its duration:
//   build-up  — the nearby lamps stutter and dim, a drone and a heartbeat rise; nothing to see yet
//   reveal    — the creature is there, in your line of sight, larger than life, playing its own animation slowly
//   lunge     — it rushes your face with a scream, the lamps cut out, and it is gone
// Pure helpers here; InteriorEncounters drives them and horrorAudio follows the same fractions.

export const STAGE = { reveal: .17, lunge: .8, blackout: .94 } as const

const clamp = (x: number) => Math.max(0, Math.min(1, x))
const ease = (x: number) => { const n = clamp(x); return n * n * (3 - 2 * n) }

/** Larger than the player (1.7 m): tall figures read as looming, small ones (a face, a hand) as close. */
const SCALE: Record<number, number> = { 1: 1.15, 2: 1.3, 3: 1.3, 4: 1.45, 5: 1.7, 6: 1.45, 7: 1.3, 8: 1.25, 9: 1.2, 10: 1.35, 11: 1.4, 12: 1.15 }
/** Where it first stands, in metres ahead of your eyes. */
const DISTANCE: Record<number, number> = { 1: 2.2, 2: 3.2, 3: 2.6, 4: 3.2, 5: 2.4, 6: 2.6, 7: 3.4, 8: 3.2, 9: 3.6, 10: 3.2, 11: 3, 12: 3.4 }
/** How far of the way to your face it rushes (the wall pieces only surge). */
const LUNGE: Record<number, number> = { 6: .35, 8: .3, 12: .45 }
/** Height of the face above its floor before scaling (0: no face to bring down — a wall, the eyes). */
const FACE: Record<number, number> = { 1: 1.5, 2: 1.95, 7: 1.45, 8: 1.7, 9: 2.35, 10: 1.75, 11: 1.3 }
/** Metres the whole thing rises on the rush, to bring a face that hangs low (upside down) up to the eyes. */
const RISE: Record<number, number> = { 3: 1.1 }
/** Eye height in first person underground (CameraRig: feet + 1.5 m). */
export const EYE_HEIGHT = 1.5

export const encounterScale = (id: number) => SCALE[id] ?? 1.3
export const encounterDistance = (id: number) => DISTANCE[id] ?? 3

export interface StageFrame {
  /** The creature is drawn. */
  visible: boolean
  /** 0..1 through the creature's own animation (InteriorEncounters.animate). */
  reveal: number
  /** 0..1 through the rush at the viewer. */
  lunge: number
  /** Metres it has rushed towards the viewer. */
  advance: number
  /** Multiplier on the nearby lamps. */
  light: number
  /** Side-to-side shudder in metres while it rushes. */
  shake: number
  /** Forward lean in radians (unused for now: a lean turns the face to the floor). */
  tilt: number
  /** Metres it rises (or sinks, below zero) while rushing, bringing the face to eye level. */
  rise: number
}

/** The state of encounter `id` at fraction `t` of its duration; `start` (metres away) sets how far it can rush. */
export function stageFrame(id: number, t: number, start: number, seed = 0): StageFrame {
  const reveal = clamp((t - STAGE.reveal) / (STAGE.lunge - STAGE.reveal))
  const lunge = clamp((t - STAGE.lunge) / (STAGE.blackout - STAGE.lunge))
  // A tall creature sinks as it rushes so its face, still looking at you, ends level with your eyes (up close the
  // floor is out of view, so nobody sees the legs go through it); a face hanging low (upside down) rises instead.
  const face = (FACE[id] ?? 0) * encounterScale(id)
  const sink = face > EYE_HEIGHT + .1 ? face - EYE_HEIGHT : 0
  const reach = Math.max(0, start - .8) * (LUNGE[id] ?? 1)
  const rush = ease(lunge)
  // Build-up: hard stutter, settling dim; reveal: low and wavering; rush: darker; then out.
  const stutter = Math.sin(t * 173 + seed) * Math.sin(t * 61 + seed * 2) > .1 ? 1 : .12
  const light = t < STAGE.reveal ? (.25 + .6 * (1 - t / STAGE.reveal)) * stutter
    : t < STAGE.lunge ? .42 + .08 * Math.sin(t * 40 + seed)
    : t < STAGE.blackout ? .3 * (1 - lunge * .7)
    : 0
  return {
    visible: t >= STAGE.reveal && t < STAGE.blackout,
    reveal,
    lunge,
    advance: reach * lunge * lunge,
    light,
    shake: lunge > 0 ? Math.sin(t * 210 + seed) * .03 * (1 - lunge * .5) : 0,
    tilt: 0,
    rise: ((RISE[id] ?? 0) - sink) * rush,
  }
}

/**
 * Where to stand the creature: straight ahead of the viewer at `distance` on the floor, stepping closer until the
 * spot is walkable (not inside a column, a wall or the cistern) and nothing stands between it and the viewer;
 * `fallback` (the encounter's anchor) if nothing fits.
 */
export function placeInView(eye: readonly [number, number], forward: readonly [number, number], distance: number,
  walkable: (x: number, z: number) => boolean, fallback: readonly [number, number]): [number, number] {
  const len = Math.hypot(forward[0], forward[1]) || 1, fx = forward[0] / len, fz = forward[1] / len
  // The first blocked step along the line of sight caps how far it can stand.
  let clear = distance
  for (let d = .4; d <= distance; d += .2) if (!walkable(eye[0] + fx * d, eye[1] + fz * d)) { clear = d - .5; break }
  for (let d = Math.min(distance, clear); d >= 1.6; d -= .2) {
    const x = eye[0] + fx * d, z = eye[1] + fz * d
    if (walkable(x, z)) return [x, z]
  }
  return [fallback[0], fallback[1]]
}

export { ease as stageEase }
