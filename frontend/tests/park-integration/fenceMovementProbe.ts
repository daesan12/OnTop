import { _roots } from '@react-three/fiber'
import { avatars, useSession } from '../../src/network/worldClient'
import { localMovement } from '../../src/network/localMovementPrediction'
import { finishWelcomeFlight } from '../../src/features/welcomeTour/state'
import { useJumpmap } from '../../src/features/jumpmap/state'
import { viewControls } from '../../src/world/cameraPerspective'
import { inputState } from '../../src/world/inputOwnership'
import { parkRuntime } from '../../src/park/runtime/runtime'

let resumeMove: typeof parkRuntime.move | undefined
export function holdFenceReports(hold: boolean) {
  if (hold && !resumeMove) {
    resumeMove = parkRuntime.move
    parkRuntime.move = (dx, dz, run, jump = false) => localMovement.intend({ dx, dz, run, jump })
    parkRuntime.stopMovement()
  } else if (!hold && resumeMove) {
    parkRuntime.move = resumeMove; resumeMove = undefined
  }
}

export function setupFenceMovement() {
  finishWelcomeFlight(); useJumpmap.setState({ available: true }); viewControls.yaw = 0
}
export function readFenceMovement() {
  const camera = _roots.get(document.querySelector('canvas')!)?.store.getState().camera
  const predicted = { ...avatars.get(useSession.getState().sessionId)!.current }
  localMovement.sample(performance.now(), predicted)
  return { own: avatars.get(useSession.getState().sessionId)?.current, epoch: localMovement.epoch,
    predicted,
    ready: localMovement.ready, flags: localMovement.displayFlags(performance.now()),
    camera: camera?.position.toArray(), metrics: localMovement.metrics(), inputState: { ...inputState } }
}
