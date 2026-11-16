import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useSession } from '../../network/worldClient'
import { canControlRoamingCamera } from '../../world/roamingCamera'
import { clearRoamingInput, inputState } from '../../world/inputOwnership'
import geomatePreview from './art/geomate-preview.webp'
import oneStoreIcon from './art/one-store-icon.webp'
import ontopPreview from './art/ontop-preview.webp'
import phoneboothPreview from './art/phonebooth-preview.webp'
import pickusPreview from './art/pickus-preview.webp'
import './advertisements.css'

export const PICKUS_LINK = 'https://www.instagram.com/pickus_magazine?obrf=emx2cGh4ZDI3MTIz&utm_source=qr'

const advertisements = [
  {
    title: 'PICKUS',
    team: '대전 F108',
    heading: '잠깐, 다른 공간으로 떠나볼까요?',
    introduction: '공원에서 발견한 다른 팀의 프로젝트를 소개합니다.',
    badge: '외부 팀 프로젝트',
    description: ['PICKUS의 다양한 소식을', '인스타그램에서 확인해 보세요.'],
    image: pickusPreview,
    alt: '한옥 공원에서 사진을 찍는 두 캐릭터와 PICKUS 사진 화면',
    link: PICKUS_LINK,
    action: '인스타그램 방문',
    notice: '온탑 외부 페이지로 이동합니다.',
    instagram: '@pickus_magazine',
  },
  {
    title: 'ONTOP',
    team: '대전 B105',
    heading: '친구와 온탑 공원에서 만나요!',
    introduction: '한옥과 호숫가를 거닐며 함께 즐길 게임을 찾아보세요.',
    badge: '온탑 게임 소개',
    description: ['돌탑을 쌓고, 공원을 산책하고,', '친구와 온탑에서 놀아 보세요.'],
    image: ontopPreview,
    alt: '한옥 정자 옆에서 두 캐릭터가 돌탑을 쌓는 온탑 홍보 일러스트',
    link: 'https://www.on-top.world/',
    action: '온탑 홈페이지',
    notice: '온탑 홈페이지로 이동합니다.',
  },
  {
    title: 'Geomate(지오메이트)',
    team: '구미 D103',
    heading: '도형을 직접 움직여 볼까요?',
    introduction: '공원에서 발견한 다른 팀의 프로젝트를 소개합니다.',
    badge: '외부 팀 프로젝트',
    description: ['도형을 직접 돌리고 펼치고 잘라 보며 스스로 이해하는 초등·중학 도형 학습 앱'],
    image: geomatePreview,
    alt: '도형 공부의 시작, 지오메이트. 한옥 공원에서 두 온탑 캐릭터가 입체도형과 전개도를 살펴보고, 다섯 마스코트 뒤로 지오메이트 앱 화면이 보이는 그림',
    artworkMat: 'cool',
    link: 'https://m.onestore.co.kr/v2/ko-kr/app/0001012470',
    action: '원스토어 방문',
    actionIcon: oneStoreIcon,
    notice: '온탑 외부 페이지로 이동합니다.',
  },
  {
    title: 'PHONEBOOTH',
    team: '부울경 E107',
    heading: '전화부스에서 함께 탈출해 보세요',
    introduction: '1–4인 협동 공포 탈출 게임',
    badge: '외부 팀 프로젝트',
    description: [
      '※싸피 최초의 고화질 3D 1인칭 공포게임! ! !※',
      '※겁쟁이 팀원들과 함께 괴물을 피해 탈출해보세요※',
    ],
    image: phoneboothPreview,
    alt: '붉은 전화부스 앞에서 괴물을 피하는 온탑 캐릭터 네 명. 신규 괴물, 난이도 하향, 빠른 대전, 랭킹 이벤트와 배달의민족 상품권을 안내하는 PHONEBOOTH 포스터',
    artworkMat: 'warm',
    link: 'https://k15e107.p.ssafy.io/',
    action: '게임 사이트 방문',
    notice: '온탑 외부 페이지로 이동합니다.',
  },
]

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

function AdvertisementArrow({ direction, onClick }: { direction: -1 | 1; onClick: () => void }) {
  return <button type="button" className="park-advertisement-arrow" onClick={onClick}
    aria-label={direction === -1 ? '이전 광고' : '다음 광고'} aria-controls="advertisement-link-project">
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d={direction === -1 ? 'm15 5-7 7 7 7' : 'm9 5 7 7-7 7'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </button>
}

export function AdvertisementLink() {
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState(0)
  const advertisement = advertisements[page]
  const turnPage = (step: -1 | 1) => setPage(current => (current + step + advertisements.length) % advertisements.length)
  const dialog = useRef<HTMLDialogElement>(null), previousFocus = useRef<HTMLElement | null>(null)
  const stayButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const show = () => {
      if (inputState.advertisementOpen || !canControlRoamingCamera()) return
      previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      inputState.advertisementOpen = true
      clearRoamingInput()
      setPage(0)
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
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        if (!event.repeat) turnPage(event.key === 'ArrowLeft' ? -1 : 1)
        return
      }
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
        <h2 id="advertisement-link-title">{advertisement.heading}</h2>
        <p id="advertisement-link-description">{advertisement.introduction}</p>
      </header>
      <div className="park-advertisement-carousel">
        <AdvertisementArrow direction={-1} onClick={() => turnPage(-1)} />
        <section id="advertisement-link-project"
          className={`park-advertisement-project${advertisement.artworkMat ? ' park-advertisement-project--framed' : ''}`}
          data-artwork-mat={advertisement.artworkMat}
          aria-labelledby="advertisement-project-name">
          <FrameCorners />
          <img className="park-advertisement-preview" src={advertisement.image} alt={advertisement.alt} width="1280" height="720" />
          <div className="park-advertisement-details">
            <div className="park-advertisement-badges">
              <span className="park-advertisement-badge">{advertisement.badge}</span>
              <span className="park-advertisement-badge park-advertisement-badge--team">{advertisement.team}</span>
            </div>
            <h3 id="advertisement-project-name">{advertisement.title}</h3>
            <p>{advertisement.description[0]}{advertisement.description[1] && <><br />{advertisement.description[1]}</>}</p>
            {advertisement.instagram && <>
              <div className="park-advertisement-divider"><Ornament /></div>
              <div className="park-advertisement-social"><InstagramIcon /><div><strong>Instagram</strong><span>{advertisement.instagram}</span></div></div>
            </>}
          </div>
        </section>
        <AdvertisementArrow direction={1} onClick={() => turnPage(1)} />
        <div className="park-advertisement-page" role="status"><span className="park-advertisement-page-title">{advertisement.title}: </span>{page + 1} / {advertisements.length}</div>
      </div>
      <footer className="park-advertisement-footer">
        <p className="park-advertisement-notice" id="advertisement-link-notice"><span aria-hidden="true">!</span><span>{advertisement.notice} 링크는 새 탭에서 열리며,<br className="park-advertisement-notice-break" /> 온탑 게임은 그대로 유지됩니다.</span></p>
        <div className="park-advertisement-actions">
          <button ref={stayButton} type="button" autoFocus onClick={() => setOpen(false)}><FrameCorners />공원에 남기</button>
          <a href={advertisement.link} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
            <FrameCorners />
            {advertisement.actionIcon && <img className="park-advertisement-action-icon" src={advertisement.actionIcon} alt="" width="32" height="32" />}
            {advertisement.action}
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 19 19 5M6 5h13v13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </a>
        </div>
      </footer>
    </div>
  </dialog>
}
