import { CAMERA, TABLES, tableScale } from '../config'
import { avatars, useSession } from '../network/worldClient'
import { parkRuntime } from '../park/runtime/runtime'

export const inputState = { blocked: false, chatOpen: false }
export const viewControls = {
  yaw: 0,
  pitch: CAMERA.pitch as number,
  distance: CAMERA.distance as number,
}
export function textInputOwnsKeys(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    !!target.closest(
      'input,textarea,select,button,a,[contenteditable="true"],[role="dialog"]',
    )
  )
}
export function setChatInputOpen(open: boolean) {
  inputState.chatOpen = open
  if (open) window.dispatchEvent(new Event('ontop-clear-input'))
}
export function nearestTable(): string | null {
  const state = useSession.getState(),
    position = avatars.get(state.sessionId)?.current
  if (!position || !state.mapCompatible || state.tableId) return null
  let nearest: { id: string; distance: number } | undefined
  for (const table of TABLES) {
    const distance = Math.hypot(
      position.x - table.position[0],
      position.z - table.position[2],
    )
    if (
      distance <= 3.5 * tableScale(table) &&
      Math.abs(position.y - 0.8 - table.position[1]) < 1.3 &&
      (!nearest || distance < nearest.distance)
    )
      nearest = { id: table.id, distance }
  }
  return nearest?.id ?? null
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
  const blocked = () =>
    document.hidden ||
    inputState.blocked ||
    inputState.chatOpen ||
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
      keys.add(event.code)
    }
    if (event.code === 'Space' && !event.repeat) {
      event.preventDefault()
      jump = true
    }
    if (event.code === 'KeyE' && !event.repeat) {
      const table = nearestTable()
      if (table) parkRuntime.inspectTable(table)
    }
  }
  const up = (event: KeyboardEvent) => keys.delete(event.code)
  const pointerDown = (event: PointerEvent) => {
    if (event.button === 0 && !inputState.chatOpen) {
      drag = true
      canvas.focus({ preventScroll: true })
    }
  }
  const pointerMove = (event: PointerEvent) => {
    if (!drag || inputState.chatOpen || inputState.blocked) return
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
    if (inputState.chatOpen) return
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
      if (hadMovement || keys.size) stop()
      return
    }
    const forward =
      Number(keys.has('KeyW') || keys.has('ArrowUp')) -
      Number(keys.has('KeyS') || keys.has('ArrowDown'))
    const side =
      Number(keys.has('KeyD') || keys.has('ArrowRight')) -
      Number(keys.has('KeyA') || keys.has('ArrowLeft'))
    const length = Math.max(1, Math.hypot(forward, side)),
      yaw = viewControls.yaw
    const dx = (side * Math.cos(yaw) - forward * Math.sin(yaw)) / length,
      dz = (-side * Math.sin(yaw) - forward * Math.cos(yaw)) / length
    if (dx || dz || jump || hadMovement)
      parkRuntime.move(
        dx,
        dz,
        keys.has('ShiftLeft') || keys.has('ShiftRight'),
        jump,
      )
    hadMovement = !!(dx || dz)
    jump = false
  }, 60)
  window.addEventListener('keydown', down)
  window.addEventListener('keyup', up)
  window.addEventListener('blur', stop)
  window.addEventListener('ontop-clear-input', stop)
  document.addEventListener('visibilitychange', stop)
  canvas.addEventListener('pointerdown', pointerDown)
  window.addEventListener('pointermove', pointerMove)
  window.addEventListener('pointerup', pointerUp)
  canvas.addEventListener('wheel', wheel, { passive: false })
  return () => {
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
