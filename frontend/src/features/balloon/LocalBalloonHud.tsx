import { useEffect } from 'react'
import { PaperPopup } from '../tableLobby/PaperPopup'
import {
  boardLocalBalloon, cancelLocalBalloon, returnLocalBalloon, startLocalBalloon, useLocalBalloon, watchLocalBalloonSession,
} from './localRide'
import './localBalloon.css'

export default function LocalBalloonHud() {
  const panel = useLocalBalloon(s => s.panel)
  const phase = useLocalBalloon(s => s.flight?.phase)
  const seconds = useLocalBalloon(s => Math.ceil(s.flight?.seconds ?? 0))
  const departure = useLocalBalloon(s => Math.ceil(s.untilDeparture))
  const boundary = useLocalBalloon(s => s.flight?.atBoundary)
  const landing = useLocalBalloon(s => s.flight?.landing)
  const reason = useLocalBalloon(s => s.flight?.returnReason)
  useEffect(() => {
    const unwatch = watchLocalBalloonSession()
    return () => { unwatch(); cancelLocalBalloon() }
  }, [])

  if (panel !== 'closed') return <PaperPopup title="하늘언덕 열기구" label="하늘언덕 열기구"
    className="park-balloon-paper" closeLabel="탑승 창 닫기" onClose={cancelLocalBalloon}>
    {panel === 'loading' ? <p role="status">열기구를 준비하고 있어요…</p>
      : panel === 'error' ? <p role="alert">열기구를 준비하지 못했어요. 다시 시도해 주세요.</p>
      : <>
        <p>최대 4인 · 로컬 체험은 1인 탑승</p>
        <p>체험 요금 0냥</p>
        <div className="paper-actions"><button type="button" className="paper-primary" onClick={boardLocalBalloon}>탑승하기</button></div>
      </>}
  </PaperPopup>

  if (!phase) return null
  return <aside className="park-balloon-hud" aria-label="열기구 운항">
    {phase === 'boarding' ? <>
      <strong>출발 대기 · 1/4</strong>
      <span>출발까지 {departure}초</span>
      <div className="park-balloon-actions">
        <button type="button" onClick={startLocalBalloon}>출발하기</button>
        <button type="button" onClick={cancelLocalBalloon}>탑승 취소</button>
      </div>
    </> : phase === 'takeoff' ? <span role="status">이륙 중</span>
      : phase === 'flying' ? <>
        <strong>조종석 · 남은 시간 {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</strong>
        <span><kbd>WASD / 방향키</kbd> 방향 · <kbd>Space</kbd> 상승 · <kbd>Shift</kbd> 하강</span>
        {boundary ? <span role="status">비행 구역 경계 · 공원 안쪽으로 돌아가세요</span> : null}
        <button type="button" onClick={returnLocalBalloon}>승강장 복귀</button>
      </> : phase === 'returning' ? <span role="status">{reason === 'terrain'
        ? '이곳에는 내릴 수 없어 승강장으로 돌아갑니다.' : '승강장으로 돌아갑니다.'}</span>
      : <span role="status">{landing === 'field' ? '착지했어요. 체험 종료 후 승강장으로 돌아갑니다.' : '승강장에 도착했어요.'} · {seconds}초</span>}
  </aside>
}
