// How an underground encounter plays out (S15P31B105-450). Players walk through in first person and the old
// 1.9 s pop at a fixed anchor was easy to miss, so each scare now has three beats over its duration:
//   build-up  — the nearby lamps stutter and dim, a drone and a heartbeat rise; nothing to see yet
//   reveal    — the creature is there, in your line of sight, larger than life, playing its own animation slowly
//   lunge     — it rushes your face with a scream, the lamps cut out, and it is gone
// Pure helpers here; InteriorEncounters drives them and horrorAudio follows the same fractions.

export const STAGE = { reveal: .17, lunge: .8, blackout: .94 } as const
/** Shared with the flashlight (HorrorZone): the scare dims and cuts it with the lamps. */
export const flashlight = { factor: 1 }

const clamp = (x: number) => Math.max(0, Math.min(1, x))
const ease = (x: number) => { const n = clamp(x); return n * n * (3 - 2 * n) }

/** Larger than the player (1.7 m): tall figures read as looming, small ones (a face, a hand) as close. */
const SCALE: Record<number, number> = { 1: 1.15, 2: 1.3, 3: 1.3, 4: 1.45, 5: 1.7, 6: 1.45, 7: 1.3, 8: 1.25, 9: 1.2, 10: 1.35, 11: 1.4, 12: 1.15 }
/** Where it first stands, in metres ahead of your eyes. */
const DISTANCE: Record<number, number> = { 1: 2.2, 2: 3.2, 3: 2.6, 4: 3.2, 5: 2.4, 6: 2.6, 7: 3.4, 8: 3.2, 9: 3.6, 10: 3.2, 11: 3, 12: 3.4 }
/** How far of the way to your face it rushes (the wall pieces only surge). */
const LUNGE: Record<number, number> = { 6: .35, 8: .3, 12: .45 }
/**
 * Metres from your eyes at which the rush ends, measured to the creature's feet. The beast is long: its jaws are a
 * metre in front of its feet, so it stops further off or its head goes past (and under) the camera.
 */
const STOP: Record<number, number> = { 4: 1.75 }
export const lungeStop = (id: number) => STOP[id] ?? .8
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
  // Facing a wall up close: try a little to either side of the gaze before giving up.
  for (const turn of [.25, -.25, .5, -.5]) {
    const c = Math.cos(turn), s = Math.sin(turn), tx = fx * c - fz * s, tz = fx * s + fz * c
    let ok = true
    for (let d = .4; d <= 1.8 && ok; d += .2) ok = walkable(eye[0] + tx * d, eye[1] + tz * d)
    if (ok) return [eye[0] + tx * 1.8, eye[1] + tz * 1.8]
  }
  return [fallback[0], fallback[1]]
}

// ---------- styles ----------
// The same build-up every time told players "here it comes" and after two scares nothing was frightening. Each
// scare now draws a way to happen, never the same twice in a row:
//   pop     — no warning at all: it is simply there, an arm's length away, screaming, and the lights die
//   behind  — breathing at your back; turn round and it is in your face (or it turns you round itself)
//   stalk   — standing far down the hall; every time the lamps blink it is closer, until it is on you
//   fakeout — the lamps stutter and the drone rises… then nothing, the light comes back; then it pops
//   reveal  — the long look (build-up, the creature in plain view, the rush): the original, now the rare one
// and three creatures have a way of their own:
//   pounce  — 4, the beast: crouched in the dark a few steps off, snarling, then it leaps at your face
//   sprint  — 7, the runner: at the far end of the hall, then flat out at you under a strobing lamp
//   statue  — 2, the statue: closer at every blink, and closer whenever you look away; then it screams
//   shadow  — 6, on the wall in front of you, the shadow of something standing right behind you, arms rising over
//             your head; turn round (or be turned round) and a face fills the screen
// You are only held still at the moment it strikes: a freeze before anything shows gave the scare away.
export type StageStyle = 'pop' | 'behind' | 'stalk' | 'fakeout' | 'reveal' | 'pounce' | 'sprint' | 'statue' | 'shadow'
export const STAGE_STYLES: readonly StageStyle[] = ['pop', 'behind', 'stalk', 'fakeout', 'reveal']
/** Creatures that stand free as a whole figure; the rest are wall, door, lift, water or face pieces. */
const FIGURES = new Set([3, 9, 10])
/** Creatures whose own character makes the scare. */
const SIGNATURE: Record<number, StageStyle[]> = { 2: ['statue'], 4: ['pounce'], 6: ['shadow'], 7: ['sprint', 'behind'] }
const WEIGHTS: Record<StageStyle, number> = { pop: .3, behind: .2, stalk: .2, fakeout: .15, reveal: .15, pounce: 1, sprint: .6, statue: 1, shadow: 1 }

