import { CAMERA } from '../config'
import { avatars, useSession } from '../network/worldClient'
import { parkRuntime } from '../park/runtime/runtime'

import { getParkInteraction, interactWithPark } from '../features/interactions/parkInteraction'
import { standBench } from '../features/interactions/benchController'
import { useBenchState } from '../features/interactions/benchState'
import { useFitnessState } from '../features/fitness/state'
import { leaveFitness } from '../features/fitness/controller'
import { panelOwnsKeys, roamingInput, textInputOwnsKeys } from './inputOwnership'
import { cameraRelativeMove, MOVEMENT_INPUT_INTERVAL_MS, type MovementIntent } from '../network/movementInput'
export { inputState, setChatInputOpen, textInputOwnsKeys } from './inputOwnership'
export const viewControls = {
  yaw: 0,
  pitch: CAMERA.pitch as number,
  distance: CAMERA.distance as number,
}
export function nearestTable(): string | null {
  const target = getParkInteraction()
  return target?.kind === 'table' ? target.id : null
}
export function installRoamingInput(canvas: HTMLCanvasElement) {
  const keys = new Set<string>()
  const movement = new Set([
    'KeyW',
    'KeyA',
    'KeyS',
    'KeyD',
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'ShiftLeft',
    'ShiftRight',
  ])
  const previousTabIndex = canvas.getAttribute('tabindex')
  canvas.tabIndex = -1
  let drag = false,
    jump = false,
    hadMovement = false
  const intent: MovementIntent = { dx: 0, dz: 0, run: false, jump: false }
  const blocked = () =>
    document.hidden ||
    useSession.getState().status !== 'connected' ||
    !avatars.has(useSession.getState().sessionId) ||
    panelOwnsKeys() ||
    textInputOwnsKeys(document.activeElement) ||
    !useSession.getState().mapCompatible ||
    !!useSession.getState().tableId
  const stop = () => {
    keys.clear()
    drag = jump = hadMovement = false
    parkRuntime.move(0, 0, false)
  }
  const down = (event: KeyboardEvent) => {
    if (
      event.isComposing ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey ||
      blocked()
    )
      return
    if (movement.has(event.code)) {
      event.preventDefault()
      if (useSession.getState().benchId) {
        if (!event.repeat && event.code !== 'ShiftLeft' && event.code !== 'ShiftRight') void standBench()
        if (event.repeat) return
      }
      if (useSession.getState().fitnessId) {
        if (!event.repeat && event.code !== 'ShiftLeft' && event.code !== 'ShiftRight') void leaveFitness()
        if (event.repeat) return
      }
      keys.add(event.code)
    }
    if (event.code === 'Space' && !event.repeat) {
      event.preventDefault()
      if (!useSession.getState().benchId && !useSession.getState().fitnessId
        && !useBenchState.getState().pending && !useFitnessState.getState().pending) jump = true
    }
    if (event.code === 'KeyE' && !event.repeat) {
      if (interactWithPark()) {
        event.preventDefault()
        canvas.focus({ preventScroll: true })
        stop()
      }
    }
  }
  const up = (event: KeyboardEvent) => keys.delete(event.code)
  const pointerDown = (event: PointerEvent) => {
    if (event.button === 0 && !panelOwnsKeys()) {
      drag = true
      canvas.focus({ preventScroll: true })
    }
  }
  const pointerMove = (event: PointerEvent) => {
    if (!drag || blocked()) return
    viewControls.yaw -= event.movementX * 0.004
    viewControls.pitch = Math.max(
      -0.2,
      Math.min(1.1, viewControls.pitch + event.movementY * 0.003),
    )
  }
  const pointerUp = () => {
    drag = false
  }
  const wheel = (event: WheelEvent) => {
    if (blocked() || useSession.getState().benchId) return
    event.preventDefault()
    viewControls.distance = Math.max(
      CAMERA.minDistance,
      Math.min(
        CAMERA.maxDistance,
        viewControls.distance + event.deltaY * 0.008,
      ),
    )
  }
  const interval = setInterval(() => {
    if (blocked()) {
      if (hadMovement || keys.size || jump) stop()
      return
    }
    if (useSession.getState().benchId || useSession.getState().fitnessId
      || useBenchState.getState().pending || useFitnessState.getState().pending) return
    const forward =
      Number(keys.has('KeyW') || keys.has('ArrowUp')) -
      Number(keys.has('KeyS') || keys.has('ArrowDown'))
    const side =
      Number(keys.has('KeyD') || keys.has('ArrowRight')) -
      Number(keys.has('KeyA') || keys.has('ArrowLeft'))
    cameraRelativeMove(forward, side, viewControls.yaw,
      keys.has('ShiftLeft') || keys.has('ShiftRight'), jump, intent)
    const { dx, dz } = intent
    if (dx || dz || jump || hadMovement)
      parkRuntime.move(
        dx,
        dz,
        intent.run,
        intent.jump,
      )
    hadMovement = !!(dx || dz)
    jump = false
  }, MOVEMENT_INPUT_INTERVAL_MS)
  window.addEventListener('keydown', down)
  window.addEventListener('keyup', up)
  window.addEventListener('blur', stop)
  window.addEventListener('ontop-clear-input', stop)
  document.addEventListener('visibilitychange', stop)
  canvas.addEventListener('pointerdown', pointerDown)
  window.addEventListener('pointermove', pointerMove)
  window.addEventListener('pointerup', pointerUp)
  canvas.addEventListener('wheel', wheel, { passive: false })
  roamingInput.ready = true
  return () => {
    roamingInput.ready = false
    clearInterval(interval)
    stop()
    window.removeEventListener('keydown', down)
    window.removeEventListener('keyup', up)
    window.removeEventListener('blur', stop)
    window.removeEventListener('ontop-clear-input', stop)
    document.removeEventListener('visibilitychange', stop)
    canvas.removeEventListener('pointerdown', pointerDown)
    window.removeEventListener('pointermove', pointerMove)
    window.removeEventListener('pointerup', pointerUp)
    canvas.removeEventListener('wheel', wheel)
    if (previousTabIndex === null) canvas.removeAttribute('tabindex')
    else canvas.setAttribute('tabindex', previousTabIndex)
  }
}
