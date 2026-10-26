import { gatheringCameraActive } from '../features/tableLobby/gathering'
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Matrix4, PerspectiveCamera, Quaternion, Vector3 } from 'three'
import { bungeoppangView } from '../features/bungeoppang/bungeoppangView'
import { CAMERA, CHARACTER, GOMOKU, TABLES, TELESCOPE, TELESCOPES, telescopeFov, groundHeight, tableScale, tableSeats } from '../park/mapConfig'
import { telescopeView } from '../features/telescopeView'
import { interactionAim } from '../features/interactions/interactionAim'
import { useGame } from '../game/store'
import { omokCamera } from '../game/cameraState'
import { avatars, sampleAvatar, useSession } from '../network/worldClient'
import { cameraOcclusion, CameraOcclusionFader } from './cameraOcclusion'
import { installRoamingInput, viewControls } from './input'
import { constrainRoamingCamera } from './cameraCollision'
import { seatScope, seatedLook, resetSeatedLook, useTableLobby, SEATED_LOOK } from '../features/tableLobby/state'
import { useDiceUI, diceCamera } from '../game/farkle/controls'
import { DICE_CAMERA, diceFocusActive } from '../game/farkle/camera'
import { roamingFirstPerson } from './roamingCamera'
import { rememberRoamingView, restoreRoamingView } from './cameraReturn'
import { useFacilityState } from '../features/facilities/state'
import { useBenchState } from '../features/interactions/benchState'
import { useFitnessState } from '../features/fitness/state'
import { useTelescopeState } from '../features/telescopes/state'
import { useFeedbackState } from '../features/feedback/state'
import { useNotesState } from '../features/notes/state'
import { benchBoardLook, benchLook, benchTable, benchViewScope, spectatorClearHeight, useBenchSpectator } from '../features/interactions/benchSpectator'
import { advanceOmokCamera, OMOK_FOCUS_LAYER, omokTopDownHeight } from './omokCamera'

