import { activeGrandpaEvent, duckProgress, grandpaEntryMs, grandpaExitMs, grandpaRecoverMs, grandpaWindupMs, type GrandpaEvent, type GrandpaRuntime, type GrandpaSwing } from './grandpaEvent'
import type { PreviewRound } from './previewRound'

/** Where the grandpa stands: between the forward court and the wire, behind the avatar's right shoulder. */
export const grandpaSpot = { x: 1.05, z: -1.2 }
const offstage = { x: 4.2, z: -2.35 }
const strikeLeadMs = 140
const followMs = 110
const fadeMs = 260
/** The windup first lifts the broom high, then coils it back for the strike. */
const raiseEndMs = -560
/** One shout per visit, shown as he walks in. */
export const grandpaShouts = ['예끼 이놈들!', '예끼! 썩 물렀거라!'] as const
/** Muttered on the way out, every visit. */
export const grandpaGrumble = '에잉, 쯧쯧…'
const shoutFromMs = 150
const shoutPopMs = 160
const shoutAfterArrivalMs = 900
const shoutFadeMs = 220
const grumbleFromMs = 120

/** Distance from the grip to the middle of the bristles, matching the broom model. */
export const broomBristleReach = 1.75

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function smooth(value: number) {
  const t = clamp01(value)
  return t * t * (3 - 2 * t)
}

function mix(from: number, to: number, weight: number) {
  return from + (to - from) * weight
}

/** Broom and body pose in the grandpa's frame, facing +Z toward the avatar. Angles turn about +Y; +X is his left. */
export type BroomPose = {
  /** Torso turn: shoulders and chest wind up and unwind with the broom. */
  twist: number
  /** Turning the whole body away from the avatar, toward the wire behind him. */
  turn: number
  gripX: number
  gripY: number
  gripZ: number
  /** Broom direction from the grip to the bristles. */
  yaw: number
  pitch: number
  /** Rotation of the broom about its handle, so the bristle fan leads the swing. */
  roll: number
  /** Extra forward bend on top of his usual stoop. Negative leans back. */
  lean: number
  /** Side bend toward his left (+) or right (-). */
  tilt: number
  /** Whether the left hand also holds the handle. */
  twoHands: number
}

// The long broom rests on his right shoulder, bristles up behind him, between swings.
const hold: BroomPose = { twist: 0, turn: 0, gripX: -0.3, gripY: 1.45, gripZ: 0.14, yaw: -2.9, pitch: 0.85, roll: 0, lean: 0, tilt: 0, twoHands: 0 }
// Dangerous swing: hoist it high, coil it back toward the wire, sweep it flat through the avatar's head, stagger.
const dangerRaise: BroomPose = { twist: -0.35, turn: 0, gripX: -0.18, gripY: 1.95, gripZ: 0.12, yaw: -2.75, pitch: 1.2, roll: 0.4, lean: -0.18, tilt: -0.05, twoHands: 1 }
const dangerWindup: BroomPose = { twist: -1.2, turn: 0, gripX: -0.3, gripY: 1.62, gripZ: 0.02, yaw: -2.1, pitch: 0.48, roll: 1.3, lean: 0, tilt: -0.15, twoHands: 1 }
const dangerContact: BroomPose = { twist: -0.05, turn: 0, gripX: -0.06, gripY: 1.5, gripZ: 0.5, yaw: 0.05, pitch: -0.02, roll: 1.5, lean: 0.22, tilt: 0.05, twoHands: 1 }
const dangerFollow: BroomPose = { twist: 1.25, turn: 0, gripX: 0.22, gripY: 1.5, gripZ: 0.28, yaw: 2.55, pitch: 0.4, roll: 1.1, lean: 0.3, tilt: 0.18, twoHands: 1 }
// Safe swing: turn to the wire, wave the broom overhead to shoo the audience, then swat just above them.
const safeRaise: BroomPose = { twist: 0.1, turn: Math.PI, gripX: -0.1, gripY: 1.95, gripZ: 0.22, yaw: -0.3, pitch: 1.35, roll: 0, lean: -0.15, tilt: 0, twoHands: 1 }
const safeContact: BroomPose = { twist: 0, turn: Math.PI, gripX: -0.08, gripY: 1.72, gripZ: 0.45, yaw: 0.1, pitch: 0.55, roll: 0, lean: 0.25, tilt: 0, twoHands: 1 }
const safeFollow: BroomPose = { twist: -0.1, turn: Math.PI, gripX: -0.1, gripY: 1.55, gripZ: 0.38, yaw: 0.2, pitch: 0.2, roll: 0, lean: 0.35, tilt: -0.1, twoHands: 1 }

function wrapAngle(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle))
}

