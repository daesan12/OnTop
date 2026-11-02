import { useEffect, useState } from 'react'
import { avatars, useSession } from '../../network/worldClient'
import { inputState } from '../../world/inputOwnership'
import { useManual } from '../manual/manualState'
import { useNavigation } from '../navigation/navigationState'
import { flightCaption, WELCOME_FLIGHT_MS, welcomeFlight } from './flight'
import {
  beginWelcomeFlight, endWelcomeTour, finishWelcomeFlight, noteTourAction, noteTourWalk, setTourCollapsed,
  takeReplayAfterManual, useWelcomeTour, welcomeReady,
} from './state'
import { takeWelcomeTour } from './pending'
import { currentStep, TOUR_STEPS, TOUR_WALK_GOAL, walkedDistance } from './steps'
import './welcomeTour.css'

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
/** 완료 카드는 옷장 위치를 알려 준 뒤 스스로 닫힌다. */
const FINISHED_MS = 12000

/** 첫 입장 환영 비행과 공원 체험 투어. 투어 목록은 대화상자가 아니라서 걷기와 시점 조작을 막지 않는다. */
export function WelcomeTour() {
  const phase = useWelcomeTour(s => s.phase)
  useEffect(() => {
    let last: { x: number; z: number } | null = null
    // 길 안내·미니게임·테이블은 기존 상태가 새로 켜지는 순간만 센다(투어 전부터 켜져 있던 것은 제외).
    let seen = { navigate: false, minigame: false, table: false }
    const timer = window.setInterval(() => {
      if (welcomeReady() && takeWelcomeTour()) beginWelcomeFlight(reducedMotion())
      const state = useWelcomeTour.getState(), session = useSession.getState(), avatar = avatars.get(session.sessionId)
      const now = { navigate: !!useNavigation.getState().target, minigame: inputState.minigameOpen,
        table: !!(session.tableId || session.watchedTableId) }
      if (state.phase !== 'tour' || !avatar) { last = null; seen = now; return }
      for (const action of ['navigate', 'minigame', 'table'] as const) if (now[action] && !seen[action]) noteTourAction(action)
      seen = now
      const here = { x: avatar.current.x, z: avatar.current.z }
      if (last) noteTourWalk(walkedDistance(last, here))
      last = here
    }, 250)
    const session = useSession.subscribe((s, old) => {
      if (s.status !== 'connected' || s.sessionId !== old.sessionId || s.roomId !== old.roomId) endWelcomeTour()
    })
    const manual = useManual.subscribe((s, old) => { if (s.phase === 'closed' && old.phase !== 'closed') takeReplayAfterManual() })
    return () => { window.clearInterval(timer); session(); manual(); endWelcomeTour() }
  }, [])
  useEffect(() => {
    if (phase !== 'flight') return
    const timer = window.setTimeout(finishWelcomeFlight, Math.max(0, welcomeFlight.startedAt + WELCOME_FLIGHT_MS - performance.now()))
    return () => window.clearTimeout(timer)
  }, [phase])
  useEffect(() => {
    if (phase !== 'finished') return
    const timer = window.setTimeout(endWelcomeTour, FINISHED_MS)
    return () => window.clearTimeout(timer)
  }, [phase])
  if (phase === 'flight') return <WelcomeBanner />
  if (phase === 'tour') return <TourChecklist />
  if (phase === 'finished') return <TourFinished />
  return null
}

function WelcomeBanner() {
  const nickname = useSession(s => s.account?.nickname)
  const [caption, setCaption] = useState(() => flightCaption(0))
  useEffect(() => {
    const timer = window.setInterval(() =>
      setCaption(flightCaption((performance.now() - welcomeFlight.startedAt) / WELCOME_FLIGHT_MS)), 200)
    return () => window.clearInterval(timer)
  }, [])
  return <div className="welcome-tour-banner" role="status">
    <p className="welcome-tour-banner__title">{nickname ? `${nickname}님, ` : ''}온탑 공원에 오신 걸 환영해요</p>
    <p className="welcome-tour-banner__place" aria-hidden="true">{caption}</p>
  </div>
}

function TourChecklist() {
  const done = useWelcomeTour(s => s.done), walked = useWelcomeTour(s => s.walked), collapsed = useWelcomeTour(s => s.collapsed)
  const current = currentStep(done)
  const progress = `${done.length}/${TOUR_STEPS.length}`
  if (collapsed) return <aside className="welcome-tour welcome-tour--collapsed" aria-label="공원 체험 투어">
    <button type="button" className="welcome-tour__resume" onClick={() => setTourCollapsed(false)}>투어 이어 하기 · {progress}</button>
  </aside>
  return <aside className="welcome-tour" aria-label="공원 체험 투어">
    <header className="welcome-tour__head">
      <b>공원 체험 투어</b><span>{progress}</span>
      <button type="button" className="welcome-tour__close" aria-label="투어 끝내기" onClick={endWelcomeTour}>×</button>
    </header>
    <ol className="welcome-tour__steps">
      {TOUR_STEPS.map(step => {
        const complete = done.includes(step.id), active = current?.id === step.id
        return <li key={step.id} data-done={complete || undefined} data-active={active || undefined}>
          <span className="welcome-tour__mark" aria-hidden="true">{complete ? '✓' : ''}</span>
          <span className="welcome-tour__copy">
            <b>{step.title}<span className="visually-hidden">{complete ? ' · 완료' : active ? ' · 지금 할 일' : ''}</span></b>
            {active && <small>{step.hint}{step.id === 'walk' ? ` (${Math.min(TOUR_WALK_GOAL, Math.floor(walked))}/${TOUR_WALK_GOAL}m)` : ''}</small>}
          </span>
        </li>
      })}
    </ol>
    <button type="button" className="welcome-tour__later" onClick={() => setTourCollapsed(true)}>나중에 하기</button>
  </aside>
}

function TourFinished() {
  return <aside className="welcome-tour welcome-tour--finished" aria-label="공원 체험 투어" data-highlight="wardrobe">
    <header className="welcome-tour__head">
      <b>투어를 모두 마쳤어요</b>
      <button type="button" className="welcome-tour__close" aria-label="투어 닫기" onClick={endWelcomeTour}>×</button>
    </header>
    <p role="status">마지막으로, <b>옷장</b>은 화면 오른쪽 아래 빠른 메뉴 맨 위에 있어요. 캐릭터 옷을 갈아입어 보세요.</p>
    <p className="welcome-tour__note">더 궁금한 건 F1 설명서에서 찾아볼 수 있어요.</p>
  </aside>
}
