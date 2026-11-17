import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useSession } from '../../network/worldClient'
import { PaperPopup } from '../tableLobby/PaperPopup'
import { BALLOON_FARE, CAPACITY } from './flight'
import { availableCabinSeat } from './cabin'
import {
  boardLocalBalloon, cancelLocalBalloon, launchLocalBalloon, localBalloonFade, occupiedBalloonSeats,
  changeLocalBalloonControl,
  returnLocalBalloon, showLocalBalloonManual, toggleLocalCabinMode, toggleLocalCabinPerspective, toggleLocalCabinSeat,
  useLocalBalloon, watchLocalBalloonSession,
} from './localRide'
import { useRemoteBalloons } from './remoteRide'
import { roleOf, type ControlMode, type ControlRole } from './controls'
import { focusParkCanvas } from '../../world/inputOwnership'
import './localBalloon.css'

function BalloonKeys({ direction, altitude, walking = false, seated = false }: {
  direction: boolean; altitude: boolean; walking?: boolean; seated?: boolean
}) {
  return <div className="park-balloon-key-guide">
    {direction && <span><kbd>WASD / 방향키</kbd> {walking ? '걷기' : '시점 기준 이동'}</span>}
    {altitude && <><span><kbd>Space</kbd> 상승</span><span><kbd>Shift</kbd> 하강</span></>}
    {walking && <span><kbd>E</kbd> {seated ? '일어나기' : '앉기'}</span>}
  </div>
}

function BalloonWarning({ children }: { children: ReactNode }) {
  return <span className="park-balloon-warning" role="status">
    <i className="park-balloon-warning-icon" aria-hidden="true">!</i>{children}
  </span>
}

function DirectionCockpitGuide() {
  return <div className="park-balloon-direction-guide" role="group" aria-label="방향 조종 키">
    <span className="park-balloon-direction-label">시점 기준 이동</span>
    <div className="park-balloon-direction-options">
      <div className="park-balloon-direction-pad" role="img" aria-label="W 앞, A 왼쪽, S 뒤, D 오른쪽">
        <kbd aria-hidden="true">W</kbd><kbd aria-hidden="true">A</kbd><kbd aria-hidden="true">S</kbd><kbd aria-hidden="true">D</kbd>
      </div>
      <span>또는</span>
      <div className="park-balloon-direction-pad" role="img" aria-label="위쪽 화살표 앞, 왼쪽 화살표 왼쪽, 아래쪽 화살표 뒤, 오른쪽 화살표 오른쪽">
        <kbd aria-hidden="true">↑</kbd><kbd aria-hidden="true">←</kbd><kbd aria-hidden="true">↓</kbd><kbd aria-hidden="true">→</kbd>
      </div>
    </div>
  </div>
}

function BalloonBoardingOptions({ paying, capacity, setCapacity, mode, setMode }: {
  paying: boolean; capacity: number; setCapacity: (capacity: number) => void
  mode: ControlMode; setMode: (mode: ControlMode) => void
}) {
  const openRides = useRemoteBalloons(useShallow(({ flights }) => Object.keys(flights).filter(id => {
    const party = flights[id]?.party
    return party?.boarding && 1 + Object.keys(party.passengers).length < party.capacity
  })))
  return <>
    <fieldset className="park-balloon-capacity" disabled={paying}>
      <legend>탑승 정원</legend>
      {Array.from({ length: CAPACITY }, (_, index) => index + 1).map(limit => <label key={limit}>
        <input type="radio" name="balloon-capacity" checked={capacity === limit} onChange={() => {
          setCapacity(limit)
          if (limit === 1) setMode('solo')
        }} />
        <span>{limit}명</span>
      </label>)}
    </fieldset>
    <fieldset className="park-balloon-mode" disabled={paying}>
      <legend className="park-balloon-sr-only">조종 방식</legend>
      <label><input type="radio" name="balloon-mode" checked={mode === 'solo'} onChange={() => setMode('solo')} />
        <strong>혼자 조종</strong><span>방향과 고도를 한 사람이 맡아요.</span></label>
      <label><input type="radio" name="balloon-mode" checked={mode === 'split'} onChange={() => {
        setMode('split')
        if (capacity === 1) setCapacity(2)
      }} />
        <strong>2인 분담 조종</strong><span>두 사람이 방향과 고도를 나눠 맡아요.</span></label>
    </fieldset>
    <BalloonKeys direction altitude />
    <BalloonWarning>
      <span>조종석이 모두 비면 <strong>3초 뒤 추락</strong>해요.<br />
        자리를 비울 때는 동승자에게 조종을 넘길 수 있어요.</span>
    </BalloonWarning>
    <div className="paper-actions park-balloon-ticket-actions">
      <button type="button" disabled={paying} onClick={() => showLocalBalloonManual(true)}>이용 안내</button>
      <button type="button" className="paper-primary" disabled={paying}
        onClick={() => void boardLocalBalloon({ capacity, mode })}>{paying ? '결제 확인 중…' : `${BALLOON_FARE}냥 내고 탑승하기`}</button>
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
  const split = useRemoteBalloons(s => s.flights[leader]?.party?.controls?.mode === 'split')
  const altitudeFilled = useRemoteBalloons(s => !!s.flights[leader]?.party?.controls?.altitude)
  if (!capacity) return null
  return <button type="button" disabled={paying} onClick={() => void boardLocalBalloon({ leaderId: leader })}>
    <span><strong>{nickname || '조종자'}의 열기구</strong>
      <small>{riderCount}/{capacity}명{split && (altitudeFilled ? ' · 2인 분담 · 일반석' : ' · 2인 분담 · 고도석 비어 있음')}</small>
    </span>
    <span className="park-balloon-joining-fare">{BALLOON_FARE}냥 내고 합류</span>
  </button>
}

