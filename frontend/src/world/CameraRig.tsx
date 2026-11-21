import { sleighRider } from '../features/winter/sleigh/controller'
import { SleighCamera } from '../features/winter/sleigh/camera'
import { ALKKAGI_FOV, alkkagiCameraActive, alkkagiTopDownFrame } from '../game/alkkagi/camera'
import { gatheringCameraActive } from '../features/tableLobby/gathering'
import { oneCardPlayerViewActive, oneCardCameraPose, oneCardSpectatorCameraPose, ONECARD_CAMERA } from '../game/onecard/camera'
import { tabletLobbyActive } from '../features/tableLobby/tabletModel'
import { TABLET } from '../features/tableLobby/tabletProjection'
import { renderedTableAnchors } from '../features/tableLobby/tabletAnchors'
import { TABLET_ENABLED } from '../features/tableLobby/tabletFeature'
import { useEffect, useMemo, useRef } from 'react'
import { localBalloonRider, useLocalBalloon } from '../features/balloon/localRide'
import { balloonCanLook, cabinCamera, setBalloonOrbit } from '../features/balloon/cabinCamera'
import { CABIN_STANDING_EYE_OFFSET } from '../features/balloon/cabin'
import { useFrame, useThree } from '@react-three/fiber'
import { Matrix4, PerspectiveCamera, Quaternion, Raycaster, SkinnedMesh, Vector3, type Object3D } from 'three'
import { bungeoppangView } from '../features/bungeoppang/bungeoppangView'
import { CAMERA, CHARACTER, GOMOKU, PARK_SIZE, TABLES, TELESCOPE, TELESCOPES, telescopeFov, groundHeight, tableScale, tableSeats } from '../park/mapConfig'
import { WELCOME_FLIGHT_MS, welcomeFlight, welcomeFlightPose } from '../features/welcomeTour/flight'
import { RENEWAL_PARK_ENABLED } from '../park/mapSelection'
import { useJumpmap } from '../features/jumpmap/state'
import { telescopeView } from '../features/telescopeView'
import { interactionAim, setInteractionCamera } from '../features/interactions/interactionAim'
import { useDisplayGame as useGame } from '../game/displayGame'
import { omokCamera, omokSpectatorViewport } from '../game/cameraState'
import { OMOK_BOARD_Y } from '../game/omokPresentation'
import { avatars, sampleAvatar, useSession,estimatedServerTime } from '../network/worldClient'
import {activeParkDebris} from '../features/parkDebris/state'
import { cameraOcclusion, CameraOcclusionFader } from './cameraOcclusion'
import { installRoamingInput, viewControls } from './input'
import { constrainMonumentStairCamera, constrainRoamingCamera } from './cameraCollision'
import { seatScope, seatedLook, resetSeatedLook, useTableLobby, SEATED_LOOK } from '../features/tableLobby/state'
import { useDiceUI, diceCamera, holdBustCamera } from '../game/farkle/controls'
import { DICE_CAMERA, DICE_SPECTATOR_CAMERA, diceFocusActive, diceSpectatorCameraPose } from '../game/farkle/camera'
import { LEDGER_CAMERA, ledgerCameraPose, ledgerFocusActive } from '../game/ledger/camera'
import { HALLI_CAMERA, halliCameraPose, halliPlayerViewActive, halliSpectatorCameraPose, halliSpectatorViewActive } from '../game/halligalli/camera'
import { roamingFirstPerson } from './roamingCamera'
import { rememberRoamingView, restoreRoamingView } from './cameraReturn'
import { inputState } from './inputOwnership'
import { useFacilityState } from '../features/facilities/state'
import { useBenchState } from '../features/interactions/benchState'
import { useFitnessState } from '../features/fitness/state'
import { useTelescopeState } from '../features/telescopes/state'
import { useFeedbackState } from '../features/feedback/state'
import { useNotesState } from '../features/notes/state'
import { benchBoardLook, benchLook, benchTable, benchViewScope, spectatorClearHeight, useBenchSpectator } from '../features/interactions/benchSpectator'
import { advanceOmokCamera, OMOK_FOCUS_LAYER, omokTopDownHeight, omokSpectatorFrame } from './omokCamera'
import { boardFocusLighting } from './boardFocusLighting'
import { wardrobeView } from '../features/wardrobe/view'
import { parkXRView } from './xrView'

/** Whole-figure framing used by the wardrobe zoom (the avatar plus a little headroom). */
const WARDROBE_FRAME = { height: CHARACTER.height * 1.08, minDistance: 1.4, maxDistance: 5 }
const indoorCameraRooms = [['facility-arcade', 5.05, 3.5, 4.1], ['facility-vr', 6.2, 4.3, 4.6]] as const
const turnToward = (from: number, to: number, t: number) => from + (Math.atan2(Math.sin(to - from), Math.cos(to - from))) * t
const sightline = new Raycaster(), sightFrom = new Vector3(), sightTo = new Vector3()
/** Front first, then gradually round the avatar: the first angle whose camera sees feet, waist and head unblocked
 * (a stone table or a tree right in front would otherwise fill the zoomed view). */
function clearWardrobeYaw(scene: Object3D, feet: Vector3, facing: number, camera: (yaw: number, out: Vector3) => Vector3) {
  for (const step of [0, 1, -1, 2, -2, 3, -3, 4]) {
    const yaw = facing + step * Math.PI / 4
    camera(yaw, sightTo)
    const blocked = [0.2, 0.7, 1.2].some(height => {
      sightFrom.set(feet.x, feet.y + height * CHARACTER.height / 1.4, feet.z)
      const length = sightFrom.distanceTo(sightTo)
      sightline.set(sightFrom, sightTo.clone().sub(sightFrom).normalize())
      sightline.far = length
      return sightline.intersectObjects(scene.children, true).some(hit => hit.object.visible && !(hit.object instanceof SkinnedMesh))
    })
    if (!blocked) return yaw
  }
  return facing
}
/** Camera distance at which the whole figure fills the wardrobe stage. */
function wardrobeFrame(camera: PerspectiveCamera) {
  const tan = Math.tan(camera.fov * Math.PI / 360)
  return { tan, close: Math.min(WARDROBE_FRAME.maxDistance, Math.max(WARDROBE_FRAME.minDistance,
    WARDROBE_FRAME.height / (2 * tan * wardrobeView.fill))) }
}

