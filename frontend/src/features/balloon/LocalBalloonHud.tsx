import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useSession } from '../../network/worldClient'
import { PaperPopup } from '../tableLobby/PaperPopup'
import { BALLOON_FARE, CAPACITY } from './flight'
import { availableCabinSeat } from './cabin'
import {
  boardLocalBalloon, cancelLocalBalloon, launchLocalBalloon, localBalloonFade, occupiedBalloonSeats,
  returnLocalBalloon, showLocalBalloonManual, toggleLocalCabinMode, toggleLocalCabinPerspective, toggleLocalCabinSeat,
  useLocalBalloon, watchLocalBalloonSession,
} from './localRide'
import { useRemoteBalloons } from './remoteRide'
import './localBalloon.css'

function BalloonBoardingOptions({ paying, capacity, setCapacity }: {
  paying: boolean; capacity: number; setCapacity: (capacity: number) => void
}) {
  const openRides = useRemoteBalloons(useShallow(({ flights }) => Object.keys(flights).filter(id => {
    const party = flights[id]?.party
    return party?.boarding && 1 + Object.keys(party.passengers).length < party.capacity
  })))
  return <>
    <fieldset className="park-balloon-capacity" disabled={paying}>
      <legend>새 열기구의 최대 탑승 인원</legend>
      {Array.from({ length: CAPACITY }, (_, index) => index + 1).map(limit => <label key={limit}>
        <input type="radio" name="balloon-capacity" checked={capacity === limit} onChange={() => setCapacity(limit)} />
        {limit}인
      </label>)}
    </fieldset>
    <div className="paper-actions">
      <button type="button" disabled={paying} onClick={() => showLocalBalloonManual(true)}>이용 안내</button>
      <button type="button" className="paper-primary" disabled={paying}
        onClick={() => void boardLocalBalloon({ capacity })}>{BALLOON_FARE}냥 내고 탑승하기</button>
    </div>
    {openRides.length > 0 && <section className="park-balloon-joining" aria-label="합류 가능한 열기구">
      <h3>탑승객을 기다리는 열기구</h3>
      {openRides.map(leader => <JoinBalloonButton key={leader} leader={leader} paying={paying} />)}
    </section>}
  </>
}

function JoinBalloonButton({ leader, paying }: { leader: string; paying: boolean }) {
  const nickname = useSession(s => s.profiles[leader]?.nickname)
  const capacity = useRemoteBalloons(s => s.flights[leader]?.party?.capacity)
  const riderCount = useRemoteBalloons(s => 1 + Object.keys(s.flights[leader]?.party?.passengers ?? {}).length)
  if (!capacity) return null
  return <button type="button" disabled={paying} onClick={() => void boardLocalBalloon({ leaderId: leader })}>
    {nickname || '조종자'}의 열기구 · {riderCount}/{capacity}명 · {BALLOON_FARE}냥 내고 합류
  </button>
}

