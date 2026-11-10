import { STAGES } from './course'
import { useJumpmap, closeJumpCompletion } from './state'
import { JumpmapCompletion } from './JumpmapCompletion'
import './jumpmap.css'
import type { RankingLoader } from './JumpmapRanking'

type View = ReturnType<typeof useJumpmap.getState>
/** 공원과 독립 프리뷰가 같은 작은 읽기 전용 HUD를 사용한다. */
export function JumpmapOverlay({ state, now, nearStart, loadRankings }: { state: View; now: number; nearStart: boolean; loadRankings?: RankingLoader }) {
  const { run, completion, popup, tip } = state
  const stage = STAGES[Math.min(STAGES.length-1, run?.gatesPassed ?? 0)]!
  const completedRun = completion && (run?.runId === completion.runId ? run : state.result?.runId === completion.runId ? state.result : null)
  const receipt = popup && now - popup.at < 900 && run
  return <section className="jumpmap" aria-label="돌탑 점프맵">
    {run && <div className="jm-compact" aria-label="도전 현황">
      <time className="jm-time" aria-label="점프맵 경과 시간">{(Math.max(0, now - run.startedAt) / 1000).toFixed(2)}<small>초</small></time><strong>{stage.name}<small>{Math.min(STAGES.length, run.gatesPassed + 1)} / {STAGES.length}구간</small></strong>
      <ol className="jm-progress" aria-label={`${STAGES.length}구간 진행`}>{STAGES.map(s => <li key={s.stage}
        aria-label={s.name} aria-current={s.stage === run.gatesPassed + 1 ? 'step' : undefined}
        data-passed={s.stage <= run.gatesPassed} />)}</ol>
      <span className="jm-compact-coins" aria-label="점프맵 엽전 현황">이번 <b>{run.runCoins}냥</b><small>미니게임 오늘 {state.todayEarned ?? '—'} / 500냥</small></span>
    </div>}
    {completedRun && <JumpmapCompletion runCoins={completedRun.runCoins} todayEarned={state.todayEarned}
      finishMs={state.result?.finishMs ?? null} loadRankings={loadRankings} settled={!run && state.result?.reason === 'FINISH'} onClose={closeJumpCompletion} />}
    {receipt && <p className="jm-receipt" role="status" data-unconfirmed={popup.anticipated || popup.label.includes('정산')}>
      {popup.amount === null ? '보상 확인 중' : `+${popup.amount}냥`}<small>{popup.label || `${popup.gate}구간 지급`}</small>
    </p>}
    {!run && tip?.key === 'FIRST_FALL' && now < tip.until && <p className="jm-hint" role="status">{tip.text}</p>}
    {nearStart && !run && tip?.key === 'START_SPOT' && now < tip.until && <p className="jm-hint" role="status">첫 발판부터 바로 도전 · 놀이 방법 F1</p>}
    {nearStart && !state.available && <p className="jm-hint jm-unavailable" role="status"><strong>점프맵 준비 중</strong><span>{state.error || '코스 연결을 확인하고 있어요'}</span></p>}
    {state.recovering && <p className="jm-hint" role="status">도전을 다시 확인하고 있어요…</p>}
  </section>
}