/** The broom aim (body turn + broom yaw) takes the short way round, so it never sweeps back across the avatar. */
function blendBroom(from: BroomPose, to: BroomPose, weight: number): BroomPose {
  const turn = mix(from.turn, to.turn, weight)
  const aim = from.turn + from.yaw + wrapAngle(to.turn + to.yaw - from.turn - from.yaw) * weight
  return {
    twist: mix(from.twist, to.twist, weight),
    turn,
    gripX: mix(from.gripX, to.gripX, weight),
    gripY: mix(from.gripY, to.gripY, weight),
    gripZ: mix(from.gripZ, to.gripZ, weight),
    yaw: aim - turn,
    pitch: mix(from.pitch, to.pitch, weight),
    roll: mix(from.roll, to.roll, weight),
    lean: mix(from.lean, to.lean, weight),
    tilt: mix(from.tilt, to.tilt, weight),
    twoHands: mix(from.twoHands, to.twoHands, weight),
  }
}

function swingHitMs(swing: GrandpaSwing) {
  return swing.hitMs ?? swing.plannedHitMs
}

/**
 * The broom pose for one swing at `ageMs` from its contact, or null outside the swing.
 * Contact stays at age 0 and the windup at -1000 ms, the same times the judgement and the red tell use.
 */
function sampleSwing(kind: GrandpaSwing['kind'], ageMs: number): BroomPose | null {
  if (ageMs < -grandpaWindupMs || ageMs >= grandpaRecoverMs) return null
  const danger = kind === 'danger'
  const raise = danger ? dangerRaise : safeRaise
  const contact = danger ? dangerContact : safeContact
  const follow = danger ? dangerFollow : safeFollow
  if (ageMs < raiseEndMs) return blendBroom(hold, raise, smooth((ageMs + grandpaWindupMs) / (grandpaWindupMs + raiseEndMs)))
  /** The held windup: a trembling coil for danger, a shooing wave over the wire for safe. */
  function poised(age: number): BroomPose {
    const settle = (age - raiseEndMs) / (-strikeLeadMs - raiseEndMs)
    if (danger) {
      const pose = blendBroom(raise, dangerWindup, smooth(settle / 0.7))
      // A readable shiver (about 5.5 Hz) and a slow bounce, not a buzz.
      const tremble = smooth(settle) * Math.sin(age * 0.035) * 0.045
      return { ...pose, yaw: pose.yaw + tremble, pitch: pose.pitch + tremble * 0.6, lean: pose.lean + 0.04 * Math.sin(age * 0.02) }
    }
    const wave = Math.sin((age - raiseEndMs) * 0.016) * smooth(settle / 0.15)
    const nod = Math.sin((age - raiseEndMs) * 0.032) * smooth(settle / 0.15)
    return { ...raise, yaw: raise.yaw + 0.5 * wave, pitch: raise.pitch + 0.08 * nod, tilt: 0.12 * wave, lean: raise.lean + 0.05 * wave }
  }
  if (ageMs < -strikeLeadMs) return poised(ageMs)
  if (ageMs < 0) {
    const t = (ageMs + strikeLeadMs) / strikeLeadMs
    return blendBroom(poised(-strikeLeadMs), contact, t * t)
  }
  if (ageMs < followMs) return blendBroom(contact, follow, 1 - (1 - ageMs / followMs) ** 2)
  // He totters after the big swing, then settles back under the shouldered broom.
  const recover = (ageMs - followMs) / (grandpaRecoverMs - followMs)
  const pose = blendBroom(follow, hold, smooth(recover))
  const wobble = Math.sin(recover * Math.PI * 3) * (1 - recover)
  return { ...pose, tilt: pose.tilt + 0.2 * wobble, lean: pose.lean + 0.08 * Math.abs(wobble), twist: pose.twist + 0.15 * wobble }
}

function nearestSwing(event: GrandpaEvent, playedMs: number) {
  let best: { swing: GrandpaSwing; ageMs: number } | null = null
  for (const swing of event.swings) {
    const ageMs = playedMs - swingHitMs(swing)
    if (ageMs < -grandpaWindupMs || ageMs >= grandpaRecoverMs) continue
    // A later windup takes over once the previous follow-through has finished.
    if (!best || (ageMs < best.ageMs && best.ageMs >= followMs)) best = { swing, ageMs }
  }
  return best
}

/** Body language layered on the broom pose: a stomping stride with a shaken fist, or a grumbling exit. */
export type GrandpaGesture = {
  /** 0..1 strength of the raised left fist. */
  fist: number
  /** Fist pumping phase, -1..1. */
  fistShake: number
  /** Head turn while muttering, radians. */
  headShake: number
  /** Extra stoop and stride sway while walking. */
  stoop: number
  sway: number
  /** Head lifted to glare (+) or bowed (-). */
  glare: number
}

