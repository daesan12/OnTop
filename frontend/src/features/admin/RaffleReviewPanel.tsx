import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AdminEventsError, confirmRaffleReview, createRaffleReview, loadCurrentRaffleReview,
  rerollRaffleReview, type RaffleReview,
} from './adminEvents'

type Action = 'draw' | 'reroll' | 'confirm'

const displayTime = (value: string) => new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short',
}).format(new Date(value))

export function RaffleReviewPanel({ week, eligible, finalized, canOperate, onRoundChanged, onAuthEnded }: {
  week: string
  eligible: boolean
  finalized: boolean
  canOperate: boolean
  onRoundChanged: () => Promise<void>
  onAuthEnded: () => void
}) {
  const [review, setReview] = useState<RaffleReview | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [confirmation, setConfirmation] = useState<'reroll' | 'confirm' | null>(null)
  const [reason, setReason] = useState('')
  const request = useRef<AbortController | null>(null)
  const busyRef = useRef(false)

  const reload = useCallback(async () => {
    request.current?.abort()
    setReview(null); setError(''); setNotice(''); setConfirmation(null)
    if (finalized) return
    const controller = request.current = new AbortController()
    setLoading(true)
    try {
      const current = await loadCurrentRaffleReview(week, controller.signal)
      if (!controller.signal.aborted) setReview(current)
    } catch (cause) {
      if (controller.signal.aborted) return
      if (cause instanceof AdminEventsError && cause.kind === 'unauthenticated') onAuthEnded()
      else if (cause instanceof AdminEventsError && cause.code === 'RAFFLE_ALREADY_FINALIZED') {
        await onRoundChanged()
      } else setError(cause instanceof Error ? cause.message : '추첨 결과를 조회하지 못했습니다.')
    } finally { if (!controller.signal.aborted) setLoading(false) }
  }, [week, finalized, onRoundChanged, onAuthEnded])

  useEffect(() => {
    void reload()
    return () => request.current?.abort()
  }, [reload])

  async function run(action: Action) {
    if (busyRef.current || !canOperate || !eligible || finalized || loading) return
    const selectedId = review?.drawId
    if (action !== 'draw' && !selectedId) return
    const trimmedReason = reason.trim()
    if (action === 'reroll' && (!trimmedReason || trimmedReason.length > 500)) {
      setError('재추첨 사유를 1~500자로 입력해주세요.'); return
    }
    const controller = request.current = new AbortController()
    busyRef.current = true; setBusy(true); setError(''); setNotice('')
    try {
      if (action !== 'draw') {
        const current = await loadCurrentRaffleReview(week, controller.signal)
        if (controller.signal.aborted) return
        if (current?.drawId !== selectedId) {
          setReview(current); setConfirmation(null)
          setError('다른 관리자가 추첨 결과를 변경했습니다. 최신 결과를 확인한 뒤 다시 진행해주세요.')
          return
        }
      }
      if (action === 'confirm') {
        await confirmRaffleReview(week, selectedId!, controller.signal)
        if (controller.signal.aborted) return
        setConfirmation(null)
        await onRoundChanged()
      } else {
        const result = action === 'draw'
          ? await createRaffleReview(week, controller.signal)
          : await rerollRaffleReview(week, selectedId!, trimmedReason, controller.signal)
        if (controller.signal.aborted) return
        setReview(result); setConfirmation(null); setReason('')
        setNotice(action === 'draw' ? '저장된 사전 추첨 결과입니다. 검토 후 확정해주세요.' : '재추첨 결과를 저장했습니다. 검토 후 확정해주세요.')
      }
    } catch (cause) {
      if (controller.signal.aborted) return
      if (cause instanceof AdminEventsError && cause.kind === 'unauthenticated') { onAuthEnded(); return }
      setConfirmation(null)
      setError(cause instanceof Error ? cause.message : '요청을 처리하지 못했습니다.')
      // A timed-out POST may have succeeded. Restore the saved attempt before another action.
      try {
        const current = await loadCurrentRaffleReview(week, controller.signal)
        if (!controller.signal.aborted) setReview(current)
      } catch (reloadError) {
        if (reloadError instanceof AdminEventsError && reloadError.code === 'RAFFLE_ALREADY_FINALIZED') {
          setReview(null); await onRoundChanged()
        } else if (reloadError instanceof AdminEventsError && reloadError.kind === 'unauthenticated') onAuthEnded()
        else setReview(null)
      }
    } finally {
      busyRef.current = false; setBusy(false)
    }
  }

  if (finalized) return null
  return <div className="admin-events-review" aria-label="응모권 추첨 검토">
    <div className="admin-events-panel-head"><h4>사전 추첨 검토</h4>
      <button type="button" disabled={loading || busy} onClick={() => void reload()}>추첨 결과 새로고침</button></div>
    {loading && <p role="status">저장된 추첨 결과를 조회하고 있습니다…</p>}
    {error && <p role="alert" className="admin-feedback-error">{error}</p>}
    {notice && <p role="status" className="admin-events-notice">{notice}</p>}
    {!loading && !review && !error && <p>사전 추첨 결과가 없습니다. 추첨을 실행한 뒤 결과를 검토해주세요.</p>}
    {review && !loading && <>
      <dl className="admin-events-facts">
        <div><dt>시도</dt><dd>{review.attemptNumber}회 · #{review.drawId}</dd></div>
        <div><dt>추첨 시각</dt><dd>{displayTime(review.drawnAt)}</dd></div>
        <div><dt>후보(제외 전)</dt><dd>{review.candidateCount}</dd></div>
        <div><dt>GM 제외 건수</dt><dd>{review.excludedGmCount}</dd></div>
        <div><dt>GM 제외 후</dt><dd>{review.candidateCount - review.excludedGmCount}</dd></div>
        <div><dt>당첨 / 상품 슬롯</dt><dd>{review.awardedPrizeCount} / {review.expectedPrizeCount}</dd></div>
        <div><dt>공석</dt><dd>{review.vacantPrizeCount}</dd></div>
      </dl>
      {review.rerollReason && <p>이전 결과 재추첨 사유: {review.rerollReason}</p>}
      <div className="admin-events-results"><h4>현재 검토 결과</h4>
        {review.picks.length ? <ol>{review.picks.map((pick, index) => <li key={`${pick.userId}-${index}`}>
          <strong>{pick.place}등 · {pick.prizeName}</strong>
          <span>{pick.nickname || `회원 #${pick.userId}`}</span><small>{pick.evidence}</small>
        </li>)}</ol> : <p>당첨자가 없습니다. 모든 상품 슬롯이 공석입니다.</p>}
      </div>
    </>}
    {canOperate && <div className="admin-events-action">
      {!review && <button type="button" disabled={!eligible || busy || loading || !!error}
        onClick={() => void run('draw')}>{busy ? '추첨 중…' : '사전 추첨 실행'}</button>}
      {review && !confirmation && <>
        <button type="button" disabled={!eligible || busy || loading} onClick={() => setConfirmation('confirm')}>검토 결과 확정</button>
        <button type="button" disabled={!eligible || busy || loading} onClick={() => setConfirmation('reroll')}>재추첨</button>
      </>}
      {review && confirmation === 'confirm' && <div role="group" aria-label="추첨 확정 확인">
        <p>현재 <strong>{review.attemptNumber}회차 추첨 #{review.drawId}</strong>의 {review.awardedPrizeCount}명 당첨 결과를 최종 확정합니다. 확정 후 재추첨할 수 없습니다.</p>
        <button type="button" disabled={busy} onClick={() => void run('confirm')}>{busy ? '확정 중…' : '이 결과 최종 확정'}</button>
        <button type="button" disabled={busy} onClick={() => setConfirmation(null)}>취소</button>
      </div>}
      {review && confirmation === 'reroll' && <div role="group" aria-label="재추첨 사유 입력">
        <label htmlFor="admin-raffle-reroll-reason">재추첨 사유</label>
        <textarea id="admin-raffle-reroll-reason" maxLength={500} value={reason}
          disabled={busy} onChange={event => setReason(event.target.value)} />
        <button type="button" disabled={busy || !reason.trim()} onClick={() => void run('reroll')}>{busy ? '재추첨 중…' : '사유 기록하고 재추첨'}</button>
        <button type="button" disabled={busy} onClick={() => setConfirmation(null)}>취소</button>
      </div>}
      {!eligible && <p>마감 후 추첨 가능 시각부터 실행할 수 있습니다.</p>}
    </div>}
    {!canOperate && <p>추첨 실행과 확정은 운영 권한이 있는 관리자만 할 수 있습니다.</p>}
  </div>
}
