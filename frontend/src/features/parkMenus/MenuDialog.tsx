import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { inputState } from '../../world/inputOwnership'

/** Modal card for the park menus; owns keys like the feedback dialog so world shortcuts never fire behind it. */
export function MenuDialog({ label, className, backdropClassName = '', onClose, children }: {
  label: string
  className: string
  backdropClassName?: string
  onClose: () => void
  children: ReactNode
}) {
  const card = useRef<HTMLElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    card.current?.querySelector<HTMLElement>('[data-autofocus], input, button:not(:disabled)')?.focus({ preventScroll: true })
    const keys = (event: KeyboardEvent) => {
      // The native F1 dialog owns keys until its closing animation finishes.
      if (inputState.manualOpen || event.code === 'F1') return
      if (event.isComposing || event.keyCode === 229) return
      if (event.code === 'Escape') { event.preventDefault(); close.current() }
      if (event.code === 'Tab') {
        event.preventDefault()
        const controls = [...(card.current?.querySelectorAll<HTMLElement>('input:not(:disabled),button:not(:disabled)') ?? [])]
          .filter(control => !control.closest('[inert]'))
        const index = controls.indexOf(document.activeElement as HTMLElement)
        controls[(index + (event.shiftKey ? controls.length - 1 : 1)) % controls.length]?.focus()
      }
      event.stopImmediatePropagation()
    }
    window.addEventListener('keydown', keys, true)
    return () => {
      window.removeEventListener('keydown', keys, true)
      if (previous?.isConnected) previous.focus({ preventScroll: true })
    }
  }, [])
  // The HUD corners are CSS-scaled, which would trap a fixed backdrop inside them.
  return createPortal(<div className={`park-menu-backdrop ${backdropClassName}`} onPointerDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section ref={card} className={`park-menu-dialog ${className}`} role="dialog" aria-modal="true" aria-label={label}>
      {children}
    </section>
  </div>, document.body)
}
