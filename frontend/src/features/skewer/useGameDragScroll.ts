import { useEffect } from 'react'
import './gameScroll.css'

/** Drag only scrollable game panels; never steal food, camera or button gestures. */
export function useGameDragScroll(selector: string, enabled = true) {
  useEffect(() => {
    if (!enabled) return
    const root = document.querySelector<HTMLElement>(selector)
    if (!root) return
    let drag: { element: HTMLElement; pointer: number; y: number; top: number; moved: boolean } | undefined
    let suppressClickUntil = 0
    const end = () => {
      if (drag?.moved) suppressClickUntil = performance.now() + 100
      drag?.element.classList.remove('skewer-dragging')
      if (drag?.element.hasPointerCapture(drag.pointer)) drag.element.releasePointerCapture(drag.pointer)
      drag = undefined
    }
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || event.pointerType !== 'mouse' || !(event.target instanceof HTMLElement)
        || event.target.closest('button,a,input,select,textarea,summary,[contenteditable=true],canvas')) return
      let node: HTMLElement | null = event.target
      while (node && root.contains(node)) {
        if (node.scrollHeight > node.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(node).overflowY)) {
          drag = { element: node, pointer: event.pointerId, y: event.clientY, top: node.scrollTop, moved: false }
          return
        }
        node = node.parentElement
      }
    }
    const move = (event: PointerEvent) => {
      if (!drag || drag.pointer !== event.pointerId) return
      if (!drag.moved && Math.abs(event.clientY - drag.y) < 6) return
      drag.moved = true
      drag.element.classList.add('skewer-dragging')
      drag.element.setPointerCapture(event.pointerId)
      drag.element.scrollTop = drag.top + drag.y - event.clientY
      event.preventDefault()
    }
    const click = (event: MouseEvent) => {
      if (performance.now() < suppressClickUntil) { event.preventDefault(); event.stopPropagation() }
    }
    root.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    window.addEventListener('blur', end)
    root.addEventListener('click', click, true)
    return () => {
      end()
      root.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      window.removeEventListener('blur', end)
      root.removeEventListener('click', click, true)
    }
  }, [selector, enabled])
}
