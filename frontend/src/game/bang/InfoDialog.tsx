import { useLayoutEffect, useId, useRef, type ReactNode } from 'react'

/** Native dialog가 배경 입력을 막고 Tab 이동과 닫은 뒤 포커스 복원을 담당한다. */
export function InfoDialog({ title, onClose, children }: { title: string; onClose(): void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null), titleId = useId()
  useLayoutEffect(() => {
    const element = dialog.current
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    element?.showModal()
    return () => { element?.close(); if (previous?.isConnected) previous.focus({ preventScroll: true }) }
  }, [])
  return <dialog ref={dialog} className="bang-dialog" aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onClose() }}
    onClick={event => { if (event.target === event.currentTarget) {
      const rect = event.currentTarget.getBoundingClientRect()
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose()
    } }}>
    <header className="bang-dialog-heading"><h2 id={titleId}>{title}</h2><button onClick={onClose}>닫기</button></header>
    <div className="bang-dialog-content">{children}</div>
  </dialog>
}
