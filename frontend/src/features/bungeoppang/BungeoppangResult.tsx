import { PaperPopup } from '../tableLobby/PaperPopup'
import { BUNGEOPPANG as R, bungeoppangV4Preview } from './config'
import { escapeBungeoppang, isV4Grill, refreshBungeoppangWallet, startBungeoppang, submitBungeoppang, useBungeoppang } from './store'

export function BungeoppangResult() {
  const grill = useBungeoppang(s => s.grill), result = useBungeoppang(s => s.result)
  const submitting = useBungeoppang(s => s.submitting), submitError = useBungeoppang(s => s.submitError)
  const starting = useBungeoppang(s => s.starting), startError = useBungeoppang(s => s.startError)
  const walletError = useBungeoppang(s => s.walletError), status = useBungeoppang(s => s.status)
  if (!grill) return null
  const summary = result ?? grill, today = result?.todayEarned ?? status?.todayEarned
  const v4 = isV4Grill(grill), preview = v4 && bungeoppangV4Preview
  return <PaperPopup title="붕어빵 뒤집기" label="붕어빵 결과" onClose={escapeBungeoppang} className="bungeoppang-paper-result">
    <section role="region" aria-label="결과">
    <h2 style={{ fontSize: 'clamp(28px, 4vw, 39px)', marginTop: 20 }}>오늘도 잘 구웠어요</h2>
    <p className="paper-subtitle">이번 도전을 마쳤어요</p>
    {v4 && <small>{preview ? '승인된 납품 점수' : result ? '서버 확정 점수' : '승인 대기 납품 점수'}</small>}
    <div className="paper-score" aria-label={preview ? '승인된 납품 점수' : result ? '서버 확정 점수' : v4 ? '승인 대기 납품 점수' : '미리보기 점수'}>{summary.score.toLocaleString()}<small>점</small></div>
    <div className="paper-stats"><div><span>완성</span><b>{summary.made}개</b></div><div><span>실수</span><b className="paper-mistakes">{summary.failed}회</b></div></div>
    {v4 && <div className="paper-stats"><div><span>전달한 개수</span><b>{result?.served ?? grill.served}개</b></div><div><span>완료한 주문</span><b>{result?.customersServed ?? grill.customersServed}개</b></div></div>}
    <div className="paper-settlement" role="status"><strong>{preview ? `미리보기 · 환산 예상 ${result?.coinsCalculated ?? '확인 중'}냥` : result ? `받은 엽전 ${result.coinsGranted}냥` : submitError ? '보상 확인이 필요해요' : <><i className="paper-pending" aria-hidden="true" />보상 확인 중</>}</strong>
      <small>{preview ? '미리보기 · 실제 엽전 지급 없음' : result ? `오늘 번 엽전 ${today} / ${result.dailyCap}냥` : '확인이 끝나면 엽전에 반영돼요'}</small></div>
    {result?.capReached && <p>오늘 장사는 끝! 게임은 계속할 수 있어요</p>}
    {!preview && result && result.coinsGranted < result.coinsCalculated && <p>환산 {result.coinsCalculated}냥 중 오늘 한도를 적용해 {result.coinsGranted}냥을 받았어요.</p>}
    {submitError && <p className="paper-error" role="alert">{submitError.message}{submitError.retryable && !submitting && <button className="paper-text-button" onClick={() => void submitBungeoppang()}>같은 결과 다시 확인</button>}</p>}
    {startError && <p className="paper-error" role="alert">{startError}</p>}
    {walletError && <p className="paper-error">{walletError}<button className="paper-text-button" onClick={() => void refreshBungeoppangWallet()}>잔액 다시 확인</button></p>}
    <div className="paper-actions" style={{ gridTemplateColumns: '1fr 1fr' }}>
      <button className="paper-primary" disabled={starting || submitting || (!result && submitError?.retryable !== false)} onClick={event => { event.currentTarget.blur(); void startBungeoppang() }}>{starting ? '준비 중…' : preview ? '다시 하기' : '다시 도전'}</button>
      <button onClick={escapeBungeoppang}>공원으로</button>
    </div>
    <details><summary>장사 기록 자세히</summary><p>양면 황금 {summary.golden}개 · 버린 개수 {summary.wasted}개 · 최고 콤보 {summary.maxCombo}</p>
      {v4 && <p>특수 추가 점수 {result?.bonusScore ?? grill.bonusScore}</p>}
      <p>엽전 환산 {R.pointsPerCoin}점당 1냥 · {preview ? '미리보기 · 실제 엽전 지급 없음' : result ? '서버 정산 완료' : '서버 결과 확인 중'}</p></details>
    </section>
  </PaperPopup>
}
