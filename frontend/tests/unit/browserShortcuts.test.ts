import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { installBrowserShortcutGuard, isRestrictedBrowserShortcut } from '../../src/park/browserShortcuts'
import { installMouseLook } from '../../src/world/mouseLook'
import { cupMotion, installDiceControls, useDiceUI } from '../../src/game/farkle/controls'
import { parkRuntime } from '../../src/park/runtime/runtime'

type Flags = Partial<KeyboardEvent>
const event = (type: string, code: string, flags: Flags = {}, cancelable = true) =>
  Object.assign(new Event(type, { cancelable }), { code, key: code, ...flags }) as KeyboardEvent
const restricted: [string, Flags][] = [
  ['F12', {}], ['F12', { ctrlKey: true }], ['F12', { shiftKey: true }], ['F12', { metaKey: true }],
  ['KeyW', { ctrlKey: true }], ['KeyW', { ctrlKey: true, shiftKey: true }],
  ...['KeyI', 'KeyJ', 'KeyC'].map(code => [code, { ctrlKey: true, shiftKey: true }] as [string, Flags]),
]
const preserved: [string, Flags][] = [
  ['F11', {}], ['F5', {}], ['F5', { ctrlKey: true }], ['F5', { shiftKey: true }],
  ['KeyK', { ctrlKey: true, shiftKey: true }],
  ...['KeyI', 'KeyJ', 'KeyC'].flatMap(code => [
    [code, { ctrlKey: true }], [code, { shiftKey: true }],
    [code, { ctrlKey: true, shiftKey: true, altKey: true }],
    [code, { ctrlKey: true, shiftKey: true, metaKey: true }],
  ] as [string, Flags][]),
  ...['KeyI', 'KeyJ', 'KeyC', 'KeyK', 'KeyU'].map(code => [code, { metaKey: true, altKey: true }] as [string, Flags]),
  ...['KeyU', 'KeyS', 'KeyP', 'KeyR'].flatMap(code => [
    [code, { ctrlKey: true }], [code, { metaKey: true }], [code, { ctrlKey: true, shiftKey: true }],
  ] as [string, Flags][]),
  ...['Escape', 'F1', 'Tab', 'Enter', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyQ', 'KeyV', 'KeyG', 'Space', 'ControlLeft']
    .map(code => [code, {}] as [string, Flags]),
  ...['KeyA', 'KeyC', 'KeyV', 'KeyX', 'KeyZ', 'KeyY', 'KeyF', 'KeyL', 'KeyT', 'Equal', 'Minus', 'Digit0']
    .flatMap(code => [[code, { ctrlKey: true }], [code, { metaKey: true }]] as [string, Flags][]),
  ['KeyW', { metaKey: true }], ['KeyW', { ctrlKey: true, altKey: true }],
  ['ArrowLeft', { altKey: true }], ['KeyS', { ctrlKey: true, altKey: true }],
]

let win: EventTarget
let doc: EventTarget & { hidden: boolean }
let dispose: () => void
beforeEach(() => {
  win = new EventTarget()
  doc = Object.assign(new EventTarget(), { hidden: false })
  vi.stubGlobal('window', win); vi.stubGlobal('document', doc)
  dispose = installBrowserShortcutGuard()
})
afterEach(() => { dispose(); vi.unstubAllGlobals() })

it.each(restricted)('cancels restricted %s %j on down and up', (code, flags) => {
  const down = event('keydown', code, flags), up = event('keyup', code)
  expect(win.dispatchEvent(down)).toBe(false)
  expect(down.defaultPrevented).toBe(true)
  // Keyup is still cancelled if modifiers were released first.
  expect(win.dispatchEvent(up)).toBe(false)
})

it.each(preserved)('preserves game, editing, accessibility and browser exit key %s %j', (code, flags) => {
  expect(win.dispatchEvent(event('keydown', code, flags))).toBe(true)
  expect(win.dispatchEvent(event('keyup', code, flags))).toBe(true)
})

it('handles key fallback and non-Latin layouts while preserving composition and AltGraph', () => {
  expect(isRestrictedBrowserShortcut(event('keydown', '', { key: 'F12' }))).toBe(true)
  expect(isRestrictedBrowserShortcut(event('keydown', '', { key: 'i', ctrlKey: true, shiftKey: true }))).toBe(true)
  expect(isRestrictedBrowserShortcut(event('keydown', 'KeyI', { key: 'ㅑ', ctrlKey: true, shiftKey: true }))).toBe(true)
  expect(isRestrictedBrowserShortcut(event('keydown', 'KeyI', { ctrlKey: true, shiftKey: true, isComposing: true }))).toBe(false)
  expect(isRestrictedBrowserShortcut(event('keydown', 'KeyI', { ctrlKey: true, shiftKey: true, getModifierState: () => true }))).toBe(false)
  expect(isRestrictedBrowserShortcut(event('keydown', 'F12', { isComposing: true }))).toBe(false)
  expect(isRestrictedBrowserShortcut(event('keydown', 'F12', { getModifierState: () => true }))).toBe(false)
})

it('does not interrupt gameplay or stop propagation for refresh and other allowed shortcuts', () => {
  const interrupt = vi.fn(), downstream = vi.fn()
  win.addEventListener('ontop-browser-interrupt', interrupt)
  win.addEventListener('keydown', downstream)
  for (const [code, flags] of preserved) win.dispatchEvent(event('keydown', code, flags))
  expect(interrupt).not.toHaveBeenCalled()
  expect(downstream).toHaveBeenCalledTimes(preserved.length)
})

it('interrupts once for a held shortcut and never claims cancellation of a non-cancelable event', () => {
  const interrupt = vi.fn(); win.addEventListener('ontop-browser-interrupt', interrupt)
  const down = event('keydown', 'F12', {}, false)
  win.dispatchEvent(down)
  win.dispatchEvent(event('keydown', 'F12', { repeat: true }))
  expect(down.defaultPrevented).toBe(false)
  expect(interrupt).toHaveBeenCalledTimes(1)
})

it('clears transient controls on blur, hidden tab, pagehide and fullscreen change; removes all handlers', () => {
  const interrupt = vi.fn(); win.addEventListener('ontop-browser-interrupt', interrupt)
  doc.dispatchEvent(new Event('visibilitychange'))
  expect(interrupt).not.toHaveBeenCalled()
  doc.hidden = true
  doc.dispatchEvent(new Event('visibilitychange'))
  win.dispatchEvent(new Event('blur'))
  win.dispatchEvent(new Event('pagehide'))
  doc.dispatchEvent(new Event('fullscreenchange'))
  expect(interrupt).toHaveBeenCalledTimes(4)
  dispose(); interrupt.mockClear()
  win.dispatchEvent(event('keydown', 'F12'))
  win.dispatchEvent(new Event('blur')); win.dispatchEvent(new Event('pagehide'))
  doc.dispatchEvent(new Event('fullscreenchange')); doc.dispatchEvent(new Event('visibilitychange'))
  expect(interrupt).not.toHaveBeenCalled()
  // StrictMode's setup -> cleanup -> setup must still work.
  dispose = installBrowserShortcutGuard()
  expect(win.dispatchEvent(event('keydown', 'F12'))).toBe(false)
  expect(interrupt).toHaveBeenCalledTimes(1)
})

it.each(['F12', 'KeyI', 'KeyJ', 'KeyC'])('does not turn restricted %s into a standalone Ctrl mouse-look request', code => {
  const canvas = { focus: vi.fn(), requestPointerLock: vi.fn(() => Promise.resolve()) } as unknown as HTMLCanvasElement
  const mouse = installMouseLook(canvas, () => true, vi.fn(), vi.fn())
  const release = () => mouse.release()
  win.addEventListener('ontop-browser-interrupt', release)
  win.dispatchEvent(event('keydown', 'ControlLeft', { ctrlKey: true }))
  win.dispatchEvent(event('keydown', code, { ctrlKey: true, shiftKey: code !== 'F12' }))
  win.dispatchEvent(event('keyup', 'ControlLeft'))
  expect(canvas.requestPointerLock).not.toHaveBeenCalled()
  win.removeEventListener('ontop-browser-interrupt', release); mouse.dispose()
})

it('cancels a ready dice cup without submitting a game action and cleans up its interrupt handler', () => {
  const act = vi.spyOn(parkRuntime, 'actDice')
  const cleanup = installDiceControls()
  useDiceUI.setState({ cup: 'ready' }); cupMotion.lift = 1
  win.dispatchEvent(event('keydown', 'F12'))
  expect(useDiceUI.getState().cup).toBe('idle')
  expect(cupMotion.lift).toBe(0)
  expect(act).not.toHaveBeenCalled()
  cleanup()
  useDiceUI.setState({ cup: 'ready' })
  win.dispatchEvent(new Event('ontop-browser-interrupt'))
  expect(useDiceUI.getState().cup).toBe('ready')
  useDiceUI.setState({ cup: 'idle' }); act.mockRestore()
})
