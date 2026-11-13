import { activeGrandpaEvent, duckProgress, grandpaEntryMs, grandpaExitMs, grandpaRecoverMs, grandpaWindupMs, type GrandpaEvent, type GrandpaRuntime, type GrandpaSwing } from './grandpaEvent'
import type { PreviewRound } from './previewRound'

/** Where the grandpa stands: between the forward court and the wire, behind the avatar's right shoulder. */
export const grandpaSpot = { x: 1.05, z: -1.2 }
const offstage = { x: 4.2, z: -2.35 }
const strikeLeadMs = 140
const followMs = 110
const fadeMs = 260
/** One shout per visit, shown as he walks in. */
export const grandpaShouts = ['예끼 이놈들!', '예끼! 썩 물렀거라!'] as const
const shoutFromMs = 150
const shoutPopMs = 160
const shoutAfterArrivalMs = 900
const shoutFadeMs = 220

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

/** Broom pose in the grandpa's frame, facing +Z toward the avatar. Angles turn about +Y; +X is his left. */
export type BroomPose = {
  /** Torso turn. */
  twist: number
  /** Turning the whole body away from the avatar, toward the wire behind him. */
  turn: number
  gripX: number
  gripY: number
  gripZ: number
  /** Broom direction from the grip to the bristles. */
  yaw: number
  pitch: number
  /** Whether the left hand also holds the handle. */
  twoHands: number
}

// The long broom rests on his right shoulder, bristles up behind him, between swings.
const hold: BroomPose = { twist: 0, turn: 0, gripX: -0.3, gripY: 1.45, gripZ: 0.14, yaw: -2.9, pitch: 0.85, twoHands: 0 }
// A dangerous swing starts up behind him near the wire, sweeps through the avatar's head height and ends up on his left.
const dangerWindup: BroomPose = { twist: -0.85, turn: 0, gripX: -0.25, gripY: 1.6, gripZ: 0.1, yaw: -2.05, pitch: 0.45, twoHands: 1 }
const dangerContact: BroomPose = { twist: -0.1, turn: 0, gripX: -0.08, gripY: 1.52, gripZ: 0.48, yaw: -0.12, pitch: -0.02, twoHands: 1 }
const dangerFollow: BroomPose = { twist: 0.9, turn: 0, gripX: 0.15, gripY: 1.55, gripZ: 0.35, yaw: 2.45, pitch: 0.38, twoHands: 1 }
// The safe swing turns to the wire and swats just above the audience.
const safeWindup: BroomPose = { twist: -0.35, turn: Math.PI, gripX: -0.12, gripY: 1.85, gripZ: 0.18, yaw: -0.75, pitch: 1.25, twoHands: 1 }
const safeContact: BroomPose = { twist: 0, turn: Math.PI, gripX: -0.08, gripY: 1.7, gripZ: 0.45, yaw: 0.1, pitch: 0.6, twoHands: 1 }
const safeFollow: BroomPose = { twist: 0.35, turn: Math.PI, gripX: -0.1, gripY: 1.55, gripZ: 0.38, yaw: 0.85, pitch: 0.35, twoHands: 1 }

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
    twoHands: mix(from.twoHands, to.twoHands, weight),
  }
}

function swingHitMs(swing: GrandpaSwing) {
  return swing.hitMs ?? swing.plannedHitMs
}

