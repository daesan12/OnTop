import { containsPad } from '../../../park-renewal-preview/jumpPadFootprint'
import { estimatedServerTime } from '../../network/serverEventClock'
import { COURSE, renewalCourse, type CourseBlock } from './activeCourse'
import { moleLandings, useJumpmap } from './state'

export interface MovingPad {
  block: number
  /** Server clock in seconds, matching the mole collision curve. */
  dipStartedAt?: number
}

let runId = '', support: CourseBlock | undefined, supportedSince = 0
const falls = new Map<number, number>()

export function syncRenewalMotion(now = estimatedServerTime() / 1000) {
  const next = useJumpmap.getState().run?.runId ?? ''
  if (next !== runId) {
    runId = next
    support = undefined
    falls.clear()
  }
  if (support?.theme === 'lily' && now - supportedSince >= 3 && !falls.has(support.block)) {
    falls.set(support.block, now)
  }
  for (const [block, time] of falls) {
    if (now - time >= 4) falls.delete(block)
  }
  return now
}

export function renewalPadShown(block: number) {
  return !!renewalCourse && (!!runId || block < renewalCourse.visibleAtStart)
}

export function renewalPadPose(pad: CourseBlock, now: number) {
  if (!runId) return { offset: 0, solid: true, visible: true }
  if (pad.theme === 'lily') {
    const age = now - (falls.get(pad.block) ?? Infinity)
    if (age >= 0 && age < 4) return { offset: -9 * age * age, solid: false, visible: age < 1.8 }
  }
  if (pad.theme === 'mole') {
    const t = (now - (moleLandings.get(pad.block) ?? -Infinity)) / .95
    if (t >= 0 && t <= 1) return { offset: -.48 * Math.sin(Math.PI * t) ** 2, solid: true, visible: true }
  }
  const offset = pad.theme === 'pigeon' ? .42 * Math.sin(now * Math.PI * 2 / 3.8 + pad.ordinal * .53) : 0
  return { offset, solid: true, visible: true }
}

export function movingPadRiderHeight(ride: MovingPad) {
  const pad = COURSE[ride.block]
  if (!renewalCourse || (pad?.theme !== 'mole' && pad?.theme !== 'pigeon')) return undefined
  const now = syncRenewalMotion()
  // Avatar models and the camera use a pose 0.8 m above the feet.
  return pad.top + renewalPadPose(pad, now).offset + .8
}

export function renewalPadAt(feet: { x: number; y: number; z: number }, now = syncRenewalMotion()) {
  return COURSE.find(pad => {
    if (!renewalPadShown(pad.block)) return false
    const pose = renewalPadPose(pad, now)
    if (!pose.solid || Math.abs(feet.y - pad.top - pose.offset) > .18) return false
    return containsPad(pad, feet.x, feet.z, .18)
  })
}

export function updateRenewalContact(pad: CourseBlock | undefined, now: number) {
  if (pad === support) return
  support = pad
  supportedSince = now
}
