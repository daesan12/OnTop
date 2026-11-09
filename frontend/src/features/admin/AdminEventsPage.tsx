import { useCallback, useEffect, useRef, useState } from 'react'
import type { AdminAccess } from './adminAccess'
import { RaffleReviewPanel } from './RaffleReviewPanel'
import { AdminMinigamePanel } from './AdminMinigamePanel'
import {
  AdminEventsError, assetWeek, confirmEventDelivery, eventKinds, eventLabels, firstMinigameWeek,
  finalizeEventRound, isMondayWeek, kstMonday, loadEventRound, loadEventWinners,
  revealEventContact, schedule, supportsWeek, winnerLabels,
  type AdminEventWinner, type AdminWinnersPage, type ContactStatus, type EventSection, type EventRound,
  type RevealedContact, type WinnerType,
} from './adminEvents'
import './adminEvents.css'

const displayTime = (value: string) => new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short',
}).format(new Date(value))
const contactLabels: Record<ContactStatus, string> = {
  NOT_SUBMITTED: '미입력', SUBMITTED: '입력 완료', EXPIRED: '보관 기간 만료',
}

export function AdminEventsPage({ access, onAuthEnded }: { access: AdminAccess; onAuthEnded: () => void }) {
  const [weekInput, setWeekInput] = useState(() => kstMonday())
  const week = isMondayWeek(weekInput) ? weekInput : null
  const [kind, setKind] = useState<EventSection>('raffle')
  const [round, setRound] = useState<EventRound | null>(null)
  const [roundLoading, setRoundLoading] = useState(false)
  const [roundError, setRoundError] = useState('')
  const [notice, setNotice] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const roundRequest = useRef<AbortController | null>(null)
  const finalizingRef = useRef(false)

  const [typeFilter, setTypeFilter] = useState<WinnerType | ''>('')
  const [contactFilter, setContactFilter] = useState<ContactStatus | ''>('')
  const [offset, setOffset] = useState(0)
  const [winners, setWinners] = useState<AdminWinnersPage | null>(null)
  const [winnersLoading, setWinnersLoading] = useState(false)
  const [winnersError, setWinnersError] = useState('')
  const winnersRequest = useRef<AbortController | null>(null)
  const [revealed, setRevealed] = useState<RevealedContact | null>(null)
  const [contactError, setContactError] = useState('')
  const [revealingId, setRevealingId] = useState<number | null>(null)
  const contactRequest = useRef<AbortController | null>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [confirmingDelivery, setConfirmingDelivery] = useState<AdminEventWinner | null>(null)
  const [deliveringId, setDeliveringId] = useState<number | null>(null)
  const [deliveryError, setDeliveryError] = useState('')
  const [deliveryNotice, setDeliveryNotice] = useState('')
  const deliveryRequest = useRef<AbortController | null>(null)
  const deliveringRef = useRef(false)

  const report = useCallback((cause: unknown, setError: (message: string) => void) => {
    if (cause instanceof AdminEventsError && cause.kind === 'unauthenticated') { onAuthEnded(); return }
    setError(cause instanceof Error ? cause.message : '요청을 처리하지 못했습니다. 다시 시도해주세요.')
  }, [onAuthEnded])

  const refreshRound = useCallback(async () => {
    roundRequest.current?.abort()
    setConfirming(false); setRound(null); setRoundError(''); setNotice('')
    if (!week || kind === 'minigames' || !supportsWeek(kind, week)) return
    const controller = roundRequest.current = new AbortController()
    setRoundLoading(true)
    try {
      const value = await loadEventRound(kind, week, controller.signal)
      if (!controller.signal.aborted) setRound(value)
    } catch (cause) { if (!controller.signal.aborted) report(cause, setRoundError) }
    finally { if (!controller.signal.aborted) setRoundLoading(false) }
  }, [week, kind, report])

  useEffect(() => {
    void refreshRound()
    return () => roundRequest.current?.abort()
  }, [refreshRound])

  const refreshWinners = useCallback(async () => {
    winnersRequest.current?.abort()
    setConfirmingDelivery(null)
    setWinners(null); setWinnersError('')
    if (!week) return
    const controller = winnersRequest.current = new AbortController()
    setWinnersLoading(true)
    try {
      const value = await loadEventWinners(week, typeFilter, contactFilter, offset, controller.signal)
      if (!controller.signal.aborted) { setWinners(value); return value }
    } catch (cause) { if (!controller.signal.aborted) report(cause, setWinnersError) }
    finally { if (!controller.signal.aborted) setWinnersLoading(false) }
  }, [week, typeFilter, contactFilter, offset, report])

  useEffect(() => {
    void refreshWinners()
    return () => winnersRequest.current?.abort()
  }, [refreshWinners])
  useEffect(() => {
    setDeliveryError(''); setDeliveryNotice(''); setConfirmingDelivery(null)
  }, [week, typeFilter, contactFilter, offset])
  useEffect(() => () => deliveryRequest.current?.abort(), [])

  const hideContact = useCallback(() => {
    contactRequest.current?.abort()
    if (hideTimer.current) clearTimeout(hideTimer.current)
    setRevealed(null); setRevealingId(null); setContactError('')
  }, [])
  useEffect(() => { hideContact(); return hideContact }, [week, typeFilter, contactFilter, offset, hideContact])
  const refreshAfterRaffle = useCallback(async () => {
    await refreshRound()
    hideContact()
    void refreshWinners()
  }, [refreshRound, refreshWinners, hideContact])

  async function finalize() {
    if (!week || kind === 'raffle' || kind === 'minigames' || !access.canOperate || finalizingRef.current || round?.finalized || !confirming) return
    const { eligibleAt } = schedule(week, kind)
    if (Date.now() < Date.parse(eligibleAt)) { setRoundError('마감 후 확정 가능 시각부터 실행할 수 있습니다.'); return }
    const controller = roundRequest.current = new AbortController()
    finalizingRef.current = true; setFinalizing(true); setRoundError(''); setNotice(''); setConfirming(false)
    try {
      const value = await finalizeEventRound(kind, week, controller.signal)
      if (controller.signal.aborted) return
      setRound(value)
      setNotice(`${eventLabels[kind]} 결과를 확정했습니다. 이미 확정된 회차라면 기존 결과가 유지됩니다.`)
      hideContact()
      void refreshWinners()
    } catch (cause) {
      if (controller.signal.aborted) return
      report(cause, setRoundError)
      // A timed-out POST may have committed. Read the persisted result before allowing another attempt.
      try {
        const current = await loadEventRound(kind, week, controller.signal)
        if (!controller.signal.aborted) {
          setRound(current)
          if (current?.finalized) setNotice('요청 후 저장된 결과를 확인했습니다. 재추첨하지 않았습니다.')
        }
      } catch { /* Preserve the original error and leave retry to the operator. */ }
    } finally {
      finalizingRef.current = false
      setFinalizing(false)
    }
  }

  async function showContact(winnerId: number) {
    if (!access.canViewContacts || revealingId !== null) return
    hideContact()
    const controller = contactRequest.current = new AbortController()
    setRevealingId(winnerId)
    try {
      const value = await revealEventContact(winnerId, controller.signal)
      if (!controller.signal.aborted) {
        setRevealed(value)
        hideTimer.current = setTimeout(() => setRevealed(null), 30_000)
      }
    } catch (cause) { if (!controller.signal.aborted) report(cause, setContactError) }
    finally { if (!controller.signal.aborted) setRevealingId(null) }
  }

  async function deliver(item: AdminEventWinner) {
    if (!access.canOperate || deliveringRef.current || item.deliveryStatus !== 'PENDING'
      || confirmingDelivery?.winnerId !== item.winnerId
      || !winners?.winners.some(current => current.winnerId === item.winnerId
        && current.userId === item.userId && current.deliveryStatus === 'PENDING')) return
    const controller = deliveryRequest.current = new AbortController()
    deliveringRef.current = true
    setDeliveringId(item.winnerId); setConfirmingDelivery(null)
    setDeliveryError(''); setDeliveryNotice(''); hideContact()
    try {
      const receipt = await confirmEventDelivery(item.winnerId, item.userId, controller.signal)
      if (controller.signal.aborted) return
      setDeliveryNotice(receipt.alreadyDelivered
        ? '이미 지급 완료된 당첨 건입니다. 저장된 지급 기록을 확인했습니다.'
        : `${item.nickname || `회원 #${item.userId}`}의 ${item.prizeName} 지급 완료를 기록했습니다.`)
      await refreshWinners()
    } catch (cause) {
      if (controller.signal.aborted) return
      report(cause, setDeliveryError)
      if (cause instanceof AdminEventsError && cause.kind === 'unauthenticated') return
      // The PUT may have committed even if the response was lost.
      const current = await refreshWinners()
      if (current?.winners.some(row => row.winnerId === item.winnerId
        && row.userId === item.userId && row.deliveryStatus === 'DELIVERED')) {
        setDeliveryError('')
        setDeliveryNotice('서버에 저장된 지급 완료 기록을 확인했습니다.')
      }
    } finally {
      deliveringRef.current = false; setDeliveringId(null)
    }
  }

  const timing = week && kind !== 'minigames' ? schedule(week, kind) : null
  const eligible = timing ? Date.now() >= Date.parse(timing.eligibleAt) : false
  const supported = week && kind !== 'minigames' ? supportsWeek(kind, week) : false

  return <section className="admin-feedback-content admin-events" aria-label="이벤트 관리">
    <div className="admin-events-heading">
      <div><h2>회차 및 당첨 관리</h2><p>KST 월요일 시작일로 조회합니다. 결과 확정은 해당 회차에 한 번만 적용됩니다.</p></div>
      <label>회차 시작일 <input type="date" value={weekInput} disabled={finalizing || deliveringId !== null} onChange={event => {
        hideContact(); setRound(null); setWinners(null)
        setWeekInput(event.target.value); setOffset(0)
      }}/></label>
    </div>
    {!week && <p role="alert" className="admin-feedback-error">KST 월요일 날짜를 선택해주세요.</p>}
    <nav className="admin-events-tabs" aria-label="이벤트 부문">
      {eventKinds.map(item => <button key={item} type="button" disabled={finalizing || deliveringId !== null} aria-pressed={kind === item}
        onClick={() => { setKind(item); setRound(null); setConfirming(false) }}>{eventLabels[item]}</button>)}
    </nav>
    {kind === 'minigames' ? <AdminMinigamePanel key={week ?? 'invalid'} week={week} access={access}
      onAuthEnded={onAuthEnded} onFinalized={() => { hideContact(); void refreshWinners() }} /> : <div className="admin-events-panel">
      <div className="admin-events-panel-head"><h3>{eventLabels[kind]} · {week || '회차 미선택'}</h3>
        <button type="button" onClick={() => void refreshRound()} disabled={!supported || roundLoading || finalizing}>결과 새로고침</button></div>
      {week && !supported && <p role="status">{kind === 'asset' ? `${assetWeek} 회차만 운영합니다.`
        : kind === 'raffle' ? `${firstMinigameWeek}부터 운영합니다.` : `${firstMinigameWeek} 회차만 운영합니다.`}</p>}
      {roundLoading && <p role="status">회차 결과를 조회하고 있습니다…</p>}
      {roundError && <p role="alert" className="admin-feedback-error">{roundError}</p>}
      {notice && <p role="status" className="admin-events-notice">{notice}</p>}
      {week && supported && !roundLoading && <>
        <dl className="admin-events-facts">
          <div><dt>시작</dt><dd>{displayTime(timing!.startsAt)}</dd></div>
          <div><dt>마감</dt><dd>{displayTime(round?.endsAt || timing!.endsAt)}</dd></div>
          <div><dt>진행 상태</dt><dd>{Date.now() < Date.parse(timing!.startsAt) ? '시작 전'
            : Date.now() < Date.parse(round?.endsAt || timing!.endsAt) ? '진행 중' : '마감 완료'}</dd></div>
          <div><dt>확정 가능</dt><dd>{displayTime(timing!.eligibleAt)}</dd></div>
          <div><dt>발표</dt><dd>{displayTime(round?.announcesAt || timing!.announcesAt)}</dd></div>
          <div><dt>발표 상태</dt><dd>{Date.now() < Date.parse(round?.announcesAt || timing!.announcesAt)
            ? '발표 전' : round?.finalized ? '발표됨' : '결과 확정 지연'}</dd></div>
          <div><dt>확정 상태</dt><dd>{round?.finalized ? '확정 완료' : eligible ? '확정 대기' : '진행 중'}</dd></div>
          <div><dt>후보(제외 전)</dt><dd>{round?.candidateCount ?? (kind === 'raffle' ? '사전 추첨 후 표시' : '확정 후 표시')}</dd></div>
          <div><dt>GM 제외 건수</dt><dd>{round?.excludedGmCount ?? (kind === 'raffle' ? '사전 추첨 후 표시' : '확정 후 표시')}</dd></div>
          <div><dt>GM 제외 후</dt><dd>{round?.candidateCount != null && round.excludedGmCount != null
            ? round.candidateCount - round.excludedGmCount : kind === 'raffle' ? '사전 추첨 후 표시' : '확정 후 표시'}</dd></div>
          <div><dt>당첨 / 상품 슬롯</dt><dd>{round ? `${round.awardedPrizeCount} / ${round.expectedPrizeCount}` : '회차 생성 전'}</dd></div>
          <div><dt>공석</dt><dd>{round?.finalized ? round.vacantPrizeCount : kind === 'raffle' ? '사전 추첨 후 표시' : round?.vacantPrizeCount ?? '확정 후 표시'}</dd></div>
        </dl>
        {!round && <p>아직 회차 기록이 없습니다. {kind === 'raffle' ? '마감 후 사전 추첨하면 검토 결과가 생성됩니다.' : '마감 후 확정하면 결과가 생성됩니다.'}</p>}
        {round?.finalized && <div className="admin-events-results"><h4>확정 결과</h4>
          {round.winners.length ? <ol>{round.winners.map((winner, index) => <li key={`${winner.userId}-${index}`}>
            <strong>{winner.place}등 · {winner.prizeName}</strong><span>{winner.nickname || `회원 #${winner.userId}`}</span><small>{winner.evidence}</small>
          </li>)}</ol> : <p>당첨자가 없습니다. 상품 슬롯은 공석으로 기록됐습니다.</p>}
        </div>}
        {kind === 'raffle' && week && !roundError && <RaffleReviewPanel key={week} week={week}
          eligible={eligible} finalized={!!round?.finalized} canOperate={access.canOperate}
          onAuthEnded={onAuthEnded} onRoundChanged={refreshAfterRaffle} />}
        {kind !== 'raffle' && access.canOperate && !round?.finalized && <div className="admin-events-action">
          {!confirming ? <button type="button" disabled={!eligible || finalizing || roundLoading || !!roundError}
            onClick={() => setConfirming(true)}>결과 확정 준비</button> : <div role="group" aria-label="확정 확인">
            <p><strong>{eventLabels[kind]} · {week}</strong> 결과를 확정합니다. 후보와 GM 제외 기준을 서버에서 검증합니다.</p>
            <button type="button" disabled={finalizing} onClick={() => void finalize()}>{finalizing ? '확정 중…' : '확정 실행'}</button>
            <button type="button" disabled={finalizing} onClick={() => setConfirming(false)}>취소</button>
          </div>}
          {!eligible && <p>확정 가능 시각 이후에 실행할 수 있습니다.</p>}
        </div>}
        {kind !== 'raffle' && !access.canOperate && !round?.finalized && <p>결과 확정은 운영 권한이 있는 관리자만 실행할 수 있습니다.</p>}
      </>}
    </div>}
    <div className="admin-events-panel">
      <div className="admin-events-panel-head"><h3>당첨자와 연락처 제출 현황</h3>
        <button type="button" disabled={!week || winnersLoading || deliveringId !== null} onClick={() => {
          hideContact(); void refreshWinners()
        }}>목록 새로고침</button></div>
      <p>확정된 부문을 조회합니다. 연락처 원문을 열면 서버에 열람 기록이 남습니다.</p>
      <div className="admin-events-filters">
        <label>부문 <select value={typeFilter} disabled={deliveringId !== null} onChange={event => {
          hideContact(); setWinners(null)
          setTypeFilter(event.target.value as WinnerType | ''); setOffset(0)
        }}><option value="">전체</option>{Object.entries(winnerLabels).map(([value, label]) =>
          <option key={value} value={value}>{label}</option>)}</select></label>
        <label>연락처 <select value={contactFilter} disabled={deliveringId !== null} onChange={event => {
          hideContact(); setWinners(null)
          setContactFilter(event.target.value as ContactStatus | ''); setOffset(0)
        }}><option value="">전체</option>{Object.entries(contactLabels).map(([value, label]) =>
          <option key={value} value={value}>{label}</option>)}</select></label>
      </div>
      {winnersError && <p role="alert" className="admin-feedback-error">{winnersError}</p>}
      {contactError && <p role="alert" className="admin-feedback-error">{contactError}</p>}
      {deliveryError && <p role="alert" className="admin-feedback-error">{deliveryError}</p>}
      {deliveryNotice && <p role="status" className="admin-events-notice">{deliveryNotice}</p>}
      {winnersLoading && <p role="status">당첨자를 조회하고 있습니다…</p>}
      {winners && !winnersLoading && (winners.winners.length ? <>
        <p>현재 페이지 지급 현황: {winners.winners.filter(item => item.deliveryStatus === 'DELIVERED').length}
          /{winners.winners.length}건 완료 · {winners.winners.every(item => item.deliveryStatus === 'DELIVERED')
            ? '모두 지급 완료' : winners.winners.some(item => item.deliveryStatus === 'DELIVERED')
              ? '일부 지급 완료' : '모두 지급 대기'}</p>
        <div className="admin-events-list">{winners.winners.map(item => <article key={item.winnerId}>
          <div><strong>{winnerLabels[item.eventType]} · {item.place}등 · {item.prizeName}</strong>
            <span>{item.nickname || `회원 #${item.userId}`} · 당첨 #{item.winnerId}</span></div>
          <div><span>연락처: {contactLabels[item.contactStatus]}</span>
            {item.maskedPhone && <span>{item.maskedPhone}</span>}
            {item.contactExpiresAt && <small>보관 만료 {displayTime(item.contactExpiresAt)}</small>}</div>
          <div><strong>경품: {item.deliveryStatus === 'DELIVERED' ? '지급 완료' : '지급 대기'}</strong>
            {item.deliveredAt && <small>지급 기록 {displayTime(item.deliveredAt)}</small>}
            {access.canOperate && item.deliveryStatus === 'PENDING' &&
              <button type="button" disabled={deliveringId !== null || winnersLoading}
                onClick={() => { setDeliveryError(''); setDeliveryNotice(''); setConfirmingDelivery(item) }}>
                {deliveringId === item.winnerId ? '지급 확인 중…' : '지급 완료 기록'}</button>}</div>
          {access.canViewContacts && item.contactStatus === 'SUBMITTED' && <div className="admin-events-reveal">
            {revealed?.winnerId === item.winnerId ? <>
              <strong aria-label="연락처 원문">{revealed.phone}</strong>
              <button type="button" onClick={hideContact}>원문 숨기기</button>
            </> : <button type="button" disabled={revealingId !== null || deliveringId !== null}
              onClick={() => void showContact(item.winnerId)}>
              {revealingId === item.winnerId ? '열람 중…' : '연락처 원문 열람'}</button>}
          </div>}
          {confirmingDelivery?.winnerId === item.winnerId && <div className="admin-events-delivery-confirm"
            role="group" aria-label="경품 지급 완료 확인">
            <p><strong>{item.nickname || `회원 #${item.userId}`}</strong> · {item.prizeName} · 당첨 #{item.winnerId}</p>
            <p>경품을 실제 전달한 뒤에만 지급 완료를 기록하세요. 기록 후에는 이 건의 입력 요청이 종료될 수 있습니다.</p>
            <button type="button" onClick={() => void deliver(item)}>전달 완료 확인</button>
            <button type="button" onClick={() => setConfirmingDelivery(null)}>취소</button>
          </div>}
        </article>)}</div>
        <div className="admin-events-pages"><button type="button" disabled={offset === 0 || winnersLoading || deliveringId !== null}
          onClick={() => setOffset(Math.max(0, offset - 20))}>이전</button>
          <span>{Math.floor(offset / 20) + 1}페이지</span>
          <button type="button" disabled={!winners.hasMore || winnersLoading || deliveringId !== null} onClick={() => setOffset(offset + 20)}>다음</button></div>
      </> : <p>이 조건에 해당하는 확정 당첨자가 없습니다.</p>)}
    </div>
  </section>
}
