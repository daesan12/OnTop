import { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { PaperPopup } from '../tableLobby/PaperPopup'
import { CAPACITY, PREVIEW_FARE } from './flight'
import { PreviewScene } from './PreviewScene'
import { canBoard } from './previewMap'
import { isPassenger, keys, occupancy, usePreview } from './previewStore'
import './preview.css'

const movementKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])

function usePreviewKeyboard() {
  useEffect(() => {
    function down(event: KeyboardEvent) {
      const state = usePreview.getState()
      if (state.popup || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return
      if (event.code === 'KeyE' && !event.repeat) state.open()
      if (!movementKeys.has(event.code) || event.target instanceof HTMLButtonElement && event.code === 'Space') return
      event.preventDefault()
      keys.add(event.code)
    }

    function up(event: KeyboardEvent) {
      keys.delete(event.code)
    }

    const clear = () => keys.clear()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    document.addEventListener('visibilitychange', clear)
    return () => {
      clear()
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
      document.removeEventListener('visibilitychange', clear)
    }
  }, [])
}

function Seats({ occupied }: { occupied: number }) {
  return <>
    <p className="balloon-count">탑승 인원 {occupied}/{CAPACITY}</p>
    <div className="balloon-seats" aria-hidden="true">
      {Array.from({ length: CAPACITY }, (_, index) => <svg key={index} viewBox="0 0 28 28" data-occupied={index < occupied}>
        <circle cx="14" cy="8" r="5" />
        <path d="M5.5 25v-3.5a8.5 8.5 0 0 1 17 0V25Z" />
      </svg>)}
    </div>
  </>
}

function BoardingPopup() {
  const popup = usePreview(s => s.popup)
  if (!popup) return null
  const { board, close, coins } = usePreview.getState()
  const occupied = occupancy(false)
  const full = occupied === CAPACITY

  if (popup === 'board') return <PaperPopup title="하늘언덕 열기구" label="하늘언덕 열기구"
    closeLabel="탑승 창 닫기" onClose={close} className="balloon-paper">
    <Seats occupied={occupied} />
    <p className="balloon-fare"><span aria-hidden="true">◆</span> 탑승 요금 · {PREVIEW_FARE}냥</p>
    <p className="balloon-balance">보유 엽전 {coins}냥 · 출발할 때 결제</p>
    {full ? <p role="status">빈자리가 없어요</p> : null}
    <div className="paper-actions"><button type="button" className="paper-primary" onClick={board} disabled={full}>탑승하기</button></div>
  </PaperPopup>

  const title = popup === 'balance' ? '엽전이 부족해요' : '출발이 취소됐어요'
  return <PaperPopup title={title} label={title} onClose={close} closeLabel="안내 닫기" className="balloon-paper">
    <p>{popup === 'balance' ? '잔액을 확인해 주세요' : '엽전은 차감되지 않았어요'}</p>
    <div className="paper-actions"><button type="button" className="paper-primary" onClick={close}>확인</button></div>
  </PaperPopup>
}

function HoldButton({ label, code }: { label: string; code: string }) {
  return <button type="button" aria-label={label} onPointerDown={event => {
    event.currentTarget.setPointerCapture(event.pointerId)
    keys.add(code)
  }} onLostPointerCapture={() => keys.delete(code)} onPointerUp={() => keys.delete(code)}
  onKeyDown={event => {
    if (event.code !== 'Space' && event.code !== 'Enter') return
    event.preventDefault()
    keys.add(code)
  }} onKeyUp={event => {
    if (event.code === 'Space' || event.code === 'Enter') keys.delete(code)
  }} onBlur={() => keys.delete(code)}>{label}</button>
}

function RideHud() {
  const phase = usePreview(s => s.flight.phase)
  const reason = usePreview(s => s.flight.returnReason)
  const landing = usePreview(s => s.flight.landing)
  const boundary = usePreview(s => s.flight.atBoundary)
  const seconds = usePreview(s => Math.ceil(s.flight.seconds))
  const wait = usePreview(s => Math.ceil(s.wait))
  const boarded = usePreview(s => s.boarded)
  const reachable = usePreview(s => canBoard(s.walker))
  const popup = usePreview(s => s.popup)
  const coins = usePreview(s => s.coins)
  const { open, start, cancel, reset, losePilot } = usePreview.getState()
  const clock = Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0')

  return <>
    <div className="balloon-preview-info">로컬 프리뷰 · 가상 엽전 {coins}냥</div>
    {phase === 'boarding' && !boarded && !popup ? <div className="balloon-bottom">
      {reachable ? <button className="balloon-prompt" type="button" onClick={open}><kbd>E</kbd> 열기구 탑승</button>
        : <div className="balloon-hint"><kbd>WASD / 방향키</kbd> 승강장으로 이동</div>}
      <div className="balloon-touch"><HoldButton label="앞으로" code="KeyW" /><HoldButton label="뒤로" code="KeyS" /></div>
    </div> : null}
    {phase === 'boarding' && boarded ? <aside className="balloon-wait balloon-hanji" aria-label="출발 대기">
      <h1>출발 대기</h1>
      <Seats occupied={occupancy(true)} />
      <p>출발까지 {wait}초</p>
      {!isPassenger ? <button className="balloon-primary" type="button" onClick={start}>출발하기</button> : null}
      <button className="balloon-cancel" type="button" onClick={cancel}>탑승 취소</button>
    </aside> : null}
    {phase === 'takeoff' ? <div className="balloon-bottom">
      <p className="balloon-hint" role="status">탑승 요금 결제 완료 · 이륙 중</p>
    </div> : null}
    {phase === 'flying' ? <>
      <div className="balloon-role">{isPassenger ? '동승석' : '조종석'}</div>
      <div className="balloon-clock balloon-hanji">남은 시간 {clock}</div>
      <button className="balloon-simulation" type="button" onClick={losePilot}>조종자 이탈 확인</button>
      <div className="balloon-bottom">
        {boundary ? <p className="balloon-hanji balloon-notice" role="status"><strong>비행 구역 경계</strong> 공원 안쪽으로 돌아가세요</p> : null}
        {isPassenger ? <p className="balloon-hint"><kbd>← →</kbd> 드래그로 시점 돌리기</p> : <>
          <div className="balloon-hint"><kbd>WASD / 방향키</kbd> 방향 조절 <kbd>Space</kbd> 상승 <kbd>Shift</kbd> 하강</div>
          <div className="balloon-touch">
            <HoldButton label="앞" code="KeyW" /><HoldButton label="왼쪽" code="KeyA" />
            <HoldButton label="뒤" code="KeyS" /><HoldButton label="오른쪽" code="KeyD" />
            <HoldButton label="상승" code="Space" /><HoldButton label="하강" code="ShiftLeft" />
          </div>
        </>}
      </div>
    </> : null}
    {phase === 'returning' ? <div className="balloon-bottom">
      <p className="balloon-hanji balloon-notice" role="status"><strong>자동 복귀 중</strong>
        {reason === 'pilot' ? '조종자 연결이 끊겼어요. 승강장으로 돌아갑니다.'
          : reason === 'terrain' ? '이곳에는 내릴 수 없어 승강장으로 돌아갑니다.' : '승강장으로 돌아갑니다.'}
      </p>
    </div> : null}
    {phase === 'landed' ? <div className="balloon-clock balloon-hanji">
      <strong>{landing === 'dock' ? '승강장에 도착했어요' : '안전한 곳에 내렸어요'}</strong>
      <p>열기구 정리까지 {seconds}초</p>
    </div> : null}
    {phase === 'removed' ? <div className="balloon-bottom">
      <p className="balloon-hint" role="status">운항이 끝났어요</p>
      <button className="balloon-prompt" type="button" onClick={reset}>승강장으로 돌아가기</button>
    </div> : null}
  </>
}

function App() {
  usePreviewKeyboard()
  return <main className="balloon-preview" aria-label="하늘언덕 열기구 프리뷰">
    <PreviewScene />
    <RideHud />
    <BoardingPopup />
  </main>
}

createRoot(document.getElementById('root')!).render(<App />)
