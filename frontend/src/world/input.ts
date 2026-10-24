import { CAMERA, TELESCOPE } from '../config'
import { avatars, useSession } from '../network/worldClient'
import { parkRuntime } from '../park/runtime/runtime'

import { getParkInteraction, interactWithPark } from '../features/interactions/parkInteraction'
import { standBench } from '../features/interactions/benchController'
import { useBenchState } from '../features/interactions/benchState'
import { useFitnessState } from '../features/fitness/state'
import { leaveFitness } from '../features/fitness/controller'
import { aimTelescope, leaveTelescope } from '../features/telescopes/controller'
import { useTelescopeState } from '../features/telescopes/state'
import { normalizeTelescopeAim } from '../features/telescopes/anchors'
import { telescopeView, zoomTelescope } from '../features/telescopeView'
import { inputState, panelOwnsKeys, roamingInput, textInputOwnsKeys } from './inputOwnership'
import { cameraRelativeMove, MOVEMENT_INPUT_INTERVAL_MS, type MovementIntent } from '../network/movementInput'
import { useGame } from '../game/store'
import { canLeaveByMovement } from '../features/tableLobby/model'
import { seatScope, turnSeatedLook } from '../features/tableLobby/state'
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
    seatDragging = '',
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
    !!useGame.getState().watchedGameId ||
    !!useSession.getState().tableId
  const stop = () => {
    keys.clear()
    drag = jump = hadMovement = false
    seatDragging = ''
    parkRuntime.move(0, 0, false)
  }
  const down = (event: KeyboardEvent) => {
    const session = useSession.getState(), table = session.tableStates[session.tableId]
    // TABLE_LEAVE is distinct from resign. A delayed movement key can never become a forfeit.
    if (!event.repeat && !event.isComposing && !event.ctrlKey && !event.altKey && !event.metaKey
      && session.status === 'connected' && !session.pending && !document.hidden && session.mapCompatible
      && table && !panelOwnsKeys() && !textInputOwnsKeys(document.activeElement)
      && canLeaveByMovement(table, session.sessionId, useGame.getState())
      && movement.has(event.code) && !event.code.startsWith('Shift')) {
      event.preventDefault()
      stop()
      void parkRuntime.leaveTable()
      return
    }
    if (
      event.isComposing ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey ||
      blocked()
    )
      return
    if (useSession.getState().telescopeId) {
      if (movement.has(event.code) || event.code === 'Space') event.preventDefault()
      if ((event.code === 'KeyE' || event.code === 'Escape') && !event.repeat) {
        event.preventDefault()
        void leaveTelescope()
      }
      return
    }
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
        && !useBenchState.getState().pending && !useFitnessState.getState().pending && !useTelescopeState.getState().pending) jump = true
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
    const session = useSession.getState(), scope = seatScope(session)
    if (event.button === 2 && scope && session.status === 'connected'
      && !Object.values(inputState).some(Boolean) && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName ?? '')) {
      event.preventDefault()
      seatDragging = scope
      canvas.focus({ preventScroll: true })
      return
    }
    if (event.button === 0 && !panelOwnsKeys()) {
      drag = true
      canvas.focus({ preventScroll: true })
    }
  }
  const pointerMove = (event: PointerEvent) => {
    if (seatDragging) {
      const session = useSession.getState()
      if (seatDragging !== seatScope(session) || session.status !== 'connected' || Object.values(inputState).some(Boolean)) {
        seatDragging = ''
        return
      }
      turnSeatedLook(seatDragging, event.movementX)
      return
    }
    if (!drag || blocked()) return
    if (useSession.getState().telescopeId) {
      if (useTelescopeState.getState().pending) return
      const sensitivity = 0.003 / Math.sqrt(telescopeView.zoom)
      Object.assign(telescopeView, normalizeTelescopeAim(telescopeView.yaw - event.movementX * sensitivity,
        telescopeView.pitch - event.movementY * sensitivity))
      return
    }
    viewControls.yaw -= event.movementX * 0.004
    viewControls.pitch = Math.max(
      -0.2,
      Math.min(1.1, viewControls.pitch + event.movementY * 0.003),
    )
  }
  const pointerUp = () => {
    drag = false
    seatDragging = ''
  }
  const contextMenu = (event: Event) => { if (useSession.getState().tableId) event.preventDefault() }
  const wheel = (event: WheelEvent) => {
    if (blocked() || useSession.getState().benchId) return
    event.preventDefault()
    if (useSession.getState().telescopeId) {
      if (!useTelescopeState.getState().pending) zoomTelescope(-event.deltaY * 0.003)
      return
    }
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
    if (useSession.getState().benchId || useSession.getState().fitnessId || useSession.getState().telescopeId
      || useBenchState.getState().pending || useFitnessState.getState().pending || useTelescopeState.getState().pending) return
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
  const aiming = setInterval(() => {
    if (!blocked() && useSession.getState().telescopeId) void aimTelescope()
  }, TELESCOPE.aimIntervalMs)
  window.addEventListener('keydown', down)
  window.addEventListener('keyup', up)
  window.addEventListener('blur', stop)
  window.addEventListener('ontop-clear-input', stop)
  document.addEventListener('visibilitychange', stop)
  canvas.addEventListener('pointerdown', pointerDown)
  canvas.addEventListener('contextmenu', contextMenu)
  window.addEventListener('pointermove', pointerMove)
  window.addEventListener('pointerup', pointerUp)
  canvas.addEventListener('wheel', wheel, { passive: false })
  roamingInput.ready = true
  return () => {
    roamingInput.ready = false
    clearInterval(interval)
    clearInterval(aiming)
    stop()
    window.removeEventListener('keydown', down)
    window.removeEventListener('keyup', up)
    window.removeEventListener('blur', stop)
    window.removeEventListener('ontop-clear-input', stop)
    document.removeEventListener('visibilitychange', stop)
    canvas.removeEventListener('pointerdown', pointerDown)
    canvas.removeEventListener('contextmenu', contextMenu)
    window.removeEventListener('pointermove', pointerMove)
    window.removeEventListener('pointerup', pointerUp)
    canvas.removeEventListener('wheel', wheel)
    if (previousTabIndex === null) canvas.removeAttribute('tabindex')
    else canvas.setAttribute('tabindex', previousTabIndex)
  }
}