function BalloonCockpit({ leader, owner, role, pending }: {
  leader: string; owner: string; role: ControlRole | null; pending: boolean
}) {
  const party = useRemoteBalloons(s => s.flights[leader]?.party)
  const profiles = useSession(s => s.profiles)
  const [chooseRider, setChooseRider] = useState(false)
  const controls = party?.controls
  if (!controls) return null
  const incoming = controls.offer?.to === owner ? controls.offer : null
  const outgoing = controls.offer?.from === owner ? controls.offer : null
  const riders = [leader, ...Object.keys(party.passengers)]
  const eligible = riders.filter(id => id !== owner)
  const roleName = (value: ControlRole) => value === 'altitude' ? '고도 조종석' : controls.mode === 'split' ? '방향 조종석' : '조종석'
  const focusRide = () => document.querySelector('canvas')?.focus({ preventScroll: true })
  return <>
    {incoming && <span className="park-balloon-hud-note" role="status">{profiles[incoming.from]?.nickname ?? '동승자'}님이 {roleName(incoming.role)}을 넘기려 해요.</span>}
    {outgoing && <span className="park-balloon-hud-note" role="status">{profiles[outgoing.to]?.nickname ?? '동승자'}님의 수락을 기다리고 있어요.</span>}
    <div className="park-balloon-actions">
      {incoming && <button type="button" className="park-balloon-action-primary" disabled={pending} onClick={() => {
        void changeLocalBalloonControl({ action: 'accept', role: incoming.role, offerId: incoming.id })
        focusRide()
      }}><kbd>E</kbd> 교대 수락</button>}
      {role
        ? <>
          <button type="button" disabled={pending} onClick={() => {
            toggleLocalCabinMode()
            setChooseRider(false)
            focusRide()
          }}><kbd>F</kbd> 조종석에서 일어나기</button>
          {eligible.length > 0 && <button type="button" className="park-balloon-exchange" aria-expanded={chooseRider}
            onClick={() => setChooseRider(picking => !picking)}>조종 교대 제안</button>}
        </>
        : (['direction', 'altitude'] as const).map(seat => !controls[seat] && (seat === 'direction' || controls.mode === 'split')
          && <button type="button" className="park-balloon-action-primary" key={seat} disabled={pending} onClick={() => {
            void changeLocalBalloonControl({ action: 'claim', role: seat })
            focusRide()
          }}>{roleName(seat)} 잡기</button>)}
    </div>
    {chooseRider && role && <div className="park-balloon-actions" aria-label="조종을 넘길 동승자">
      {eligible.map(id => <button type="button" key={id} disabled={pending} onClick={() => {
        void changeLocalBalloonControl({ action: 'offer', role, peer: id })
        setChooseRider(false)
        focusRide()
      }}>{profiles[id]?.nickname ?? `동승자 ${riders.indexOf(id) + 1}`}{roleOf(controls, id) ? '와 자리 바꾸기' : '에게 조종 넘기기'}</button>)}
    </div>}
  </>
}

