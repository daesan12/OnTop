import { gatheringCameraActive } from '../features/tableLobby/gathering'
import { OneCardHeldHand } from '../game/onecard/OneCardHeldHand'
import { oneCardHeldCount, oneCardHoldingPose } from '../game/onecard/heldHand'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useLoader, useThree } from '@react-three/fiber'
import { Group, Matrix4, Vector3 } from 'three'
import { ParkAssetLoader } from './art/assetLoader'
import { characterUrls, createCharacterRig } from './worldAssets'
import { avatarPoseActive, avatarPoseAmbient, avatarSeatSurface, createAvatarMotion } from './avatarMotion'
import { AvatarPresentation } from './avatarPresentation'
import { SwimmingRipples } from './SwimmingRipples'

import { AvatarPoseCadence } from '../performance/avatarPoseCadence'
import { CHARACTER } from '../park/mapConfig'
import { FartCloud } from './art/FartCloud'
import { bungeoppangReturnOpacity } from '../features/bungeoppang/bungeoppangView'
import { createAvatarOpacity } from './avatarOpacity'
import { avatarMenuRaycast } from './avatarMenuPicking'
import { useAvatarFrameSampler } from './AvatarPoseFrame'
import type { AvatarSampler } from '../network/avatarFrame'
import { emptyEquipment } from '../network/equipment'
import { roamingFirstPerson } from './roamingCamera'
import { localMovement } from '../network/localMovementPrediction'
import { useJumpmap } from '../features/jumpmap/state'
import { remoteMovement } from '../network/remoteMovement'
import { useGame } from '../game/store'
import { openAvatarMenu } from '../features/follow/FollowMenu'
import { gameReaction, installGameReactions } from './gameReactions'
import {activeParkDebris} from '../features/parkDebris/state'

import {
  AvatarOverlayPositions,
  type AvatarAnchors,
  type OverlayTargets,
} from './AvatarOverlays'
import {
  avatars,
  useSession,
  estimatedServerTime,
} from '../network/worldClient'

