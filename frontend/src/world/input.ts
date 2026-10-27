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
import { inputState, panelOwnsKeys, panelOwnsMovement, roamingInput, textInputOwnsKeys } from './inputOwnership'
import { cameraRelativeMove, MOVEMENT_INPUT_INTERVAL_MS, type MovementIntent } from '../network/movementInput'
import { useGame } from '../game/store'
import { canLeaveByMovement } from '../features/tableLobby/model'
import { seatScope, turnSeatedLook } from '../features/tableLobby/state'
import { installMouseLook, mouseLookReturn } from './mouseLook'
import { canControlRoamingCamera } from './roamingCamera'
import { toggleCameraPerspective, useCameraPerspective, viewControls } from './cameraPerspective'
import { cancelMouseLookReturn, resetCameraReturn } from './cameraReturn'
import { benchViewScope, turnBenchLook, useBenchSpectator } from '../features/interactions/benchSpectator'
export { inputState, setChatInputOpen, textInputOwnsKeys } from './inputOwnership'
export { viewControls } from './cameraPerspective'
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
    benchDragging = '',
    benchExitKey = false,
    jump = false,
    hadMovement = false
  const intent: MovementIntent = { dx: 0, dz: 0, run: false, jump: false }
  const blocked = () =>
    document.hidden ||
    useSession.getState().status !== 'connected' ||
    !avatars.has(useSession.getState().sessionId) ||
    panelOwnsMovement() ||
    textInputOwnsKeys(document.activeElement) ||
    !useSession.getState().mapCompatible ||
    !!useGame.getState().watchedGameId ||
    !!useSession.getState().tableId
  const stop = () => {
    keys.clear()
    drag = jump = hadMovement = false
    seatDragging = ''
    benchDragging = ''
    benchExitKey = false
    parkRuntime.stopMovement()
  }
  const sendIntent = (jumpNow = false) => {
    const forward = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'))
    const side = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'))
    cameraRelativeMove(forward, side, viewControls.yaw,
      keys.has('ShiftLeft') || keys.has('ShiftRight'), jumpNow, intent)
    if (intent.dx || intent.dz || jumpNow || hadMovement)
      parkRuntime.move(intent.dx, intent.dz, intent.run, intent.jump)
    hadMovement = !!(intent.dx || intent.dz)
  }
  const rotate = (x: number, y: number) => {
    viewControls.yaw -= x * 0.004
    viewControls.pitch = Math.max(-0.2, Math.min(1.1, viewControls.pitch + y * 0.003))
  }
  const mouseLook = installMouseLook(canvas, canControlRoamingCamera, rotate, stop, cancelMouseLookReturn)
  const clear = () => { mouseLook.release(); stop() }
  const abandonMouseLook = () => { cancelMouseLookReturn(); clear() }
  const changePerspective = () => {
    if (!canControlRoamingCamera()) return
    stop()
    toggleCameraPerspective()
    canvas.focus({ preventScroll: true })
  }
  const unsubscribe = useSession.subscribe((next, previous) => {
    if (!canControlRoamingCamera() || next.roomId !== previous.roomId || next.sessionId !== previous.sessionId) {
      mouseLook.release()
    }
    if (next.roomId !== previous.roomId || next.sessionId !== previous.sessionId) { resetCameraReturn(); stop() }
  })
  const focus = (event: FocusEvent) => {
    if (event.target === canvas) return
    mouseLook.release()
    stop()
  }
  const down = (event: KeyboardEvent) => {
    if (event.defaultPrevented) return
    const session = useSession.getState(), table = session.tableStates[session.tableId]
    // A bench watcher must be able to stand even while GAME_WATCH blocks roaming.
    if (session.benchId && movement.has(event.code) && !event.code.startsWith('Shift') && !event.repeat
      && !event.isComposing && !event.ctrlKey && !event.altKey && !event.metaKey && session.status === 'connected'
      && !document.hidden && !panelOwnsKeys() && !textInputOwnsKeys(document.activeElement)) {
      event.preventDefault()
      if (useBenchState.getState().pending) { keys.add(event.code); return }
      stop(); keys.add(event.code); benchExitKey = true
      void standBench().then(ok => { if (!ok) { benchExitKey = false; keys.clear() } })
      return
    }
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
    if (event.code === 'KeyV' && !event.repeat && !event.shiftKey && canControlRoamingCamera()) {
      event.preventDefault()
      changePerspective()
      return
    }
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
        && !useBenchState.getState().pending && !useFitnessState.getState().pending && !useTelescopeState.getState().pending) {
        // Queue the edge now, rather than waiting for the roaming polling tick.
        // The transport still enforces its minimum interval and sends it only once.
        jump = true
        sendIntent(true)
      }
    }
    if (event.code === 'KeyE' && !event.repeat && !inputState.wardrobeOpen) {
      if (interactWithPark()) {
        event.preventDefault()
        canvas.focus({ preventScroll: true })
        stop()
      }
    }
  }
  const up = (event: KeyboardEvent) => keys.delete(event.code)
  const pointerDown = (event: PointerEvent) => {
    if (mouseLook.locked()) return
    const session = useSession.getState(), scope = seatScope(session)
    const benchScope = benchViewScope(session), benchView = useBenchSpectator.getState()
    if (event.button === 2 && benchScope && benchView.scope === benchScope && benchView.view === 'participants'
      && !panelOwnsKeys() && !textInputOwnsKeys(document.activeElement)) {
      event.preventDefault(); benchDragging = benchScope; canvas.focus({ preventScroll: true }); return
    }
    if (event.button === 2 && scope && session.status === 'connected'
      && !Object.values(inputState).some(Boolean) && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName ?? '')) {
      event.preventDefault()
      seatDragging = scope
      canvas.focus({ preventScroll: true })
      return
    }
    if (event.button === 0 && !panelOwnsMovement()) {
      drag = true
      canvas.focus({ preventScroll: true })
    }
  }
  const pointerMove = (event: PointerEvent) => {
    if (mouseLook.locked()) return
    if (benchDragging) {
      const benchView = useBenchSpectator.getState()
      if (benchDragging !== benchViewScope(useSession.getState()) || benchView.scope !== benchDragging
        || benchView.view !== 'participants' || panelOwnsKeys()) { benchDragging = ''; return }
      turnBenchLook(event.movementX); return
    }
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
    rotate(event.movementX, event.movementY)
  }
  const pointerUp = () => {
    drag = false
    seatDragging = ''
    benchDragging = ''
  }
  const contextMenu = (event: Event) => { if (useSession.getState().tableId || useSession.getState().benchId) event.preventDefault() }
  const wheel = (event: WheelEvent) => {
    if (blocked() || useSession.getState().benchId) return
    event.preventDefault()
    if (useSession.getState().telescopeId) {
      if (!useTelescopeState.getState().pending) zoomTelescope(-event.deltaY * 0.003)
      return
    }
    if (canControlRoamingCamera() && useCameraPerspective.getState().perspective === 'first-person') return
    viewControls.distance = Math.max(
      CAMERA.minDistance,
      Math.min(
        CAMERA.maxDistance,
        viewControls.distance + event.deltaY * 0.008,
      ),
    )
  }
  const interval = setInterval(() => {
    if (!canControlRoamingCamera()) mouseLook.release()
    else if (mouseLookReturn.requested) mouseLook.resume()
    if (blocked()) {
      if (benchExitKey && useSession.getState().benchId && useSession.getState().status === 'connected'
        && !document.hidden && !panelOwnsKeys() && !textInputOwnsKeys(document.activeElement)) return
      if (hadMovement || keys.size || jump) stop()
      return
    }
    if (!useSession.getState().benchId) benchExitKey = false
    if (useSession.getState().benchId || useSession.getState().fitnessId || useSession.getState().telescopeId
      || useBenchState.getState().pending || useFitnessState.getState().pending || useTelescopeState.getState().pending) return
    sendIntent()
    jump = false
  }, MOVEMENT_INPUT_INTERVAL_MS)
  const aiming = setInterval(() => {
    if (!blocked() && useSession.getState().telescopeId) void aimTelescope()
  }, TELESCOPE.aimIntervalMs)
  window.addEventListener('keydown', down)
  window.addEventListener('keyup', up)
  window.addEventListener('blur', abandonMouseLook)
  window.addEventListener('ontop-clear-input', clear)
  window.addEventListener('ontop-toggle-camera-perspective', changePerspective)
  document.addEventListener('visibilitychange', abandonMouseLook)
  document.addEventListener('focusin', focus)
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
    unsubscribe()
    mouseLook.dispose()
    resetCameraReturn()
    stop()
    window.removeEventListener('keydown', down)
    window.removeEventListener('keyup', up)
    window.removeEventListener('blur', abandonMouseLook)
    window.removeEventListener('ontop-clear-input', clear)
    window.removeEventListener('ontop-toggle-camera-perspective', changePerspective)
    document.removeEventListener('visibilitychange', abandonMouseLook)
    document.removeEventListener('focusin', focus)
    canvas.removeEventListener('pointerdown', pointerDown)
    canvas.removeEventListener('contextmenu', contextMenu)
    window.removeEventListener('pointermove', pointerMove)
    window.removeEventListener('pointerup', pointerUp)
    canvas.removeEventListener('wheel', wheel)
    if (previousTabIndex === null) canvas.removeAttribute('tabindex')
    else canvas.setAttribute('tabindex', previousTabIndex)
  }
}
