import { CAMERA, TELESCOPE } from '../config'
import { parkXRView } from './xrView'
import { avatars, useSession } from '../network/worldClient'
import { parkRuntime } from '../park/runtime/runtime'
import { createCarryEscape } from '../features/carry/escape'

import { getParkInteraction, interactWithPark } from '../features/interactions/parkInteraction'
import { standBench } from '../features/interactions/benchController'
import { useBenchState } from '../features/interactions/benchState'
import { useFitnessState } from '../features/fitness/state'
import { leaveFitness } from '../features/fitness/controller'
import { aimTelescope, leaveTelescope } from '../features/telescopes/controller'
import { useTelescopeState } from '../features/telescopes/state'
import { normalizeTelescopeAim } from '../features/telescopes/anchors'
import { telescopeTurnRate, telescopeView, zoomTelescope } from '../features/telescopeView'
import { inputState, panelOwnsKeys, panelOwnsMovement, roamingInput, scenePointerOwners, textInputOwnsKeys } from './inputOwnership'
import { cameraRelativeMove, MOVEMENT_INPUT_INTERVAL_MS, type MovementIntent } from '../network/movementInput'
import { localMovement } from '../network/localMovementPrediction'
import { useGame } from '../game/store'
import { canLeaveByMovement } from '../features/tableLobby/model'
import { seatScope, turnSeatedLook } from '../features/tableLobby/state'
import { installMouseLook, mouseLookReturn } from './mouseLook'
import { lookScale } from './lookSensitivity'
import { canControlRoamingCamera, lookOwner } from './roamingCamera'
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
  const carryEscape = createCarryEscape()
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
    parkXRView.ownsInput ||
    document.hidden ||
    useSession.getState().status !== 'connected' ||
    !avatars.has(useSession.getState().sessionId) ||
    panelOwnsMovement() ||
    textInputOwnsKeys(document.activeElement) ||
    !useSession.getState().mapCompatible ||
    !!useGame.getState().watchedGameId ||
    !!(avatars.get(useSession.getState().sessionId)?.carry && avatars.get(useSession.getState().sessionId)?.carry?.role !== 'CARRIER') ||
    !!useSession.getState().tableId
  const stop = () => {
    carryEscape.reset()
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
    if (intent.dx || intent.dz || jumpNow || hadMovement || localMovement.positionMode)
      parkRuntime.move(intent.dx, intent.dz, intent.run, intent.jump)
    hadMovement = !!(intent.dx || intent.dz)
  }
  const rotate = (x: number, y: number) => {
    const scale = lookScale()
    viewControls.yaw -= x * 0.004 * scale
    viewControls.pitch = Math.max(-0.2, Math.min(1.1, viewControls.pitch + y * 0.003 * scale))
    if (hadMovement) sendIntent()
  }
  // Shared by drag and mouse look; zoom slows the aim and the server sync keeps its own interval.
  const turnTelescope = (x: number, y: number) => {
    if (useTelescopeState.getState().pending) return
    const rate = telescopeTurnRate()
    Object.assign(telescopeView, normalizeTelescopeAim(telescopeView.yaw - x * rate, telescopeView.pitch - y * rate))
  }
  // Held keys turn the telescope every frame at the mouse rate of this many pixels per second,
  // only while mouse look is off; the server still only hears the aim on its own interval.
  const telescopeAimKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])
  const TELESCOPE_KEY_PX_PER_SECOND = 450
  let telescopeFrame = 0, telescopeLast = 0
  // The frame timestamp can precede the key press, so time the step with performance.now()
  // to let a slow first frame still turn by the time that passed.
  const telescopeKeyStep = () => {
    const now = performance.now()
    const dt = Math.min(0.1, Math.max(0, now - telescopeLast) / 1000)
    telescopeLast = now
    const x = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'))
    const y = Number(keys.has('KeyS') || keys.has('ArrowDown')) - Number(keys.has('KeyW') || keys.has('ArrowUp'))
    if (!useSession.getState().telescopeId || blocked() || mouseLook.locked() || (!x && !y)) {
      telescopeFrame = 0
      return
    }
    turnTelescope(x * TELESCOPE_KEY_PX_PER_SECOND * dt, y * TELESCOPE_KEY_PX_PER_SECOND * dt)
    telescopeFrame = requestAnimationFrame(telescopeKeyStep)
  }
  const startTelescopeKeys = () => {
    if (telescopeFrame) return
    telescopeLast = performance.now()
    telescopeFrame = requestAnimationFrame(telescopeKeyStep)
  }
  // Fitness keeps the park orbit. On a bench the seated view uses the park controls,
  // the spectator view its own yaw, and the top-down board view stays fixed.
  const look = (x: number, y: number) => {
    const owner = lookOwner()
    if (owner === 'park' || owner === 'fitness') { rotate(x, y); return }
    if (owner === 'telescope') { turnTelescope(x, y); return }
    if (owner !== 'bench') return
    const benchView = useBenchSpectator.getState()
    if (benchView.scope !== benchViewScope(useSession.getState()) || benchView.view === 'seated') rotate(x, y)
    else if (benchView.view === 'participants') turnBenchLook(x)
  }
  const mouseLook = installMouseLook(canvas, () => !parkXRView.ownsInput && lookOwner() !== null, look, stop, cancelMouseLookReturn)
  const clear = () => { mouseLook.release(); stop() }
  // Entering a bench, telescope or fitness station clears movement keys but keeps mouse look;
  // callers that open a panel or minigame release it, as does any clear while simply roaming.
  // Controllers clear input just before marking their request pending, so decide after they finish.
  // The map, emote wheel and manual only borrow the cursor: closing them returns to mouse look.
  const clearInput = () => {
    scenePointerOwners.clear()
    const wasLocked = mouseLook.locked()
    stop()
    queueMicrotask(() => {
      const owner = lookOwner()
      if (owner !== null && owner !== 'park') return
      mouseLook.release()
      if (wasLocked && (inputState.mapOpen || inputState.emoteWheelOpen || inputState.manualOpen)) mouseLookReturn.requested = true
    })
  }
  const abandonMouseLook = () => { scenePointerOwners.clear(); cancelMouseLookReturn(); clear() }
  const changePerspective = () => {
    if (parkXRView.ownsInput) return
    if (!canControlRoamingCamera()) return
    stop()
    toggleCameraPerspective()
    canvas.focus({ preventScroll: true })
  }
  const unsubscribe = useSession.subscribe((next, previous) => {
    if (lookOwner() === null || next.roomId !== previous.roomId || next.sessionId !== previous.sessionId) {
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
    if (event.defaultPrevented || parkXRView.ownsInput) { carryEscape.reset(); return }
    const session = useSession.getState(), table = session.tableStates[session.tableId]
    const carry = avatars.get(session.sessionId)?.carry
    if (carry?.role === 'CARRIED') {
      if (event.isComposing || event.ctrlKey || event.altKey || event.metaKey || session.pending
        || session.status !== 'connected' || !session.mapCompatible || document.hidden
        || panelOwnsKeys() || textInputOwnsKeys(document.activeElement)) { carryEscape.reset(); return }
      if (event.code === 'KeyA' || event.code === 'KeyD') {
        event.preventDefault()
        if (!event.repeat && carryEscape.press(carry.carryId, event.code, performance.now())) {
          void parkRuntime.releaseAvatar?.(carry.carryId).then(ok => { if (!ok) carryEscape.reset() })
        }
      } else carryEscape.reset()
      return
    }
    carryEscape.reset()
    if (event.code === 'Escape' && !event.repeat && !event.isComposing && !event.ctrlKey && !event.altKey && !event.metaKey
      && carry?.role === 'CARRIER' && session.status === 'connected' && !document.hidden
      && !panelOwnsKeys() && !textInputOwnsKeys(document.activeElement)) {
      event.preventDefault()
      void parkRuntime.releaseAvatar?.(carry.carryId)
      return
    }
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
        return
      }
      // Without mouse look, WASD and arrows aim like the mouse (S15P31B105-216); with mouse look
      // the mouse alone aims. Shift and Space stay inert here.
      if (telescopeAimKeys.has(event.code) && !mouseLook.locked()) { keys.add(event.code); startTelescopeKeys() }
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
      const changed = !keys.has(event.code)
      keys.add(event.code)
      // Local intent must not wait for the transport's 60ms send cadence.
      if (changed) sendIntent()
    }
    if (event.code === 'Space') {
      event.preventDefault()
      if (!event.repeat && !useSession.getState().benchId && !useSession.getState().fitnessId
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
  const up = (event: KeyboardEvent) => {
    const changed = keys.delete(event.code)
    if (changed && movement.has(event.code) && !blocked() && !useSession.getState().telescopeId) sendIntent()
  }
  const pointerDown = (event: PointerEvent) => {
    if (parkXRView.ownsInput) return
    if (event.defaultPrevented || scenePointerOwners.has(event.pointerId)) return
    if (mouseLook.locked()) return
    const session = useSession.getState(), scope = seatScope(session)
    const benchScope = benchViewScope(session), benchView = useBenchSpectator.getState()
    if (event.button === 0 && benchScope && benchView.scope === benchScope && benchView.view === 'participants'
      && !panelOwnsKeys() && !textInputOwnsKeys(document.activeElement)) {
      event.preventDefault(); benchDragging = benchScope; canvas.focus({ preventScroll: true }); return
    }
    const game = useGame.getState().game
    if (game?.role === 'PLAYER' && game.dice?.status === 'PLAYING') return
    if (event.button === 2 && scope && session.status === 'connected'
      && !Object.values(inputState).some(Boolean) && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName ?? '')) {
      if (event.button === 2) event.preventDefault()
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
    if (scenePointerOwners.has(event.pointerId)) { benchDragging = ''; seatDragging = ''; drag = false; return }
    if (mouseLook.locked()) return
    if (benchDragging) {
      const benchView = useBenchSpectator.getState()
      if (benchDragging !== benchViewScope(useSession.getState()) || benchView.scope !== benchDragging
        || benchView.view !== 'participants' || panelOwnsKeys()) { benchDragging = ''; return }
      turnBenchLook(event.movementX); return
    }
    if (seatDragging) {
      const session = useSession.getState(), game = useGame.getState().game
      if (game?.role === 'PLAYER' && game.dice?.status === 'PLAYING' || seatDragging !== seatScope(session) || session.status !== 'connected' || Object.values(inputState).some(Boolean)) {
        seatDragging = ''
        return
      }
      turnSeatedLook(seatDragging, event.movementX)
      return
    }
    if (!drag || blocked()) return
    if (useSession.getState().telescopeId) {
      turnTelescope(event.movementX, event.movementY)
      return
    }
    rotate(event.movementX, event.movementY)
  }
  const pointerUp = (event: PointerEvent) => {
    scenePointerOwners.delete(event.pointerId)
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
    // XR owns both intent and the idle position heartbeat until its session ends.
    if (parkXRView.ownsInput) { carryEscape.reset(); return }
    if (avatars.get(useSession.getState().sessionId)?.carry?.role !== 'CARRIED' || panelOwnsKeys()
      || textInputOwnsKeys(document.activeElement)) carryEscape.reset()
    const owner = lookOwner()
    if (owner === null) mouseLook.release()
    else if (owner !== 'hold' && mouseLookReturn.requested) mouseLook.resume()
    if (blocked()) {
      if (benchExitKey && useSession.getState().benchId && useSession.getState().status === 'connected'
        && !document.hidden && !panelOwnsKeys() && !textInputOwnsKeys(document.activeElement)) return
      if (hadMovement || keys.size || jump) stop()
      // Foreground UI/text focus blocks controls, not the verified position lease.
      // Actual facility/table/activity ownership remains gated by the runtime.
      if (!document.hidden && localMovement.positionMode && localMovement.ready)
        parkRuntime.move(0, 0, false, false)
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
  window.addEventListener('ontop-browser-interrupt', abandonMouseLook)
  window.addEventListener('ontop-clear-input', clearInput)
  window.addEventListener('ontop-toggle-camera-perspective', changePerspective)
  document.addEventListener('visibilitychange', abandonMouseLook)
  document.addEventListener('focusin', focus)
  canvas.addEventListener('pointerdown', pointerDown)
  canvas.addEventListener('contextmenu', contextMenu)
  window.addEventListener('pointermove', pointerMove)
  window.addEventListener('pointerup', pointerUp)
  window.addEventListener('pointercancel', pointerUp)
  canvas.addEventListener('wheel', wheel, { passive: false })
  roamingInput.ready = true
  return () => {
    scenePointerOwners.clear()
    roamingInput.ready = false
    clearInterval(interval)
    clearInterval(aiming)
    if (telescopeFrame) cancelAnimationFrame(telescopeFrame)
    unsubscribe()
    mouseLook.dispose()
    resetCameraReturn()
    stop()
    window.removeEventListener('keydown', down)
    window.removeEventListener('keyup', up)
    window.removeEventListener('blur', abandonMouseLook)
    window.removeEventListener('ontop-browser-interrupt', abandonMouseLook)
    window.removeEventListener('ontop-clear-input', clearInput)
    window.removeEventListener('ontop-toggle-camera-perspective', changePerspective)
    document.removeEventListener('visibilitychange', abandonMouseLook)
    document.removeEventListener('focusin', focus)
    canvas.removeEventListener('pointerdown', pointerDown)
    canvas.removeEventListener('contextmenu', contextMenu)
    window.removeEventListener('pointermove', pointerMove)
    window.removeEventListener('pointerup', pointerUp)
    window.removeEventListener('pointercancel', pointerUp)
    canvas.removeEventListener('wheel', wheel)
    if (previousTabIndex === null) canvas.removeAttribute('tabindex')
    else canvas.setAttribute('tabindex', previousTabIndex)
  }
}
