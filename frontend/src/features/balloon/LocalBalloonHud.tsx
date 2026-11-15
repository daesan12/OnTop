import { useEffect } from 'react'
import { PaperPopup } from '../tableLobby/PaperPopup'
import { BALLOON_FARE } from './flight'
import { availableCabinSeat } from './cabin'
import {
  boardLocalBalloon, cancelLocalBalloon, localBalloonFade, returnLocalBalloon, toggleLocalCabinMode,
  toggleLocalCabinSeat, useLocalBalloon, watchLocalBalloonSession,
} from './localRide'
import './localBalloon.css'

export default function LocalBalloonHud() {
  const panel = useLocalBalloon(s => s.panel)
  const phase = useLocalBalloon(s => s.flight?.phase)
  const seconds = useLocalBalloon(s => Math.ceil(s.flight?.seconds ?? 0))
  const paymentError = useLocalBalloon(s => s.paymentError)
  const boundary = useLocalBalloon(s => s.flight?.atBoundary)
  const landing = useLocalBalloon(s => s.flight?.landing)
  const reason = useLocalBalloon(s => s.flight?.returnReason)
  const fade = useLocalBalloon(localBalloonFade)
  const walkingInside = useLocalBalloon(s => s.walkingInside)
  const seated = useLocalBalloon(s => s.cabin.seatIndex >= 0)
  const seatNearby = useLocalBalloon(s => s.walkingInside && availableCabinSeat(s.cabin) >= 0)
  useEffect(() => {
    const unwatch = watchLocalBalloonSession()
    return () => { unwatch(); cancelLocalBalloon() }
  }, [])

  if (panel !== 'closed') return <PaperPopup title="하늘언덕 열기구" label="하늘언덕 열기구"
    className="park-balloon-paper" closeLabel="탑승 창 닫기" closeDisabled={panel === 'paying'} onClose={cancelLocalBalloon}>
    {panel === 'loading' ? <p role="status">열기구를 준비하고 있어요…</p>
      : panel === 'error' ? <p role="alert">열기구를 준비하지 못했어요. 다시 시도해 주세요.</p>
      : <>
        <p>개발 체험 · 1인 탑승</p>
        <p>탑승 요금 {BALLOON_FARE}냥</p>
        {paymentError && <p role="alert">{paymentError}</p>}
        {panel === 'paying' && <p role="status">결제를 확인하고 있어요…</p>}
        <div className="paper-actions">
          <button type="button" className="paper-primary" disabled={panel === 'paying'} onClick={() => void boardLocalBalloon()}>
            {BALLOON_FARE}냥 내고 탑승하기
          </button>
        </div>
      </>}
  </PaperPopup>

  const fadeOverlay = fade > 0 ? <div className="park-balloon-fade" aria-hidden="true" style={{ opacity: fade }} /> : null
  if (!phase) return fadeOverlay
  return <>
    <aside className="park-balloon-hud" aria-label="열기구 운항">
    {phase === 'takeoff' ? <span role="status">이륙 중</span>
      : phase === 'flying' ? <>
        <strong>{walkingInside ? '기내' : '조종석'} · 남은 시간 {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</strong>
        {walkingInside
          ? <span><kbd>WASD / 방향키</kbd> 걷기 · <kbd>E</kbd> {seated ? '일어나기' : '가까운 의자에 앉기'}</span>
          : <span><kbd>WASD / 방향키</kbd> 방향 · <kbd>Space</kbd> 상승 · <kbd>Shift</kbd> 하강</span>}
        {boundary ? <span role="status">비행 구역 경계 · 공원 안쪽으로 돌아가세요</span> : null}
        <div className="park-balloon-actions">
          <button type="button" onClick={() => {
            toggleLocalCabinMode()
            document.querySelector('canvas')?.focus({ preventScroll: true })
          }}><kbd>F</kbd> {walkingInside ? '조종석으로' : '기내 이동'}</button>
          {walkingInside && (seated || seatNearby) && <button type="button" onClick={() => {
            toggleLocalCabinSeat()
            document.querySelector('canvas')?.focus({ preventScroll: true })
          }}>{seated ? '일어나기' : '앉기'}</button>}
          <button type="button" onClick={returnLocalBalloon}>승강장 복귀</button>
        </div>
      </> : phase === 'returning' ? <span role="status">{reason === 'terrain'
        ? '이곳에는 내릴 수 없어 승강장으로 돌아갑니다.' : '승강장으로 돌아갑니다.'}</span>
      : <span role="status">{landing === 'field' ? '착지했어요. 체험 종료 후 승강장으로 돌아갑니다.' : '승강장에 도착했어요.'} · {seconds}초</span>}
    </aside>
    {fadeOverlay}
  </>
}
