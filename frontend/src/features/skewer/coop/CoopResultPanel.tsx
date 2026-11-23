import { dailyEarningsText } from '../../minigameRewards'
import { useState } from 'react'
import { CoopRankingDialog } from './CoopRankingDialog'
import { useStore } from 'zustand'
import { PaperPopup, ResultTrophy } from '../../tableLobby/PaperPopup'
import { RewardCoinSource } from '../../wallet/RewardCoinFlight'
import coinImage from '../../../assets/entry/yeopjeon-icon.webp'
import cover from './art/result-celebration.png'
import type { CoopClient } from './client'

export const rankingReasonText = (reason?: string, mode = 'VR') => reason === 'NON_VR' ? '이전 규칙에서 PC 플레이 또는 방식 전환으로 제외된 기록이에요.'
  : reason === 'MODE_CHANGED' ? '경기 중 PC·VR 방식을 바꿔 이번 기록은 랭킹에서 제외됐어요.'
  : reason === 'EARLY_END' ? '영업을 끝까지 마치지 못한 경기는 팀 랭킹에 등록하지 않아요.'
    : reason === 'RULES_MISMATCH' ? '현재 랭킹과 영업시간 규칙이 달라요.' : `${mode} 요리사로 영업을 끝까지 완료한 팀 기록이에요.`

export const endReasonText = (reason: string | null) => reason === 'SKEWER_RUNTIME_ERROR'
  ? '진행 중 문제가 생겨 이번 경기를 마쳤어요. 보상 확인 후 다시 시작해 주세요.'
  : reason === 'SKEWER_DISCONNECT_TIMEOUT' ? '재접속 대기 시간이 끝나 경기를 마쳤어요.'
    : reason === 'SKEWER_FORFEIT' ? '참가자가 공동 경기를 종료했어요.' : '둘이 함께 만든 오늘의 기록'

export function CoopResultPanel({ client, leaving, onClose }: { client: CoopClient; leaving: boolean; onClose: () => void }) {
  const state = useStore(client.store), pub = state.snapshot!.publicState, result = state.result
  const [rankingOpen, setRankingOpen] = useState(false)
  const mode = pub.rankingMode ?? (pub.chefVR ? 'VR' : 'PC')
  const settled = result?.status === 'SETTLED'
  if (rankingOpen) return <CoopRankingDialog client={client} initialMode={mode}
    onClose={() => setRankingOpen(false)} backLabel="결과로 돌아가기" />
  return <PaperPopup title="온탑 꼬치왕 · 공동 경기 결과" label="공동 경기 결과" className="coop-result-paper" onClose={onClose} closeLabel="결과 창 닫기">
    <section aria-label="공동 경기 결과 요약" data-settlement={result?.status ?? 'PENDING'}>
      <header className="coop-result-heading"><ResultTrophy /><h2>오늘도 수고했어요!</h2></header>
      <p className="paper-subtitle">{endReasonText(pub.endReason)}</p>
      <div className="coop-result-layout"><div className="coop-team-record">
        <img className="coop-result-art" src={cover} alt="완성한 꼬치 접시를 들고 기뻐하는 요리사" />
        <div className="coop-result-score"><span>우리 팀이 함께 만든 점수</span><strong>{pub.score.toLocaleString('ko-KR')}<small>점</small></strong></div>
        <div className="coop-result-served"><span>서빙 완료</span><b>{pub.served}팀</b></div>
      </div><div className="coop-personal-reward">
      <p className="coop-section-label">나의 영업 보상</p>
      <div className="paper-settlement" role="status" aria-live="polite">
        <strong>{settled ? <RewardCoinSource receipt={`skewer-coop:${result.gameId}`} amount={result.coinsGranted!} soundOnReveal><img src={coinImage} alt="" width="42" height="42" /><span>내가 받은 엽전<b>{result.coinsGranted}냥</b></span></RewardCoinSource> : result?.status === 'UNAVAILABLE' ? '보상을 확인할 수 없어요' : state.resultError ? '보상을 불러오지 못했어요' : '개인 보상을 확인하고 있어요…'}</strong>
        <small>{settled ? `오늘 번 엽전 ${dailyEarningsText(result.todayEarned, result.dailyCap)}` : '잠시만 기다려 주세요.'}</small>
      </div>
      {settled && result.dailyCap > 0 ? <progress className="coop-daily-progress" aria-label="모든 미니게임 합산 오늘 보상 한도" value={result.todayEarned ?? 0} max={result.dailyCap} /> : null}
      <p className="coop-reward-calculation">개인 기본 환산 <b>{Math.floor(pub.score / 20)}냥</b><span>팀 점수 20점당 각자 1냥 · 일일 제한 없음</span></p>
      {settled && result.dailyCap > 0 && result.coinsGranted! < result.coinsCalculated ? <p className="coop-result-note">기본 {result.coinsCalculated}냥 중 오늘 남은 한도를 적용해 {result.coinsGranted}냥을 받았어요.</p> : null}
      {settled && result.dailyCap === 0 && result.coinsGranted! < result.coinsCalculated ? <p className="coop-result-note">이번 경기의 지급 상한 1000냥을 적용했어요. 다음 경기에서도 보상을 받을 수 있어요.</p> : null}
      {settled && result.dailyCap > 0 && result.remainingToday === 0 ? <p className="coop-result-note">오늘 보상 한도에 도달했어요. 무료 플레이는 계속할 수 있어요.</p> : null}
      <div className={`coop-result-ranking${result?.rankingStatus === 'REGISTERED' ? ' is-ranked' : ''}`}><strong>{result?.rankingStatus === 'REGISTERED' ? `${mode} 팀 기록 등록 완료` : result?.rankingStatus === 'EXCLUDED' ? '팀 랭킹 미등록 · 엽전 보상 가능' : pub.rankingEligible ? `${mode} 팀 기록 확인 중` : '팀 랭킹 미등록'}</strong><p>{!settled && pub.rankingEligible ? '보상과 팀 기록을 확인하고 있어요.' : rankingReasonText(result?.rankingReason ?? (pub.endReason !== 'SKEWER_TIME_UP' ? 'EARLY_END' : pub.rankingEligible ? 'ELIGIBLE' : 'MODE_CHANGED'), mode)}</p></div>
      {state.resultError ? <p className="paper-error" role="alert">{state.resultError}</p> : null}
      {!settled ? <button className="paper-text-button" disabled={state.resultPending} onClick={() => void client.refreshResult()}>보상 다시 확인</button> : null}
      </div></div>
      <div className="paper-actions"><button className="paper-primary" onClick={onClose} disabled={leaving}>{leaving ? '공원으로 이동 중…' : '공원으로 돌아가기'}</button><button aria-haspopup="dialog" onClick={() => setRankingOpen(true)}>팀 랭킹 보기</button></div>
      <details><summary>보상 기준 자세히</summary><p>팀 점수 20점당 두 사람에게 각각 1냥을 환산해요. 일일 획득량 제한 없이 보상을 받을 수 있어요. 한 판에는 최대 1000냥을 받아요.</p><p>반납·보관 중이거나 아직 손님에게 전달하지 않은 음식은 점수에 포함하지 않아요.</p>{settled ? <p>오늘 받은 보상 · 보유 엽전 {result.balance?.toLocaleString('ko-KR')}냥</p> : <p>잠시 후 보상 다시 확인을 눌러 주세요.</p>}</details>
    </section>
  </PaperPopup>
}
