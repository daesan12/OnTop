import { gatheringCameraActive } from '../features/tableLobby/gathering'
import { oneCardShoulderActive } from '../game/onecard/camera'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { Group, Vector3 } from 'three'
import { ParkAssetLoader } from './art/assetLoader'
import { characterUrls, createCharacterRig } from './art/CharacterRig'
import { avatarPoseActive, avatarPoseKey, avatarSeatSurface, createAvatarMotion } from './avatarMotion'
import { SwimmingRipples } from './SwimmingRipples'

import { AvatarPoseCadence } from '../performance/avatarPoseCadence'
import { CHARACTER } from '../config'
import { FartCloud } from './art/FartCloud'
import { bungeoppangReturnOpacity } from '../features/bungeoppang/bungeoppangView'
import { createAvatarOpacity } from './avatarOpacity'
import { emptyEquipment } from '../network/equipment'
import { roamingFirstPerson } from './roamingCamera'
import { useGame } from '../game/store'
import { openAvatarMenu } from '../features/follow/FollowMenu'
import { gameReaction, installGameReactions } from './gameReactions'

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
  const variant = useSession(state => state.profiles[id]?.character ?? 'man')
  const equipment = useSession(state => state.equipment[id] ?? emptyEquipment)
  const model = useMemo(
    () => createCharacterRig(sources[variant === 'girl' ? 1 : 0]!),
    [sources, variant],
  )
  const root = useRef<Group>(null)
  const figure = useRef<Group>(null)
  const marker = useRef<Group>(null)
  const pose = useMemo(() => ({ x: 0, y: 0, z: 0, yaw: 0 }), [])
  const worldPosition = useMemo(() => new Vector3(), [])
  const motion = useMemo(() => createAvatarMotion(model), [model])
  const cadence = useMemo(() => new AvatarPoseCadence(), [])
  const appearance = useMemo(() => createAvatarOpacity(model.root), [model])
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
    const opacity = own ? bungeoppangReturnOpacity(frameAt, reducedMotion.matches) : 1
    root.current.visible = opacity > 0 && !(own && (((avatar.tableId && seated && !gatheringCameraActive() && !oneCardShoulderActive(useGame.getState().game) || avatar.benchId && seated) || avatar.telescopeId)
      || roamingFirstPerson(avatar, !!useGame.getState().watchedGameId)))
    appearance.set(root.current.visible ? opacity : 1)
    root.current.userData.appearanceOpacity = root.current.visible ? opacity : 0
    root.current.position.set(
      pose.x,
      pose.y - 0.8 + (seated ? avatarSeatSurface(avatar.benchId) + model.seatedHipLift - model.hipHeight : 0),
      pose.z,
    )
    root.current.rotation.y = pose.yaw
    if (!root.current.visible) return
    const distance = camera.position.distanceTo(
      root.current.getWorldPosition(worldPosition),
    )
    model.lod(distance)
    const now = estimatedServerTime()
    const reaction = gameReaction(id, avatar, now)
    const active = !!reaction || avatarPoseActive(avatar, now)
    // Keep the authoritative position interpolation above at display cadence.
    // State changes (seat, action, reconnect) must never wait for the next pose tick.
    const poseDelta = cadence.advance(
      delta,
      distance,
      own,
      active,
      `${avatarPoseKey(avatar)}|${reaction?.key ?? ''}`,
    )
    if (!poseDelta) return
    motion.apply(avatar, now, poseDelta, pose, figure.current, reaction)
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
      onContextMenu={event => {
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
