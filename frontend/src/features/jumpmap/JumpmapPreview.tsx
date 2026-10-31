import { createRoot } from 'react-dom/client'
import { useEffect, useState } from 'react'
import { JumpmapOverlay } from './JumpmapOverlay'
import { acceptJumpEvent, applyJumpStatus, bindJumpmap, resetJumpmap, showTip, useJumpmap } from './state'
import { COURSE_VERSION, MAP_VERSION, RULES_VERSION, kstDate } from './course'
import './jumpmapPreview.css'

const scope = { channelId: 'preview', mapVersion: MAP_VERSION }
let revision = 0, serial = 0
const money = () => ({ todayEarned: useJumpmap.getState().todayEarned ?? 0, dailyCap: 100, earningsDate: kstDate() })
function fresh() {
  revision = 0; serial = 0; resetJumpmap(); bindJumpmap('101', 'preview', MAP_VERSION)
  applyJumpStatus({ ...scope, ...money(), revision: 0, enabled: true, rulesVersion: RULES_VERSION, courseVersion: COURSE_VERSION,
    isFirstRun: true, seenTips: [], activeRunId: null, bestFinishMs: null })
  showTip('START_SPOT')
}
function firstPad() {
  if (useJumpmap.getState().run) return
  acceptJumpEvent({ type: 'JUMPMAP_STARTED', ...scope, ...money(), revision: ++revision, runId: `preview-${++serial}`,
    rulesVersion: RULES_VERSION, courseVersion: COURSE_VERSION, serverTime: Date.now() })
}
function gate() {
  const s = useJumpmap.getState(), run = s.run
  if (!run || run.gatesPassed >= 6) return
  const rewards = [2, 4, 7, 11, 16, 24], n = run.gatesPassed + 1, grant = Math.min(rewards[n - 1]!, 100 - (s.todayEarned ?? 0))
  acceptJumpEvent({ type: 'JUMPMAP_GATE', ...scope, ...money(), revision: ++revision, runId: run.runId, gate: n, elapsedMs: n * 15000,
    coinsCalculated: rewards[n - 1]!, coinsGranted: grant, pending: false, runCoins: run.runCoins + grant, todayEarned: (s.todayEarned ?? 0) + grant })
}
function lastPad() {
  if (!useJumpmap.getState().run) return
  while (useJumpmap.getState().run!.gatesPassed < 6) gate()
  acceptJumpEvent({ type: 'JUMPMAP_FINAL_PAD', ...scope, revision: ++revision, runId: useJumpmap.getState().run!.runId })
}
function end(reason: 'FINISH' | 'FALL') {
  const s = useJumpmap.getState(), run = s.run
  if (!run || reason === 'FINISH' && !run.finalReached) return
  const grant = reason === 'FINISH' ? Math.min(36, 100 - (s.todayEarned ?? 0)) : 0
  acceptJumpEvent({ type: 'JUMPMAP_ENDED', ...scope, ...money(), revision: ++revision, runId: run.runId, reason,
    gatesPassed: reason === 'FINISH' ? 7 : run.gatesPassed, elapsedMs: 272180, runCoins: run.runCoins + grant,
    todayEarned: (s.todayEarned ?? 0) + grant, maxHeight: 46.5,
    ...(reason === 'FINISH' ? { finishMs: 272180, bestFinishMs: 272180, newBest: true } : {}) })
}
function Preview() {
  const s = useJumpmap(), [now, setNow] = useState(performance.now())
  useEffect(() => { fresh(); const timer = setInterval(() => setNow(performance.now()), 50); return () => { clearInterval(timer); resetJumpmap() } }, [])
  return <main className="jm-preview"><header><h1>돌탑 점프맵 · 반복 도전 HUD</h1><p>실제 FE 컴포넌트 · 모의 상태 · 지도/서버 연결 및 실제 엽전 지급 없음</p><div>
    <button onClick={fresh}>처음 상태</button><button disabled={!!s.run} onClick={firstPad}>첫 발판 (테스트)</button>
    <button disabled={!s.run || s.run.gatesPassed >= 6} onClick={gate}>구간 통과 (테스트)</button>
    <button disabled={!s.run} onClick={() => end('FALL')}>낙하 (테스트)</button>
    <button disabled={!s.run || s.run.finalReached} onClick={lastPad}>마지막 발판 (테스트)</button>
    <button disabled={!s.run?.finalReached} onClick={() => end('FINISH')}>호수 완주 (테스트)</button>
  </div></header><div className="jm-preview-stage"><div className="jm-preview-crosshair" aria-hidden="true">+</div>
    <JumpmapOverlay state={s} now={now} nearStart={!s.run} />
    <p className="jm-preview-note">낙하 후 바로 다시 도전해 보세요. 마지막 연잎에서는 완료 화면을 확인하고 계속하기로 진행해요.</p>
  </div></main>
}
if (import.meta.env.DEV) createRoot(document.getElementById('root')!).render(<Preview />)
