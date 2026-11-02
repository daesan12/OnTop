/** Best-effort cancellation of page-delivered shortcuts, never a security boundary. */
export function isRestrictedBrowserShortcut(event: KeyboardEvent, firefox = false): boolean {
  if (event.isComposing || event.getModifierState?.('AltGraph')) return false
  const code = event.code || (event.key.length === 1 ? `Key${event.key.toUpperCase()}` : event.key)
  if (code === 'F12') return true
  const { ctrlKey: ctrl, metaKey: cmd, altKey: alt, shiftKey: shift } = event
  if (ctrl && !cmd) {
    if (!alt && (code === 'KeyW' || !shift && ['KeyU', 'F4'].includes(code))) return true
    if (shift && !alt && ['KeyI', 'KeyJ', 'KeyC'].includes(code)) return true
    if (firefox && shift && (code === 'KeyI' && alt || !alt && ['KeyK', 'KeyE', 'KeyM', 'KeyZ'].includes(code))) return true
  }
  if (cmd && !ctrl) {
    if (!alt && (code === 'KeyW' || shift && code === 'KeyC')) return true
    if (firefox && !alt && !shift && code === 'KeyU') return true
    if (alt && !shift && ['KeyI', 'KeyJ', 'KeyC', 'KeyU'].includes(code)) return true
    if (firefox && alt && (shift && code === 'KeyI' || !shift && ['KeyK', 'KeyE', 'KeyM', 'KeyZ'].includes(code))) return true
  }
  // Firefox-only tool keys: do not break Chrome/Edge hard refresh or text redo.
  return firefox && shift && !ctrl && !cmd && !alt && ['F5', 'F7', 'F9'].includes(code)
}

/** Install before the game's passive effects, including modal capture handlers. */
export function installBrowserShortcutGuard(): () => void {
  // Select extra browser shortcuts once; UA detection is convenience, not enforcement.
  const firefox = /Firefox\//i.test(navigator.userAgent)
  const suppressed = new Set<string>()
  const capture = { capture: true }
  const interrupt = () => window.dispatchEvent(new Event('ontop-browser-interrupt'))
  const down = (event: KeyboardEvent) => {
    if (!isRestrictedBrowserShortcut(event, firefox)) return
    if (event.cancelable) event.preventDefault()
    event.stopImmediatePropagation()
    const key = event.code || event.key
    const first = !suppressed.has(key)
    suppressed.add(key)
    // Also clears the Ctrl-tap candidate: a blocked Ctrl chord must not toggle mouse look.
    // Holding W before pressing Ctrl produces a repeat; it still needs one interruption.
    if (first) interrupt()
  }
  const up = (event: KeyboardEvent) => {
    if (!suppressed.delete(event.code || event.key)) return
    if (event.cancelable) event.preventDefault()
    event.stopImmediatePropagation()
  }
  const leave = () => { suppressed.clear(); interrupt() }
  const beforeUnload = (event: BeforeUnloadEvent) => {
    // Browser-owned close shortcuts may never deliver a keydown to the page.
    // Clear held input even when the player cancels the browser's leave dialog.
    leave()
    event.preventDefault()
    event.returnValue = 'true' // Legacy browsers; the browser supplies the dialog text.
  }
  const visibility = () => { if (document.hidden) leave() }
  window.addEventListener('keydown', down, capture)
  window.addEventListener('keyup', up, capture)
  window.addEventListener('blur', leave)
  window.addEventListener('beforeunload', beforeUnload)
  window.addEventListener('pagehide', leave)
  document.addEventListener('visibilitychange', visibility)
  // Includes a native exit from DOM fullscreen. Browser F11 fullscreen may only resize.
  document.addEventListener('fullscreenchange', leave)
  return () => {
    suppressed.clear()
    window.removeEventListener('keydown', down, capture)
    window.removeEventListener('keyup', up, capture)
    window.removeEventListener('blur', leave)
    window.removeEventListener('beforeunload', beforeUnload)
    window.removeEventListener('pagehide', leave)
    document.removeEventListener('visibilitychange', visibility)
    document.removeEventListener('fullscreenchange', leave)
  }
}
