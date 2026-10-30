import { useEffect, useRef } from 'react'
import { panelOwnsKeys } from '../../world/inputOwnership'

/** Captures right-click before seated camera dragging or avatar context menus. */
export function useHammerShortcut(enabled: boolean, toggle: () => void) {
  const action = useRef(toggle); action.current = toggle
  useEffect(() => {
    if (!enabled) return
    const accepts = (event: MouseEvent | PointerEvent) => !event.ctrlKey && !event.altKey && !event.metaKey && !document.hidden
      && !panelOwnsKeys() && event.target instanceof Element
      && !event.target.closest('input,textarea,select,[contenteditable="true"],dialog,[role="dialog"],.park-chat,.park-runtime-status')
    const down = (event: PointerEvent) => {
      if (event.button !== 2 || !accepts(event)) return
      event.preventDefault(); event.stopImmediatePropagation(); action.current()
    }
    const context = (event: MouseEvent) => {
      if (accepts(event)) { event.preventDefault(); event.stopImmediatePropagation() }
    }
    window.addEventListener('pointerdown', down, true); window.addEventListener('contextmenu', context, true)
    return () => { window.removeEventListener('pointerdown', down, true); window.removeEventListener('contextmenu', context, true) }
  }, [enabled])
}
