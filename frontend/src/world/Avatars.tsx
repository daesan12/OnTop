import { gatheringCameraActive } from '../features/tableLobby/gathering'
import { OneCardHeldHand } from '../game/onecard/OneCardHeldHand'
import { oneCardHeldCount, oneCardHoldingPose } from '../game/onecard/heldHand'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { Group, Vector3 } from 'three'
import { ParkAssetLoader } from './art/assetLoader'
import { characterUrls, createCharacterRig } from './worldAssets'
import { avatarPoseActive, avatarPoseAmbient, avatarPoseKey, avatarSeatSurface, createAvatarMotion } from './avatarMotion'
import { SwimmingRipples } from './SwimmingRipples'

import { AvatarPoseCadence } from '../performance/avatarPoseCadence'
import { CHARACTER } from '../park/mapConfig'
import { FartCloud } from './art/FartCloud'
import { bungeoppangReturnOpacity } from '../features/bungeoppang/bungeoppangView'
import { createAvatarOpacity } from './avatarOpacity'
import { emptyEquipment } from '../network/equipment'
import { availableLook, isCharacterSource, lookKey, lookSources, resolveLook } from './art/characterLook'
import { useOutfitSources } from './art/outfitSources'
import { previewEquipment, useWardrobe } from '../features/wardrobe/state'
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
  const variant = useSession(state => state.profiles[id]?.character === 'girl' ? 'girl' : 'man')
  const equipment = useSession(state => state.equipment[id] ?? emptyEquipment)
  const own = useSession(state => state.sessionId === id)
  // The own avatar tries on the wardrobe's previewed item before it is worn.
  const previewId = useWardrobe(state => own && state.open ? state.previewId : 0)
  const owned = useWardrobe(state => state.items)
  const worn = useMemo(() => previewId && previewEquipment(owned, previewId) || equipment, [previewId, owned, equipment])
  const look = useMemo(() => resolveLook(variant, worn), [variant, worn])
  const outfits = useOutfitSources(lookSources(look).filter(source => !isCharacterSource(source)))
  const files = useMemo(() => new Map([['man', sources[0]!], ['girl', sources[1]!], ...outfits]), [sources, outfits])
  const shown = availableLook(variant, look, source => files.has(source))
  const shownKey = lookKey(shown)
  const model = useMemo(
    () => createCharacterRig(sources[variant === 'girl' ? 1 : 0]!, shown, files),
    // (`shown` is fully described by its key)
    [sources, variant, shownKey, files],
  )
  const root = useRef<Group>(null)
  const figure = useRef<Group>(null)
  const marker = useRef<Group>(null)
  const pose = useMemo(() => ({ x: 0, y: 0, z: 0, yaw: 0 }), [])
  const worldPosition = useMemo(() => new Vector3(), [])
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
    sampleAvatar(avatar, frameAt, pose)
    const seated = avatar.seatIndex >= 0
    const own = id === useSession.getState().sessionId
    // Hide only this client's own model; other clients retain the full avatar.
    const ownAvatar = !own && useJumpmap.getState().run ? avatars.get(useSession.getState().sessionId) : undefined
    const ownPose = ownAvatar && sampleAvatar(ownAvatar, frameAt, { ...ownAvatar.current })
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
    const displayAvatar = displayFlags ? { ...avatar, ...displayFlags } : avatar
    const active = !!reaction || avatarPoseActive(displayAvatar, now)
    // Keep the authoritative position interpolation above at display cadence.
    // State changes (seat, action, reconnect) must never wait for the next pose tick.
    const poseDelta = cadence.advance(
      delta,
      distance,
      own,
      active,
      `${avatarPoseKey(avatar)}|${reaction?.key ?? ''}|${holdingCards}|${active ? '' : `${avatar.current.x}|${avatar.current.y}|${avatar.current.z}`}`,
      !reaction && avatarPoseAmbient(displayAvatar),
    )
    if (!poseDelta) return
    motion.apply(displayAvatar, now, poseDelta, pose, figure.current, reaction, holdingCards ? oneCardHoldingPose : undefined)
    // Follow the posed head when swimming; a tilted standing-height marker
    // otherwise puts the nickname in front of the swimmer's face/water.
    model.bones.head.getWorldPosition(worldPosition)
    root.current.worldToLocal(worldPosition)
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
      // A registered handler raycasts the whole posed model on every canvas
      // press/release/click, even though the local avatar has no context menu.
      onContextMenu={own ? undefined : event => {
        if (id === useSession.getState().sessionId) return
        event.stopPropagation(); event.nativeEvent.preventDefault()
        openAvatarMenu({ id, x: event.clientX, y: event.clientY })
      }}
      // Approved public appearance reaches the renderer. No guessed asset or material
      // substitution: product-specific models/textures have not been supplied yet.
      userData={{ character: variant, equipment, look: shownKey }}
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
  const rigs = useMemo(() => new Map<string, AvatarAnchors>(), [])
  useEffect(installGameReactions, [])
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
