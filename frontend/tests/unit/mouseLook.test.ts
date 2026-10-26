import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { installMouseLook, useMouseLook } from '../../src/world/mouseLook'

let doc: EventTarget & { pointerLockElement: unknown; exitPointerLock: ReturnType<typeof vi.fn> }
let win: EventTarget
let canvas: HTMLCanvasElement
let canLock: boolean
let controls: ReturnType<typeof installMouseLook>
const stop = vi.fn(), move = vi.fn()
const key = (type: string, code: string, flags = {}) => {
  const event = Object.assign(new Event(type, { cancelable: true }), { code, ...flags })
  win.dispatchEvent(event)
}
function acquire() { doc.pointerLockElement = canvas; doc.dispatchEvent(new Event('pointerlockchange')) }
beforeEach(() => {
  doc = Object.assign(new EventTarget(), { pointerLockElement: null as unknown, exitPointerLock: vi.fn(() => { doc.pointerLockElement = null }) })
  win = new EventTarget()
  vi.stubGlobal('document', doc); vi.stubGlobal('window', win)
  canvas = { focus: vi.fn(), requestPointerLock: vi.fn(() => Promise.resolve()) } as unknown as HTMLCanvasElement
  canLock = true
  useMouseLook.setState({ active: false, error: '' }); stop.mockClear(); move.mockClear()
  controls = installMouseLook(canvas, () => canLock, move, stop)
})
afterEach(() => { controls.dispose(); vi.unstubAllGlobals() })

it('uses a standalone Ctrl tap, leaving Ctrl shortcuts and composing input alone', () => {
  key('keydown', 'ControlLeft', { ctrlKey: true }); key('keydown', 'KeyC', { ctrlKey: true }); key('keyup', 'ControlLeft')
  key('keydown', 'ControlLeft', { ctrlKey: true, isComposing: true }); key('keyup', 'ControlLeft')
  expect(canvas.requestPointerLock).not.toHaveBeenCalled()
  key('keydown', 'ControlRight', { ctrlKey: true }); key('keyup', 'ControlRight')
  expect(canvas.requestPointerLock).toHaveBeenCalledTimes(1)
  acquire(); expect(useMouseLook.getState().active).toBe(true)
  doc.dispatchEvent(Object.assign(new Event('mousemove'), { movementX: 8, movementY: -3 }))
  expect(move).toHaveBeenCalledWith(8, -3)
})

it('rejects a late native grant after a modal cancels a pending request', () => {
  win.dispatchEvent(new Event('ontap-toggle-mouse-look'))
  controls.release(); canLock = false
  acquire()
  expect(doc.exitPointerLock).toHaveBeenCalled()
  expect(useMouseLook.getState().active).toBe(false)
  expect(move).not.toHaveBeenCalled()
})

it('lets Esc cancel an in-flight request and never reacquires automatically', () => {
  win.dispatchEvent(new Event('ontap-toggle-mouse-look'))
  key('keydown', 'Escape'); acquire()
  expect(useMouseLook.getState().active).toBe(false)
  expect(stop).toHaveBeenCalled()
  expect(canvas.requestPointerLock).toHaveBeenCalledTimes(1)
})

it('reports permission rejection and retries only on an explicit new action', async () => {
  vi.mocked(canvas.requestPointerLock).mockRejectedValueOnce(new Error('denied'))
  win.dispatchEvent(new Event('ontap-toggle-mouse-look'))
  await Promise.resolve()
  expect(useMouseLook.getState().error).toContain('고정하지 못했어요')
  expect(useMouseLook.getState().active).toBe(false)
  win.dispatchEvent(new Event('ontap-toggle-mouse-look')); acquire()
  expect(useMouseLook.getState()).toEqual({ active: true, error: '' })
})

const moveBy = (movementX: number, movementY = 0) =>
  doc.dispatchEvent(Object.assign(new Event('mousemove'), { movementX, movementY }))

it('drops a lone huge jump but keeps a real fast swipe after its first step', () => {
  win.dispatchEvent(new Event('ontap-toggle-mouse-look')); acquire()
  moveBy(900)
  moveBy(6, 2)
  moveBy(-1200, 300)
  moveBy(-5)
  expect(move.mock.calls).toEqual([[6, 2], [-5, 0]])

  move.mockClear()
  moveBy(40); moveBy(250); moveBy(260); moveBy(300); moveBy(120)
  expect(move.mock.calls.map(([x]) => x)).toEqual([40, 260, 300, 120])
})

it('resets the jump guard every time the lock starts again', () => {
  win.dispatchEvent(new Event('ontap-toggle-mouse-look')); acquire()
  moveBy(150); moveBy(180)
  doc.pointerLockElement = null; doc.dispatchEvent(new Event('pointerlockchange'))
  move.mockClear()
  win.dispatchEvent(new Event('ontap-toggle-mouse-look')); acquire()
  moveBy(500)
  moveBy(8)
  expect(move.mock.calls).toEqual([[8, 0]])
})

it('releases on invalid ownership and removes handlers on teardown', () => {
  win.dispatchEvent(new Event('ontap-toggle-mouse-look')); acquire()
  canLock = false
  doc.dispatchEvent(Object.assign(new Event('mousemove'), { movementX: 20, movementY: 5 }))
  expect(move).not.toHaveBeenCalled()
  expect(useMouseLook.getState().active).toBe(false)
  controls.dispose(); canLock = true
  win.dispatchEvent(new Event('ontap-toggle-mouse-look'))
  expect(canvas.requestPointerLock).toHaveBeenCalledTimes(1)
})

it('distinguishes a programmatic pause from an explicit native unlock and supports a one-shot resume', () => {
  controls.dispose()
  const manual = vi.fn()
  controls = installMouseLook(canvas, () => canLock, move, stop, manual)
  controls.resume(); acquire()
  controls.release(); doc.dispatchEvent(new Event('pointerlockchange'))
  expect(manual).not.toHaveBeenCalled()
  controls.resume(); acquire()
  expect(useMouseLook.getState().active).toBe(true)
  doc.pointerLockElement = null; doc.dispatchEvent(new Event('pointerlockchange'))
  expect(manual).toHaveBeenCalledTimes(1)
  expect(useMouseLook.getState().active).toBe(false)
})
