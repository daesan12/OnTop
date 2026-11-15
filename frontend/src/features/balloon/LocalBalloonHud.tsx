import { useEffect, useState } from 'react'
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
import './localBalloon.css'

function BalloonBoardingOptions({ paying, capacity, setCapacity, mode, setMode }: {
  paying: boolean; capacity: number; setCapacity: (capacity: number) => void
  mode: ControlMode; setMode: (mode: ControlMode) => void
}) {
  const openRides = useRemoteBalloons(useShallow(({ flights }) => Object.keys(flights).filter(id => {
    const party = flights[id]?.party
    return party?.boarding && 1 + Object.keys(party.passengers).length < party.capacity
  })))
  return <>
    <p>비행 중 조종을 넘겨줄 수 있어요. 조종석이 모두 비면 3초 뒤 추락해요.</p>
    <fieldset className="park-balloon-capacity" disabled={paying}>
      <legend>새 열기구의 최대 탑승 인원</legend>
      {Array.from({ length: CAPACITY }, (_, index) => index + 1).map(limit => <label key={limit}>
        <input type="radio" name="balloon-capacity" checked={capacity === limit} onChange={() => {
          setCapacity(limit)
          if (limit === 1) setMode('solo')
        }} />
        {limit}인
      </label>)}
    </fieldset>
    <fieldset className="park-balloon-mode" disabled={paying}>
      <legend>조종 방식</legend>
      <label><input type="radio" name="balloon-mode" checked={mode === 'solo'} onChange={() => setMode('solo')} />
        <strong>혼자 조종</strong><span>방향과 고도를 한 사람이 맡아요.</span></label>
      <label><input type="radio" name="balloon-mode" checked={mode === 'split'} onChange={() => {
        setMode('split')
        if (capacity === 1) setCapacity(2)
      }} />
        <strong>2인 분담 조종</strong><span>두 사람이 방향과 고도를 나눠 맡아요.</span></label>
    </fieldset>
    <div className="park-balloon-key-guide">
      <span>방향 <kbd>WASD / 방향키</kbd></span>
      <span>고도 <kbd>Space</kbd> 상승 · <kbd>Shift</kbd> 하강</span>
    </div>
    <div className="paper-actions">
      <button type="button" disabled={paying} onClick={() => showLocalBalloonManual(true)}>이용 안내</button>
      <button type="button" className="paper-primary" disabled={paying}
        onClick={() => void boardLocalBalloon({ capacity, mode })}>{BALLOON_FARE}냥 내고 탑승하기</button>
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
    {nickname || '조종자'}의 열기구 · {riderCount}/{capacity}명<br />
    {split && (altitudeFilled ? '2인 분담 · 일반석' : '2인 분담 · 고도석 비어 있음')} {BALLOON_FARE}냥 내고 합류
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
    {incoming && <span role="status">{profiles[incoming.from]?.nickname ?? '동승자'}님이 {roleName(incoming.role)}을 넘기려 해요.</span>}
    {outgoing && <span role="status">{profiles[outgoing.to]?.nickname ?? '동승자'}님의 수락을 기다리고 있어요.</span>}
    <div className="park-balloon-actions">
      {incoming && <button type="button" disabled={pending} onClick={() => {
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
          {eligible.length > 0 && <button type="button" aria-expanded={chooseRider}
            onClick={() => setChooseRider(picking => !picking)}>조종 교대 제안</button>}
        </>
        : (['direction', 'altitude'] as const).map(seat => !controls[seat] && (seat === 'direction' || controls.mode === 'split')
          && <button type="button" key={seat} disabled={pending} onClick={() => {
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

  if (panel === 'manual') return <PaperPopup key="manual" title="열기구 이용 안내" label="열기구 이용 안내"
    className="park-balloon-paper" closeLabel="탑승 화면으로 돌아가기" onClose={() => showLocalBalloonManual(false)}>
    <ul className="park-balloon-manual">
      <li>1인당 {BALLOON_FARE}냥이에요. 새 열기구의 정원을 1~{CAPACITY}명으로 정하거나, 같은 채널에서 기다리는 열기구에 합류할 수 있어요.</li>
      <li>방향은 <kbd>WASD / 방향키</kbd>, 고도는 <kbd>Space</kbd> 상승과 <kbd>Shift</kbd> 하강으로 조종해요. 2인 분담에서는 두 역할을 나눠 맡아요.</li>
      <li><strong>조종 교대 제안</strong>을 받은 사람이 <kbd>E</kbd>로 수락하면 바로 교대해요. <kbd>F</kbd>를 눌러 조종석에서 일어나거나 빈 조종석을 잡을 수 있어요.</li>
      <li>조종석이 모두 비면 3초 뒤 추락해요. 바닥에 닿기 전에 조종석을 잡으면 다시 조종할 수 있어요.</li>
      <li>기내에서 마우스를 드래그해 둘러보고 <kbd>V</kbd>로 1인칭과 3인칭을 바꿔요. 기내에서는 점프할 수 없어요.</li>
    </ul>
    <div className="paper-actions"><button type="button" className="paper-primary"
      onClick={() => showLocalBalloonManual(false)}>탑승 화면으로</button></div>
  </PaperPopup>
  if (panel !== 'closed') return <PaperPopup key="boarding" title="하늘언덕 열기구 탑승 준비" label="하늘언덕 열기구 탑승 준비"
    className="park-balloon-paper" closeLabel="탑승 창 닫기" closeDisabled={panel === 'paying'} onClose={cancelLocalBalloon}>
    {panel === 'loading' ? <p role="status">열기구를 준비하고 있어요…</p>
      : panel === 'error' ? <p role="alert">열기구를 준비하지 못했어요. 다시 시도해 주세요.</p>
      : <>
        <p>1인당 {BALLOON_FARE}냥</p>
        {paymentError && <p role="alert">{paymentError}</p>}
        {panel === 'paying' && <p role="status">결제를 확인하고 있어요…</p>}
        <BalloonBoardingOptions paying={panel === 'paying'} capacity={selectedCapacity} setCapacity={setSelectedCapacity}
          mode={selectedMode} setMode={setSelectedMode} />
      </>}
  </PaperPopup>

  const fadeOverlay = fade > 0 ? <div className="park-balloon-fade" aria-hidden="true" style={{ opacity: fade }} /> : null
  if (!phase) return fadeOverlay
  return <>
    <aside className="park-balloon-hud" aria-label="열기구 운항">
    {phase === 'boarding' ? <>
        <strong>탑승 {passengerCount}/{capacity}명</strong>
        {controlsMode === 'split' && <span>방향 담당 배정 완료 · {splitReady ? '고도 담당 배정 완료' : '고도 담당 대기 중'}</span>}
        <span>{isPilot ? '준비되면 출발할 수 있어요.' : '조종자가 출발하기를 기다리고 있어요.'}</span>
        {paymentError && <span role="alert">{paymentError}</span>}
        <div className="park-balloon-actions">
          {isPilot && (controlsMode === 'split' && !splitReady
            ? <button type="button" disabled={launching} onClick={() => void launchLocalBalloon(true)}>혼자 조종으로 출발</button>
            : <button type="button" disabled={launching} onClick={() => void launchLocalBalloon()}>출발</button>)}
          <button type="button" disabled={launching} onClick={cancelLocalBalloon}>내리기</button>
        </div>
      </> : phase === 'takeoff' ? <span role="status">이륙 중</span>
      : phase === 'flying' ? <>
        <strong>{walkingInside ? '기내' : controlRole === 'altitude' ? '고도 조종석'
          : controlsMode === 'split' ? '방향 조종석' : '조종석'}{isPilot && ` · 남은 시간 ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`}</strong>
        {walkingInside
          ? <span><kbd>WASD / 방향키</kbd> 걷기 · <kbd>E</kbd> {seated ? '일어나기' : '가까운 의자에 앉기'} · 드래그로 둘러보기</span>
          : <span>{controlRole !== 'altitude' && <><kbd>WASD / 방향키</kbd> 방향</>}
            {controlsMode !== 'split' || controlRole === 'altitude' ? <> <kbd>Space</kbd> 상승 · <kbd>Shift</kbd> 하강</> : null}</span>}
        {emptySeconds !== null && <span className="park-balloon-warning" role="status">{emptySeconds
          ? `조종석이 비었어요. ${emptySeconds}초 뒤 추락합니다.` : '추락 중이에요. 조종석을 잡아 주세요!'}</span>}
        {paymentError && <span role="alert">{paymentError}</span>}
        {boundary ? <span role="status">비행 구역 경계 · 공원 안쪽으로 돌아가세요</span> : null}
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
      </> : phase === 'returning' ? <span role="status">{reason === 'terrain'
        ? '이곳에는 내릴 수 없어 승강장으로 돌아갑니다.' : '승강장으로 돌아갑니다.'}</span>
      : <span role="status">{landing === 'field' ? '착지했어요. 체험 종료 후 승강장으로 돌아갑니다.' : '승강장에 도착했어요.'} · {seconds}초</span>}
    </aside>
    {fadeOverlay}
  </>
}
