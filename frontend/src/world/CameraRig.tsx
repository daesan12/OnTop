import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { PerspectiveCamera, Vector3 } from 'three'
import { CAMERA, GOMOKU, TABLES, groundHeight, tableScale } from '../config'
import { useGame } from '../game/store'
import { omokCamera } from '../game/cameraState'
import { avatars, sampleAvatar, useSession } from '../network/worldClient'
import { cameraOcclusion, CameraOcclusionFader } from './cameraOcclusion'
import { installRoamingInput, viewControls } from './input'

export function CameraRig() {
  const { gl } = useThree()
  const state = useMemo(
    () => ({
      focus: new Vector3(),
      desired: new Vector3(),
      look: new Vector3(),
      pose: { x: 0, y: 0, z: 0, yaw: 0 },
      owner: '',
    }),
    [],
  )
  const occlusion = useMemo(() => new CameraOcclusionFader(), []),
    scan = useRef(1)
  useEffect(() => installRoamingInput(gl.domElement), [gl])
  useEffect(
    () => () => {
      occlusion.dispose()
      omokCamera.ready = false
      omokCamera.anchorId = ''
    },
    [occlusion],
  )
  useFrame(({ camera, scene }, delta) => {
    scan.current += delta
    if (scan.current >= 0.5) {
      const park = scene.getObjectByName('placeholder-park')
      if (park) occlusion.refresh(park)
      scan.current = 0
    }
    const session = useSession.getState(),
      avatar = avatars.get(session.sessionId)
    if (!avatar) {
      omokCamera.ready = false
      omokCamera.anchorId = ''
      camera.position.set(110, 115, 138)
      camera.lookAt(0, 4, 0)
      state.owner = ''
      return
    }
    sampleAvatar(avatar, performance.now(), state.pose)
    const pose = state.pose,
      seated = !!avatar.tableId && avatar.seatIndex >= 0
    const game = useGame.getState().game
    const boardFocus =
      seated &&
      game?.omok.status === 'PLAYING' &&
      (game.role === 'SPECTATOR' || game.omok.turnUserId === session.sessionId)
    state.look.set(pose.x, pose.y + CAMERA.focusHeight - 0.8, pose.z)
    if (state.owner !== session.sessionId) {
      state.focus.copy(state.look)
      state.owner = session.sessionId
    }
    state.focus.lerp(
      state.look,
      1 - Math.exp(-CAMERA.followSpeed * Math.min(delta, 0.1)),
    )
    if (boardFocus) {
      const anchor = TABLES.find((t) => t.id === avatar.tableId)!
      state.look.set(
        anchor.position[0],
        anchor.position[1] + GOMOKU.boardY,
        anchor.position[2],
      )
      state.desired.set(
        state.look.x,
        state.look.y + 2.6 * tableScale(anchor),
        state.look.z + 0.001,
      )
    } else if (seated) {
      const anchor = TABLES.find((t) => t.id === avatar.tableId)
      state.desired.set(pose.x, pose.y + 0.55, pose.z)
      state.look.set(
        anchor?.position[0] ?? pose.x,
        (anchor?.position[1] ?? pose.y) + 1.05,
        anchor?.position[2] ?? pose.z - 1,
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
    camera.position.lerp(
      state.desired,
      1 - Math.exp(-12 * Math.min(delta, 0.1)),
    )
    camera.lookAt(state.look)
    omokCamera.anchorId = boardFocus ? avatar.tableId : ''
    omokCamera.ready =
      !!boardFocus && camera.position.distanceTo(state.desired) < 0.005
    if (camera instanceof PerspectiveCamera) {
      const fov = boardFocus ? GOMOKU.topDownFov : seated ? 76 : CAMERA.fov
      if (Math.abs(camera.fov - fov) > 0.01) {
        camera.fov = fov
        camera.updateProjectionMatrix()
      }
    }
    cameraOcclusion.focus.value.copy(state.focus)
    cameraOcclusion.strength.value = seated ? 0 : 1
    occlusion.update(camera.position, state.focus, !seated, delta)
  })
  return null
}
