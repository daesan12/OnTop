import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useSession } from '../../network/worldClient'
import { canControlRoamingCamera } from '../../world/roamingCamera'
import { clearRoamingInput, inputState } from '../../world/inputOwnership'
import './advertisements.css'

// The original prototype's approved PICKUS destination; other ads have no inferred URL.
export const PICKUS_LINK = 'https://www.instagram.com/pickus_magazine?obrf=emx2cGh4ZDI3MTIz&utm_source=qr'

export function AdvertisementLink() {
  const [open, setOpen] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null), previousFocus = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const show = () => {
      if (inputState.advertisementOpen || !canControlRoamingCamera()) return
      previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      inputState.advertisementOpen = true
      clearRoamingInput()
      setOpen(true)
    }
    const close = () => {
      if (!inputState.advertisementOpen) return
      inputState.advertisementOpen = false
      clearRoamingInput()
      setOpen(false)
    }
    const unsubscribe = useSession.subscribe((s, old) => {
      if (s.status !== 'connected' || s.sessionId !== old.sessionId || s.roomId !== old.roomId) close()
    })
    window.addEventListener('ontap-open-pickus', show)
    window.addEventListener('ontop-manual-open', close)
    return () => {
      unsubscribe()
      window.removeEventListener('ontap-open-pickus', show)
      window.removeEventListener('ontop-manual-open', close)
      inputState.advertisementOpen = false
      clearRoamingInput()
    }
  }, [])
  useLayoutEffect(() => {
    if (!open || !dialog.current) return
    const element = dialog.current, overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    element.showModal()
    return () => {
      element.close()
      document.body.style.overflow = overflow
      inputState.advertisementOpen = false
      clearRoamingInput()
      if (!inputState.manualOpen && useSession.getState().status === 'connected') {
        (previousFocus.current?.isConnected ? previousFocus.current : document.querySelector<HTMLCanvasElement>('canvas'))?.focus({ preventScroll: true })
      }
    }
  }, [open])
  if (!open) return null
  return <dialog ref={dialog} className="park-advertisement-dialog" aria-labelledby="advertisement-link-title"
    onCancel={event => { event.preventDefault(); setOpen(false) }}
    onClose={() => { if (!dialog.current?.open) setOpen(false) }}
    onKeyDown={event => {
      event.stopPropagation()
      if (event.key !== 'Tab') return
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button,a[href]')]
      const first = controls[0], last = controls.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }}>
    <small>공원 광고 · PICKUS</small>
    <h2 id="advertisement-link-title">광고 페이지로 이동합니다</h2>
    <p>PICKUS 인스타그램 페이지가 새 탭에서 열립니다.</p>
    <div className="park-advertisement-actions">
      <button type="button" autoFocus onClick={() => setOpen(false)}>취소</button>
      <a href={PICKUS_LINK} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>광고 보러 가기 ↗</a>
    </div>
  </dialog>
}
