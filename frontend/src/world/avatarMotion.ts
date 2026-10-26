import { Vector3, type Group } from 'three'
import type { AvatarSnapshot, Pose } from '../network/worldClient'
import {
  AVATAR,
  FITNESS_STATIONS,
  NETWORK,
  characterGestureDuration,
  createFitnessMotion,
  sampleFitnessMotion,
} from '../park/mapConfig'
import type { createCharacterRig } from './art/CharacterRig'
import { createGait, pavingLift, sampleGait } from './art/characterMotion'
import { sampleCharacterEmote } from './art/characterEmotes'
import { createFitnessGrip } from './art/fitnessGrip'

type Avatar = Pick<AvatarSnapshot,
  'connected' | 'moving' | 'running' | 'swimming' | 'seatIndex' |
  'benchId' | 'tableId' | 'fitnessId' | 'fitnessStartedAt' |
  'telescopeId' | 'telescopePitch' | 'emote' | 'emoteAt'
>
type Rig = ReturnType<typeof createCharacterRig>
const stations = new Map(FITNESS_STATIONS.map(station => [station.id, station]))
const defaultDurationEmotes = new Set(['EMOTE_TSK', 'EMOTE_APPLAUSE_REQUEST', 'EMOTE_FART'])
const supportedHipPoses = new Set(['rower', 'situp', 'inversion', 'legpress', 'pulldown'])

/** Presentation precedence only. Occupancy/permissions come from the adapter. */
export function avatarPoseKind(avatar: Avatar) {
  if (stations.has(avatar.fitnessId)) return 'fitness'
  if (avatar.telescopeId) return 'telescope'
  if (avatar.swimming) return 'swimming'
  return avatar.seatIndex >= 0 ? 'seated' : 'ground'
}

export function avatarEmoteAge(avatar: Avatar, now: number): number | null {
  if (!avatar.connected || avatar.fitnessId || avatar.telescopeId || avatar.swimming) return null
  const duration = characterGestureDuration(avatar.emote) ||
    (defaultDurationEmotes.has(avatar.emote) ? NETWORK.emoteDurationMs : 0)
  const age = now - avatar.emoteAt
  return Number.isFinite(age) && age >= 0 && age < duration ? age : null
}

export function avatarPoseActive(avatar: Avatar, now: number) {
  return avatar.connected && (avatar.moving || !!avatar.fitnessId || avatar.swimming || avatarEmoteAge(avatar, now) !== null)
}

export function avatarPoseKey(a: Avatar) {
  return `${a.connected}|${a.moving}|${a.running}|${a.tableId}|${a.seatIndex}|${a.benchId}|${a.fitnessId}|${a.fitnessStartedAt}|${a.telescopeId}|${a.telescopePitch}|${a.swimming}|${a.emote}|${a.emoteAt}`
}

/** Per-player mutable pose state; no React updates or per-frame vectors. */
export function createAvatarMotion(model: Rig) {
  const fitness = createFitnessMotion(), gait = createGait()
  const grip = createFitnessGrip(), hipFit = new Vector3()
  let phase = 0, move = 0, run = 0
  return {
    apply(avatar: Avatar, now: number, delta: number, pose: Pose, figure: Group) {
      const kind = avatarPoseKind(avatar)
      const seated = kind === 'seated'
      const age = avatarEmoteAge(avatar, now)
      const moving = avatar.connected && avatar.moving && kind === 'ground' &&
        !(avatar.emote === 'EMOTE_CLAP' && age !== null)
      const dt = Math.max(0, Math.min(delta, 0.1)), alpha = 1 - Math.exp(-dt * 10)
      move += ((moving ? 1 : 0) - move) * alpha
      run += ((avatar.running && moving ? 1 : 0) - run) * alpha
      phase += dt * (8 + 4.8 * run) * move
      sampleGait(phase, move, run, gait)
      model.reset()
      const set = model.set
      figure.position.set(0, 0, seated && avatar.benchId ? 0.18 : 0)
      figure.rotation.set(0, 0, 0)
      set('upperLeg_L', seated ? -Math.PI / 2 : gait.thighL)
      set('upperLeg_R', seated ? -Math.PI / 2 : gait.thighR)
      set('lowerLeg_L', seated ? Math.PI / 2 : gait.kneeL)
      set('lowerLeg_R', seated ? Math.PI / 2 : gait.kneeR)
      set('foot_L', seated ? 0 : gait.ankleL)
      set('foot_R', seated ? 0 : gait.ankleR)
      set('upperArm_L', seated ? -0.35 : gait.armL)
      set('upperArm_R', seated ? -0.35 : gait.armR)
      set('lowerArm_L', seated ? -0.8 : gait.elbow)
      set('lowerArm_R', seated ? -0.8 : gait.elbow)
      if (kind === 'ground') {
        set('hips', 0, gait.hipYaw, gait.hipRoll)
        set('chest', gait.lean, -gait.hipYaw * 0.6, -gait.hipRoll * 0.5)
      } else if (kind === 'telescope') {
        set('upperArm_L', -1.1)
        set('upperArm_R', -1.1)
        set('lowerArm_L', -0.5)
        set('lowerArm_R', -0.5)
        set('head', -avatar.telescopePitch * 0.4)
      } else if (kind === 'swimming') {
        set('foot_L')
        set('foot_R')
        if (avatar.connected) phase += dt * (avatar.moving ? 2 : 1.5)
        const stroke = Math.sin(phase)
        figure.position.y = 0.45
        figure.rotation.x = 1
        set('upperArm_L', -1.4 + stroke * 0.65, 0, -0.35)
        set('upperArm_R', -1.4 - stroke * 0.65, 0, 0.35)
        set('upperLeg_L', 0.15 + stroke * 0.22)
        set('upperLeg_R', 0.15 - stroke * 0.22)
        set('head', -0.45)
      } else if (kind === 'fitness') {
        set('foot_L')
        set('foot_R')
        const station = stations.get(avatar.fitnessId)!
        const m = sampleFitnessMotion(station.kind, avatar.fitnessStartedAt,
          avatar.connected ? now : avatar.fitnessStartedAt, fitness)
        figure.rotation.set(m.bodyX, m.bodyY, m.bodyZ)
        figure.position.set(0, m.offsetY * AVATAR.scale, m.offsetZ * AVATAR.scale)
        // Runtime L bones are +X; machine "left" parts are on -X.
        set('upperLeg_L', m.rightLeg, m.lowerYaw, m.legZ)
        set('upperLeg_R', m.leftLeg, m.lowerYaw, m.legZ)
        set('lowerLeg_L', Math.max(0, -m.rightLeg) * 0.55)
        set('lowerLeg_R', Math.max(0, -m.leftLeg) * 0.55)
        set('upperArm_L', m.rightArm, 0, -m.armZ)
        set('upperArm_R', m.leftArm, 0, m.armZ)
        if (supportedHipPoses.has(station.kind)) {
          hipFit.set(0, AVATAR.hipHeight * AVATAR.scale - model.hipHeight, 0).applyEuler(figure.rotation)
          figure.position.add(hipFit)
        }
        grip(station, m, figure, model)
      }
      if (age !== null) {
        if (avatar.emote === 'EMOTE_FART') figure.rotation.x = Math.sin(Math.PI * age / NETWORK.emoteDurationMs) * 0.12
        sampleCharacterEmote(avatar.emote, age, model)
      }
      model.apply(delta)
      if (kind === 'ground' || kind === 'telescope') {
        figure.position.y = pavingLift(pose.x, pose.z, pose.y - 0.8) + model.groundShift() + 0.003
      }
    },
  }
}
