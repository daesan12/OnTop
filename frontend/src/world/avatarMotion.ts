import { Vector3, type Group } from 'three'
import type { AvatarSnapshot, Pose } from '../network/worldClient'
import {
  AVATAR,
  BENCH_SEAT_HEIGHTS,
  CHARACTER,
  FITNESS_STATIONS,
  NETWORK,
  characterGestureDuration,
  createFitnessMotion,
  sampleFitnessMotion,
} from '../park/mapConfig'
import type { createCharacterRig } from './art/CharacterRig'
import { createGait, pavingLift, sampleGait } from './art/characterMotion'
import { createClipPose } from './art/characterClips'
import { sampleCharacterEmote } from './art/characterEmotes'
import { createFitnessGrip } from './art/fitnessGrip'
import { sampleDefeatMotion } from './art/defeatMotion'
import type { DefeatReaction } from '../game/presentation/defeat'
import { carryEase, CARRY_PULL_SECONDS, CARRY_RELEASE_SECONDS, CARRY_FINISH_SECONDS } from './avatarCarryMotion'

type Avatar = Pick<AvatarSnapshot,
  'connected' | 'moving' | 'running' | 'swimming' | 'seatIndex' |
  'benchId' | 'tableId' | 'fitnessId' | 'fitnessStartedAt' |
  'telescopeId' | 'telescopePitch' | 'emote' | 'emoteAt' | 'carry'
>
type Rig = ReturnType<typeof createCharacterRig>
const stations = new Map(FITNESS_STATIONS.map(station => [station.id, station]))
const defaultDurationEmotes = new Set(['EMOTE_TSK', 'EMOTE_APPLAUSE_REQUEST', 'EMOTE_FART'])
const supportedHipPoses = new Set(['rower', 'situp', 'inversion', 'legpress', 'pulldown'])
/** Map-local seat height above the bench base; table/unknown seats retain the shared default. */
export function avatarSeatSurface(benchId: string) {
  return BENCH_SEAT_HEIGHTS.get(benchId) ?? CHARACTER.seatedHipHeight
}

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
  return avatar.connected && (avatar.moving || !!avatar.carry || !!avatar.fitnessId || avatar.swimming || avatarEmoteAge(avatar, now) !== null)
}

/** Standing still on the ground plays the authored idle: it never settles, so it is sampled while near. */
export function avatarPoseAmbient(avatar: Avatar) {
  return avatar.connected && !avatar.moving && avatarPoseKind(avatar) === 'ground'
}

export function avatarPoseKey(a: Avatar) {
  return `${a.connected}|${a.moving}|${a.running}|${a.tableId}|${a.seatIndex}|${a.benchId}|${a.fitnessId}|${a.fitnessStartedAt}|${a.telescopeId}|${a.telescopePitch}|${a.swimming}|${a.emote}|${a.emoteAt}|${a.carry?.role ?? ''}`
}

