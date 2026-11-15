import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useSession } from '../../network/worldClient'
import { canControlRoamingCamera } from '../../world/roamingCamera'
import { clearRoamingInput, inputState } from '../../world/inputOwnership'
import pickusPreview from './art/pickus-preview.webp'
import './advertisements.css'

// The original prototype's approved PICKUS destination; other ads have no inferred URL.
export const PICKUS_LINK = 'https://www.instagram.com/pickus_magazine?obrf=emx2cGh4ZDI3MTIz&utm_source=qr'

function Ornament({ className = '' }: { className?: string }) {
  return <svg className={className} viewBox="0 0 40 40" fill="none" aria-hidden="true">
    <path d="m20 3 7 7-7 7-7-7 7-7Zm0 20 7 7-7 7-7-7 7-7ZM3 20l7-7 7 7-7 7-7-7Zm20 0 7-7 7 7-7 7-7-7Z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
    <path d="M16 16h8v8h-8z" stroke="currentColor" strokeWidth="2" transform="rotate(45 20 20)" />
  </svg>
}

function FrameCorners() {
  return <span className="park-advertisement-corners" aria-hidden="true">{[0, 1, 2, 3].map(corner =>
    <svg key={corner} viewBox="0 0 32 32" fill="none"><path d="M3 27V14C3 7 7 3 14 3h13M9 27v-8c0-6 4-10 10-10h8M4 18h7M18 4v7" stroke="currentColor" strokeWidth="1.4" /><path d="m18 18 4-4 4 4-4 4-4-4Z" fill="currentColor" /></svg>,
  )}</span>
}

function InstagramIcon() {
  return <span className="park-advertisement-instagram-icon" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none">
    <rect x="7" y="7" width="34" height="34" rx="10" stroke="currentColor" strokeWidth="3.5" />
    <circle cx="24" cy="24" r="8" stroke="currentColor" strokeWidth="3.5" /><circle cx="34.5" cy="13.5" r="2.3" fill="currentColor" />
  </svg></span>
}

export function AdvertisementLink() {
  const [open, setOpen] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null), previousFocus = useRef<HTMLElement | null>(null)
  const stayButton = useRef<HTMLButtonElement>(null)
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
    stayButton.current?.focus({ preventScroll: true })
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
  return <dialog ref={dialog} className="park-advertisement-dialog" aria-labelledby="advertisement-link-title" aria-describedby="advertisement-link-description advertisement-link-notice"
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
    <div className="park-advertisement-sheet">
      <FrameCorners />
      <svg className="park-advertisement-tassel" viewBox="0 0 50 155" fill="none" aria-hidden="true">
        <path d="M25 0v43" stroke="#89936a" strokeWidth="2" /><circle cx="25" cy="48" r="11" fill="#a69b53" stroke="#797c4e" strokeWidth="2" />
        <path d="M19 60h12v8H19z" fill="#b5a263" /><path d="M17 69Q25 61 33 69l10 74q-18 11-36 0l10-74Z" fill="#526f45" stroke="#7a8e56" strokeWidth="2" />
        <path d="m20 72-7 70m12-73v77m5-74 7 70" stroke="#a1ad6d" strokeWidth="1.5" opacity=".65" />
      </svg>
      <header className="park-advertisement-header">
        <div className="park-advertisement-eyebrow"><Ornament /> <span>ONTOP · 공원 광고</span></div>
        <button className="park-advertisement-close" type="button" aria-label="광고 안내 닫기" onClick={() => setOpen(false)}>
          <svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="m5 5 22 22M27 5 5 27" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /></svg>
        </button>
        <h2 id="advertisement-link-title">잠깐, 다른 공간으로 떠나볼까요?</h2>
        <p id="advertisement-link-description">공원에서 발견한 다른 팀의 프로젝트를 소개합니다.</p>
      </header>
      <section className="park-advertisement-project" aria-label="PICKUS 프로젝트 소개">
        <FrameCorners />
        <img className="park-advertisement-preview" src={pickusPreview} alt="한옥 공원에서 사진을 찍는 두 캐릭터와 PICKUS 사진 화면" width="1280" height="720" />
        <div className="park-advertisement-details">
          <span className="park-advertisement-badge">외부 팀 프로젝트</span>
          <h3>PICKUS</h3>
          <p>PICKUS의 다양한 소식을<br />인스타그램에서 확인해 보세요.</p>
          <div className="park-advertisement-divider"><Ornament /></div>
          <div className="park-advertisement-social"><InstagramIcon /><div><strong>Instagram</strong><span>@pickus_magazine</span></div></div>
        </div>
      </section>
      <footer className="park-advertisement-footer">
        <p className="park-advertisement-notice" id="advertisement-link-notice"><span aria-hidden="true">!</span><span>온탑 외부 페이지로 이동합니다. 링크는 새 탭에서 열리며,<br className="park-advertisement-notice-break" /> 온탑 게임은 그대로 유지됩니다.</span></p>
        <div className="park-advertisement-actions">
          <button ref={stayButton} type="button" autoFocus onClick={() => setOpen(false)}><FrameCorners />공원에 남기</button>
          <a href={PICKUS_LINK} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}><FrameCorners />인스타그램 방문 <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 19 19 5M6 5h13v13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></a>
        </div>
      </footer>
    </div>
  </dialog>
}
