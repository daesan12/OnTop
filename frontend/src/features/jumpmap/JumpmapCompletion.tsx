import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PaperPopup } from '../tableLobby/PaperPopup'
import { clearRoamingInput } from '../../world/inputOwnership'
import coinImage from '../../assets/entry/yeopjeon-icon.webp'
import './jumpmapCompletion.css'
import './rewardFeedback.css'
import { JumpmapRanking, jumpTime, type RankingLoader } from './JumpmapRanking'
import { DAILY_CAP, REWARDS, STAGES } from './course'

/** 마지막 연잎에서만 여는 종이 완료 화면. 이동을 정리하고, 닫은 뒤 직접 호수로 진행한다. */
export function JumpmapCompletion({ runCoins, todayEarned, settled, finishMs, loadRankings, onClose }: {
  runCoins: number; todayEarned: number | null; settled: boolean; finishMs: number | null; loadRankings?: RankingLoader; onClose(): void
}) {
  const [rankingOpen, setRankingOpen] = useState(false)
  const rankingButton = useRef<HTMLButtonElement>(null), returning = useRef(false)
  const returnToResult = () => { returning.current = true; setRankingOpen(false) }
  const fullReward = REWARDS.reduce((sum, reward) => sum + reward, 0)
  const capped = todayEarned !== null && todayEarned >= DAILY_CAP
  const confirming = !settled || todayEarned === null || runCoins < fullReward && !capped
  useEffect(() => { clearRoamingInput(); return clearRoamingInput }, [])
  return createPortal(<div className="jumpmap jm-completion-root">
    {rankingOpen ? <PaperPopup key="ranking" title="돌탑 타임어택 랭킹" label="돌탑 타임어택 랭킹" className="jm-completion-paper jm-ranking-paper"
      onClose={returnToResult} closeLabel="랭킹 닫기">
      <JumpmapRanking load={loadRankings} onBack={returnToResult}/>
    </PaperPopup> : <PaperPopup key="result" title="돌탑 도전 완료" label="점프맵 완료" className="jm-completion-paper" onClose={onClose} closeLabel="완료 화면 닫기"
      initialFocusRef={returning.current ? rankingButton : undefined}>
      <h2>돌탑 도전 완료</h2>
      <p className="paper-subtitle">마지막 연잎까지 멋지게 완주했어요!</p>
      <p className="jm-finish-time" aria-label="완주 시간">{finishMs === null ? '기록 확인 중…' : jumpTime(finishMs)}</p>
      <div className="jm-paper-ornament" aria-hidden="true">❖</div>
      <div className="jm-paper-hero"><img src="/art/jumpmap/guide-3.webp" alt="마지막 연잎에서 호수로 뛰어드는 캐릭터" width="400" height="240" /></div>
      <div className="paper-stats"><div><span>도착 구간</span><b>7 / 7</b></div><div><span>이번 도전 받은 엽전</span><b>{runCoins}<small>냥</small></b></div></div>
      <div className="paper-settlement" role="status"><strong><img src={coinImage} alt="" width="28" height="28" />미니게임 합산 수입 {todayEarned ?? '—'} / {DAILY_CAP}냥</strong>
        {confirming ? <small>기록과 구간 보상을 확인하고 있어요.</small> : capped && runCoins < fullReward
          ? <small>완주 보상 {fullReward}냥 중 남은 일일 한도만큼 {runCoins}냥을 받았어요.</small> : null}</div>
      {capped && <p className="jm-completion-note">오늘 미니게임 보상 한도에 도달했어요. 기록 도전은 계속할 수 있어요.</p>}
      <details className="jm-reward-detail"><summary>구간 보상 자세히</summary>
        <dl>{STAGES.map(stage => <div key={stage.stage}><dt>{stage.stage}구간 · {stage.name}</dt><dd>{stage.reward}냥</dd></div>)}</dl>
        <p>완주 합계 {fullReward}냥 · 실제 지급액은 오늘 남은 한도에 따라 달라져요.</p>
      </details>
      <div className="jm-ranking-entry"><button ref={rankingButton} className="paper-secondary" aria-haspopup="dialog" onClick={() => setRankingOpen(true)}>타임어택 랭킹 보기</button></div>
      <div className="paper-actions"><button className="paper-primary" onClick={onClose}>계속하기</button></div>
      <p className="jm-completion-shortcut">Esc로 닫기</p>
    </PaperPopup>}
  </div>, document.body)
}
