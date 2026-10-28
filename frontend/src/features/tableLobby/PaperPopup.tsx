import { useEffect, useRef, type ReactNode } from 'react'
import './paperPopup.css'

export function PaperPopup({ title, label, onClose, children, className = '', closeLabel = '결과 창 닫기' }: {
  title: string; label: string; onClose: () => void; children: ReactNode; className?: string; closeLabel?: string
}) {
  const dialog = useRef<HTMLDivElement>(null), close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (document.pointerLockElement) document.exitPointerLock()
    dialog.current?.focus({ preventScroll: true })
    // Async dialogs can remove the focused load-more button. Escape must still close the top popup.
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.repeat || event.isComposing) return
      const dialogs = document.querySelectorAll('dialog[open],[role="dialog"],[role="alertdialog"]')
      if (dialogs[dialogs.length - 1] !== dialog.current) return
      event.preventDefault(); event.stopPropagation(); close.current()
    }
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('keydown', key); if (previous?.isConnected) previous.focus({ preventScroll: true }) }
  }, [])
  return <div className="table-paper-backdrop"><div ref={dialog} className={`table-paper-popup ${className}`}
    role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} onKeyDown={event => {
      if (event.key === 'Escape') { event.stopPropagation(); event.preventDefault(); if (!event.repeat && !event.nativeEvent.isComposing) close.current(); return }
      if (event.key !== 'Tab') return
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),a[href],summary')].filter(e => e.getClientRects().length)
      const first = controls[0], last = controls.at(-1)
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }}>
    <button className="paper-close" aria-label={closeLabel} onClick={onClose}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M5 5L19 19M19 5L5 19" /></svg></button>
    <p className="paper-caption">{title}</p>{children}
  </div></div>
}
export function ResultTrophy() {
  return <svg className="paper-trophy" viewBox="0 0 90 80" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="3">
    <path d="M28 10h34v14c0 19-9 24-17 24S28 43 28 24V10ZM28 15H15v7c0 12 6 18 17 18M62 15h13v7c0 12-6 18-17 18M45 48v15M33 69v-6h24v6M23 73h44" />
    <path d="M12 43c-6 12-1 20 10 26M78 43c6 12 1 20-10 26" strokeWidth="2" />
  </svg>
}
