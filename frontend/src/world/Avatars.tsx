import { gatheringCameraActive } from '../features/tableLobby/gathering'
import { OneCardHeldHand } from '../game/onecard/OneCardHeldHand'
import { oneCardHeldCount, oneCardHoldingPose } from '../game/onecard/heldHand'
import { startTransition, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { localBalloonRider, useLocalBalloon } from '../features/balloon/localRide'
import { remoteBalloonRider } from '../features/balloon/remoteRide'
import { useFrame, useLoader, useThree } from '@react-three/fiber'
import { Group, Matrix4, Vector3 } from 'three'
import { cameraWorldPosition, parkXRView } from './xrView'
import { ParkAssetLoader } from './art/assetLoader'
import { characterUrls } from './worldAssets'
import { createSafeCharacterRig } from './art/safeCharacterRig'
import { avatarPoseActive, avatarPoseAmbient, avatarSeatSurface, createAvatarMotion } from './avatarMotion'
import { RENEWAL_PARK_ENABLED } from '../park/mapSelection'
import { createCarryMotion } from './avatarCarryMotion'
import { createMountedVehicle } from '../features/mobility/mountedVehicle'
import { AvatarPresentation } from './avatarPresentation'
import { SwimmingRipples } from './SwimmingRipples'

import { AvatarPoseCadence } from '../performance/avatarPoseCadence'
import { CHARACTER, TABLES } from '../park/mapConfig'
import { FartCloud } from './art/FartCloud'
import { bungeoppangReturnOpacity } from '../features/bungeoppang/bungeoppangView'
import { createAvatarOpacity } from './avatarOpacity'
import { avatarMenuRaycast } from './avatarMenuPicking'
import { useAvatarFrameSampler } from './AvatarPoseFrame'
import type { AvatarSampler } from '../network/avatarFrame'
import { emptyEquipment } from '../network/equipment'
import { availableLook, isCharacterSource, lookKey, lookSources, resolveLook } from './art/characterLook'
import { useOutfitSources } from './art/outfitSources'
import { resolveWholeSkin } from './art/wholeSkin'
import { useSkinCatalog } from './art/skinCatalog'
import { previewEquipment, useWardrobe } from '../features/wardrobe/state'
import type { OwnedItem } from '../features/shop/contracts'
import { WARDROBE_OUTFITS_ENABLED } from '../features/wardrobe/feature'
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

const noItems: OwnedItem[] = []
function avatarCrowdGroup(id: string) {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (Math.imul(hash, 31) + id.charCodeAt(i)) | 0
  return (hash ^ (hash >>> 16)) & 1
}

function Avatar({
  id,
  rigs,
  menuRaycast,
  samplePose,
  carryMotion,
  firstGateFrameAt,
  crowded,
  crowdFrame,
}: {
  id: string
  crowded: boolean
  crowdFrame: RefObject<number>
  rigs: Map<string, AvatarAnchors>
  menuRaycast: Group['raycast']
  samplePose: AvatarSampler
  carryMotion: ReturnType<typeof createCarryMotion>
  firstGateFrameAt?: RefObject<number | null>
}) {
  const sources = useLoader(ParkAssetLoader, characterUrls)
  const variant = useSession(state => state.profiles[id]?.character === 'girl' ? 'girl' : 'man')
  const receivedEquipment = useSession(state => state.equipment[id])
  const equipment = receivedEquipment ?? emptyEquipment
  const own = useSession(state => state.sessionId === id)
  // The own avatar tries on the wardrobe's previewed item before it is worn.
  const previewId = useWardrobe(state => own && state.open ? state.previewId : 0)
  // (only the own avatar previews; others keep one empty list, so a wardrobe refresh does not re-render them)
  const owned = useWardrobe(state => own ? state.items : noItems)
  const worn = useMemo(() => previewId && previewEquipment(owned, previewId) || equipment, [previewId, owned, equipment])
  const catalogRevision = useSkinCatalog(s => s.revision)
  const waitingForCatalog = useSkinCatalog(s => !s.checked) &&
    worn.some(item => item.imageKey?.startsWith('catalog/'))
  // Outfits closed (production build): every avatar keeps its default clothes, whatever is equipped.
  const look = useMemo(() => resolveLook(variant, WARDROBE_OUTFITS_ENABLED ? worn : emptyEquipment), [variant, worn, catalogRevision])
  const wholeSkin = WARDROBE_OUTFITS_ENABLED ? resolveWholeSkin(variant, worn) : undefined
  const { outfits, pending: waitingForOutfit } = useOutfitSources(wholeSkin
    ? [wholeSkin.source] : lookSources(look).filter(source => !isCharacterSource(source)))
  const [equipmentTimedOut, setEquipmentTimedOut] = useState(false)
  useEffect(() => {
    if (!WARDROBE_OUTFITS_ENABLED || receivedEquipment !== undefined) return
    const timeout = window.setTimeout(() => setEquipmentTimedOut(true), 8000)
    return () => window.clearTimeout(timeout)
  }, [receivedEquipment])
  const appearanceReady = !WARDROBE_OUTFITS_ENABLED ||
    ((receivedEquipment !== undefined || equipmentTimedOut) && !waitingForCatalog && !waitingForOutfit)
  const firstAppearanceReady = useRef(false)
  useLayoutEffect(() => {
    if (appearanceReady) firstAppearanceReady.current = true
  }, [appearanceReady])
  const wholeSource = wholeSkin && outfits.get(wholeSkin.source)
  const files = useMemo(() => new Map([['man', sources[0]!], ['girl', sources[1]!], ...outfits]), [sources, outfits])
  const shown = availableLook(variant, look, source => files.has(source))
  const shownKey = lookKey(shown)
  const model = useMemo(
    () => createSafeCharacterRig(sources[variant === 'girl' ? 1 : 0]!, shown, files, wholeSource || undefined),
    // (`shown` is fully described by its key)
    [sources, variant, shownKey, files, wholeSource],
  )
  const root = useRef<Group>(null)
  const figure = useRef<Group>(null)
  const marker = useRef<Group>(null)
  const pose = useMemo(() => ({ x: 0, y: 0, z: 0, yaw: 0 }), [])
  const overlapPose = useMemo(() => ({ x: 0, y: 0, z: 0, yaw: 0 }), [])
  const worldPosition = useMemo(() => new Vector3(), [])
  const inverseRoot = useMemo(() => new Matrix4(), [])
  const presentation = useMemo(() => new AvatarPresentation(), [])
  const mountedVehicle = useMemo(createMountedVehicle, [])
  const motion = useMemo(() => createAvatarMotion(model, RENEWAL_PARK_ENABLED), [model])
  const carriedPartner = useRef({ id: '', carryId: '' })
  const cadence = useMemo(() => new AvatarPoseCadence(avatarCrowdGroup(id)), [id, model])
  const appearance = useRef<ReturnType<typeof createAvatarOpacity> | null>(null)
  const pendingFadeShaders = useRef<(() => void) | null>(null)
  const rendererState = useThree(state => state.get)
  const overlapOpacity = useRef(1)
  const reducedMotion = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)'), [])
  useLayoutEffect(() => {
    // Create in setup: StrictMode may replay cleanup/setup while retaining the model.
    const current = createAvatarOpacity(model.root)
    appearance.current = current
    rigs.set(id, { root: root.current!, head: marker.current! })
    const { gl } = rendererState()
    let active = true
    const prepare = () => {
      pendingFadeShaders.current = null
      const { camera, scene } = rendererState()
      void current.prepare(gl, camera, scene).catch(error => {
        if (active && !gl.getContext().isContextLost()) console.error('아바타 반투명 셰이더를 준비하지 못했습니다.', error)
      })
    }
    const schedulePreparation = () => {
      if (firstGateFrameAt?.current === null) pendingFadeShaders.current = prepare
      else prepare()
    }
    const lost = () => { pendingFadeShaders.current = null; current.invalidate() }
    const restored = () => { current.invalidate(); schedulePreparation() }
    gl.domElement.addEventListener('webglcontextlost', lost)
    gl.domElement.addEventListener('webglcontextrestored', restored)
    schedulePreparation()
    return () => {
      active = false
      pendingFadeShaders.current = null
      gl.domElement.removeEventListener('webglcontextlost', lost)
      gl.domElement.removeEventListener('webglcontextrestored', restored)
      rigs.delete(id)
      if (appearance.current === current) appearance.current = null
      current.dispose()
      model.dispose()
    }
  }, [id, rigs, model, rendererState, firstGateFrameAt])
  useFrame(({ camera }, delta) => {
    const avatar = avatars.get(id)
    if (!avatar || !root.current || !figure.current) return
    if (avatar.carry?.role === 'CARRIER') {
      carriedPartner.current.id = avatar.carry.partnerId
      carriedPartner.current.carryId = avatar.carry.carryId
    }
    const frameAt = performance.now()
    samplePose(avatar, frameAt, pose)
    const seated = avatar.seatIndex >= 0
    const seatTable = seated && avatar.tableId ? TABLES.find(table => table.id === avatar.tableId) : undefined
    const own = id === useSession.getState().sessionId
    const localBalloon = useLocalBalloon.getState()
    const localPilot = localBalloon.flight && localBalloon.owner === localBalloon.leader
      ? { id: localBalloon.owner, position: localBalloon.flight.position } : undefined
    const balloonRider = own ? localBalloonRider(id) : remoteBalloonRider(id, frameAt, localPilot)
    // Hide only this client's own model; other clients retain the full avatar.
    const ownAvatar = !own && useJumpmap.getState().run ? avatars.get(useSession.getState().sessionId) : undefined
    const ownPose = ownAvatar && samplePose(ownAvatar, frameAt, overlapPose)
    const overlap = !!ownPose && Math.hypot(pose.x - ownPose.x, pose.z - ownPose.z) < .7 && Math.abs(pose.y - ownPose.y) < 1.8
    const targetOpacity = overlap ? .4 : 1
    overlapOpacity.current = targetOpacity + (overlapOpacity.current - targetOpacity) * Math.exp(-Math.min(delta, .1) * 6)
    if (Math.abs(overlapOpacity.current - targetOpacity) < .001) overlapOpacity.current = targetOpacity
    const opacity = own ? bungeoppangReturnOpacity(frameAt, reducedMotion.matches) : overlapOpacity.current
    const gateFrameAt = firstGateFrameAt?.current
    // Give the first render and walking input a turn before compiling fade-only variants.
    if (gateFrameAt != null && (frameAt - gateFrameAt >= 1000 || (opacity > 0 && opacity < 1))) {
      pendingFadeShaders.current?.()
    }
    const debrisMotion=!reducedMotion.matches&&activeParkDebris(useSession.getState().tableId,estimatedServerTime())
    const balloon = own && balloonRider ? useLocalBalloon.getState() : null
    const hideBalloonRider = balloon?.walkingInside && balloon.cabinFirstPerson && balloon.flight?.phase === 'flying'
    root.current.visible = firstAppearanceReady.current && opacity > 0 && !hideBalloonRider && !(own && parkXRView.active) && (!!balloonRider || !!debrisMotion || !(own && (((avatar.tableId && seated && !gatheringCameraActive() || avatar.benchId && seated) || avatar.telescopeId)
      || roamingFirstPerson(avatar, !!useGame.getState().watchedGameId))))
    appearance.current?.set(root.current.visible ? opacity : 1)
    root.current.userData.appearanceOpacity = root.current.visible ? opacity : 0
    if (balloonRider) {
      const seatLift = balloonRider.seatIndex >= 0 ? model.seatedContactLift - model.hipHeight : 0
      root.current.position.set(balloonRider.x, balloonRider.y + seatLift, balloonRider.z)
    }
    else root.current.position.set(
      pose.x,
      pose.y - 0.8 + (seated ? (seatTable?.seatSurfaceY
        ?? avatarSeatSurface(avatar.benchId))
          + (RENEWAL_PARK_ENABLED ? model.seatedContactLift : model.seatedHipLift) - model.hipHeight : 0),
      pose.z,
    )
    root.current.rotation.y = balloonRider?.yaw ?? pose.yaw
    const carryAnimation = carryMotion.get(id)
    if (!root.current.visible && !carryAnimation) return
    // The visitors parent has an identity transform; this position is already
    // in world space. Avoid walking/updating the ancestor matrices per avatar.
    const distance = cameraWorldPosition(camera).distanceTo(root.current.position)
    model.lod(distance)
    const now = estimatedServerTime()
    const reaction = gameReaction(id, avatar, now)
    const holdingCards = seated && oneCardHeldCount(id, avatar.tableId) > 0
    const displayFlags = own && localMovement.ready ? localMovement.displayFlags(frameAt)
      : !own ? remoteMovement.flags(id) : undefined
    const motionAvatar = balloonRider ? { ...avatar, seatIndex: balloonRider.seatIndex,
      moving: balloonRider.moving, running: false, swimming: false } : avatar
    const displayAvatar = presentation.sample(motionAvatar, balloonRider ? undefined : displayFlags,
      own || balloonRider ? undefined : pose, frameAt)
    const active = !!avatar.vehicle || mountedVehicle.root.children.length > 0 || !!carryAnimation || !!reaction || avatarPoseActive(displayAvatar, now)
    // Keep the authoritative position interpolation above at display cadence.
    // State changes (seat, action, reconnect) must never wait for the next pose tick.
    const poseDelta = cadence.advance(
      delta,
      distance,
      own,
      active,
      presentation.key(motionAvatar, reaction?.key ?? '', holdingCards, active),
      !reaction && avatarPoseAmbient(displayAvatar),
      crowded && !carryAnimation && !reaction && !seated && !displayAvatar.emote && !displayAvatar.fitnessId && !displayAvatar.telescopeId,
      crowdFrame.current,
    )
    if (!poseDelta) return
    const partner = avatars.get(carriedPartner.current.id)
    const throwFlight = partner?.carry?.role === 'THROWN' && partner.carry.partnerId === id
      && partner.carry.carryId === carriedPartner.current.carryId ? partner : null
    // Place the knees beyond the front edge of the deeper pavilion seats.
    let seatForward: number | undefined
    if (RENEWAL_PARK_ENABLED && seated) {
      if (avatar.benchId) seatForward = .34
      else if (seatTable?.pavilionId === 'P0') seatForward = .27
      else if (seatTable?.pavilionId) seatForward = .43
      else seatForward = .13
    }
    if (!mountedVehicle.apply(avatar.vehicle, pose, root.current.position.y, delta, figure.current, model))
      motion.apply(displayAvatar, now, poseDelta, pose, figure.current, reaction,
      holdingCards ? oneCardHoldingPose : undefined, throwFlight,
      carryAnimation?.releasedAt !== null ? carryAnimation?.age : undefined, seatForward)
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
      visible={false}
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
      userData={{ character: variant, equipment, look: shownKey, wholeSkin: wholeSource ? wholeSkin?.imageKey : undefined }}
    >
      <FartCloud id={id} />
      <primitive object={mountedVehicle.root} dispose={null} />
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
  firstGateFrameAt,
}: {
  overlayTargets: OverlayTargets
  firstGateFrameAt?: RefObject<number | null>
}) {
  const ids = useSession((state) => state.ids)
  const ownId = useSession(state => state.sessionId)
  const [mountedPeers, setMountedPeers] = useState<readonly string[]>([])
  const pendingPeers = useRef(false)
  const mounted = useMemo(() => new Set(mountedPeers), [mountedPeers])
  const wanted = useMemo(() => new Set(ids.filter(id => id !== ownId)), [ids, ownId])
  const needsPeers = RENEWAL_PARK_ENABLED && (mounted.size !== wanted.size || mountedPeers.some(id => !wanted.has(id)))
  useLayoutEffect(() => { pendingPeers.current = false }, [mountedPeers])
  useFrame(() => {
    if (firstGateFrameAt?.current === null || !needsPeers || pendingPeers.current) return
    const next = mountedPeers.filter(id => wanted.has(id))
    // Cloning several skeletons at once can monopolize a render frame on join.
    // Retain existing peers and admit at most four new rigs per rendered frame.
    let admitted = 0
    for (const id of wanted) {
      if (mounted.has(id)) continue
      next.push(id)
      if (++admitted === 4) break
    }
    if (!admitted && next.length === mountedPeers.length) return
    pendingPeers.current = true
    startTransition(() => setMountedPeers(next))
  }, -2.5)
  const crowded = RENEWAL_PARK_ENABLED && ids.length >= 20
  const crowdFrame = useRef(0)
  useFrame(() => { crowdFrame.current++ }, -1.25)
  const samplePose = useAvatarFrameSampler()
  const rigs = useMemo(() => new Map<string, AvatarAnchors>(), [])
  const carryMotion = useMemo(createCarryMotion, [])
  // r3f v9 sorts numeric priorities, including fractions, from low to high.
  // Sample (-2) -> carry state (-1.5) -> avatar poses (-1) -> carry placement (-.5) -> overlays (0).
  // Keep these stages distinct so placement always uses this frame's posed shoulders.
  useFrame(() => carryMotion.update(avatars, performance.now()), -1.5)
  useFrame(() => carryMotion.place(rigs), -.5)
  const lastEvent = useThree(state => state.internal.lastEvent)
  const inputRaycaster = useThree(state => state.raycaster)
  const menuRaycast = useMemo(() => avatarMenuRaycast(() => lastEvent.current, inputRaycaster), [lastEvent, inputRaycaster])
  useEffect(installGameReactions, [])
  return (
    <group name="visitors">
      {(RENEWAL_PARK_ENABLED ? ids.filter(id => id === ownId || mounted.has(id)) : ids).map((id) => (
        <Avatar key={id} id={id} crowded={crowded} crowdFrame={crowdFrame} rigs={rigs} menuRaycast={menuRaycast} samplePose={samplePose} carryMotion={carryMotion} firstGateFrameAt={firstGateFrameAt} />
      ))}
      <SwimmingRipples />

      <AvatarOverlayPositions rigs={rigs} targets={overlayTargets} />
    </group>
  )
}
