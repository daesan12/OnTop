import { useState } from 'react'
import { PaperPopup } from '../tableLobby/PaperPopup'
import { BUNGEOPPANG as R, bungeoppangV4Preview, bungeoppangV5Preview } from './config'
import { escapeBungeoppang, isV4Grill, refreshBungeoppangWallet, setBungeoppangHelp, startBungeoppang, submitBungeoppang, useBungeoppang } from './store'
import './bungeoppangResult.css'
import { RankingDetails, RankingSummary, useBungeoppangRanking } from './BungeoppangRanking'
import { RewardCoinSource } from '../wallet/RewardCoinFlight'
import { bungeoppangService } from './service'

function ActionIcon({ kind }: { kind: 'retry' | 'park' | 'book' }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'retry' ? <path d="M19 7v5h-5M19 12a7 7 0 1 1-2-5L19 9" />
      : kind === 'park' ? <path d="m3 11 9-8 9 8M6 9v12h5v-7h3v7h4V9" />
        : <path d="M12 5v16M12 5C9 3 5 3 2 4v15c3-1 7-1 10 2 3-3 7-3 10-2V4c-3-1-7-1-10 1Z" />}
  </svg>
}

export function BungeoppangResult() {
  const grill = useBungeoppang(s => s.grill), result = useBungeoppang(s => s.result)
  const submitting = useBungeoppang(s => s.submitting), submitError = useBungeoppang(s => s.submitError)
  const starting = useBungeoppang(s => s.starting), startError = useBungeoppang(s => s.startError)
  const walletError = useBungeoppang(s => s.walletError), status = useBungeoppang(s => s.status)
  const gameId = useBungeoppang(s => s.gameId), [rankingOpen, setRankingOpen] = useState(false)
  const rulesVersion = isV4Grill(grill) ? grill.rulesVersion : R.rulesVersion
  const ranking = useBungeoppangRanking(rulesVersion, `${gameId}/${!!result}`, !!grill)
  if (!grill) return null
  const summary = result ?? grill, today = result?.todayEarned ?? status?.todayEarned
  const v4 = isV4Grill(grill), preview = v4 && (bungeoppangV4Preview || bungeoppangV5Preview)
  if (rankingOpen) return <PaperPopup key="ranking" title="붕어빵 전체 랭킹" label="붕어빵 전체 랭킹" closeLabel="랭킹 닫기"
    onClose={() => setRankingOpen(false)} className="bungeoppang-paper-result bungeoppang-ranking-popup">
    <RankingDetails feed={ranking} rulesVersion={rulesVersion} onBack={() => setRankingOpen(false)} />
  </PaperPopup>
  return <PaperPopup key="result" title="붕어빵 도전 결과" label="붕어빵 결과" onClose={escapeBungeoppang} className="bungeoppang-paper-result">
    <section role="region" aria-label="결과">
    <h2>붕어빵 도전 결과</h2>
    <p className="paper-subtitle">{summary.made ? '따끈따끈, 오늘의 장사를 마쳤어요' : '다음엔 더 잘할 수 있어요!'}</p>
    <div className="bung-result-ornament" aria-hidden="true">❖</div>
    <div className="bung-result-hero" data-empty={summary.made === 0}>
      <img src="/art/bungeoppang/result-fish.webp" alt="노릇하게 구운 붕어빵" width="400" height="220" />
    </div>
    <div className="paper-stats"><div><span>완성</span><b>{summary.made}개</b></div><div><span>실수</span><b className="paper-mistakes">{summary.failed}회</b></div></div>
    <RankingSummary feed={ranking} onOpen={() => setRankingOpen(true)} />
    <div className="paper-settlement" role="status"><strong><RewardCoinSource receipt={gameId ? `minigame:${gameId}` : ''} amount={!bungeoppangService.mock && !preview ? result?.coinsGranted ?? 0 : 0}><span className="bung-result-coin" aria-hidden="true">▣</span>{preview ? `미리보기 · 환산 예상 ${result?.coinsCalculated ?? '확인 중'}냥` : result ? `받은 엽전 ${result.coinsGranted}냥` : submitError ? '보상 내역을 확인하지 못했어요' : '보상 확인 중'}</RewardCoinSource></strong>
      <small>{preview ? '미리보기 · 실제 엽전 지급 없음' : result ? `오늘 번 엽전 ${today} / ${result.dailyCap}냥` : '확인이 끝나면 엽전에 반영돼요'}</small></div>
    {result?.capReached && <p>오늘 장사는 끝! 게임은 계속할 수 있어요</p>}
    {!preview && result && result.coinsGranted < result.coinsCalculated && <p>환산 {result.coinsCalculated}냥 중 오늘 한도를 적용해 {result.coinsGranted}냥을 받았어요.</p>}
    {submitError && <p className="paper-error" role="alert">{submitError.message}{submitError.retryable && !submitting && <button className="paper-text-button" onClick={() => void submitBungeoppang()}>같은 결과 다시 확인</button>}</p>}
    {startError && <p className="paper-error" role="alert">{startError}</p>}
    {walletError && <p className="paper-error">{walletError}<button className="paper-text-button" onClick={() => void refreshBungeoppangWallet()}>잔액 다시 확인</button></p>}
    <div className="paper-actions">
      <button className="paper-primary" disabled={starting || submitting || (!result && submitError?.retryable !== false)} onClick={event => { event.currentTarget.blur(); void startBungeoppang() }}><ActionIcon kind="retry" />{starting ? '준비 중…' : preview ? '다시 하기' : '다시 도전'}</button>
      <button className="paper-primary" onClick={escapeBungeoppang}><ActionIcon kind="park" />공원으로</button>
      <button onClick={() => setBungeoppangHelp(true)}><ActionIcon kind="book" />설명서</button>
    </div>
    <div className="bung-result-score"><span>{preview ? '승인된 납품 점수' : result ? '서버 확정 점수' : v4 ? '승인 대기 납품 점수' : '미리보기 점수'}</span><b aria-label={preview ? '승인된 납품 점수' : result ? '서버 확정 점수' : v4 ? '승인 대기 납품 점수' : '미리보기 점수'}>{summary.score.toLocaleString()}<small>점</small></b></div>
    <details><summary>장사 기록 자세히</summary><p>양면 황금 {summary.golden}개 · 버린 개수 {summary.wasted}개 · 최고 콤보 {summary.maxCombo}</p>
      {v4 && <p>전달한 개수 {result?.served ?? grill.served}개 · 완료한 주문 {result?.customersServed ?? grill.customersServed}개</p>}
      {v4 && <p>특수 추가 점수 {result?.bonusScore ?? grill.bonusScore}</p>}
      <p>엽전 환산 {R.pointsPerCoin}점당 1냥 · {preview ? '미리보기 · 실제 엽전 지급 없음' : result ? '서버 정산 완료' : '서버 결과 확인 중'}</p></details>
    </section>
  </PaperPopup>
}
