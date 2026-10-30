import { useEffect, useState } from 'react'
import { avatars, sampleAvatar, useSession } from '../../network/worldClient'
import { GENERATED_PARK_ENABLED } from '../../park/mapSelection'
import { selectDestination } from '../navigation/navigationState'
import { openManual } from '../manual/manualState'
import { setSfxSettings, useSfxSettings } from '../../audio/bgm'
import { RETURN_TO, START, STAGES } from './course'
import { useJumpmap } from './state'
import './jumpmap.css'

export const formatJumpTime = (ms: number) => `${Math.floor(ms / 60000)}:${(ms % 60000 / 1000).toFixed(2).padStart(5, '0')}`
const reasons = { FALL: '아쉽게 떨어졌어요', LAKE: '호수에 도착했어요', DISCONNECT: '연결이 끊겨 도전을 마쳤어요', TIMEOUT: '도전 시간이 끝났어요', RESET: '도전을 마쳤어요', LEFT: '코스를 떠났어요', FINISH: '7구간 완주!' }
export function JumpmapHud() {
  const state = useJumpmap(), muted = useSfxSettings(s => s.muted)
  const [frame, setFrame] = useState({ now: performance.now(), feet: 0, near: false })
  useEffect(() => {
    if (!GENERATED_PARK_ENABLED) return
    const timer = setInterval(() => {
      if (document.hidden) return
      const own = avatars.get(useSession.getState().sessionId), now = performance.now()
      const p = own && sampleAvatar(own, now, { ...own.current })
      setFrame({ now, feet: p ? p.y - .8 : 0, near: !!p && Math.hypot(p.x - START.x, p.z - START.z) < 4 && Math.abs(p.y - .8 - START.y) < 2 })
    }, 100)
    return () => clearInterval(timer)
  }, [])
  if (!GENERATED_PARK_ENABLED) return null
  const { run, banner, popup, tip, recovering } = state, { now, feet, near } = frame
  const result = state.result && state.result.until > now ? state.result : null
  const stage = STAGES[Math.min(6, run?.gatesPassed ?? 0)]!
  const guide = () => {
    const s = useSession.getState()
    if (s.status === 'connected' && s.mapCompatible) selectDestination(RETURN_TO, s.sessionId, s.roomId)
    document.querySelector('canvas')?.focus({ preventScroll: true })
  }
  return <section className="jumpmap" aria-label="돌탑 점프맵">
    {near && !run && !result && <div className="jm-start">
      <span className="jm-eyebrow">돌탑 점프맵</span><strong>{state.available ? '첫 발판을 밟으면 시작해요' : '점프맵 준비 중'}</strong>
      <span>{state.available ? 'WASD 이동 · Space 점프 · Shift 달리기' : state.error || '서버의 코스 준비 상태를 확인하고 있어요'}</span>
      <small>7구간 · 세이브 없음 · 하루 최대 100냥</small>
      <button onClick={() => openManual('jump')}>놀이 방법 · F1</button>
    </div>}
    {run && <>
      <div className="jm-card jm-run" aria-label="도전 현황">
        <span className="jm-eyebrow">돌탑 점프맵 · {Math.min(7, run.gatesPassed + 1)}구간</span>
        <h2>{stage.name}<small> {stage.subtitle}</small></h2>
        <div className="jm-metrics"><span>현재 높이<b>{Math.max(0, feet).toFixed(1)}<small> m</small></b></span><span>경과 시간<b>{formatJumpTime(Math.max(run.elapsedMs, now - run.startedAt))}</b></span></div>
        <p>통과한 문 {run.gatesPassed} / 7 · 세이브 포인트 없음</p>
      </div>
      <div className="jm-card jm-coins" aria-label="점프맵 엽전 현황">
        <span className="jm-eyebrow">오늘 점프맵 엽전 · 한국 시간 기준</span>
        <div className="jm-total">{state.todayEarned ?? '—'} <small>/ 100냥</small></div>
        <progress max={100} value={state.todayEarned ?? 0} aria-label="오늘 점프맵 수입" />
        <div className="jm-coin-note"><span>이번 도전 <b>{run.runCoins}냥</b></span><span>다음 문 <b>{stage.reward}냥</b></span></div>
        {state.todayEarned === 100 && <p>오늘 상한 도달 · 완주 기록은 계속 남아요</p>}
        {state.error && <p role="status">수입 정보를 다시 확인하고 있어요</p>}
        <button className="jm-sound" onClick={() => setSfxSettings({ muted: !muted })}>{muted ? '효과음 켜기' : '효과음 끄기'}</button>
      </div>
      <ol className="jm-stages" aria-label="7구간 진행">{STAGES.map(s => <li key={s.stage} aria-current={s.stage === run.gatesPassed + 1 ? 'step' : undefined} data-passed={s.stage <= run.gatesPassed}><strong>{s.stage}. {s.name}</strong><span>{s.reward}냥</span></li>)}</ol>
    </>}
    {recovering && <p className="jm-recovery" role="status">진행 중인 도전을 다시 확인하고 있어요…</p>}
    {banner && banner.until > now && <div className="jm-banner" key={banner.until} role="status"><strong>{banner.title}</strong><span>{banner.subtitle}</span></div>}
    {popup && now - popup.at < 2200 && <div className="jm-popup jm-receipt" key={`${popup.gate}:${popup.anticipated}`} data-unconfirmed={popup.anticipated || popup.label.includes('정산')} role="status"><strong>{popup.amount === null ? '확인 중' : `+${popup.amount}냥`}</strong><small>{popup.gate}구간 · {popup.label || '지급 완료'}</small></div>}
    {tip && !result && (run || !near) && tip.until > now && <p className="jm-tip" role="status">{tip.text}</p>}
    {result && <div className="jm-card jm-result" data-finish={result.reason === 'FINISH'} aria-label="점프맵 결과" role="status">
      <span className="jm-eyebrow">돌탑 점프맵 · 도전 결과</span><h2>{reasons[result.reason]}</h2>
      {result.finishMs !== undefined && <div className="jm-finish-time">{formatJumpTime(result.finishMs)}</div>}
      {result.newBest && <p className="jm-best">나의 새 최고 기록!</p>}
      {result.bestFinishMs != null && <p>개인 최고 {formatJumpTime(result.bestFinishMs)}</p>}
      <p>통과 {result.gatesPassed} / 7 · 최고 높이 {result.maxHeight.toFixed(1)}m<br/>이번 도전 {result.runCoins}냥 · 받은 엽전은 그대로예요</p>
      <div className="jm-return"><span>걸어서 출발 자리로 돌아가요</span><button onClick={guide}>돌탑 길 안내</button></div>
    </div>}
  </section>
}
