import { useEffect, useRef, useState, type ReactNode } from 'react'

/** 요청 버튼과 서버가 승인한 응답 대기 카드를 같은 자리에 표시한다. */
export function OmokRequestCard({ label, symbol, pending, requester, remaining, requestDisabled,
  responseDisabled, requestHint, decision, decisionId, onRequest, onRespond, used = false }: {
  label: string; symbol: ReactNode; pending: boolean; requester: boolean; remaining: number
  requestDisabled: boolean; responseDisabled: boolean; requestHint: string; decision?: string; decisionId?: string
  onRequest(): void; onRespond(accept: boolean): void; used?: boolean
}) {
  const previousDecision = useRef(decisionId)
  const [showDecision, setShowDecision] = useState(false)
  useEffect(() => {
    const changed = previousDecision.current !== decisionId
    previousDecision.current = decisionId
    if (pending) { setShowDecision(false); return }
    if (!changed || !decisionId) return
    setShowDecision(true)
    const timer = setTimeout(() => setShowDecision(false), 3500)
    return () => clearTimeout(timer)
  }, [decisionId, pending])
  const seconds = Math.min(10, Math.max(0, Math.ceil(remaining / 1000)))
  if (!pending) return <div className="omok-request-action" role="group" aria-label={`오목 ${label}`}>
    <button type="button" className="omok-request-trigger" disabled={requestDisabled} title={used ? '이번 경기의 무승부 요청을 사용했어요.' : requestHint}
      onClick={onRequest}><span aria-hidden="true">{symbol}</span>{label}{used && <small>사용함</small>}</button>
    {showDecision && decision && <span className="omok-request-feedback" role="status">{decision}</span>}
  </div>
  return <aside className="omok-request-card" role="group" aria-label={`오목 ${label}`} data-pending="true">
    <header><span className="omok-request-symbol" aria-hidden="true">{symbol}</span><strong>{label} 요청</strong>
      <span className="omok-request-seconds" aria-label={`응답까지 ${seconds}초`}>{seconds}<small>초</small></span></header>
    <p role="status">{requester ? '상대의 응답을 기다리고 있어요.' : `상대가 ${label}를 요청했어요.`}</p>
    <progress aria-label={`${label} 응답 남은 시간`} max={10000} value={Math.min(10000, remaining)} />
    <small className="omok-request-clock-note">착수 시계는 계속 진행돼요.</small>
    {!requester && <div className="omok-request-responses">
      <button type="button" className="omok-request-accept" disabled={responseDisabled || remaining <= 0} onClick={() => onRespond(true)}>{label}</button>
      <button type="button" disabled={responseDisabled || remaining <= 0} onClick={() => onRespond(false)}>거절</button>
    </div>}
  </aside>
}