export function CameraRig() {
  const { gl, camera: mountedCamera, raycaster } = useThree()
  const roomNodes = useRef<(Object3D | undefined)[]>([])
  const reducedMotion=useMemo(()=>window.matchMedia('(prefers-reduced-motion: reduce)'),[])
  const state = useMemo(
    () => ({
      focus: new Vector3(),
      desired: new Vector3(),
      look: new Vector3(),
      pose: { x: 0, y: 0, z: 0, yaw: 0 },
      owner: '',
      bench: '',
      savedView: { ...viewControls },
      telescope: '',
      savedTelescopeView: { ...viewControls },
      savedFov: CAMERA.fov as number,
      direction: new Vector3(),
      seatScope: '',
      bungeoppangFov: null as number | null,
      rotation: new Quaternion(), targetRotation: new Quaternion(),
      targetUp: new Vector3(0, 1, 0), lookMatrix: new Matrix4(), omokTransition: false, diceTransition: false, alkkagiTransition: false,
      center: new Vector3(), pan: new Vector3(), feet: new Vector3(),
      jumpOrbitRun: '', jumpOrbitDirection: new Vector3(),
      sleighCamera: new SleighCamera(),
    }),
    [],
  )
  const occlusion = useMemo(() => new CameraOcclusionFader(), []),
    scan = useRef(1),
    // The angles the wardrobe's easing last wrote, how long it has eased toward the current aim, and that aim: kept per
    // mounted rig (module variables would carry a remounted rig the last one's values, review).
    aimTrack = useRef<{ written: { yaw: number; pitch: number } | null; age: number; seen: { yaw: number; pitch: number } | null }>(
      { written: null, age: 0, seen: null })
  useEffect(() => installRoamingInput(gl.domElement), [gl])
  useEffect(
    () => () => {
      if (cameraOcclusion.scenery === occlusion) cameraOcclusion.scenery = null
      occlusion.dispose()
      interactionAim.ready = false
      setInteractionCamera(null)
      if (state.bench) Object.assign(viewControls, state.savedView)
      if (state.telescope) {
        Object.assign(viewControls, state.savedTelescopeView)
        if (mountedCamera instanceof PerspectiveCamera) {
          mountedCamera.fov = state.savedFov
          mountedCamera.updateProjectionMatrix()
        }
      }
      omokCamera.ready = false
      omokCamera.anchorId = ''
      boardFocusLighting.requested = false
      mountedCamera.layers.set(0)
      delete mountedCamera.userData.showConstellationLines
      raycaster.layers.set(0)
      resetSeatedLook()
      if (state.bungeoppangFov !== null && mountedCamera instanceof PerspectiveCamera) {
        mountedCamera.fov = state.bungeoppangFov; mountedCamera.updateProjectionMatrix()
      }
    },
    [occlusion, state, mountedCamera, raycaster],
  )
  useFrame(({ camera, scene }, delta) => {
    const priorJumpOrbitRun = state.jumpOrbitRun
    state.jumpOrbitRun = ''
    camera.userData.showConstellationLines = false
    diceCamera.ready = false
    omokCamera.ready = false
    boardFocusLighting.requested = false
    camera.layers.set(0)
    raycaster.layers.set(0)
    if (parkXRView.ownsInput) {
      interactionAim.ready = false
      cameraOcclusion.strength.value = 0
      occlusion.reset()
      return
    }
    const sleigh = sleighRider(useSession.getState().sessionId)
    if (sleigh) {
      interactionAim.ready = false
      cameraOcclusion.strength.value = 0
      occlusion.reset()
      state.sleighCamera.follow(camera, sleigh, delta)
      return
    }
    if (state.sleighCamera.leave(camera)) state.owner = ''
    const balloonRider = localBalloonRider(useSession.getState().sessionId)
    if (balloonRider) {
      interactionAim.ready = false
      cameraOcclusion.strength.value = 0
      occlusion.reset()
      const { walkingInside, cabinFirstPerson, flight } = useLocalBalloon.getState()
      if (flight && balloonCanLook(flight.phase)) {
        if (walkingInside && cabinFirstPerson && flight.phase === 'flying') {
          const { yaw, pitch } = cabinCamera
          const eye = balloonRider.y + (balloonRider.seatIndex >= 0 ? .95 : CABIN_STANDING_EYE_OFFSET)
          camera.position.set(balloonRider.x, eye, balloonRider.z)
          const lookPitch = pitch - .57
          camera.lookAt(balloonRider.x - Math.sin(yaw) * Math.cos(lookPitch), eye - Math.sin(lookPitch),
            balloonRider.z - Math.cos(yaw) * Math.cos(lookPitch))
          return
        }
        setBalloonOrbit(flight.position, camera.position, state.look, !walkingInside)
        camera.lookAt(state.look)
        return
      }
      camera.position.set(balloonRider.x + 6, balloonRider.y + 5, balloonRider.z + 9)
      camera.lookAt(balloonRider.x, balloonRider.y + .6, balloonRider.z - 4)
      return
    }
    scan.current += delta
    wardrobeView.blend += (Number(wardrobeView.active) - wardrobeView.blend) * (1 - Math.exp(-5 * Math.min(delta, 0.1)))
    if (Math.abs(Number(wardrobeView.active) - wardrobeView.blend) < 0.001) wardrobeView.blend = Number(wardrobeView.active)
    if (scan.current >= 0.5) {
      const park = scene.getObjectByName(RENEWAL_PARK_ENABLED ? 'detail-220-buildings' : 'placeholder-park')
      if (park) {
        occlusion.refresh(park)
        cameraOcclusion.scenery = occlusion
      }
      if (RENEWAL_PARK_ENABLED) roomNodes.current = indoorCameraRooms.map(([name]) => scene.getObjectByName(name))
      scan.current = 0
    }
    const session = useSession.getState(),
      avatar = avatars.get(session.sessionId)
    const facilities = useFacilityState.getState()
    const temporaryView = !!(avatar?.tableId || avatar?.benchId || avatar?.fitnessId || avatar?.telescopeId
      || session.tableId || session.focusedAnchorId || useTableLobby.getState().joiningAnchorId || useGame.getState().watchedGameId || bungeoppangView.active
      || useFeedbackState.getState().open || useNotesState.getState().open)
    if (temporaryView) rememberRoamingView(session.sessionId, session.roomId)
    restoreRoamingView(session.sessionId, session.roomId, temporaryView || inputState.minigameOpen || session.status !== 'connected'
      || facilities.pending || facilities.awaitingWorld || facilities.uncertain
      || useBenchState.getState().pending || useFitnessState.getState().pending || useTelescopeState.getState().pending)
    const telescope = session.status === 'connected' && session.mapCompatible
      ? TELESCOPES.find(t => t.id === session.telescopeId) : undefined
    if (telescope && !state.telescope) {
      state.telescope = telescope.id
      state.savedTelescopeView = { ...viewControls }
      if (camera instanceof PerspectiveCamera) state.savedFov = camera.fov
    } else if (!telescope && state.telescope) {
      Object.assign(viewControls, state.savedTelescopeView)
      if (camera instanceof PerspectiveCamera) {
        camera.fov = state.savedFov
        camera.updateProjectionMatrix()
      }
      state.telescope = ''
      state.owner = ''
      state.omokTransition = false
      state.diceTransition = false
      state.alkkagiTransition = false
    }
    if (!avatar) {
      interactionAim.ready = false
      if (state.bench) { Object.assign(viewControls, state.savedView); state.bench = '' }
      omokCamera.ready = false
      omokCamera.anchorId = ''
      camera.position.set(110, 115, 138)
      camera.lookAt(0, 4, 0)
      state.owner = ''
      state.omokTransition = false
      state.diceTransition = false
      state.alkkagiTransition = false
      return
    }
    if (welcomeFlight.active) {
      // The flight ends exactly on the ordinary third-person pose, so the follow camera takes over without a jump.
      sampleAvatar(avatar, performance.now(), state.pose)
      state.look.set(state.pose.x, state.pose.y + CAMERA.focusHeight - 0.8, state.pose.z)
      const horizontal = viewControls.distance * Math.cos(viewControls.pitch)
      state.desired.set(state.look.x + Math.sin(viewControls.yaw) * horizontal,
        state.look.y + viewControls.distance * Math.sin(viewControls.pitch), state.look.z + Math.cos(viewControls.yaw) * horizontal)
      const progress = (performance.now() - welcomeFlight.startedAt) / WELCOME_FLIGHT_MS
      const flight = welcomeFlightPose(progress, { position: state.desired, look: state.look }, PARK_SIZE)
      // Descending towards the avatar, fade roofs and trees in between like the ordinary follow camera does.
      const approach = progress > 0.6
      camera.position.set(flight.position.x, flight.position.y, flight.position.z)
      constrainRoamingCamera(camera.position)
      camera.lookAt(flight.look.x, flight.look.y, flight.look.z)
      if (camera instanceof PerspectiveCamera && Math.abs(camera.fov - CAMERA.fov) > 0.01) { camera.fov = CAMERA.fov; camera.updateProjectionMatrix() }
      state.focus.copy(state.look)
      state.owner = session.sessionId
      state.omokTransition = false
      state.diceTransition = false
      interactionAim.ready = omokCamera.ready = false
      omokCamera.anchorId = ''
      cameraOcclusion.focus.value.copy(state.look)
      cameraOcclusion.strength.value = approach ? 1 : 0
      occlusion.update(camera.position, state.look, approach, delta)
      return
    }
    if (bungeoppangView.active) {
      state.omokTransition = false
      state.diceTransition = false
      state.alkkagiTransition = false
      if (camera instanceof PerspectiveCamera) {
        state.bungeoppangFov ??= camera.fov
        // Keep all three mould columns in view on narrow screens too.
        const fov = 2 * Math.atan(Math.tan(bungeoppangView.fov * Math.PI / 360)
          * Math.max(1, 1.4 / camera.aspect)) * 180 / Math.PI
        camera.fov += (fov - camera.fov) * (1 - Math.exp(-6 * delta))
        camera.updateProjectionMatrix()
      }
      state.desired.set(...bungeoppangView.position)
      state.look.set(...bungeoppangView.target)
      state.rotation.copy(camera.quaternion)
      camera.lookAt(state.look); state.targetRotation.copy(camera.quaternion)
      camera.quaternion.slerpQuaternions(state.rotation, state.targetRotation, 1 - Math.exp(-6 * delta))
      camera.position.lerp(state.desired, 1 - Math.exp(-6 * delta))
      state.focus.set(avatar.current.x, avatar.current.y + CAMERA.focusHeight - .8, avatar.current.z)
      interactionAim.ready = omokCamera.ready = false
      omokCamera.anchorId = ''
      cameraOcclusion.strength.value = 0
      occlusion.update(camera.position, state.look, false, delta)
      return
    }
    if (state.bungeoppangFov !== null && camera instanceof PerspectiveCamera) {
      camera.fov += (state.bungeoppangFov - camera.fov) * (1 - Math.exp(-24 * delta))
      if (performance.now() >= bungeoppangView.returningUntil) {
        camera.fov = state.bungeoppangFov; state.bungeoppangFov = null
      }
      camera.updateProjectionMatrix()
    }
    sampleAvatar(avatar, performance.now(), state.pose)
    if (telescope) {
      camera.userData.showConstellationLines = true
      state.omokTransition = false
      state.diceTransition = false
      state.alkkagiTransition = false
      const { yaw, pitch } = telescopeView
      camera.position.set(telescope.position[0], telescope.position[1] + TELESCOPE.eyeHeight + (RENEWAL_PARK_ENABLED ? .44 : 0), telescope.position[2])
      state.look.set(camera.position.x + Math.sin(yaw) * Math.cos(pitch), camera.position.y + Math.sin(pitch),
        camera.position.z + Math.cos(yaw) * Math.cos(pitch))
      camera.lookAt(state.look)
      if (camera instanceof PerspectiveCamera) {
        const fov = telescopeFov(state.savedFov, telescopeView.zoom)
        if (Math.abs(camera.fov - fov) > 0.001) { camera.fov = fov; camera.updateProjectionMatrix() }
      }
      state.focus.set(state.pose.x, state.pose.y + CAMERA.focusHeight - 0.8, state.pose.z)
      interactionAim.ready = omokCamera.ready = false
      omokCamera.anchorId = ''
      cameraOcclusion.strength.value = 0
      occlusion.update(camera.position, state.focus, false, delta)
      return
    }
    const pose = state.pose,
      seated = !!(avatar.tableId || avatar.benchId) && avatar.seatIndex >= 0
    const benchScope = benchViewScope(session), benchAnchor = benchTable(avatar.benchId)
    if (avatar.benchId && state.bench !== benchScope) {
      if (!state.bench) state.savedView = { ...viewControls }
      if (benchAnchor) Object.assign(viewControls, benchBoardLook(avatar.current,
        [benchAnchor.position[0], benchAnchor.position[1] + GOMOKU.boardY, benchAnchor.position[2]]))
      else { viewControls.yaw = avatar.current.yaw + Math.PI; viewControls.pitch = 0 }
      state.bench = benchScope
    } else if (!avatar.benchId && state.bench) {
      Object.assign(viewControls, state.savedView)
      state.bench = ''
    }
    const gameSession = useGame.getState(), game = gameSession.game
    const scope = seatScope(session)
    if (state.seatScope !== scope) { resetSeatedLook(); state.seatScope = scope }
    const looking = !!scope && useTableLobby.getState().lookScope === scope
    const watchedAnchor = game?.role === 'SPECTATOR' && session.watchedTableId
      ? TABLES.find(t => t.id === session.bindings.find(b => b.channelId === session.roomId && b.tableId === session.watchedTableId)?.anchorId) : undefined
    const benchView = useBenchSpectator.getState()
    const closeView = game?.role === 'SPECTATOR' ? useTableLobby.getState().spectatorView === 'board' ? 'board' : 'participants' : benchView.view
    const closeAnchor = benchView.scope === benchScope && benchView.view !== 'seated' ? benchAnchor : undefined
    const spectatorBoard = closeAnchor ? closeView === 'board' : !!watchedAnchor && useTableLobby.getState().spectatorView === 'board'
    const diceSpectator = spectatorBoard && game?.role === 'SPECTATOR' && !!game.dice
    const firstPerson = roamingFirstPerson(avatar, !!useGame.getState().watchedGameId)
    const boardFocus = seated && !!avatar.tableId && game?.role === 'PLAYER'
      && game.omok?.status === 'PLAYING' && !gameSession.lastResult
    const ownOmok = seated && !!avatar.tableId && (session.tableStates[session.tableId]?.gameCode === 'OMOK'
      || game?.role === 'PLAYER' && !!game.omok)
    const gathering = !gameSession.localPractice && !TABLET_ENABLED && gatheringCameraActive()
    const spectatorOmok = spectatorBoard && game?.role === 'SPECTATOR' && game.omok?.status === 'PLAYING'
    const focusedOmok = boardFocus && ownOmok && !gathering || spectatorOmok
    const alkkagiCamera = !!game && alkkagiCameraActive(game.alkkagi?.status, !!gameSession.lastResult)
      && ((seated && !!avatar.tableId && game.role === 'PLAYER') || (game.role === 'SPECTATOR' && !!(closeAnchor || watchedAnchor)))
    const ownAlkkagi = seated && !!avatar.tableId && (session.tableStates[session.tableId]?.gameCode === 'ALKKAGI'
      || game?.role === 'PLAYER' && !!game.alkkagi)
    const focusedAlkkagi = alkkagiCamera && (game?.role === 'PLAYER' ? !looking : spectatorBoard)
    boardFocusLighting.requested = focusedOmok || focusedAlkkagi
    if (focusedOmok || focusedAlkkagi) {
      camera.layers.set(OMOK_FOCUS_LAYER)
      raycaster.layers.set(OMOK_FOCUS_LAYER)
    }
    state.targetUp.set(0, 1, 0)
    if (diceSpectator) state.targetUp.set(0, 0, -1)
    const ownDice = seated && !!avatar.tableId && game?.role === 'PLAYER' && !!game.dice
    const diceFocus = seated && !!avatar.tableId && diceFocusActive(game, session.sessionId,
      useDiceUI.getState().boardView || holdBustCamera(game?.gameId, session.sessionId))
    const ledgerFocus = seated && !!avatar.tableId && (ledgerFocusActive(game, session.sessionId, looking) || !looking && game?.role === 'PLAYER' && !!game.rummikub)
    state.look.set(pose.x, pose.y + CAMERA.focusHeight - 0.8, pose.z)
    if (state.owner !== session.sessionId) {
      state.focus.copy(state.look)
      state.owner = session.sessionId
    }
    state.focus.lerp(
      state.look,
      1 - Math.exp(-CAMERA.followSpeed * Math.min(delta, 0.1)),
    )
    const tablet = tabletLobbyActive()
    const debris = reducedMotion.matches?null:activeParkDebris(session.tableId||session.watchedTableId,estimatedServerTime())
    const debrisAnchor=debris?TABLES.find(t=>t.id===debris.anchorId):undefined
    if(debris&&debrisAnchor){
      // World defeat effects take priority over a retained Alkkagi result board.
      camera.layers.set(0)
      raycaster.layers.set(0)
      const scale=tableScale(debrisAnchor),yaw=debris.throwYaw+Math.PI*.7
      state.look.set(debrisAnchor.position[0],debrisAnchor.position[1]+.85*scale,debrisAnchor.position[2])
      state.desired.set(debrisAnchor.position[0]+Math.sin(yaw)*6.5*scale,debrisAnchor.position[1]+3.6*scale,debrisAnchor.position[2]+Math.cos(yaw)*6.5*scale)
    } else if (tablet) {
      const anchor = renderedTableAnchors.get(avatar.tableId) ?? TABLES.find(t => t.id === avatar.tableId)
      if (anchor) {
        const seat = tableSeats(anchor, session.seatIndex + 1)[session.seatIndex] ?? tableSeats(anchor)[0]!
        const yaw = Math.atan2(seat.x, seat.z), scale = tableScale(anchor)
        const aspect = camera instanceof PerspectiveCamera ? camera.aspect : 1.6
        const distance = 1.65 * scale * Math.max(1, 1.6 / aspect)
        const centerY = anchor.position[1] + (anchor.boardOffsetY ?? 0) + 1.06 + (TABLET.y - 1.06) * scale
        state.look.set(anchor.position[0], centerY, anchor.position[2])
        state.desired.set(anchor.position[0] + Math.sin(yaw) * distance,
          centerY + .19 * scale, anchor.position[2] + Math.cos(yaw) * distance)
      }
    } else if (gathering) {
      const anchor = TABLES.find(t => t.id === avatar.tableId)
      if (anchor) {
        const seat = tableSeats(anchor, session.seatIndex + 1)[session.seatIndex] ?? tableSeats(anchor)[0]!
        const yaw = Math.atan2(seat.x, seat.z) + Math.PI / 4
        const radius = 2.7 + Math.hypot(seat.x, seat.z)
        state.look.set(anchor.position[0], anchor.position[1] + 1.35, anchor.position[2])
        state.desired.set(anchor.position[0] + Math.sin(yaw) * radius,
          Math.min(anchor.position[1] + 2.8, spectatorClearHeight(anchor.pavilionId)), anchor.position[2] + Math.cos(yaw) * radius)
      }
    } else if (focusedAlkkagi) {
      const anchor = game?.role === 'PLAYER' ? TABLES.find(t => t.id === avatar.tableId)! : (closeAnchor ?? watchedAnchor)!
      if (anchor) {
        state.look.set(anchor.position[0], anchor.position[1] + 1.14, anchor.position[2])
        const frame = alkkagiTopDownFrame(gl.domElement.clientWidth, gl.domElement.clientHeight, tableScale(anchor))
        const up = game?.role === 'SPECTATOR' || session.seatIndex === 0 ? -1 : 1
        state.look.z += up * frame.offset
        state.desired.copy(state.look)
        state.desired.y += frame.height
        state.targetUp.set(0, 0, up)
      }
    } else if (seated && avatar.tableId && oneCardPlayerViewActive(game)) {
      const anchor = TABLES.find(t => t.id === avatar.tableId)
      if (anchor) {
        const pose = oneCardCameraPose(anchor, session.seatIndex)
        state.desired.set(...pose.position)
        state.look.set(...pose.target)
      }
    } else if (game?.role === 'SPECTATOR' && game.onecard && (closeAnchor || watchedAnchor)) {
      const anchor = (closeAnchor ?? watchedAnchor)!
      const seats = tableSeats(anchor), turnSeat = seats[avatars.get(game.onecard.turnUserId ?? '')?.seatIndex ?? 0] ?? seats[0]!
      const yaw = Math.atan2(-turnSeat.x, -turnSeat.z) + .35 + benchLook.yaw - Math.PI / 4
      const pose = oneCardSpectatorCameraPose(anchor, yaw, camera instanceof PerspectiveCamera ? camera.aspect : 1.6, spectatorClearHeight(anchor.pavilionId))
      state.desired.set(...pose.position); state.look.set(...pose.target)
    } else if (halliPlayerViewActive(game, seated && !!avatar.tableId, looking)) {
      const anchor = TABLES.find(t => t.id === avatar.tableId)
      if (anchor) {
        const pose = halliCameraPose(anchor, session.seatIndex, camera instanceof PerspectiveCamera ? camera.aspect : 1.6)
        state.desired.set(...pose.position); state.look.set(...pose.target)
      }
    } else if (halliSpectatorViewActive(game, !!(closeAnchor || watchedAnchor))) {
      const anchor = (closeAnchor ?? watchedAnchor)!
      const pose = halliSpectatorCameraPose(anchor, avatars.get(game!.halli!.players[0]?.userId ?? '')?.seatIndex ?? 0, benchLook.yaw,
        camera instanceof PerspectiveCamera ? camera.aspect : 1.6, spectatorClearHeight(anchor.pavilionId))
      state.desired.set(...pose.position); state.look.set(...pose.target)
    } else if (focusedOmok && camera instanceof PerspectiveCamera) {
      const anchor = spectatorOmok ? (closeAnchor ?? watchedAnchor)! : TABLES.find(t => t.id === avatar.tableId)!
      state.look.set(anchor.position[0], anchor.position[1] + (anchor.boardOffsetY ?? 0) + OMOK_BOARD_Y + .017, anchor.position[2])
      if (omokSpectatorViewport.gameId === game?.gameId) {
        const frame = omokSpectatorFrame(gl.domElement.clientWidth, gl.domElement.clientHeight, tableScale(anchor), omokSpectatorViewport.insets)
        const orientation = !spectatorOmok && avatar.seatIndex === 1 ? -1 : 1
        state.look.x += frame.offsetX * orientation; state.look.z += frame.offsetZ * orientation
        state.desired.copy(state.look); state.desired.y += frame.height
      } else {
        state.desired.copy(state.look)
        state.desired.y += omokTopDownHeight(camera.aspect, tableScale(anchor), gl.domElement.clientHeight)
      }
      state.targetUp.set(0, 0, spectatorOmok || avatar.seatIndex === 0 ? -1 : 1)
    } else if (diceFocus) {
      const anchor = TABLES.find(t => t.id === avatar.tableId)!
      const seat = tableSeats(anchor, session.seatIndex + 1)[session.seatIndex] ?? tableSeats(anchor)[0]!
      const scale = tableScale(anchor)
      state.look.set(anchor.position[0], anchor.position[1] + GOMOKU.boardY + .017, anchor.position[2])
      state.desired.set(anchor.position[0], anchor.position[1] + DICE_CAMERA.tableHeight + DICE_CAMERA.height * scale,
        anchor.position[2] + Math.sign(seat.z) * DICE_CAMERA.seatOffset * scale)
    } else if (ledgerFocus) {
      const anchor = TABLES.find(t => t.id === avatar.tableId)!
      const seat = tableSeats(anchor, session.seatIndex + 1)[session.seatIndex] ?? tableSeats(anchor)[0]!
      const scale = tableScale(anchor), pose = ledgerCameraPose(anchor.position, seat.x * scale, seat.z * scale, scale)
      state.desired.set(...pose.position)
      state.look.set(...pose.target)
    } else if (diceSpectator) {
      const anchor = (closeAnchor ?? watchedAnchor)!
      const frame = diceSpectatorCameraPose(anchor.position, tableScale(anchor), gl.domElement.clientWidth, gl.domElement.clientHeight)
      state.look.set(...frame.target); state.desired.set(...frame.position)
      state.desired.y = Math.min(state.desired.y, spectatorClearHeight(anchor.pavilionId))
    } else if (boardFocus || spectatorBoard) {
      const anchor = closeAnchor ?? watchedAnchor ?? TABLES.find((t) => t.id === avatar.tableId)!
      state.look.set(
        // 주사위 장부 관전은 오른쪽 2D 장부에 판이 가리지 않도록 화면 왼쪽에 둔다.
        anchor.position[0] + (spectatorBoard && (game?.ledger || game?.rummikub) ? LEDGER_CAMERA.panOffset * tableScale(anchor) : 0),
        anchor.position[1] + GOMOKU.boardY,
        anchor.position[2],
      )
      state.desired.set(
        state.look.x,
        Math.min(state.look.y + (spectatorBoard && (game?.ledger || game?.rummikub) ? 3.2 : 2.6) * tableScale(anchor), spectatorClearHeight(anchor.pavilionId)),
        state.look.z + 0.001,
      )
    } else if (closeAnchor) {
      const radius = 2.75 + Math.max(...tableSeats(closeAnchor).map(s => Math.hypot(s.x, s.z)))
      state.look.set(closeAnchor.position[0], closeAnchor.position[1] + 1.2, closeAnchor.position[2])
      state.desired.set(state.look.x + Math.sin(benchLook.yaw) * radius,
        Math.min(closeAnchor.position[1] + 3.1, spectatorClearHeight(closeAnchor.pavilionId)),
        state.look.z + Math.cos(benchLook.yaw) * radius)
    } else if (watchedAnchor) {
      state.look.set(watchedAnchor.position[0], watchedAnchor.position[1] + 1, watchedAnchor.position[2])
      state.desired.set(state.look.x + 4 * tableScale(watchedAnchor), state.look.y + 3 * tableScale(watchedAnchor), state.look.z + 4 * tableScale(watchedAnchor))
    } else if (avatar.benchId) {
      state.desired.set(pose.x, pose.y - 0.8 + CHARACTER.height - 0.2
        + CHARACTER.seatedHipHeight - CHARACTER.hipHeight, pose.z)
      state.look.set(
        state.desired.x - Math.sin(viewControls.yaw) * Math.cos(viewControls.pitch),
        state.desired.y - Math.sin(viewControls.pitch),
        state.desired.z - Math.cos(viewControls.yaw) * Math.cos(viewControls.pitch),
      )
    } else if (seated) {
      const anchor = TABLES.find((t) => t.id === avatar.tableId)
      const seat = anchor ? tableSeats(anchor, session.seatIndex + 1)[session.seatIndex] : undefined
      state.desired.set(anchor && seat ? anchor.position[0] + seat.x : pose.x,
        anchor ? anchor.position[1] + SEATED_LOOK.eyeHeight : pose.y + 0.55,
        anchor && seat ? anchor.position[2] + seat.z : pose.z)
      state.look.set(
        anchor?.position[0] ?? pose.x,
        anchor ? anchor.position[1] + SEATED_LOOK.targetHeight : pose.y + 1.05,
        anchor?.position[2] ?? pose.z - 1,
      )
      if (looking) {
        const yaw = Math.atan2(state.look.x - state.desired.x, state.look.z - state.desired.z) + seatedLook.yaw
        state.look.set(state.desired.x + Math.sin(yaw) * 4, state.look.y, state.desired.z + Math.cos(yaw) * 4)
      }
    } else if (firstPerson) {
      // Use the replicated capsule position without orbit lag or head bob.
      state.desired.set(pose.x, pose.y - 0.8 + CHARACTER.height - 0.2, pose.z)
      state.look.set(
        state.desired.x - Math.sin(viewControls.yaw) * Math.cos(viewControls.pitch),
        state.desired.y - Math.sin(viewControls.pitch),
        state.desired.z - Math.cos(viewControls.yaw) * Math.cos(viewControls.pitch),
      )
    } else {
      if (wardrobeView.chooseClearView && wardrobeView.active && camera instanceof PerspectiveCamera) {
        wardrobeView.chooseClearView = false
        wardrobeView.aim ??= { yaw: viewControls.yaw, pitch: viewControls.pitch }
        const { tan, close } = wardrobeFrame(camera), pitch = wardrobeView.aim.pitch
        const feet = state.feet.set(pose.x, pose.y - 0.8, pose.z)
        const side = -wardrobeView.x * close * tan * camera.aspect, lift = -wardrobeView.y * close * tan
        wardrobeView.aim.yaw = clearWardrobeYaw(scene, feet, wardrobeView.aim.yaw, (yaw, out) => out.set(
          feet.x + Math.cos(yaw) * side + Math.sin(yaw) * Math.cos(pitch) * close,
          feet.y + CHARACTER.height / 2 + lift + Math.sin(pitch) * close,
          feet.z - Math.sin(yaw) * side + Math.cos(yaw) * Math.cos(pitch) * close))
      }
      const aim = wardrobeView.aim
      // The view eases to the wardrobe's front on open and back to where it was on close, but gives way at once to
      // the player turning it (the angles differ from what this wrote last frame) and after 1.5 s at most: held
      // until it converged, the camera pulled back against every drag, even one started right after opening.
      const track = aimTrack.current, written = track.written
      const turned = !!written
        && (Math.abs(viewControls.yaw - written.yaw) > 1e-5 || Math.abs(viewControls.pitch - written.pitch) > 1e-5)
      if (aim !== track.seen) { track.seen = aim; track.age = 0; if (aim) track.written = null }
      track.age = aim ? track.age + delta : 0
      if (aim && (turned || track.age > 1.5)) wardrobeView.aim = null
      if (wardrobeView.aim) {
        const t = 1 - Math.exp(-6 * Math.min(delta, 0.1))
        viewControls.yaw = turnToward(viewControls.yaw, wardrobeView.aim.yaw, t)
        viewControls.pitch += (wardrobeView.aim.pitch - viewControls.pitch) * t
        track.written = { yaw: viewControls.yaw, pitch: viewControls.pitch }
        if (Math.abs(Math.sin(wardrobeView.aim.yaw - viewControls.yaw)) < 0.002 && Math.abs(wardrobeView.aim.pitch - viewControls.pitch) < 0.002) wardrobeView.aim = null
      }
      if (!wardrobeView.aim) track.written = null
      const center = state.center.copy(state.focus)
      let distance = viewControls.distance
      const w = wardrobeView.blend
      if (w > 0 && camera instanceof PerspectiveCamera) {
        // Zoom until the whole figure fills the stage, then slide it beside the wardrobe panel.
        const { tan, close } = wardrobeFrame(camera)
        distance += (close - distance) * w
        center.y += (pose.y - 0.8 + CHARACTER.height / 2 - center.y) * w
        const halfHeight = distance * tan, halfWidth = halfHeight * camera.aspect
        state.pan.set(Math.cos(viewControls.yaw), 0, -Math.sin(viewControls.yaw)).multiplyScalar(-wardrobeView.x * halfWidth * w)
        state.pan.y = -wardrobeView.y * halfHeight * w
        center.add(state.pan)
      }
      const cosPitch = Math.cos(viewControls.pitch)
      const orbitX = Math.sin(viewControls.yaw) * cosPitch
      const orbitY = Math.sin(viewControls.pitch)
      const orbitZ = Math.cos(viewControls.yaw) * cosPitch
      const jumpmap = useJumpmap.getState()
      const runId = jumpmap.owner === session.sessionId ? jumpmap.run?.runId : undefined
      if (runId && !w && !wardrobeView.active && !temporaryView && performance.now() >= bungeoppangView.returningUntil) {
        const previous = state.jumpOrbitDirection
        if (priorJumpOrbitRun === runId) {
          // Apply the turn immediately. The remaining interpolation still
          // smooths the follow position and zoom, including platform motion.
          camera.position.x += (orbitX - previous.x) * distance
          camera.position.y += (orbitY - previous.y) * distance
          camera.position.z += (orbitZ - previous.z) * distance
        }
        state.jumpOrbitRun = runId
        previous.set(orbitX, orbitY, orbitZ)
      }
      state.desired.set(
        center.x + orbitX * distance,
        center.y + orbitY * distance,
        center.z + orbitZ * distance,
      )
      const orbitHeight = state.desired.y
      state.desired.y = Math.max(
        state.desired.y,
        groundHeight(state.desired.x, state.desired.z) + 0.3,
      )
      if (RENEWAL_PARK_ENABLED && !wardrobeView.active) {
        for (const [index, [, halfWidth, halfDepth, height]] of indoorCameraRooms.entries()) {
          const room = roomNodes.current[index]
          if (!room) continue
          const building = room.position, base = building.y
          const cos = Math.cos(room.rotation.y), sin = Math.sin(room.rotation.y)
          const dx = pose.x - building.x, dz = pose.z - building.z
          if (pose.y < base || pose.y > base + height || Math.abs(dx * cos - dz * sin) >= halfWidth
            || Math.abs(dx * sin + dz * cos) >= halfDepth) continue
          const camX = state.desired.x - building.x, camZ = state.desired.z - building.z
          const x = Math.max(-halfWidth + .34, Math.min(halfWidth - .34, camX * cos - camZ * sin))
          const z = Math.max(-halfDepth + .34, Math.min(halfDepth - .34, camX * sin + camZ * cos))
          state.desired.set(building.x + x * cos + z * sin, Math.min(state.desired.y, base + height - .4), building.z - x * sin + z * cos)
          if (state.desired.distanceToSquared(center) < .55 ** 2) state.desired.y = center.y + .7
          break
        }
      }
      state.look.copy(center)
      if (RENEWAL_PARK_ENABLED) constrainMonumentStairCamera(state.desired, state.look)
      // Keep the requested upward angle when the ground prevents the orbit from lowering.
      if (orbitY < 0 && !wardrobeView.active) state.look.y += Math.max(0, state.desired.y - orbitHeight)
    }
    const targetFov = debrisAnchor ? 55 : tablet ? 43 : focusedAlkkagi ? ALKKAGI_FOV : gathering ? ownOmok ? 60 : CAMERA.fov : seated && oneCardPlayerViewActive(game) ? ONECARD_CAMERA.fov : diceFocus ? DICE_CAMERA.fov : ledgerFocus ? LEDGER_CAMERA.fov : diceSpectator ? DICE_SPECTATOR_CAMERA.fov : boardFocus || spectatorBoard ? GOMOKU.topDownFov : seated ? GOMOKU.seatedFov : CAMERA.fov
    const smoothingOmok = focusedOmok || ownOmok || state.omokTransition
    const smoothingDice = ownDice || state.diceTransition
    // A defeat shot is an intermediate camera goal, not the end of the return transition.
    const holdAlkkagi = ownAlkkagi || alkkagiCamera || !!debrisAnchor && debris?.gameCode === 'ALKKAGI'
    const smoothingAlkkagi = holdAlkkagi || state.alkkagiTransition
    const smoothingBoard = smoothingOmok || smoothingDice || smoothingAlkkagi || diceSpectator
    let omokSettled = false
    if (smoothingBoard) {
      // A stable up vector preserves each seat's orientation at exactly 90 degrees.
      state.lookMatrix.lookAt(state.desired, state.look, state.targetUp)
      state.targetRotation.setFromRotationMatrix(state.lookMatrix)
      omokSettled = advanceOmokCamera(camera, state.desired, state.targetRotation, targetFov, delta)
      if (smoothingOmok) state.omokTransition = focusedOmok || ownOmok || !omokSettled
      if (smoothingDice) state.diceTransition = ownDice || !omokSettled
      if (smoothingAlkkagi) state.alkkagiTransition = holdAlkkagi || !omokSettled
    } else {
      if (firstPerson && performance.now() >= bungeoppangView.returningUntil) camera.position.copy(state.desired)
      else camera.position.lerp(state.desired, 1 - Math.exp(-(performance.now() < bungeoppangView.returningUntil ? 24 : 12) * Math.min(delta, 0.1)))
    }
    if (!firstPerson && !seated && !watchedAnchor) constrainRoamingCamera(camera.position)
    // Position smoothing can cross a stair edge even when the desired orbit is clear.
    if (RENEWAL_PARK_ENABLED && !firstPerson && !temporaryView && !watchedAnchor && !smoothingBoard)
      constrainMonumentStairCamera(camera.position, state.look)
    if (!smoothingBoard) {
      if (performance.now() < bungeoppangView.returningUntil) {
        state.rotation.copy(camera.quaternion)
        camera.lookAt(state.look); state.targetRotation.copy(camera.quaternion)
        camera.quaternion.slerpQuaternions(state.rotation, state.targetRotation, 1 - Math.exp(-24 * delta))
      } else camera.lookAt(state.look)
    }
    diceCamera.ready = diceFocus || diceSpectator ? omokSettled : !!(spectatorBoard && game?.dice) && camera.position.distanceTo(state.desired) < .005
    state.sleighCamera.returnToPark(camera, state.desired, state.look, delta)
    camera.getWorldDirection(state.direction)
    setInteractionCamera(camera)
    interactionAim.ready = true
    interactionAim.x = camera.position.x
    interactionAim.y = camera.position.y
    interactionAim.z = camera.position.z
    interactionAim.dx = state.direction.x
    interactionAim.dy = state.direction.y
    interactionAim.dz = state.direction.z
    omokCamera.anchorId = boardFocus ? avatar.tableId : spectatorBoard ? (closeAnchor ?? watchedAnchor)!.id : ''
    omokCamera.ready =
      focusedOmok ? omokSettled : !!(boardFocus || spectatorBoard) && camera.position.distanceTo(state.desired) < 0.005
    if (!smoothingBoard && camera instanceof PerspectiveCamera && state.bungeoppangFov === null) {
      const halliView = !debrisAnchor && !tablet && !gathering && (halliPlayerViewActive(game, seated && !!avatar.tableId, looking)
        || halliSpectatorViewActive(game, !!(closeAnchor || watchedAnchor)))
      const fov = halliView ? HALLI_CAMERA.fov : targetFov
      if (Math.abs(camera.fov - fov) > 0.01) {
        camera.fov = fov
        camera.updateProjectionMatrix()
      }
    }
    cameraOcclusion.focus.value.set(pose.x, pose.y + CAMERA.focusHeight - 0.8, pose.z)
    cameraOcclusion.strength.value = seated || firstPerson ? 0 : 1
    occlusion.update(camera.position, state.focus, !seated && !firstPerson, delta)
  })
  return null
}
