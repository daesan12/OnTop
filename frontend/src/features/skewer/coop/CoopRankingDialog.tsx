import { useEffect } from 'react'
import { useStore } from 'zustand'
import { PaperPopup } from '../../tableLobby/PaperPopup'
import type { CoopClient } from './client'

export function CoopRankingDialog({ client, onClose, backLabel }: {
  client: CoopClient; initialMode: 'PC' | 'VR'; onClose(): void; backLabel: string
}) {
  const ranking = useStore(client.store, s => s.ranking)
  const pending = useStore(client.store, s => s.rankingPending)
  const error = useStore(client.store, s => s.rankingError)
  const mode = 'ALL' as const
  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => { if (!cancelled) void client.refreshRanking(mode) })
    return () => { cancelled = true }
  }, [client, mode])

  return <PaperPopup title="온탑 꼬치왕 · 팀 최고 기록" label="꼬치왕 팀 랭킹" className="coop-result-paper coop-ranking-paper" closeLabel="랭킹 닫기" onClose={onClose}>
    <h2>PC·VR 통합 팀 기록</h2><p className="paper-subtitle">전체 기간 · 같은 두 사람의 최고 점수</p>
    <p className="coop-result-note">역할을 바꾸어도 같은 팀이에요. 동점은 공동 순위로 표시해요.</p>
    {pending && <p role="status">팀 랭킹을 불러오고 있어요…</p>}
    {error && <p className="paper-error" role="alert">{error}</p>}
    {ranking?.playMode === mode && <><p className="coop-ranking-mine">{ranking.myBest ? `내 최고 팀 기록 ${ranking.myBest.rank}위 · ${ranking.myBest.teamScore.toLocaleString('ko-KR')}점` : '아직 등록된 내 팀 기록이 없어요.'}</p>
      {ranking.items.length ? <ol className="coop-ranking-list">{ranking.items.map(item => <li key={item.gameId}><b>{item.rank}위</b><span><strong>{item.chefNickname}{item.playMode === 'VR' && <small className="ranking-vr-badge">VR</small>} · {item.serverNickname}{item.playMode === 'VR' && <small className="ranking-vr-badge">VR</small>}</strong><small>요리사 · 서빙 담당</small></span><b>{item.teamScore.toLocaleString('ko-KR')}점</b></li>)}</ol> : <p>첫 팀 기록에 도전해보세요.</p>}</>}
    <div className="paper-actions"><button type="button" disabled={pending} onClick={() => void client.refreshRanking(mode)}>랭킹 새로고침</button><button type="button" className="paper-primary" onClick={onClose}>{backLabel}</button></div>
  </PaperPopup>
}
