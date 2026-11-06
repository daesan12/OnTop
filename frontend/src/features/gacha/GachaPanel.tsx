import { useEffect, useRef } from 'react'
import { useSession } from '../../network/worldClient'
import { closeConstructionNotice } from '../construction/model'
import { gradeName, money } from './contracts'
import { useGachaEvents } from './events'
import { gachaAction, refreshGacha, resetGacha, useGacha } from './state'
import './gacha.css'

export function GachaLifecycle() {
  const owner = useSession(s => s.sessionId), connected = useSession(s => s.status === 'connected')
  useEffect(() => { resetGacha() }, [owner, connected])
  return null
}
export function GachaCrate({ grade }: { grade: number }) {
  return <svg className="gacha-crate" data-grade={grade} viewBox="0 0 100 90" aria-hidden="true">
    <path d="M12 34Q14 10 50 10T88 34V76Q50 90 12 76Z" fill="currentColor" />
    <path d="M12 34H88M27 19V80M73 19V80" fill="none" stroke="#f5db98" strokeWidth="5" />
    <path d="m50 37 11 13-11 15-11-15Z" fill="#fff6d0" stroke="#7d6131" strokeWidth="2" />
  </svg>
}
function Outcome() {
  const result = useGacha(s => s.result)
  if (!result) return null
  return <div className="gacha-outcome" role="status" aria-live="polite">
    <strong>{result.kind === 'BUY' ? '뽑기권 한 장을 받았어요' : result.product
      ? result.duplicate ? '이미 가진 의상이에요' : `${result.product.name} 획득!`
      : result.grade === 5 ? '엽전 당첨!' : `${gradeName(result.grade)} 당첨!`}</strong>
    <span>{result.awardedCoins ? `${money(result.awardedCoins)}을 지갑에 넣었어요.`
      : result.kind === 'DRAW' ? '마이룸의 상자 보관함에서 열어 보세요.'
      : result.kind === 'OPEN' ? '나의 옷장에서 바로 입어 볼 수 있어요.' : '이 화면에서 바로 사용할 수 있어요.'}</span>
  </div>
}
function Messages() {
  const s = useGacha()
  return <>{s.error && <p className="gacha-error" role="alert">{s.error}</p>}
    {s.pending && !s.busy && <button className="gacha-primary" onClick={() => void gachaAction(s.pending!.kind, s.pending!.grade)}>이전 요청 결과 다시 확인</button>}
    <Outcome /></>
}
export function GachaPanel() {
  const dialog = useRef<HTMLDialogElement>(null), s = useGacha(), live = useGachaEvents(v => v.machine)
  useEffect(() => { const d = dialog.current; d?.showModal(); void refreshGacha(); return () => d?.close() }, [])
  const machine = s.state && live && live.version > s.state.machine.version ? live : s.state?.machine
  const blocked = s.busy || !!s.pending || !s.state
  return <dialog ref={dialog} className="gacha-panel" aria-labelledby="gacha-title"
    onCancel={event => { event.preventDefault(); closeConstructionNotice() }}
    onClose={() => { if (!dialog.current?.open) closeConstructionNotice() }}
    onKeyDown={event => event.stopPropagation()}>
    <header><div><small>온탑 공원 · 모두가 함께하는 뽑기</small><h2 id="gacha-title">의상 뽑기</h2></div>
      <button className="gacha-close" aria-label="뽑기 닫기" onClick={closeConstructionNotice}>×</button></header>
    <p>1등이 나오면 새 기계로! 의상 상자는 마이룸에서 열어 보세요.</p>
    {s.loading && !s.state && <p role="status">기계를 확인하고 있어요…</p>}
    {machine && <><div className="gacha-round"><strong>{machine.roundId}회차</strong><span>{machine.remaining} / 30개 남음 · 전체 채널 공유</span></div>
      <div className="gacha-prizes">{machine.prizes.map(p => <article key={p.grade} data-grade={p.grade}>
        {p.grade === 5 ? <span className="gacha-coin" aria-hidden="true">냥</span> : <GachaCrate grade={p.grade} />}
        <b>{gradeName(p.grade)}</b><strong>{p.remaining}<small> / {p.initial}</small></strong>
        <span>현재 {(p.remaining / machine.remaining * 100).toFixed(2)}%</span>
        <small>{p.grade === 5 ? `${money(p.value)} 즉시 지급` : `의상 가치 ${money(p.value)}`}</small>
      </article>)}</div></>}
    {s.state && <div className="gacha-purchase"><span>사용 가능 <b>{money(s.state.inventory.availableBalance)}</b></span>
      <span>보유 뽑기권 <b>{s.state.inventory.tickets}장</b></span>
      <button disabled={blocked || s.state.inventory.availableBalance < s.state.ticketPrice}
        onClick={() => void gachaAction('BUY')}>뽑기권 구매 · {money(s.state.ticketPrice)}</button>
      <button className="gacha-primary" disabled={blocked || s.state.inventory.tickets < 1}
        onClick={() => void gachaAction('DRAW')}>{s.busy ? '확인 중…' : '뽑기권 1장 사용'}</button>
      {s.state.inventory.availableBalance < s.state.ticketPrice && <small>구매하려면 {money(s.state.ticketPrice - s.state.inventory.availableBalance)}이 더 필요해요.</small>}</div>}
    <Messages />
    <button className="gacha-refresh" disabled={s.loading || s.busy} onClick={() => void refreshGacha()}>기계 다시 확인</button>
    <footer>같은 의상은 가치의 절반을 엽전으로 받아요. 통합 의상도 상품 하나로 계산해요.</footer>
  </dialog>
}
export function GachaBoxes() {
  const s = useGacha()
  useEffect(() => { void refreshGacha() }, [])
  return <section className="gacha-boxes" aria-label="상자 보관함">
    <p>한 상자에서 현재 캐릭터가 입을 수 있는 의상 상품 하나가 나와요.</p>
    {s.state && <div className="gacha-box-grid">{s.state.inventory.boxes.map(box => <article key={box.grade}>
      <GachaCrate grade={box.grade} /><h4>{gradeName(box.grade)}</h4><span>{box.quantity}개 보관 중</span>
      <button disabled={s.busy || !!s.pending || box.quantity < 1} onClick={() => void gachaAction('OPEN', box.grade)}>
        {s.busy ? '확인 중…' : '상자 하나 열기'}</button>
    </article>)}</div>}
    <Messages />
    {!s.state && <p role="status">{s.unavailable ? '의상 상자 보관함을 준비하고 있어요.' : s.loading ? '상자를 불러오고 있어요…' : '보관함을 확인해주세요.'}</p>}
    <button className="gacha-refresh" disabled={s.loading || s.busy} onClick={() => void refreshGacha()}>보관함 다시 확인</button>
  </section>
}