/** Which styles suit encounter `id` (a wall of eyes cannot creep up behind you). */
export function stylesFor(id: number): StageStyle[] {
  return SIGNATURE[id] ?? (FIGURES.has(id) ? [...STAGE_STYLES] : ['pop', 'fakeout', 'reveal'])
}
/** A weighted draw for `id`, never repeating `last` when there is another choice. */
export function pickStyle(id: number, last: StageStyle | undefined, random: () => number = Math.random): StageStyle {
  const all = stylesFor(id), others = all.filter(s => s !== last), options = others.length ? others : all
  const total = options.reduce((sum, s) => sum + WEIGHTS[s], 0)
  let r = random() * total
  for (const s of options) if ((r -= WEIGHTS[s]) < 0) return s
  return options[options.length - 1]!
}

/** Seconds into the scare at which each beat happens. `duration` is in ms like Encounter.duration. */
export interface StagePlan {
  style: StageStyle
  duration: number
  /** Drawn from here on. */
  show: number
  /** The rush starts. */
  rush: number
  /** Lights out, creature gone. */
  dark: number
  /** Stalk, statue: the blinks at which it is suddenly closer. */
  jumps: number[]
  /** Fakeout: when the false alarm ends and the light comes back. */
  calm: number
}
const POP = { rush: .05, dark: .55, after: .6 }
/** The beats of a scare in `style`; `base` (ms) is the old duration, used by the long reveal only. */
export function stagePlan(style: StageStyle, base: number, random: () => number = Math.random): StagePlan {
  const plan = (show: number, rush: number, dark: number, end: number, extra: Partial<StagePlan> = {}): StagePlan =>
    ({ style, duration: end * 1000, show, rush, dark, jumps: [], calm: 0, ...extra })
  const jitter = (times: number[]) => times.map(t => t + (random() - .5) * .2)
  switch (style) {
    case 'pop': return plan(0, POP.rush, POP.dark, POP.dark + POP.after)
    case 'fakeout': {
      const calm = 1.3 + random() * .3, at = calm + 1 + random() * 1.4
      return plan(at, at + POP.rush, at + POP.dark, at + POP.dark + POP.after, { calm })
    }
    case 'stalk': return plan(0, 3.55, 3.95, 4.6, { jumps: jitter([1.2, 2.1, 2.8, 3.3]) })
    // `rush` is when it turns you round if you have not looked; looking earlier moves the rush up.
    case 'behind': return plan(0, 4.2, 4.7, 5.3)
    case 'reveal': { const d = base / 1000; return plan(STAGE.reveal * d, STAGE.lunge * d, STAGE.blackout * d, d) }
    case 'pounce': return plan(0, .95, 1.4, 2)
    case 'sprint': return plan(0, .25, 1.35, 1.95)
    case 'statue': return plan(0, 3.9, 4.3, 4.9, { jumps: jitter([1.3, 2.4, 3.3]) })
    // `rush` is when it turns you round; turning round yourself moves it up.
    case 'shadow': return plan(0, 3, 3.45, 4.1)
  }
}
/** The stalker's distance at each blink, as a share of how far off it first stood. */
const STALK = [1, .72, .5, .33, .22]
const STATUE = [1, .72, .52, .38, .3, .25]
/** Styles that need a long clear hall in view; with less than this they pop instead. */
export const FAR_MIN: Partial<Record<StageStyle, number>> = { stalk: 5.5, sprint: 6, statue: 3.2 }
/** Upper bound on how far off the far styles start. */
const FAR_MAX: Partial<Record<StageStyle, number>> = { stalk: 9, sprint: 13, statue: 6.5 }
export const STALK_MIN = FAR_MIN.stalk!
/**
 * Metres ahead of the viewer the creature stands at second `t`: the stalker and the statue step in from `far` (the
 * statue also for each of `extra` looks away); the rest stand still.
 */
export function standDistance(plan: StagePlan, id: number, t: number, far = 9, extra = 0) {
  const blinks = plan.jumps.filter(j => t >= j).length
  switch (plan.style) {
    case 'reveal': return encounterDistance(id)
    case 'stalk': return Math.max(1.8, far * STALK[Math.min(4, blinks)]!)
    case 'statue': return Math.max(2.2, far * STATUE[Math.min(5, blinks + extra)]!)
    case 'behind': return 1.7
    case 'pounce': return 4.2
    case 'sprint': return FAR_MAX.sprint!
    case 'shadow': return 2.6
    default: return 1.75
  }
}
/** How far off a far style may start (the clear distance found, capped). */
export const farStart = (style: StageStyle, clear: number) => Math.min(FAR_MAX[style] ?? clear, clear)