/** The broom pose for one swing at `ageMs` from its contact, or null outside the swing. */
function sampleSwing(kind: GrandpaSwing['kind'], ageMs: number): BroomPose | null {
  if (ageMs < -grandpaWindupMs || ageMs >= grandpaRecoverMs) return null
  const windup = kind === 'danger' ? dangerWindup : safeWindup
  const contact = kind === 'danger' ? dangerContact : safeContact
  const follow = kind === 'danger' ? dangerFollow : safeFollow
  if (ageMs < -strikeLeadMs) {
    const pose = blendBroom(hold, windup, smooth((ageMs + grandpaWindupMs) / (grandpaWindupMs - strikeLeadMs - 160)))
    // The tell trembles harder as the strike nears.
    const tremble = smooth((ageMs + 600) / 400) * Math.sin(ageMs * 0.09) * 0.05
    return { ...pose, yaw: pose.yaw + tremble, pitch: pose.pitch + tremble * 0.6 }
  }
  if (ageMs < 0) {
    const t = (ageMs + strikeLeadMs) / strikeLeadMs
    return blendBroom(windup, contact, t * t)
  }
  if (ageMs < followMs) return blendBroom(contact, follow, 1 - (1 - ageMs / followMs) ** 2)
  return blendBroom(follow, hold, smooth((ageMs - followMs) / (grandpaRecoverMs - followMs)))
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

export type GrandpaFrame = {
  event: GrandpaEvent
  /** The visit's shout and its 0..1 pop-in strength. */
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
  /** 0..1 strength of the red tell above his head. */
  warning: number
  swing: { swing: GrandpaSwing; ageMs: number } | null
}

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
  if (playedMs < arriveAt) {
    along = smooth((playedMs - event.startMs) / grandpaEntryMs * 0.9 + 0.05)
    facing = mix(pathYaw, lookAtAvatar, smooth((playedMs - arriveAt + 260) / 260))
    walking = true
  } else if (playedMs > leaveAt) {
    along = 1 - smooth((playedMs - leaveAt) / grandpaExitMs * 0.9 + 0.05)
    facing = mix(lookAtAvatar, pathYaw + Math.PI, smooth((playedMs - leaveAt) / 260))
    walking = true
  }
  const opacity = Math.min(1, (playedMs - event.startMs) / fadeMs, (event.endMs - playedMs) / fadeMs)
  const swing = walking ? null : nearestSwing(event, playedMs)
  const broom = swing ? sampleSwing(swing.swing.kind, swing.ageMs) ?? hold : hold
  const warning = swing?.swing.kind === 'danger' && swing.ageMs < 0 ? smooth((swing.ageMs + grandpaWindupMs) / 120) : 0
  const shoutAge = playedMs - event.startMs - shoutFromMs
  const shoutEnd = arriveAt + shoutAfterArrivalMs - event.startMs - shoutFromMs
  const shoutWeight = shoutAge < 0 ? 0 : Math.min(smooth(shoutAge / shoutPopMs), smooth((shoutEnd - shoutAge) / shoutFadeMs))
  return {
    event,
    shout: grandpaShouts[Math.max(0, grandpa.events.indexOf(event)) % grandpaShouts.length]!,
    shoutWeight,
    x: mix(offstage.x, grandpaSpot.x, along),
    z: mix(offstage.z, grandpaSpot.z, along),
    facing: facing + broom.turn,
    opacity: Math.max(0, opacity),
    walking,
    walkSpeed: pathLength / grandpaEntryMs * 1000,
    broom,
    warning,
    swing,
  }
}

export const idleBroom = hold

export function blendTowardIdle(pose: BroomPose, freeze: number) {
  return freeze > 0 ? blendBroom(pose, hold, smooth(freeze)) : pose
}

/** The audience on the wire hops in place as each swing lands. */
export function sampleAudienceHop(grandpa: GrandpaRuntime, playedMs: number, index: number) {
  const event = activeGrandpaEvent(grandpa)
  if (!event) return { lift: 0, flap: 0 }
  let lift = 0
  let flap = 0
  for (const swing of event.swings) {
    const startMs = swingHitMs(swing) - 130 + index * 55
    const progress = (playedMs - startMs) / 540
    if (progress <= 0 || progress >= 1) continue
    const height = swing.kind === 'safe' ? 0.36 : 0.27
    lift = Math.max(lift, height * 4 * progress * (1 - progress))
    flap = Math.max(flap, Math.sin(progress * Math.PI) * (0.75 + 0.35 * Math.sin(progress * 38)))
  }
  return { lift, flap }
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