export type GrandpaFrame = {
  event: GrandpaEvent
  /** The visit's shout or exit grumble, and its 0..1 pop-in strength. */
  shout: string
  shoutWeight: number
  x: number
  z: number
  /** Facing as a rotation about +Y, where 0 faces +Z. */
  facing: number
  opacity: number
  walking: boolean
  walkSpeed: number
  broom: BroomPose
  gesture: GrandpaGesture
  /** 0..1 strength of the red tell above his head. */
  warning: number
  swing: { swing: GrandpaSwing; ageMs: number } | null
}

const still: GrandpaGesture = { fist: 0, fistShake: 0, headShake: 0, stoop: 0, sway: 0, glare: 0 }

/** Samples the visit on the play clock, so a MISS freeze pauses it and the same remaining time follows. */
export function sampleGrandpa(grandpa: GrandpaRuntime, playedMs: number, avatar: { x: number; z: number }): GrandpaFrame | null {
  const event = activeGrandpaEvent(grandpa)
  if (!event || playedMs < event.startMs || playedMs > event.endMs) return null
  const arriveAt = event.startMs + grandpaEntryMs
  const leaveAt = event.endMs - grandpaExitMs
  const lookAtAvatar = Math.atan2(avatar.x - grandpaSpot.x, avatar.z - grandpaSpot.z)
  const pathYaw = Math.atan2(grandpaSpot.x - offstage.x, grandpaSpot.z - offstage.z)
  const pathLength = Math.hypot(grandpaSpot.x - offstage.x, grandpaSpot.z - offstage.z)
  let along = 1
  let facing = lookAtAvatar
  let walking = false
  let gesture = still
  if (playedMs < arriveAt) {
    along = smooth((playedMs - event.startMs) / grandpaEntryMs * 0.9 + 0.05)
    facing = mix(pathYaw, lookAtAvatar, smooth((playedMs - arriveAt + 260) / 260))
    walking = true
    // Striding in with a raised, shaking fist.
    const step = (playedMs - event.startMs) * 0.0122
    const settle = 1 - smooth((playedMs - arriveAt + 200) / 200)
    gesture = {
      fist: settle * smooth((playedMs - event.startMs) / 220), fistShake: Math.sin(step * 1.3),
      headShake: 0, stoop: 0.14 * settle, sway: 0.07 * Math.sin(step) * settle, glare: 0.12 * settle,
    }
  } else if (playedMs > leaveAt) {
    along = 1 - smooth((playedMs - leaveAt) / grandpaExitMs * 0.9 + 0.05)
    facing = mix(lookAtAvatar, pathYaw + Math.PI, smooth((playedMs - leaveAt) / 260))
    walking = true
    // Trudging off, shaking his head and his fist a little.
    const step = (playedMs - leaveAt) * 0.0122
    const begin = smooth((playedMs - leaveAt) / 200)
    gesture = {
      fist: 0.6 * begin, fistShake: Math.sin(step * 1.1),
      headShake: 0.28 * Math.sin((playedMs - leaveAt) * 0.011) * begin,
      stoop: 0.22 * begin, sway: 0.06 * Math.sin(step) * begin, glare: -0.12 * begin,
    }
  }
  const opacity = Math.min(1, (playedMs - event.startMs) / fadeMs, (event.endMs - playedMs) / fadeMs)
  const swing = walking ? null : nearestSwing(event, playedMs)
  const broom = swing ? sampleSwing(swing.swing.kind, swing.ageMs) ?? hold : hold
  if (swing?.swing.kind === 'danger' && swing.ageMs < 0) gesture = { ...still, glare: 0.18 }
  const warning = swing?.swing.kind === 'danger' && swing.ageMs < 0 ? smooth((swing.ageMs + grandpaWindupMs) / 120) : 0
  const shoutAge = playedMs - event.startMs - shoutFromMs
  const shoutEnd = arriveAt + shoutAfterArrivalMs - event.startMs - shoutFromMs
  const entryShout = shoutAge < 0 ? 0 : Math.min(smooth(shoutAge / shoutPopMs), smooth((shoutEnd - shoutAge) / shoutFadeMs))
  const grumbleAge = playedMs - leaveAt - grumbleFromMs
  const grumble = grumbleAge < 0 ? 0 : Math.min(smooth(grumbleAge / shoutPopMs), smooth((event.endMs - playedMs - 120) / shoutFadeMs))
  const shout = grumble > 0 ? grandpaGrumble : grandpaShouts[Math.max(0, grandpa.events.indexOf(event)) % grandpaShouts.length]!
  return {
    event,
    shout,
    shoutWeight: Math.max(entryShout, grumble),
    x: mix(offstage.x, grandpaSpot.x, along),
    z: mix(offstage.z, grandpaSpot.z, along),
    facing: facing + broom.turn,
    opacity: Math.max(0, opacity),
    walking,
    walkSpeed: pathLength / grandpaEntryMs * 1000,
    broom,
    gesture,
    warning,
    swing,
  }
}