/** Per-player mutable pose state; no React updates or per-frame vectors. */
export function createAvatarMotion(model: Rig, fittedSeats = false) {
  const fitness = createFitnessMotion(), gait = createGait()
  const grip = createFitnessGrip(), hipFit = new Vector3(), clip = createClipPose()
  let phase = 0, swimPhase = 0, move = 0, run = 0, previousCarry = '', releaseAge = 1, throwAge = 0
  let releasingThrow = false, releaseYaw = 0, releaseTurn = 0, releaseDirectionKnown = false, launchX = 0, launchZ = 0
  return {
    apply(avatar: Avatar, now: number, delta: number, pose: Pose, figure: Group, reaction?: DefeatReaction | null, seatedPose?: (model: Rig) => void, throwFlight?: Pick<AvatarSnapshot, 'current'> | null, carryThrowAge?: number, seatForward?: number, groundPose?: (rig: Rig, figure: Group) => void) {
      const kind = avatarPoseKind(avatar)
      const seated = kind === 'seated'
      const age = avatarEmoteAge(avatar, now)
      const moving = avatar.connected && avatar.moving && (kind === 'ground' || kind === 'swimming') &&
        !(avatar.emote === 'EMOTE_CLAP' && age !== null)
      const dt = Math.max(0, Math.min(delta, 0.1)), alpha = 1 - Math.exp(-dt * 10)
      move += ((moving ? 1 : 0) - move) * alpha
      run += ((avatar.running && moving ? 1 : 0) - run) * alpha
      phase += dt * (8 + 4.8 * run) * move
      sampleGait(phase, move, run, gait)
      model.reset()
      const set = model.set
      figure.position.set(0, 0, seated ? seatForward ?? (avatar.benchId ? .18 : 0) : 0)
      figure.rotation.set(0, 0, 0)
      set('upperLeg_L', seated ? -Math.PI / 2 : gait.thighL)
      set('upperLeg_R', seated ? -Math.PI / 2 : gait.thighR)
      const seatedKnee = fittedSeats ? Math.PI * .37 : Math.PI / 2
      set('lowerLeg_L', seated ? seatedKnee : gait.kneeL)
      set('lowerLeg_R', seated ? seatedKnee : gait.kneeR)
      set('foot_L', seated ? 0 : gait.ankleL)
      set('foot_R', seated ? 0 : gait.ankleR)
      set('upperArm_L', seated ? -0.35 : gait.armL)
      set('upperArm_R', seated ? -0.35 : gait.armR)
      set('lowerArm_L', seated ? -0.8 : gait.elbow)
      set('lowerArm_R', seated ? -0.8 : gait.elbow)
      if (kind === 'ground') {
        // Authored idle/walk/run cycles (blended by the same smoothed move/run amounts) replace the gait.
        // The own avatar uses them too, so it looks the same as other players see it.
        clip.ground(dt, move, run, set)
      } else if (kind === 'telescope') {
        set('upperArm_L', -1.1)
        set('upperArm_R', -1.1)
        set('lowerArm_L', -0.5)
        set('lowerArm_R', -0.5)
        set('head', -avatar.telescopePitch * 0.4)
      } else if (kind === 'swimming') {
        // A dedicated crawl cycle must keep running without ground locomotion.
        // Moving: alternating full strokes + flutter kick. Stopped: tread water.
        if (avatar.connected) swimPhase = (swimPhase + dt * (2.8 + 4 * move + 1.5 * run)) % (Math.PI * 2)
        const stroke = Math.sin(swimPhase), kick = Math.sin(swimPhase * 2)
        const tilt = 0.18 + 1.12 * move
        figure.rotation.set(tilt, 0, Math.cos(swimPhase) * 0.07 * move)
        // Rotate around the pelvis, not the soles: no forward orbit or floating bob.
        hipFit.set(0, model.hipHeight, 0).applyEuler(figure.rotation)
        figure.position.set(-hipFit.x, 0.56 + 0.24 * move - hipFit.y, -hipFit.z)
        for (const side of ['L', 'R'] as const) {
          const sign = side === 'L' ? 1 : -1
          const armPhase = swimPhase + (side === 'L' ? 0 : Math.PI)
          // Positive X brings the arm forward over the shoulder on this rig.
          set(`upperArm_${side}`, avatar.moving ? armPhase : -0.55 + stroke * 0.2,
            0, -sign * (0.65 * (1 - move) + 0.15 * move))
          set(`lowerArm_${side}`, -0.35 - Math.max(0, Math.sin(armPhase)) * 0.95)
          set(`upperLeg_${side}`, 0.12 + sign * kick * (0.1 + 0.14 * move))
          set(`lowerLeg_${side}`, 0.18 + Math.max(0, -sign * kick) * 0.3)
          set(`foot_${side}`, -0.18)
          model.handPose(side, 'cup')
        }
        set('head', -0.12 - 0.95 * move)
        // Swimming forward: the authored crawl over the tilted figure (treading water stays procedural).
        if (avatar.moving) clip.swim(dt, move, set)
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
      if (reaction && avatar.connected && (kind === 'ground' || seated) && !avatar.moving) sampleDefeatMotion(reaction.kind, now - reaction.at, model)
      if (seated && age === null && !reaction) seatedPose?.(model)
      const role = avatar.carry?.role ?? ''
      throwAge = role !== 'THROWN' ? 0 : carryThrowAge !== undefined
        ? Math.max(0, carryThrowAge - CARRY_RELEASE_SECONDS) : previousCarry === 'THROWN' ? throwAge + dt : 0
      if (previousCarry === 'CARRIER' && !role) {
        releaseAge = 0
        releasingThrow = !!throwFlight
        releaseDirectionKnown = false
        releaseYaw = pose.yaw
        releaseTurn = 0
        launchX = throwFlight?.current.x ?? pose.x
        launchZ = throwFlight?.current.z ?? pose.z
      }
      previousCarry = role
      releaseAge += dt
      if (carryThrowAge !== undefined) releaseAge = carryThrowAge
      if (releasingThrow && !releaseDirectionKnown && throwFlight) {
        const dx = throwFlight.current.x - launchX, dz = throwFlight.current.z - launchZ
        if (Math.hypot(dx, dz) > .01) {
          releaseYaw = Math.atan2(dx, dz)
          releaseDirectionKnown = true
        }
      }
      if (role === 'CARRIER' || !role && kind === 'ground' && age === null && !reaction && releaseAge < CARRY_FINISH_SECONDS) {
        const throwing = !role && releasingThrow
        const lift = throwing ? carryEase(releaseAge / .16) : 0
        const pull = throwing ? carryEase((releaseAge - .16) / .18) : 0
        const push = throwing ? carryEase((releaseAge - CARRY_PULL_SECONDS) / .12) : 0
        const recover = throwing ? carryEase((releaseAge - .46) / .24) : 0
        const duck = throwing ? .65 * lift * (1 - push) : 0
        const weight = role === 'CARRIER' ? 1 : 1 - carryEase(releaseAge / CARRY_FINISH_SECONDS)
        for (const side of ['L', 'R'] as const) {
          const sign = side === 'L' ? 1 : -1
          // Keep the raised-back support, then duck underneath the forward overhead sweep.
          const reach = throwing ? 2.35 + .7 * lift + .75 * pull + 1.1 * push + (Math.PI * 2 - 4.9) * recover - duck : 2.35 * weight
          set(`upperArm_${side}`, reach, 0, -sign * .25)
          set(`lowerArm_${side}`, .4 - .28 * lift - .08 * push)
          model.handPose(side, throwing && releaseAge >= CARRY_RELEASE_SECONDS ? 'open' : 'cup')
        }
        set('spine', role === 'CARRIER' ? .03 + .03 * run : 0)
        if (throwing) {
          const turn = Math.atan2(Math.sin(releaseYaw - pose.yaw), Math.cos(releaseYaw - pose.yaw))
          releaseTurn += Math.atan2(Math.sin(turn - releaseTurn), Math.cos(turn - releaseTurn)) * (1 - Math.exp(-dt * 30))
          figure.rotation.y = releaseTurn * Math.min(1, Math.max(0, (CARRY_FINISH_SECONDS - releaseAge) / .13))
          set('spine', duck + .24 * Math.sin(push * Math.PI / 2) * (1 - recover))
          set('head', .25 * lift * (1 - push))
        }
      } else if (role === 'CARRIED' || role === 'THROWN') {
        // 내려놓는 직립 자세 대신, 들린 자세에서 이어지는 짧은 공중 회전.
        const flightAge = throwAge
        figure.rotation.set(role === 'THROWN' ? -.1 - Math.min(flightAge, .8) * 4 : -.1,
          0, Math.PI / 2 + (role === 'THROWN' ? Math.sin(flightAge * 9) * .12 : 0))
        hipFit.set(0, model.hipHeight, 0).applyEuler(figure.rotation)
        figure.position.set(-hipFit.x, model.hipHeight - hipFit.y, -hipFit.z)
        // 리그의 팔 축에 Euler 각을 고정하면 손/팔꿈치가 몸통 안으로 접힌다.
        // 실제 팔 길이와 바깥쪽 팔꿈치 pole을 쓰는 기존 IK로 양팔을 몸 밖에 유지한다.
        for (const side of ['L', 'R'] as const) {
          const sign = side === 'L' ? 1 : -1
          model.reachHand(side, sign * (role === 'CARRIED' ? .42 : .48),
            model.hipHeight + (role === 'CARRIED' ? .12 : .23), role === 'CARRIED' ? .14 : .04,
            0, 0, sign * .2, 1, false)
          model.handPose(side, role === 'CARRIED' ? 'cup' : 'open')
        }
        set('upperLeg_L', -.35); set('upperLeg_R', .3)
        set('lowerLeg_L', .6); set('lowerLeg_R', .4)
      }
      if (!role && kind === 'ground' && age === null && !reaction) groundPose?.(model, figure)
      model.apply(delta)
      if (!role && (kind === 'ground' || kind === 'telescope') || role === 'CARRIER') {
        figure.position.y = pavingLift(pose.x, pose.z, pose.y - 0.8) + model.groundShift() + 0.003
      }
      // The paired presentation pass fits the held hips to the actual carrier shoulders.
    },
  }
}