function Avatar({
  id,
  rigs,
  menuRaycast,
  samplePose,
}: {
  id: string
  rigs: Map<string, AvatarAnchors>
  menuRaycast: Group['raycast']
  samplePose: AvatarSampler
}) {
  const sources = useLoader(ParkAssetLoader, characterUrls)
  const variant = useSession(state => state.profiles[id]?.character ?? 'man')
  const equipment = useSession(state => state.equipment[id] ?? emptyEquipment)
  const own = useSession(state => state.sessionId === id)
  const model = useMemo(
    () => createCharacterRig(sources[variant === 'girl' ? 1 : 0]!),
    [sources, variant],
  )
  const root = useRef<Group>(null)
  const figure = useRef<Group>(null)
  const marker = useRef<Group>(null)
  const pose = useMemo(() => ({ x: 0, y: 0, z: 0, yaw: 0 }), [])
  const overlapPose = useMemo(() => ({ x: 0, y: 0, z: 0, yaw: 0 }), [])
  const worldPosition = useMemo(() => new Vector3(), [])
  const inverseRoot = useMemo(() => new Matrix4(), [])
  const presentation = useMemo(() => new AvatarPresentation(), [])
  const motion = useMemo(() => createAvatarMotion(model), [model])
  const cadence = useMemo(() => new AvatarPoseCadence(), [model])
  const appearance = useMemo(() => createAvatarOpacity(model.root), [model])
  const overlapOpacity = useRef(1)
  const reducedMotion = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)'), [])
  useLayoutEffect(() => {
    rigs.set(id, {
      root: root.current!,
      head: marker.current!,
    })
    return () => {
      rigs.delete(id)
      appearance.dispose()
      model.dispose()
    }
  }, [id, rigs, model, appearance])
  useFrame(({ camera }, delta) => {
    const avatar = avatars.get(id)
    if (!avatar || !root.current || !figure.current) return
    const frameAt = performance.now()
    samplePose(avatar, frameAt, pose)
    const seated = avatar.seatIndex >= 0
    const own = id === useSession.getState().sessionId
    // Hide only this client's own model; other clients retain the full avatar.
    const ownAvatar = !own && useJumpmap.getState().run ? avatars.get(useSession.getState().sessionId) : undefined
    const ownPose = ownAvatar && samplePose(ownAvatar, frameAt, overlapPose)
    const overlap = !!ownPose && Math.hypot(pose.x - ownPose.x, pose.z - ownPose.z) < .7 && Math.abs(pose.y - ownPose.y) < 1.8
    const targetOpacity = overlap ? .4 : 1
    overlapOpacity.current = targetOpacity + (overlapOpacity.current - targetOpacity) * Math.exp(-Math.min(delta, .1) * 6)
    if (Math.abs(overlapOpacity.current - targetOpacity) < .001) overlapOpacity.current = targetOpacity
    const opacity = own ? bungeoppangReturnOpacity(frameAt, reducedMotion.matches) : overlapOpacity.current
    const debrisMotion=!reducedMotion.matches&&activeParkDebris(useSession.getState().tableId,estimatedServerTime())
    root.current.visible = opacity > 0 && (!!debrisMotion || !(own && (((avatar.tableId && seated && !gatheringCameraActive() || avatar.benchId && seated) || avatar.telescopeId)
      || roamingFirstPerson(avatar, !!useGame.getState().watchedGameId))))
    appearance.set(root.current.visible ? opacity : 1)
    root.current.userData.appearanceOpacity = root.current.visible ? opacity : 0
    root.current.position.set(
      pose.x,
      pose.y - 0.8 + (seated ? avatarSeatSurface(avatar.benchId) + model.seatedHipLift - model.hipHeight : 0),
      pose.z,
    )
    root.current.rotation.y = pose.yaw
    if (!root.current.visible) return
    // The visitors parent has an identity transform; this position is already
    // in world space. Avoid walking/updating the ancestor matrices per avatar.
    const distance = camera.position.distanceTo(root.current.position)
    model.lod(distance)
    const now = estimatedServerTime()
    const reaction = gameReaction(id, avatar, now)
    const holdingCards = seated && oneCardHeldCount(id, avatar.tableId) > 0
    const displayFlags = own && localMovement.ready ? localMovement.displayFlags(frameAt)
      : !own ? remoteMovement.flags(id) : undefined
    const displayAvatar = presentation.sample(avatar, displayFlags)
    const active = !!reaction || avatarPoseActive(displayAvatar, now)
    // Keep the authoritative position interpolation above at display cadence.
    // State changes (seat, action, reconnect) must never wait for the next pose tick.
    const poseDelta = cadence.advance(
      delta,
      distance,
      own,
      active,
      presentation.key(avatar, reaction?.key ?? '', holdingCards, active),
      !reaction && avatarPoseAmbient(displayAvatar),
    )
    if (!poseDelta) return
    motion.apply(displayAvatar, now, poseDelta, pose, figure.current, reaction, holdingCards ? oneCardHoldingPose : undefined)
    // Follow the posed head when swimming; a tilted standing-height marker
    // otherwise puts the nickname in front of the swimmer's face/water.
    model.bones.head.getWorldPosition(worldPosition)
    // getWorldPosition already refreshed the ancestor matrices above.
    worldPosition.applyMatrix4(inverseRoot.copy(root.current.matrixWorld).invert())
    if (marker.current) {
      marker.current.position.copy(worldPosition)
      marker.current.position.y += 0.16
    }
  }, -1)
  return (
    <group
      ref={root}
      name={`avatar-${id}`}
      dispose={null}
      raycast={menuRaycast}
      onContextMenu={own ? undefined : event => {
        if (id === useSession.getState().sessionId) return
        event.stopPropagation(); event.nativeEvent.preventDefault()
        openAvatarMenu({ id, x: event.clientX, y: event.clientY })
      }}
      // Approved public appearance reaches the renderer. No guessed asset or material
      // substitution: product-specific models/textures have not been supplied yet.
      userData={{ character: variant, equipment, equipmentAssetsPending: equipment.length > 0 }}
    >
      <FartCloud id={id} />
      <group ref={figure} name={`figure-${id}`}>
        <primitive object={model.root} dispose={null} />
        <OneCardHeldHand userId={id} model={model} />
      </group>
      <group ref={marker} position={[0, CHARACTER.height - 0.5, 0]} />
    </group>
  )
}
export function Avatars({
  overlayTargets,
}: {
  overlayTargets: OverlayTargets
}) {
  const ids = useSession((state) => state.ids)
  const samplePose = useAvatarFrameSampler()
  const rigs = useMemo(() => new Map<string, AvatarAnchors>(), [])
  const lastEvent = useThree(state => state.internal.lastEvent)
  const inputRaycaster = useThree(state => state.raycaster)
  const menuRaycast = useMemo(() => avatarMenuRaycast(() => lastEvent.current, inputRaycaster), [lastEvent, inputRaycaster])
  useEffect(installGameReactions, [])
  return (
    <group name="visitors">
      {ids.map((id) => (
        <Avatar key={id} id={id} rigs={rigs} menuRaycast={menuRaycast} samplePose={samplePose} />
      ))}
      <SwimmingRipples />

      <AvatarOverlayPositions rigs={rigs} targets={overlayTargets} />
    </group>
  )
}
