/** Guard only F12 and Ctrl+Shift+I/J/C; preserve refresh and other browser shortcuts. */
export function isRestrictedBrowserShortcut(event: KeyboardEvent): boolean {
  if (event.isComposing || event.getModifierState?.('AltGraph')) return false
  const code = event.code || (event.key.length === 1 ? `Key${event.key.toUpperCase()}` : event.key)
  return code === 'F12' || (event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey
    && ['KeyI', 'KeyJ', 'KeyC'].includes(code))
}

/** Install before the game's passive effects, including modal capture handlers. */
export function installBrowserShortcutGuard(): () => void {
  const suppressed = new Set<string>()
  const capture = { capture: true }
  const interrupt = () => window.dispatchEvent(new Event('ontop-browser-interrupt'))
  const down = (event: KeyboardEvent) => {
    if (!isRestrictedBrowserShortcut(event)) return
    if (event.cancelable) event.preventDefault()
    event.stopImmediatePropagation()
    suppressed.add(event.code || event.key)
    // Also clears the Ctrl-tap candidate: a blocked Ctrl chord must not toggle mouse look.
    if (!event.repeat) interrupt()
  }
  const up = (event: KeyboardEvent) => {
    if (!suppressed.delete(event.code || event.key)) return
    if (event.cancelable) event.preventDefault()
    event.stopImmediatePropagation()
  }
  const leave = () => { suppressed.clear(); interrupt() }
  const visibility = () => { if (document.hidden) leave() }
  window.addEventListener('keydown', down, capture)
  window.addEventListener('keyup', up, capture)
  window.addEventListener('blur', leave)
  window.addEventListener('pagehide', leave)
  document.addEventListener('visibilitychange', visibility)
  // Includes a native exit from DOM fullscreen. Browser F11 fullscreen may only resize.
  document.addEventListener('fullscreenchange', leave)
  return () => {
    suppressed.clear()
    window.removeEventListener('keydown', down, capture)
    window.removeEventListener('keyup', up, capture)
    window.removeEventListener('blur', leave)
    window.removeEventListener('pagehide', leave)
    document.removeEventListener('visibilitychange', visibility)
    document.removeEventListener('fullscreenchange', leave)
  }
}