export interface StyleFrame extends StageFrame {
  /** Stalk, statue: how many blinks have passed (it moves on each). */
  step: number
  /** Behind: it stands at your back until the rush. */
  behind: boolean
  /** How hard the gaze is dragged to it, per second (0: free). */
  drag: number
  /** The player cannot move. */
  held: boolean
}
/** The state of a scare at second `t` of `plan`; `start` is how far away it stood when the rush began. */
export function styleFrame(plan: StagePlan, id: number, t: number, start: number, seed = 0): StyleFrame {
  const d = plan.duration / 1000, style = plan.style
  if (style === 'reveal') {
    const f = stageFrame(id, t / d, start, seed)
    return { ...f, step: 0, behind: false, drag: f.visible ? (f.lunge > 0 ? 14 : 5) : 0, held: f.lunge > 0 && t < plan.dark }
  }
  const lunge = clamp((t - plan.rush) / (plan.dark - plan.rush))
  const rush = ease(lunge)
  const face = (FACE[id] ?? 0) * encounterScale(id)
  const sink = face > EYE_HEIGHT + .1 ? face - EYE_HEIGHT : 0
  const reach = Math.max(0, start - lungeStop(id)) * (LUNGE[id] ?? 1)
  const flick = (k: number) => Math.sin(t * 173 + seed) * Math.sin(t * 61 + seed * 2) > k ? 1 : .12
  const step = plan.jumps.filter(j => t >= j).length
  const blink = (style === 'stalk' || style === 'statue') && plan.jumps.some(j => t >= j - .1 && t < j + .12)
  let light: number
  if (t >= plan.dark) light = t < plan.dark + .35 ? 0 : Math.min(1, (t - plan.dark - .35) * 2.5)
  else if (style === 'pop' || (style === 'fakeout' && t >= plan.show)) light = t - plan.show < .07 ? 1.8 : .5 * flick(-.3)
  else if (style === 'fakeout') light = t < plan.calm ? (.3 + .6 * (1 - t / plan.calm)) * flick(.1) : 1
  else if (style === 'stalk' || style === 'statue') light = blink ? 0 : t >= plan.rush ? .3 : .55
  else if (style === 'pounce') light = t >= plan.rush ? .32 : .38 + .08 * Math.sin(t * 23 + seed)
  else if (style === 'sprint') light = t >= plan.rush ? .55 * flick(-.2) : .7 * flick(-.6)
  else if (style === 'shadow') light = t >= plan.rush ? 0 : t < .12 ? .15 : .8
  else light = t >= plan.rush ? .35 : .85 + .1 * Math.sin(t * 31 + seed)
  const visible = t >= plan.show && t < (style === 'shadow' ? plan.rush : plan.dark) && !blink
  // How much of the way the face has come down to eye level (tall creatures sink so you see the face, not a chest).
  const lowered = style === 'pop' || style === 'fakeout' ? 1
    : style === 'behind' ? (lunge > 0 ? 1 : 0)
    : style === 'sprint' ? lunge
    : style === 'statue' ? Math.max(rush, Math.min(1, step / 3))
    : rush
  let rise = ((RISE[id] ?? 0) - sink) * lowered
  // The beast breathes low in its crouch, then leaps in a low arc, jaws at your eyes; the runner bobs as it runs.
  if (style === 'pounce') rise += t < plan.rush ? -.1 + .03 * Math.sin(t * 9) : .3 * Math.sin(Math.PI * Math.min(1, lunge * 1.15))
  if (style === 'sprint' && lunge > 0) rise += .07 * Math.abs(Math.sin(lunge * Math.PI * 7))
  // Mid-leap the beast rears, jaws up at your eyes rather than its back under them.
  if (style === 'pounce') rise += .2 * rush
  return {
    visible,
    // Popped up creatures are already in their final pose; the stalker and the runner hold one with the figure in it.
    reveal: style === 'stalk' || style === 'sprint' ? .55 : style === 'statue' || style === 'pounce' ? 1
      : style === 'shadow' ? .12 * clamp(t / plan.rush) : clamp((t - plan.show) / .25), // the shadow grows, not stretches
    lunge,
    advance: style === 'sprint' ? reach * lunge : style === 'pounce' ? reach * rush : reach * lunge * lunge,
    light,
    shake: lunge > 0 ? Math.sin(t * 210 + seed) * .04 : style === 'pounce' ? Math.sin(t * 90 + seed) * .012 : 0,
    tilt: style === 'pounce' ? -.35 * Math.sin(Math.PI * Math.min(1, lunge * 1.2)) : 0,
    rise,
    step,
    behind: style === 'behind' && t < plan.rush,
    drag: style === 'behind' || style === 'shadow' ? (t >= plan.rush - .6 && t < plan.dark ? 18 : 0)
      : style === 'statue' ? (lunge > 0 ? 16 : 0)
      : visible ? (lunge > 0 ? 16 : style === 'stalk' ? 1.5 : style === 'sprint' ? 10 : 9) : 0,
    // Held only from the instant it strikes (a pop strikes as it shows; behind and shadow as they turn you round).
    held: t < plan.dark && (style === 'behind' || style === 'shadow' ? t >= plan.rush - .6
      : style === 'pop' || style === 'fakeout' ? t >= plan.show : t >= plan.rush),
  }
}

/** Angle in radians between where the viewer looks (flat) and the creature. */
export function offGaze(eye: readonly [number, number], forward: readonly [number, number], at: readonly [number, number]) {
  const dx = at[0] - eye[0], dz = at[1] - eye[1], d = Math.hypot(dx, dz) || 1, f = Math.hypot(forward[0], forward[1]) || 1
  return Math.acos(Math.max(-1, Math.min(1, (dx * forward[0] + dz * forward[1]) / (d * f))))
}

export { ease as stageEase }