export default function LocalBalloonHud() {
  const [selectedCapacity, setSelectedCapacity] = useState(1)
  const [selectedMode, setSelectedMode] = useState<ControlMode>('solo')
  const panel = useLocalBalloon(s => s.panel)
  const xrSightseeing = useLocalBalloon(s => s.xrSightseeing)
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
  const owner = useLocalBalloon(s => s.owner)
  const isPilot = useLocalBalloon(s => s.owner === s.leader)
  const launching = useLocalBalloon(s => s.launching)
  const controlRole = useLocalBalloon(s => s.controlRole)
  const controlPending = useLocalBalloon(s => s.controlPending)
  const emptySeconds = useLocalBalloon(s => s.emptySeconds)
  const controlsMode = useRemoteBalloons(s => s.flights[leader]?.party?.controls?.mode)
  const splitReady = useRemoteBalloons(s => !!s.flights[leader]?.party?.controls?.altitude)
  const capacity = useRemoteBalloons(s => s.flights[leader]?.party?.capacity ?? 1)
  const passengerCount = useRemoteBalloons(s => 1 + Object.keys(s.flights[leader]?.party?.passengers ?? {}).length)
  const seated = useLocalBalloon(s => s.cabin.seatIndex >= 0)
  const seatNearby = useLocalBalloon(s => s.walkingInside && availableCabinSeat(s.cabin, occupiedBalloonSeats(s)) >= 0)
  useEffect(() => {
    const unwatch = watchLocalBalloonSession()
    return () => { unwatch(); cancelLocalBalloon() }
  }, [])

  if (xrSightseeing) return null

  if (panel === 'manual') return <PaperPopup key="manual" title={<strong>열기구 이용 안내</strong>} label="열기구 이용 안내"
    className="park-balloon-paper park-balloon-guide" closeLabel="탑승 화면으로 돌아가기" onClose={() => showLocalBalloonManual(false)}>
    <ul className="park-balloon-manual">
      <li>1인당 {BALLOON_FARE}냥이에요. 새 열기구의 정원을 1~{CAPACITY}명으로 정하거나, 같은 채널에서 기다리는 열기구에 합류할 수 있어요.</li>
      <li><kbd>WASD / 방향키</kbd>는 화면에서 바라보는 방향을 기준으로 이동해요. <kbd>Space</kbd>로 상승하고 <kbd>Shift</kbd>로 하강해요. 2인 분담에서는 두 역할을 나눠 맡아요.</li>
      <li><strong>조종 교대 제안</strong>을 받은 사람이 <kbd>E</kbd>로 수락하면 바로 교대해요. <kbd>F</kbd>를 눌러 조종석에서 일어나거나 빈 조종석을 잡을 수 있어요.</li>
      <li>조종석이 모두 비면 3초 뒤 추락해요. 바닥에 닿기 전에 조종석을 잡으면 다시 조종할 수 있어요.</li>
      <li>이륙부터 조종석에서도 마우스를 드래그해 둘러볼 수 있어요. 조종석에서 일어나면 <kbd>V</kbd>로 1인칭과 3인칭을 바꿔요. 기내에서는 점프할 수 없어요.</li>
    </ul>
    <div className="paper-actions"><button type="button" className="paper-primary"
      onClick={() => showLocalBalloonManual(false)}>탑승 화면으로</button></div>
  </PaperPopup>
  if (panel !== 'closed') return <PaperPopup key="boarding" title={<><strong>하늘언덕 열기구</strong><small>탑승 준비</small></>} label="하늘언덕 열기구 탑승 준비"
    className="park-balloon-paper" closeLabel="탑승 창 닫기" closeDisabled={panel === 'paying'} onClose={cancelLocalBalloon}>
    {panel === 'loading' ? <p role="status">열기구를 준비하고 있어요…</p>
      : panel === 'error' ? <p role="alert">열기구를 준비하지 못했어요. 다시 시도해 주세요.</p>
      : <>
        {paymentError && <p className="park-balloon-dialog-error" role="alert">{paymentError}</p>}
        {panel === 'paying' && <p className="park-balloon-sr-only" role="status">결제를 확인하고 있어요…</p>}
        <BalloonBoardingOptions paying={panel === 'paying'} capacity={selectedCapacity} setCapacity={setSelectedCapacity}
          mode={selectedMode} setMode={setSelectedMode} />
      </>}
  </PaperPopup>

  const fadeOverlay = fade > 0 ? <div className="park-balloon-fade" aria-hidden="true" style={{ opacity: fade }} /> : null
  if (!phase) return fadeOverlay

  const soloDeparture = controlsMode === 'split' && !splitReady
  const directing = phase === 'flying' && controlsMode === 'split' && controlRole === 'direction' && !walkingInside
  const roleTitle = walkingInside ? '기내' : controlRole === 'altitude' ? '고도 조종석'
    : controlsMode === 'split' ? '방향 조종석' : '조종석'
  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

  return <>
    <aside className="park-balloon-hud" data-phase={phase} data-direction-seat={directing || undefined} aria-label="열기구 운항"
      onClick={event => {
        if (event.detail > 0 && event.target instanceof Element && event.target.closest('button')) focusParkCanvas('localBalloon')
      }}>
      {phase === 'flying' && emptySeconds !== null && <BalloonWarning>{emptySeconds
        ? <>조종석이 비었어요 · <strong>{emptySeconds}초 뒤 추락</strong></>
        : <>추락 중이에요. 조종석을 잡아 주세요!</>}</BalloonWarning>}
      <div className="park-balloon-hud-panel">
        {phase === 'boarding' ? <>
          <div className="park-balloon-hud-heading"><strong>탑승 대기</strong><span>탑승 <b>{passengerCount}/{capacity}명</b></span></div>
          {controlsMode === 'split' && <span className="park-balloon-hud-note">방향 담당 배정 완료 · {splitReady ? '고도 담당 배정 완료' : '고도 담당 대기 중'}</span>}
          {!isPilot && <span className="park-balloon-hud-note">조종자가 출발하기를 기다리고 있어요.</span>}
          {paymentError && <span className="park-balloon-hud-note" role="alert">{paymentError}</span>}
          <div className="park-balloon-actions">
            {isPilot && <button type="button" className="park-balloon-action-primary" disabled={launching}
              onClick={() => void launchLocalBalloon(soloDeparture)}>{soloDeparture ? '혼자 조종으로 출발' : '출발'}</button>}
            <button type="button" disabled={launching} onClick={cancelLocalBalloon}>내리기</button>
          </div>
        </> : phase === 'flying' ? <>
          <div className="park-balloon-hud-heading">
            <strong><i className="park-balloon-compass" aria-hidden="true" />{roleTitle}</strong>
            {isPilot && <span>남은 시간 <b>{time}</b></span>}
          </div>
          {directing ? <DirectionCockpitGuide />
            : <BalloonKeys walking={walkingInside} seated={seated} direction={walkingInside || controlRole !== 'altitude'}
                altitude={!walkingInside && (controlsMode !== 'split' || controlRole === 'altitude')} />}
          <span className="park-balloon-hud-note">드래그로 둘러보기 · Enter 채팅</span>
          {paymentError && <span className="park-balloon-hud-note" role="alert">{paymentError}</span>}
          {boundary && <span className="park-balloon-hud-note" role="status">비행 구역 경계 · 공원 안쪽으로 돌아가세요</span>}
          <div className="park-balloon-hud-controls">
            {controlsMode && <BalloonCockpit leader={leader} owner={owner} role={controlRole} pending={controlPending} />}
            <div className="park-balloon-actions">
              {isPilot && !controlsMode && <button type="button" onClick={() => {
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
              {(controlRole || isPilot && !controlsMode) && <button type="button" disabled={controlPending}
                onClick={returnLocalBalloon}>승강장 복귀</button>}
            </div>
          </div>
        </> : phase === 'takeoff' ? <span role="status">이륙 중</span>
          : phase === 'returning' ? <span role="status">{reason === 'terrain'
            ? '이곳에는 내릴 수 없어 승강장으로 돌아갑니다.' : '승강장으로 돌아갑니다.'}</span>
          : <span role="status">{landing === 'field' ? '착지했어요. 체험 종료 후 승강장으로 돌아갑니다.' : '승강장에 도착했어요.'} · {seconds}초</span>}
      </div>
    </aside>
    {fadeOverlay}
  </>
}
