import { useState } from 'react'
import { useStore } from 'zustand'
import { PaperPopup, ResultTrophy } from '../../tableLobby/PaperPopup'
import { RewardCoinSource } from '../../wallet/RewardCoinFlight'
import coinImage from '../../../assets/entry/yeopjeon-icon.webp'
import cover from './art/result-celebration.png'
import type { CoopClient } from './client'

export const rankingReasonText = (reason?: string) => reason === 'NON_VR' ? '요리사가 VR 없이 진행했거나 경기 중 PC로 전환했어요.'
  : reason === 'EARLY_END' ? '기권·연결 종료 경기는 팀 랭킹에 등록하지 않아요.'
    : reason === 'RULES_MISMATCH' ? '현재 랭킹과 영업시간 규칙이 달라요.' : 'VR 요리사로 영업을 끝까지 완료한 팀 기록이에요.'

export function CoopResultPanel({ client, leaving, onClose }: { client: CoopClient; leaving: boolean; onClose: () => void }) {
  const state = useStore(client.store), pub = state.snapshot!.publicState, result = state.result
  const [rankingOpen, setRankingOpen] = useState(false)
  const settled = result?.status === 'SETTLED'
  const openRanking = () => { setRankingOpen(true); void client.refreshRanking() }
  if (rankingOpen) return <PaperPopup title="온탑 꼬치왕 · 팀 최고 기록" label="꼬치왕 팀 랭킹" className="coop-result-paper coop-ranking-paper" closeLabel="랭킹 닫기" onClose={() => setRankingOpen(false)}>
    <h2>함께 만든 기록</h2><p className="paper-subtitle">전체 기간 · 같은 두 사람의 최고 점수</p>
    <p className="coop-result-note">역할을 바꾸어도 같은 팀이에요. 동점은 공동 순위로 표시해요.</p>
    {state.rankingPending ? <p role="status">팀 랭킹을 불러오고 있어요…</p> : null}
    {state.rankingError ? <p className="paper-error" role="alert">{state.rankingError}</p> : null}
    {state.ranking ? <><p className="coop-ranking-mine">{state.ranking.myBest ? `내 최고 팀 기록 ${state.ranking.myBest.rank}위 · ${state.ranking.myBest.teamScore.toLocaleString('ko-KR')}점` : '아직 등록된 내 팀 기록이 없어요.'}</p>
      {state.ranking.items.length ? <ol className="coop-ranking-list">{state.ranking.items.map(item => <li key={item.gameId}><b>{item.rank}위</b><span><strong>{item.chefNickname} · {item.serverNickname}</strong><small>요리사 · 서빙 담당</small></span><b>{item.teamScore.toLocaleString('ko-KR')}점</b></li>)}</ol> : <p>첫 VR 팀 기록에 도전해보세요.</p>}</> : null}
    <div className="paper-actions"><button disabled={state.rankingPending} onClick={() => void client.refreshRanking()}>랭킹 새로고침</button><button className="paper-primary" onClick={() => setRankingOpen(false)}>결과로 돌아가기</button></div>
  </PaperPopup>
  return <PaperPopup title="온탑 꼬치왕 · 공동 경기 결과" label="공동 경기 결과" className="coop-result-paper" onClose={onClose} closeLabel="결과 창 닫기">
    <section aria-label="공동 경기 결과 요약" data-settlement={result?.status ?? 'PENDING'}>
      <header className="coop-result-heading"><ResultTrophy /><h2>오늘도 수고했어요!</h2></header>
      <p className="paper-subtitle">{pub.endReason === 'SKEWER_DISCONNECT_TIMEOUT' ? '재접속 대기 시간이 끝나 경기를 마쳤어요.' : pub.endReason === 'SKEWER_FORFEIT' ? '참가자가 공동 경기를 종료했어요.' : '둘이 함께 만든 오늘의 기록'}</p>
      <div className="coop-result-layout"><div className="coop-team-record">
        <img className="coop-result-art" src={cover} alt="완성한 꼬치 접시를 들고 기뻐하는 요리사" />
        <div className="coop-result-score"><span>우리 팀이 함께 만든 점수</span><strong>{pub.score.toLocaleString('ko-KR')}<small>점</small></strong></div>
        <div className="coop-result-served"><span>서빙 완료</span><b>{pub.served}팀</b></div>
      </div><div className="coop-personal-reward">
      <p className="coop-section-label">나의 영업 보상</p>
      <div className="paper-settlement" role="status" aria-live="polite">
        <strong>{settled ? <RewardCoinSource receipt={`skewer-coop:${result.gameId}`} amount={result.coinsGranted!} soundOnReveal><img src={coinImage} alt="" width="42" height="42" /><span>내가 받은 엽전<b>{result.coinsGranted}냥</b></span></RewardCoinSource> : result?.status === 'UNAVAILABLE' ? '보상을 확인할 수 없어요' : state.resultError ? '보상을 불러오지 못했어요' : '개인 보상을 확인하고 있어요…'}</strong>
        <small>{settled ? `오늘 번 엽전 ${result.todayEarned} / ${result.dailyCap}냥 · 남은 한도 ${result.remainingToday}냥` : '잠시만 기다려 주세요.'}</small>
      </div>
      {settled ? <progress className="coop-daily-progress" aria-label="모든 미니게임 합산 오늘 보상 한도" value={result.todayEarned ?? 0} max={result.dailyCap} /> : null}
      <p className="coop-reward-calculation">개인 기본 환산 <b>{Math.floor(pub.score / 20)}냥</b><span>팀 점수 20점당 각자 1냥 · 오늘 남은 한도 적용</span></p>
      {settled && result.coinsGranted! < result.coinsCalculated ? <p className="coop-result-note">기본 {result.coinsCalculated}냥 중 오늘 남은 한도를 적용해 {result.coinsGranted}냥을 받았어요.</p> : null}
      {settled && result.remainingToday === 0 ? <p className="coop-result-note">오늘 보상 한도에 도달했어요. 무료 플레이는 계속할 수 있어요.</p> : null}
      <div className={`coop-result-ranking${result?.rankingStatus === 'REGISTERED' ? ' is-ranked' : ''}`}><strong>{result?.rankingStatus === 'REGISTERED' ? 'VR 팀 기록 등록 완료' : result?.rankingStatus === 'EXCLUDED' ? '팀 랭킹 미등록 · 엽전 보상 가능' : pub.rankingEligible ? 'VR 팀 기록 확인 중' : '팀 랭킹 미등록'}</strong><p>{!settled && pub.rankingEligible ? '보상과 팀 기록을 확인하고 있어요.' : rankingReasonText(result?.rankingReason ?? (pub.endReason !== 'SKEWER_TIME_UP' ? 'EARLY_END' : pub.rankingEligible ? 'ELIGIBLE' : 'NON_VR'))}</p></div>
      {state.resultError ? <p className="paper-error" role="alert">{state.resultError}</p> : null}
      {!settled ? <button className="paper-text-button" disabled={state.resultPending} onClick={() => void client.refreshResult()}>보상 다시 확인</button> : null}
      </div></div>
      <div className="paper-actions"><button className="paper-primary" onClick={onClose} disabled={leaving}>{leaving ? '공원으로 이동 중…' : '공원으로 돌아가기'}</button><button onClick={openRanking}>팀 랭킹 보기</button></div>
      <details><summary>보상 기준 자세히</summary><p>팀 점수 20점당 두 사람에게 각각 1냥을 환산해요. 소수점은 버리고, 모든 미니게임에서 오늘 받은 보상을 합쳐 각자 최대 500냥까지 받을 수 있어요.</p><p>반납·보관 중이거나 아직 손님에게 전달하지 않은 음식은 점수에 포함하지 않아요.</p>{settled ? <p>오늘 받은 보상 · 보유 엽전 {result.balance?.toLocaleString('ko-KR')}냥</p> : <p>잠시 후 보상 다시 확인을 눌러 주세요.</p>}</details>
    </section>
  </PaperPopup>
}
