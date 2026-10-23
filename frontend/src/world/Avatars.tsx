import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { Group, Vector3 } from 'three'
import { ParkAssetLoader } from './art/assetLoader'
import { characterUrls, createCharacterRig } from './art/CharacterRig'
import { createGait, sampleGait, pavingLift } from './art/characterMotion'
import { sampleCharacterEmote } from './art/characterEmotes'
import { SwimmingRipples } from './SwimmingRipples'

import { AvatarPoseCadence } from '../performance/avatarPoseCadence'
import {
  AVATAR,
  CHARACTER,
  NETWORK,
  FITNESS_STATIONS,
  createFitnessMotion,
  sampleFitnessMotion,
} from '../config'
import { clapElapsedMs } from '../game/presentation/emoteTiming'
import { FartCloud } from './art/FartCloud'

import {
  AvatarOverlayPositions,
  type AvatarAnchors,
  type OverlayTargets,
} from './AvatarOverlays'
import {
  avatars,
  sampleAvatar,
  useSession,
  estimatedServerTime,
} from '../network/worldClient'

function Avatar({
  id,
  rigs,
}: {
  id: string
  rigs: Map<string, AvatarAnchors>
}) {
  const sources = useLoader(ParkAssetLoader, characterUrls)
  const variant = avatars.get(id)?.character ?? 'man'
  const model = useMemo(
    () => createCharacterRig(sources[variant === 'girl' ? 1 : 0]!),
    [sources, variant],
  )
  const root = useRef<Group>(null)
  const figure = useRef<Group>(null)
  const marker = useRef<Group>(null)
  const pose = useMemo(() => ({ x: 0, y: 0, z: 0, yaw: 0 }), [])
  const worldPosition = useMemo(() => new Vector3(), [])
  const fitness = useMemo(createFitnessMotion, [])
  const phase = useRef(0)
  const gait = useMemo(createGait, [])
  const blend = useRef({ move: 0, run: 0 })
  const cadence = useMemo(() => new AvatarPoseCadence(), [])
  useLayoutEffect(() => {
    rigs.set(id, {
      root: root.current!,
      head: marker.current!,
    })
    return () => {
      rigs.delete(id)
      model.dispose()
    }
  }, [id, rigs, model])
  useFrame(({ camera }, delta) => {
    const avatar = avatars.get(id)
    if (!avatar || !root.current || !figure.current) return
    sampleAvatar(avatar, performance.now(), pose)
    const seated = avatar.seatIndex >= 0
    const own = id === useSession.getState().sessionId
    // Hide only this client's own model; other clients retain the full avatar.
    root.current.visible = !(own && (avatar.tableId || avatar.benchId) && seated)
    root.current.position.set(
      pose.x,
      pose.y - 0.8 + (seated ? CHARACTER.seatedHipHeight - model.hipHeight : 0),
      pose.z,
    )
    root.current.rotation.y = pose.yaw
    if (!root.current.visible) return
    const distance = camera.position.distanceTo(
      root.current.getWorldPosition(worldPosition),
    )
    model.lod(distance)
    const now = estimatedServerTime()
    const clapAge = clapElapsedMs(avatar, now)
    const age = now - avatar.emoteAt
    const active =
      avatar.moving ||
      !!avatar.fitnessId ||
      avatar.swimming ||
      clapAge !== null ||
      (age >= 0 && age < NETWORK.emoteDurationMs)
    // Keep the authoritative position interpolation above at display cadence.
    // State changes (seat, action, reconnect) must never wait for the next pose tick.
    const poseDelta = cadence.advance(
      delta,
      distance,
      own,
      active,
      `${avatar.connected}|${avatar.moving}|${avatar.running}|${avatar.tableId}|${avatar.seatIndex}|${avatar.benchId}|${avatar.fitnessId}|${avatar.fitnessStartedAt}|${avatar.telescopeId}|${avatar.swimming}|${avatar.emoteAt}`,
    )
    if (!poseDelta) return
    delta = poseDelta
    const moving = avatar.connected && avatar.moving && clapAge === null
    const blendAlpha = 1 - Math.exp(-Math.min(delta, 0.1) * 10)
    blend.current.move += ((moving ? 1 : 0) - blend.current.move) * blendAlpha
    blend.current.run +=
      ((avatar.running && moving ? 1 : 0) - blend.current.run) * blendAlpha
    phase.current +=
      Math.min(delta, 0.1) * (8 + 4.8 * blend.current.run) * blend.current.move
    sampleGait(phase.current, blend.current.move, blend.current.run, gait)
    model.reset()
    const set = model.set
    // Short stylized thighs need the hip slightly forward of a bench's center,
    // otherwise the solid front apron hides the calves.
    figure.current.position.set(0, 0, avatar.benchId ? 0.18 : 0)
    figure.current.rotation.set(0, 0, 0)
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
    if (!seated && !avatar.swimming && !avatar.fitnessId) {
      set('hips', 0, gait.hipYaw, gait.hipRoll)
      set('chest', gait.lean, -gait.hipYaw * 0.6, -gait.hipRoll * 0.5)
    }
    if (avatar.telescopeId) {
      set('upperArm_L', -1.1)
      set('upperArm_R', -1.1)
      set('lowerArm_L', -0.5)
      set('lowerArm_R', -0.5)
      set('head', -avatar.telescopePitch * 0.4)
    }
    if (avatar.swimming) {
      set('foot_L')
      set('foot_R')
      phase.current += Math.min(delta, 0.1) * (moving ? 2 : 1.5)
      const stroke = Math.sin(phase.current)
      figure.current.position.y = 0.45
      figure.current.rotation.x = 1
      set('upperArm_L', -1.4 + stroke * 0.65, 0, -0.35)
      set('upperArm_R', -1.4 - stroke * 0.65, 0, 0.35)
      set('upperLeg_L', 0.15 + stroke * 0.22)
      set('upperLeg_R', 0.15 - stroke * 0.22)
      set('head', -0.45)
    }
    if (avatar.fitnessId) {
      set('foot_L')
      set('foot_R')
      const station = FITNESS_STATIONS.find((s) => s.id === avatar.fitnessId)
      const m = sampleFitnessMotion(
        station?.kind ?? 'walker',
        avatar.fitnessStartedAt,
        avatar.connected ? now : avatar.fitnessStartedAt,
        fitness,
      )
      figure.current.rotation.set(m.bodyX, m.bodyY, m.bodyZ)
      figure.current.position.set(
        0,
        m.offsetY * AVATAR.scale,
        m.offsetZ * AVATAR.scale,
      )
      set('upperLeg_L', m.leftLeg, m.lowerYaw, m.legZ)
      set('upperLeg_R', m.rightLeg, m.lowerYaw, m.legZ)
      set('lowerLeg_L', Math.max(0, -m.leftLeg) * 0.55)
      set('lowerLeg_R', Math.max(0, -m.rightLeg) * 0.55)
      set('upperArm_L', m.leftArm, 0, -m.armZ)
      set('upperArm_R', m.rightArm, 0, m.armZ)
    }
    if (avatar.connected && age >= 0 && age < NETWORK.emoteDurationMs) {
      const pulse = Math.sin((Math.PI * age) / NETWORK.emoteDurationMs)
      if (avatar.emote === 'EMOTE_FART') {
        if (!avatar.fitnessId) figure.current.rotation.x = pulse * 0.12
      }
    }
    if (
      avatar.connected &&
      !avatar.fitnessId &&
      !avatar.telescopeId &&
      !avatar.swimming
    )
      sampleCharacterEmote(avatar.emote, age, model)
    model.apply(delta)
    if (!seated && !avatar.fitnessId && !avatar.swimming) {
      figure.current.position.y =
        pavingLift(pose.x, pose.z, pose.y - 0.8) + model.groundShift() + 0.003
    }
  }, -1)
  return (
    <group
      ref={root}
      name={`avatar-${id}`}
      dispose={null}
      userData={{ character: variant }}
    >
      <FartCloud id={id} />
      <group ref={figure} name={`figure-${id}`}>
        <primitive object={model.root} dispose={null} />
        <group ref={marker} position={[0, CHARACTER.height - 0.5, 0]} />
      </group>
    </group>
  )
}
export function Avatars({
  overlayTargets,
}: {
  overlayTargets: OverlayTargets
}) {
  const ids = useSession((state) => state.ids)
  const rigs = useMemo(() => new Map<string, AvatarAnchors>(), [])
  return (
    <group name="visitors">
      {ids.map((id) => (
        <Avatar key={id} id={id} rigs={rigs} />
      ))}
      <SwimmingRipples />

      <AvatarOverlayPositions rigs={rigs} targets={overlayTargets} />
    </group>
  )
}
