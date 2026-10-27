import { create } from 'zustand'

export const useMouseLook = create<{ active: boolean; error: string }>(() => ({ active: false, error: '' }))
export const toggleMouseLook = () => window.dispatchEvent(new Event('ontap-toggle-mouse-look'))
// A one-shot return request; rejection must never start an automatic retry loop.
export const mouseLookReturn = { requested: false }
// Browsers can report a lone huge movement while locked (often right after locking).
// A step this large that is also far bigger than the previous one is dropped; a real fast
// swipe keeps growing, so only its first step is lost.
const SPIKE_MIN = 200, SPIKE_RATIO = 4

/** Pointer lock belongs only to this canvas. A cancelled request must never reacquire it. */
export function installMouseLook(canvas: HTMLCanvasElement, canLock: () => boolean,
  move: (x: number, y: number) => void, stop: () => void, onManualRelease: () => void = () => {}) {
  let desired = false, pending = false, disposed = false, request = 0, lastStep = 0
  let control: string | null = null, chord = false
  const locked = () => document.pointerLockElement === canvas
  function release() {
    desired = pending = false
    control = null
    request++
    if (locked()) document.exitPointerLock()
    if (useMouseLook.getState().active) useMouseLook.setState({ active: false })
  }
  function fail(version: number) {
    if (disposed || version !== request || !desired) return
    desired = pending = false
    useMouseLook.setState({ active: false, error: '마우스 시점을 고정하지 못했어요. 공원 화면을 클릭한 뒤 Ctrl을 다시 눌러주세요.' })
  }
  function toggle() {
    mouseLookReturn.requested = false
    if (locked() || pending) { onManualRelease(); release(); stop(); return }
    if (disposed || !canLock()) return
    if (!canvas.requestPointerLock) {
      useMouseLook.setState({ error: '이 브라우저에서는 마우스 고정을 지원하지 않아요. 드래그로 시점을 조절해주세요.' })
      return
    }
    useMouseLook.setState({ error: '' })
    canvas.focus({ preventScroll: true })
    desired = pending = true
    const version = ++request
    try { Promise.resolve(canvas.requestPointerLock()).catch(() => fail(version)) }
    catch { fail(version) }
  }
  function changed() {
    if (locked()) {
      if (!desired || disposed || !canLock()) { release(); return }
      pending = false
      lastStep = 0
      useMouseLook.setState({ active: true, error: '' })
    } else {
      if (desired || pending || useMouseLook.getState().active) onManualRelease()
      release(); stop()
    }
  }
  const error = () => fail(request)
  function mousemove(event: MouseEvent) {
    if (!locked()) return
    if (!canLock()) { release(); stop(); return }
    const step = Math.hypot(event.movementX, event.movementY)
    if (!Number.isFinite(step)) return
    const spike = step > SPIKE_MIN && step > lastStep * SPIKE_RATIO
    lastStep = step
    if (spike) return
    move(event.movementX, event.movementY)
  }
  function keydown(event: KeyboardEvent) {
    if (event.code === 'Escape' && (locked() || pending)) {
      event.preventDefault(); onManualRelease(); release(); stop(); return
    }
    if (event.code === 'ControlLeft' || event.code === 'ControlRight') {
      if (event.repeat) return
      if (control) { chord = true; return }
      control = event.code
      chord = event.defaultPrevented || event.altKey || event.metaKey || event.shiftKey || event.isComposing || !canLock()
    } else if (control) chord = true
  }
  function keyup(event: KeyboardEvent) {
    if (event.code !== control) return
    const tap = !chord && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey
      && !event.defaultPrevented && !event.isComposing
    control = null
    if (tap) toggle()
  }
  const pointerdown = () => { if (control) chord = true }
  document.addEventListener('pointerlockchange', changed)
  document.addEventListener('pointerlockerror', error)
  document.addEventListener('mousemove', mousemove)
  window.addEventListener('keydown', keydown)
  window.addEventListener('keyup', keyup)
  window.addEventListener('pointerdown', pointerdown)
  window.addEventListener('ontap-toggle-mouse-look', toggle)
  // A return request after a visit must never switch off a lock that is still held.
  const resume = () => {
    if (locked() || pending) { mouseLookReturn.requested = false; return }
    toggle()
  }
  return { locked, release, resume, dispose() {
    disposed = true
    release()
    mouseLookReturn.requested = false
    useMouseLook.setState({ active: false, error: '' })
    document.removeEventListener('pointerlockchange', changed)
    document.removeEventListener('pointerlockerror', error)
    document.removeEventListener('mousemove', mousemove)
    window.removeEventListener('keydown', keydown)
    window.removeEventListener('keyup', keyup)
    window.removeEventListener('pointerdown', pointerdown)
    window.removeEventListener('ontap-toggle-mouse-look', toggle)
  } }
}