export default function LocalBalloonHud() {
  const [selectedCapacity, setSelectedCapacity] = useState(1)
  const panel = useLocalBalloon(s => s.panel)
  const phase = useLocalBalloon(s => s.flight?.phase)
  const seconds = useLocalBalloon(s => Math.ceil(s.flight?.seconds ?? 0))
  const paymentError = useLocalBalloon(s => s.paymentError)
  const boundary = useLocalBalloon(s => s.flight?.atBoundary)
  const landing = useLocalBalloon(s => s.flight?.landing)
  const reason = useLocalBalloon(s => s.flight?.returnReason)
  const fade = useLocalBalloon(localBalloonFade)
  const walkingInside = useLocalBalloon(s => s.walkingInside)
  const firstPerson = useLocalBalloon(s => s.cabinFirstPerson)
  const leader = useLocalBalloon(s => s.leader)
  const isPilot = useLocalBalloon(s => s.owner === s.leader)
  const launching = useLocalBalloon(s => s.launching)
  const capacity = useRemoteBalloons(s => s.flights[leader]?.party?.capacity ?? 1)
  const passengerCount = useRemoteBalloons(s => 1 + Object.keys(s.flights[leader]?.party?.passengers ?? {}).length)
  const seated = useLocalBalloon(s => s.cabin.seatIndex >= 0)
  const seatNearby = useLocalBalloon(s => s.walkingInside && availableCabinSeat(s.cabin, occupiedBalloonSeats(s)) >= 0)
  useEffect(() => {
    const unwatch = watchLocalBalloonSession()
    return () => { unwatch(); cancelLocalBalloon() }
  }, [])

  if (panel === 'manual') return <PaperPopup key="manual" title="열기구 이용 안내" label="열기구 이용 안내"
    className="park-balloon-paper" closeLabel="탑승 화면으로 돌아가기" onClose={() => showLocalBalloonManual(false)}>
    <ul className="park-balloon-manual">
      <li>1인당 {BALLOON_FARE}냥이에요. 새 열기구의 정원을 1~{CAPACITY}명으로 정하거나, 같은 채널에서 기다리는 열기구에 합류할 수 있어요.</li>
      <li>조종자는 인원이 다 차기 전에도 출발할 수 있어요. <kbd>WASD / 방향키</kbd>로 조종하고 <kbd>Space</kbd>로 상승, <kbd>Shift</kbd>로 하강해요.</li>
      <li>조종 중 <kbd>F</kbd>를 누르면 기내로 이동해요. 기내에서는 <kbd>WASD / 방향키</kbd>로 걷고 빈 의자 근처에서 <kbd>E</kbd>로 앉거나 일어나요.</li>
      <li>기내에서 마우스를 드래그해 둘러보고 <kbd>V</kbd>로 1인칭과 3인칭을 바꿔요. 기내에서는 점프할 수 없어요.</li>
    </ul>
    <div className="paper-actions"><button type="button" className="paper-primary"
      onClick={() => showLocalBalloonManual(false)}>탑승 화면으로</button></div>
  </PaperPopup>
  if (panel !== 'closed') return <PaperPopup key="boarding" title="하늘언덕 열기구" label="하늘언덕 열기구"
    className="park-balloon-paper" closeLabel="탑승 창 닫기" closeDisabled={panel === 'paying'} onClose={cancelLocalBalloon}>
    {panel === 'loading' ? <p role="status">열기구를 준비하고 있어요…</p>
      : panel === 'error' ? <p role="alert">열기구를 준비하지 못했어요. 다시 시도해 주세요.</p>
      : <>
        <p>1인당 {BALLOON_FARE}냥</p>
        {paymentError && <p role="alert">{paymentError}</p>}
        {panel === 'paying' && <p role="status">결제를 확인하고 있어요…</p>}
        <BalloonBoardingOptions paying={panel === 'paying'} capacity={selectedCapacity} setCapacity={setSelectedCapacity} />
      </>}
  </PaperPopup>

  const fadeOverlay = fade > 0 ? <div className="park-balloon-fade" aria-hidden="true" style={{ opacity: fade }} /> : null
  if (!phase) return fadeOverlay
  return <>
    <aside className="park-balloon-hud" aria-label="열기구 운항">
    {phase === 'boarding' ? <>
        <strong>탑승 {passengerCount}/{capacity}명</strong>
        <span>{isPilot ? '준비되면 출발할 수 있어요.' : '조종자가 출발하기를 기다리고 있어요.'}</span>
        {paymentError && <span role="alert">{paymentError}</span>}
        <div className="park-balloon-actions">
          {isPilot && <button type="button" disabled={launching} onClick={() => void launchLocalBalloon()}>출발</button>}
          <button type="button" disabled={launching} onClick={cancelLocalBalloon}>내리기</button>
        </div>
      </> : phase === 'takeoff' ? <span role="status">이륙 중</span>
      : phase === 'flying' ? <>
        <strong>{walkingInside ? '기내' : '조종석'}{isPilot && ` · 남은 시간 ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`}</strong>
        {walkingInside
          ? <span><kbd>WASD / 방향키</kbd> 걷기 · <kbd>E</kbd> {seated ? '일어나기' : '가까운 의자에 앉기'} · 드래그로 둘러보기</span>
          : <span><kbd>WASD / 방향키</kbd> 방향 · <kbd>Space</kbd> 상승 · <kbd>Shift</kbd> 하강</span>}
        {boundary ? <span role="status">비행 구역 경계 · 공원 안쪽으로 돌아가세요</span> : null}
        <div className="park-balloon-actions">
          {isPilot && <button type="button" onClick={() => {
            toggleLocalCabinMode()
            document.querySelector('canvas')?.focus({ preventScroll: true })
          }}><kbd>F</kbd> {walkingInside ? '조종석으로' : '기내 이동'}</button>}
          {walkingInside && <button type="button" onClick={() => {
            toggleLocalCabinPerspective()
            document.querySelector('canvas')?.focus({ preventScroll: true })
          }}><kbd>V</kbd> {firstPerson ? '3인칭 보기' : '1인칭 보기'}</button>}
          {walkingInside && (seated || seatNearby) && <button type="button" onClick={() => {
            toggleLocalCabinSeat()
            document.querySelector('canvas')?.focus({ preventScroll: true })
          }}>{seated ? '일어나기' : '앉기'}</button>}
          {isPilot && <button type="button" onClick={returnLocalBalloon}>승강장 복귀</button>}
        </div>
      </> : phase === 'returning' ? <span role="status">{reason === 'terrain'
        ? '이곳에는 내릴 수 없어 승강장으로 돌아갑니다.' : '승강장으로 돌아갑니다.'}</span>
      : <span role="status">{landing === 'field' ? '착지했어요. 체험 종료 후 승강장으로 돌아갑니다.' : '승강장에 도착했어요.'} · {seconds}초</span>}
    </aside>
    {fadeOverlay}
  </>
}