export const idleBroom = hold

export function blendTowardIdle(pose: BroomPose, freeze: number) {
  return freeze > 0 ? blendBroom(pose, hold, smooth(freeze)) : pose
}

/**
 * World position of a point `along` metres down the broom from the grip, using the same transform as the
 * rendered model. With `broomBristleReach` it gives the middle of the bristles.
 */
export function broomPointInWorld(frame: Pick<GrandpaFrame, 'x' | 'z' | 'facing' | 'broom'>, along = broomBristleReach) {
  const { twist, gripX, gripY, gripZ, yaw, pitch } = frame.broom
  // The grip turns with the torso about the frame's vertical axis.
  const gx = gripX * Math.cos(twist) + gripZ * Math.sin(twist)
  const gz = -gripX * Math.sin(twist) + gripZ * Math.cos(twist)
  const x = gx + along * Math.sin(yaw) * Math.cos(pitch)
  const y = gripY + along * Math.sin(pitch)
  const z = gz + along * Math.cos(yaw) * Math.cos(pitch)
  return {
    x: frame.x + x * Math.cos(frame.facing) + z * Math.sin(frame.facing),
    y,
    z: frame.z - x * Math.sin(frame.facing) + z * Math.cos(frame.facing),
  }
}

// Pigeons nearer the grandpa's spot (higher index) jump a little higher.
const hopStrength = [0.8, 0.88, 1.02, 1.12]

/** The audience flinches as a swing nears, hops in place on the wire with flapping wings, then lands and settles. */
export function sampleAudienceHop(grandpa: GrandpaRuntime, playedMs: number, index: number) {
  const event = activeGrandpaEvent(grandpa)
  const calm = { lift: 0, flap: 0, crouch: 0, alarm: 0, squash: 0 }
  if (!event) return calm
  let pose = calm
  for (const swing of event.swings) {
    const takeoff = swingHitMs(swing) - 120 + index * 45
    const age = playedMs - takeoff
    if (age < -320 || age > 760) continue
    const height = (swing.kind === 'safe' ? 0.36 : 0.27) * (hopStrength[index] ?? 1)
    const air = clamp01(age / 520)
    const lift = age > 0 && age < 520 ? height * 4 * air * (1 - air) : 0
    const next = {
      lift,
      flap: age > 0 && age < 520 ? Math.sin(air * Math.PI) * (0.75 + 0.35 * Math.sin(air * 38)) : 0,
      // Startle: crouch and stretch the neck up just before taking off.
      crouch: age < 0 ? smooth((age + 220) / 200) : 0,
      alarm: Math.min(smooth((age + 320) / 180), 1 - smooth((age - 560) / 200)),
      // Land with a quick squash, then settle.
      squash: age >= 520 ? Math.sin(clamp01((age - 520) / 240) * Math.PI) : 0,
    }
    if (next.lift + next.crouch + next.alarm + next.squash > pose.lift + pose.crouch + pose.alarm + pose.squash) pose = next
  }
  return pose
}

/** 1 while the play clock is frozen by a MISS, easing in and back out around the freeze. */
export function grandpaFreeze(round: PreviewRound, now: number) {
  const phase = round.phase
  if (phase.kind === 'landing' || phase.kind === 'reaction' || phase.kind === 'resumePending') {
    return smooth((now - phase.stoppedAt) / 160)
  }
  const resumedAt = round.grandpa?.resumedAt
  return phase.kind === 'playing' && resumedAt != null ? 1 - smooth((now - resumedAt) / 160) : 0
}

/** Reactions stay quiet from entry to exit, including any MISS freeze inside the visit. */
export function grandpaSuppressesReactions(grandpa: GrandpaRuntime | undefined) {
  return grandpa !== undefined && activeGrandpaEvent(grandpa) !== null
}

export type AvatarExtras = { duck: number; stun: number; stunAgeMs: number }

export function sampleAvatarExtras(grandpa: GrandpaRuntime | undefined, round: PreviewRound): AvatarExtras {
  if (!grandpa || round.endReason) return { duck: 0, stun: 0, stunAgeMs: 0 }
  const stun = grandpa.stun
  const stunAgeMs = stun ? round.playedMs - stun.atMs : 0
  return {
    duck: round.phase.kind === 'playing' ? duckProgress(grandpa.duck, round.playedMs) : 0,
    stun: stun ? smooth(stunAgeMs / 90) : 0,
    stunAgeMs,
  }
}