export function CameraRig() {
  const { gl, camera: mountedCamera, raycaster } = useThree()
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
      targetUp: new Vector3(0, 1, 0), lookMatrix: new Matrix4(), omokTransition: false, diceTransition: false,
    }),
    [],
  )
  const occlusion = useMemo(() => new CameraOcclusionFader(), []),
    scan = useRef(1)
  useEffect(() => installRoamingInput(gl.domElement), [gl])
  useEffect(
    () => () => {
      occlusion.dispose()
      interactionAim.ready = false
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
      mountedCamera.layers.set(0)
      raycaster.layers.set(0)
      resetSeatedLook()
      if (state.bungeoppangFov !== null && mountedCamera instanceof PerspectiveCamera) {
        mountedCamera.fov = state.bungeoppangFov; mountedCamera.updateProjectionMatrix()
      }
    },
    [occlusion, state, mountedCamera, raycaster],
  )
  useFrame(({ camera, scene }, delta) => {
    diceCamera.ready = false
    omokCamera.ready = false
    camera.layers.set(0)
    raycaster.layers.set(0)
    scan.current += delta
    if (scan.current >= 0.5) {
      const park = scene.getObjectByName('placeholder-park')
      if (park) occlusion.refresh(park)
      scan.current = 0
    }
    const session = useSession.getState(),
      avatar = avatars.get(session.sessionId)
    const facilities = useFacilityState.getState()
    const temporaryView = !!(avatar?.tableId || avatar?.benchId || avatar?.fitnessId || avatar?.telescopeId
      || session.tableId || session.focusedAnchorId || useGame.getState().watchedGameId || bungeoppangView.active
      || useFeedbackState.getState().open || useNotesState.getState().open)
    if (temporaryView) rememberRoamingView(session.sessionId, session.roomId)
    restoreRoamingView(session.sessionId, session.roomId, temporaryView || session.status !== 'connected'
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
      return
    }
    if (bungeoppangView.active) {
      state.omokTransition = false
      state.diceTransition = false
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
      camera.fov += (state.bungeoppangFov - camera.fov) * (1 - Math.exp(-7 * delta))
      if (performance.now() >= bungeoppangView.returningUntil) {
        camera.fov = state.bungeoppangFov; state.bungeoppangFov = null
      }
      camera.updateProjectionMatrix()
    }
    sampleAvatar(avatar, performance.now(), state.pose)
    if (telescope) {
      state.omokTransition = false
      state.diceTransition = false
      const { yaw, pitch } = telescopeView
      camera.position.set(telescope.position[0], telescope.position[1] + TELESCOPE.eyeHeight, telescope.position[2])
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
    const game = useGame.getState().game
    const scope = seatScope(session)
    if (state.seatScope !== scope) { resetSeatedLook(); state.seatScope = scope }
    const looking = !!scope && useTableLobby.getState().lookScope === scope
    const watchedAnchor = game?.role === 'SPECTATOR' && session.watchedTableId
      ? TABLES.find(t => t.id === session.bindings.find(b => b.channelId === session.roomId && b.tableId === session.watchedTableId)?.anchorId) : undefined
    const benchView = useBenchSpectator.getState()
    const closeView = game?.role === 'SPECTATOR' ? useTableLobby.getState().spectatorView === 'board' ? 'board' : 'participants' : benchView.view
    const closeAnchor = benchView.scope === benchScope && benchView.view !== 'seated' ? benchAnchor : undefined
    const spectatorBoard = closeAnchor ? closeView === 'board' : !!watchedAnchor && useTableLobby.getState().spectatorView === 'board'
    const firstPerson = roamingFirstPerson(avatar, !!useGame.getState().watchedGameId)
    const boardFocus =
      !looking && seated && !!avatar.tableId &&
      game?.omok?.status === 'PLAYING' &&
      (game.role === 'SPECTATOR' || game.omok.turnUserId === session.sessionId)
    const ownOmok = seated && !!avatar.tableId && (session.tableStates[session.tableId]?.gameCode === 'OMOK'
      || game?.role === 'PLAYER' && !!game.omok)
    const gathering = gatheringCameraActive()
    const focusedOmok = boardFocus && ownOmok && !gathering
    if (focusedOmok) {
      camera.layers.set(OMOK_FOCUS_LAYER)
      raycaster.layers.set(OMOK_FOCUS_LAYER)
    }
    state.targetUp.set(0, 1, 0)
    const ownDice = seated && !!avatar.tableId && game?.role === 'PLAYER' && !!game.dice
    const diceFocus = seated && !!avatar.tableId && diceFocusActive(game, session.sessionId, looking, useDiceUI.getState().boardView)
    state.look.set(pose.x, pose.y + CAMERA.focusHeight - 0.8, pose.z)
    if (state.owner !== session.sessionId) {
      state.focus.copy(state.look)
      state.owner = session.sessionId
    }
    state.focus.lerp(
      state.look,
      1 - Math.exp(-CAMERA.followSpeed * Math.min(delta, 0.1)),
    )
    if (gathering) {
      const anchor = TABLES.find(t => t.id === avatar.tableId)
      if (anchor) {
        const seat = tableSeats(anchor)[session.seatIndex] ?? tableSeats(anchor)[0]!
        const yaw = Math.atan2(seat.x, seat.z) + Math.PI / 4
        const radius = 2.7 + Math.hypot(seat.x, seat.z)
        state.look.set(anchor.position[0], anchor.position[1] + 1.35, anchor.position[2])
        state.desired.set(anchor.position[0] + Math.sin(yaw) * radius,
          Math.min(anchor.position[1] + 2.8, spectatorClearHeight(anchor.pavilionId)), anchor.position[2] + Math.cos(yaw) * radius)
      }
    } else if (focusedOmok && camera instanceof PerspectiveCamera) {
      const anchor = TABLES.find(t => t.id === avatar.tableId)!
      state.look.set(anchor.position[0], anchor.position[1] + GOMOKU.boardY + .017, anchor.position[2])
      state.desired.copy(state.look)
      state.desired.y += omokTopDownHeight(camera.aspect, tableScale(anchor))
      state.targetUp.set(0, 0, avatar.seatIndex === 0 ? -1 : 1)
    } else if (diceFocus) {
      const anchor = TABLES.find(t => t.id === avatar.tableId)!
      const seat = tableSeats(anchor)[session.seatIndex] ?? tableSeats(anchor)[0]!
      const scale = tableScale(anchor)
      state.look.set(anchor.position[0], anchor.position[1] + GOMOKU.boardY + .017, anchor.position[2])
      state.desired.set(anchor.position[0], anchor.position[1] + DICE_CAMERA.tableHeight + DICE_CAMERA.height * scale,
        anchor.position[2] + Math.sign(seat.z) * DICE_CAMERA.seatOffset * scale)
    } else if (boardFocus || spectatorBoard) {
      const anchor = closeAnchor ?? watchedAnchor ?? TABLES.find((t) => t.id === avatar.tableId)!
      state.look.set(
        anchor.position[0],
        anchor.position[1] + GOMOKU.boardY,
        anchor.position[2],
      )
      state.desired.set(
        state.look.x,
        Math.min(state.look.y + (spectatorBoard && game?.dice ? 3.2 : 2.6) * tableScale(anchor), spectatorClearHeight(anchor.pavilionId)),
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
      const seat = anchor ? tableSeats(anchor)[session.seatIndex] : undefined
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
      const horizontal = viewControls.distance * Math.cos(viewControls.pitch)
      state.desired.set(
        state.focus.x + Math.sin(viewControls.yaw) * horizontal,
        state.focus.y + viewControls.distance * Math.sin(viewControls.pitch),
        state.focus.z + Math.cos(viewControls.yaw) * horizontal,
      )
      state.desired.y = Math.max(
        state.desired.y,
        groundHeight(state.desired.x, state.desired.z) + 0.3,
      )
      state.look.copy(state.focus)
    }
    const targetFov = gathering ? ownOmok ? 60 : CAMERA.fov : diceFocus ? DICE_CAMERA.fov : boardFocus || spectatorBoard ? GOMOKU.topDownFov : seated ? GOMOKU.seatedFov : CAMERA.fov
    const smoothingOmok = ownOmok || state.omokTransition
    const smoothingDice = ownDice || state.diceTransition
    const smoothingBoard = smoothingOmok || smoothingDice
    let omokSettled = false
    if (smoothingBoard) {
      // A stable up vector preserves each seat's orientation at exactly 90 degrees.
      state.lookMatrix.lookAt(state.desired, state.look, state.targetUp)
      state.targetRotation.setFromRotationMatrix(state.lookMatrix)
      omokSettled = advanceOmokCamera(camera, state.desired, state.targetRotation, targetFov, delta)
      if (smoothingOmok) state.omokTransition = ownOmok || !omokSettled
      if (smoothingDice) state.diceTransition = ownDice || !omokSettled
    } else {
      if (firstPerson && performance.now() >= bungeoppangView.returningUntil) camera.position.copy(state.desired)
      else camera.position.lerp(state.desired, 1 - Math.exp(-12 * Math.min(delta, 0.1)))
    }
    if (!firstPerson && !seated && !watchedAnchor) constrainRoamingCamera(camera.position)
    if (!smoothingBoard) {
      if (performance.now() < bungeoppangView.returningUntil) {
        state.rotation.copy(camera.quaternion)
        camera.lookAt(state.look); state.targetRotation.copy(camera.quaternion)
        camera.quaternion.slerpQuaternions(state.rotation, state.targetRotation, 1 - Math.exp(-7 * delta))
      } else camera.lookAt(state.look)
    }
    diceCamera.ready = diceFocus ? omokSettled : !!(spectatorBoard && game?.dice) && camera.position.distanceTo(state.desired) < .005
    camera.getWorldDirection(state.direction)
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
      const fov = targetFov
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
