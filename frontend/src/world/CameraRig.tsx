import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { PerspectiveCamera, Vector3 } from 'three'
import { CAMERA, CHARACTER, GOMOKU, TABLES, TELESCOPE, TELESCOPES, telescopeFov, groundHeight, tableScale } from '../config'
import { telescopeView } from '../features/telescopeView'
import { interactionAim } from '../features/interactions/interactionAim'
import { useGame } from '../game/store'
import { omokCamera } from '../game/cameraState'
import { avatars, sampleAvatar, useSession } from '../network/worldClient'
import { cameraOcclusion, CameraOcclusionFader } from './cameraOcclusion'
import { installRoamingInput, viewControls } from './input'
import { constrainRoamingCamera } from './cameraCollision'
import { seatScope, seatedLook, resetSeatedLook, useTableLobby } from '../features/tableLobby/state'
import { useDiceUI, diceCamera } from '../game/farkle/controls'

export function CameraRig() {
  const { gl, camera: mountedCamera } = useThree()
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
      resetSeatedLook()
    },
    [occlusion, state, mountedCamera],
  )
  useFrame(({ camera, scene }, delta) => {
    diceCamera.ready = false
    scan.current += delta
    if (scan.current >= 0.5) {
      const park = scene.getObjectByName('placeholder-park')
      if (park) occlusion.refresh(park)
      scan.current = 0
    }
    const session = useSession.getState(),
      avatar = avatars.get(session.sessionId)
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
    }
    if (!avatar) {
      interactionAim.ready = false
      if (state.bench) { Object.assign(viewControls, state.savedView); state.bench = '' }
      omokCamera.ready = false
      omokCamera.anchorId = ''
      camera.position.set(110, 115, 138)
      camera.lookAt(0, 4, 0)
      state.owner = ''
      return
    }
    sampleAvatar(avatar, performance.now(), state.pose)
    if (telescope) {
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
    if (avatar.benchId && state.bench !== avatar.benchId) {
      state.savedView = { ...viewControls }
      viewControls.yaw = pose.yaw + Math.PI
      viewControls.pitch = 0
      state.bench = avatar.benchId
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
    const spectatorBoard = !!watchedAnchor && useTableLobby.getState().spectatorView === 'board'
    const boardFocus =
      !looking && seated && !!avatar.tableId &&
      game?.omok?.status === 'PLAYING' &&
      (game.role === 'SPECTATOR' || game.omok.turnUserId === session.sessionId)
    const diceFocus = !looking && seated && !!avatar.tableId && !!game?.dice && game.role === 'PLAYER' && useDiceUI.getState().boardView
    state.look.set(pose.x, pose.y + CAMERA.focusHeight - 0.8, pose.z)
    if (state.owner !== session.sessionId) {
      state.focus.copy(state.look)
      state.owner = session.sessionId
    }
    state.focus.lerp(
      state.look,
      1 - Math.exp(-CAMERA.followSpeed * Math.min(delta, 0.1)),
    )
    if (boardFocus || spectatorBoard || diceFocus) {
      const anchor = watchedAnchor ?? TABLES.find((t) => t.id === avatar.tableId)!
      state.look.set(
        anchor.position[0],
        anchor.position[1] + GOMOKU.boardY,
        anchor.position[2],
      )
      state.desired.set(
        state.look.x,
        state.look.y + (diceFocus || (spectatorBoard && game?.dice) ? 3.2 : 2.6) * tableScale(anchor),
        state.look.z + 0.001,
      )
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
      state.desired.set(pose.x, pose.y + 0.55, pose.z)
      state.look.set(
        anchor?.position[0] ?? pose.x,
        (anchor?.position[1] ?? pose.y) + 1.05,
        anchor?.position[2] ?? pose.z - 1,
      )
      if (looking) {
        const yaw = Math.atan2(state.look.x - pose.x, state.look.z - pose.z) + seatedLook.yaw
        state.look.set(pose.x + Math.sin(yaw) * 4, state.desired.y - 0.05, pose.z + Math.cos(yaw) * 4)
      }
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
    camera.position.lerp(
      state.desired,
      1 - Math.exp(-12 * Math.min(delta, 0.1)),
    )
    if (!seated && !watchedAnchor) constrainRoamingCamera(camera.position)
    camera.lookAt(state.look)
    diceCamera.ready = !!(diceFocus || (spectatorBoard && game?.dice)) && camera.position.distanceTo(state.desired) < .005
    camera.getWorldDirection(state.direction)
    interactionAim.ready = true
    interactionAim.x = camera.position.x
    interactionAim.y = camera.position.y
    interactionAim.z = camera.position.z
    interactionAim.dx = state.direction.x
    interactionAim.dy = state.direction.y
    interactionAim.dz = state.direction.z
    omokCamera.anchorId = boardFocus ? avatar.tableId : spectatorBoard ? watchedAnchor!.id : ''
    omokCamera.ready =
      !!(boardFocus || spectatorBoard) && camera.position.distanceTo(state.desired) < 0.005
    if (camera instanceof PerspectiveCamera) {
      const fov = boardFocus || spectatorBoard || diceFocus ? GOMOKU.topDownFov : seated ? 76 : CAMERA.fov
      if (Math.abs(camera.fov - fov) > 0.01) {
        camera.fov = fov
        camera.updateProjectionMatrix()
      }
    }
    cameraOcclusion.focus.value.set(pose.x, pose.y + CAMERA.focusHeight - 0.8, pose.z)
    cameraOcclusion.strength.value = seated ? 0 : 1
    occlusion.update(camera.position, state.focus, !seated, delta)
  })
  return null
}
