import { useEffect, useState } from 'react';
import { BREAD_FILLINGS, BREAD_NAMES, BREAD_TOOLS, trayCounts } from './rulesV4';
import { isV5Grill, ready, type CustomerOrder } from './rulesV5';
import { bungeoppangClock as clock } from './bungeoppangView';
import { deliverBungeoppangOrder, requestV5Delivery, selectBungeoppangCustomer, selectBungeoppangTray,
  setBungeoppangTool, toggleBungeoppangWaste, trashBungeoppangSelection, useBungeoppang } from './store';
import { ingredientStyle } from './BungeoppangFeedback';
import { BreadPortraitV5 } from './BreadPortraitV5';
import { advanceCustomerSpeechV5, customerRequestText, registerCustomerCloudV5, useCustomerSpeechV5 } from './customerSpeechV5';
import { useCustomerArrivalsV5 } from './customerArrivalV5';
import { useCustomerDeparturesV5, type CustomerDepartureV5 } from './customerDepartureV5';

function ServiceHeader() {
  const [, tick] = useState(0);
  useEffect(() => { const id = window.setInterval(() => tick(n => n + 1), 100); return () => window.clearInterval(id); }, []);
  const phase = useBungeoppang(s => s.phase), rules = useBungeoppang(s => s.rules);
  const score = useBungeoppang(s => s.grill?.score ?? 0);
  const combo = useBungeoppang(s => s.grill?.combo ?? 0);
  const served = useBungeoppang(s => s.grill && 'customersServed' in s.grill ? s.grill.customersServed : 0);
  const seconds = Math.max(0, Math.ceil((clock.durationMs - clock.t) / 1000));
  const rush = phase === 'play' && clock.t >= rules.rushFromMs;
  const warn = phase === 'play' && clock.t >= rules.rushFromMs - 3000 && !rush;
  return <>
    <div className="bung25-vignette" data-rush={rush} />
    <header className="bung25-top">
      <div className="bung25-time" role="timer" aria-label="남은 시간" data-rush={rush}>
        <svg viewBox="0 0 32 36" aria-hidden="true"><circle cx="16" cy="21" r="12" /><path d="M12 2h8m-4 0v7m9 1 3-3M16 13v9l5 3" /></svg>
        {String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}
      </div>
      {(rush || warn) && <div className="bung25-rush" role="status">{warn ? '곧 손님이 몰려와요!' : '손님이 몰려왔어요! · 화력 UP'}</div>}
      <div className="bung25-score"><span>점수 <b>{score}</b></span><span className="bung25-served">전달 <b>{served}<small>명</small></b></span></div>
    </header>
    <aside className="bung25-combo" aria-label={`콤보 ${combo}`}><strong>{combo}</strong><b>COMBO</b><span>×{combo >= 6 ? '1.5' : combo >= 3 ? '1.2' : '1.0'}</span></aside>
  </>;
}

/** Native vector silhouette stays crisp at every cooking-camera viewport. */
function OrderCloud() {
  return <svg className="bung25-order-cloud" viewBox="0 0 280 150" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <path className="bung25-cloud-body" d="M39 24C23 17 8 29 13 44C-1 48-3 67 10 77C-2 94 7 113 25 113C24 132 45 143 63 132C77 147 99 148 113 138C131 151 157 151 172 138C191 151 214 142 220 131C241 141 264 128 263 111C283 109 288 88 276 76C289 59 282 39 264 37C264 17 243 9 226 21C211 5 187 5 174 18C158 5 136 9 125 21C110 7 86 7 74 21C59 8 45 11 39 24Z" />
    <circle className="bung25-cloud-tail" cx="140" cy="5" r="5" />
    <circle className="bung25-cloud-tail" cx="145" cy="-8" r="3" />
  </svg>;
}

function CustomerOrderCloud({ order, selected, done, counts, active, pending, error }: {
  order: CustomerOrder; selected: boolean; done: boolean; counts: ReturnType<typeof trayCounts>;
  active: boolean; pending: boolean; error: boolean;
}) {
  const admitted = useCustomerArrivalsV5(s => s.admitted[order.orderId] !== undefined);
  const speech = useCustomerSpeechV5(s => s.stages[order.orderId] ?? 'waiting');
  const dialogue = useCustomerSpeechV5(s => s.dialogues[order.orderId]);
  const complained = useBungeoppang(s => !!s.grill && 'rulesVersion' in s.grill && isV5Grill(s.grill)
    && s.grill.complainedOrderIds.includes(order.orderId));
  const [complaintVisible, setComplaintVisible] = useState(false);
  useEffect(() => {
    setComplaintVisible(complained);
    if (!complained) return;
    const timer = setTimeout(() => setComplaintVisible(false), 3500);
    return () => clearTimeout(timer);
  }, [complained]);
  const stage = admitted ? speech : 'waiting';
  const summary = stage === 'summary', fillings = BREAD_FILLINGS.filter(f => order.items[f]);
  return <section ref={element => { registerCustomerCloudV5(order.orderId, element); }} className="bung25-order" aria-label={`${order.customerSlot + 1}번 자리 손님 주문`}
    data-order-id={order.orderId} data-selected={selected} data-ready={done} data-complaint={complaintVisible} data-stage={stage} aria-hidden={stage === 'waiting'}>
    {stage !== 'waiting' && <><OrderCloud />
    <button type="button" className="bung25-select" aria-label={`${order.customerSlot + 1}번 손님 주문 선택`} aria-pressed={selected} disabled={!active || stage === 'greeting'}
      onClick={e => { e.currentTarget.blur(); if (selectBungeoppangCustomer(order.orderId)) advanceCustomerSpeechV5(order.orderId, 'summary'); }}>
      {selected && <span className="bung25-selected-mark" aria-hidden="true">✓</span>}
    </button>
    {complaintVisible ? <p className="bung25-speech bung25-complaint" role="alert"><span aria-hidden="true">⚠ </span>제가 먼저 왔어요!<br /><strong>컴플레인 −5점</strong></p> : summary ? <ul data-items={fillings.length} aria-label="주문 요약">{fillings.map(f => {
      const have = Math.min(counts[f], order.items[f]), complete = have === order.items[f];
      return <li key={f} data-complete={complete} style={ingredientStyle(f)} aria-label={`${BREAD_NAMES[f]} ${order.items[f]}개 주문, ${have}개 준비`}>
        <span className="bung25-order-food"><BreadPortraitV5 filling={f} /></span>
        <span className="bung25-recipe-name">{BREAD_NAMES[f]} <b>×{order.items[f]}</b></span>
      </li>;
    })}</ul> : <p key={stage} className="bung25-speech" role="status" aria-live="polite" aria-atomic="true">
      {stage === 'greeting' ? dialogue?.greeting : customerRequestText(order.items, dialogue?.request)}
    </p>}
    {summary && done && <button type="button" className="bung25-deliver" disabled={!active || pending || error}
      onClick={e => { e.currentTarget.blur(); selectBungeoppangCustomer(order.orderId); deliverBungeoppangOrder(); }}>
      {pending && selected ? '전달 확인 중…' : '전달하기'}
    </button>}</>}
  </section>;
}

function CustomerThanksCloud({ visit }: { visit: CustomerDepartureV5 }) {
  const { order, phase } = visit;
  return <section ref={element => { registerCustomerCloudV5(order.orderId, element); }}
    className="bung25-order bung25-thanks" data-order-id={order.orderId} data-stage={phase}
    aria-label={`${order.customerSlot + 1}번 손님 ${phase === 'pending' ? '전달 확인' : '감사 인사'}`}>
    <OrderCloud />
    <p className="bung25-speech" role="status" aria-live="polite" aria-atomic="true">
      {phase === 'pending' ? '전달을 확인하고 있어요…' : phase === 'receiving' ? '붕어빵을 받고 있어요.' : visit.thanks}
    </p>
  </section>;
}

/** Fixed, readable UI over a close, three-dimensional cooking set. */
export function BungeoppangHudV5() {
  const s = useBungeoppang();
  const departures = useCustomerDeparturesV5(state => state.visits);
  const grill = s.grill;
  if (!grill || !('rulesVersion' in grill) || !isV5Grill(grill)) return null;
  const counts = trayCounts(grill), active = s.phase === 'play' && !s.confirmExit && !s.helpOpen && !s.abandonPending;
  const wasteHint = s.wasteTarget ? '선택한 빵을 쓰레기통에 버릴까요?' : s.choosingWaste ? '버릴 철판 빵을 누르세요' : '탄 빵은 칸을 눌러 바로 버려요';
  return <>
    <ServiceHeader />
    <div className="bung25-orders" aria-label="손님 주문">
      {[0, 1, 2].map(slot => {
        const departure = Object.values(departures).find(visit => visit.order.customerSlot === slot);
        if (departure) return <CustomerThanksCloud key={`thanks-${departure.order.orderId}`} visit={departure} />;
        const order = grill.activeOrders.find(o => o.customerSlot === slot);
        if (!order) return <section key={`empty-${slot}`} className="bung25-order bung25-order-empty" aria-hidden="true" />;
        return <CustomerOrderCloud key={order.orderId} order={order} selected={order.orderId === s.selectedCustomer}
          done={ready(grill, order)} counts={counts} active={active} pending={s.orderPending} error={!!s.orderError} />;
      })}
    </div>
    <div className="bung25-bottom">
      <div className="bung25-tools" aria-label="손에 든 재료">{BREAD_TOOLS.map((tool, i) => <button key={tool} type="button" disabled={!active}
        data-tool={tool} data-active={tool === s.tool} aria-pressed={tool === s.tool} style={ingredientStyle(tool)}
        onClick={e => { e.currentTarget.blur(); setBungeoppangTool(tool); }}>
        <i className="bung25-ingredient" style={{ backgroundPosition: `${i * 25}% center` }} aria-hidden="true" />
        <b>{BREAD_NAMES[tool]}</b><kbd>{i === 0 ? 'Space' : i}</kbd>
      </button>)}</div>
      <aside className="bung25-stock" aria-label="완성품 쟁반" data-count={grill.tray.length}>
        <header><b>보관함 <strong>{grill.tray.length}/10</strong></b><small>2단 · 각 5개</small></header>
        <ol>{Array.from({ length: 10 }, (_, i) => {
          const bread = grill.tray[i];
          return <li key={bread?.id ?? `empty-${i}`} data-tray-bread-id={bread?.id}>
            <button type="button" disabled={!active || !bread} aria-label={bread ? `보관 ${i + 1} ${BREAD_NAMES[bread.filling]} 선택` : `보관 ${i + 1} 빈 자리`}
              aria-pressed={!!bread && s.wasteTarget?.kind === 'tray' && s.wasteTarget.breadId === bread.id}
              onClick={e => { e.currentTarget.blur(); if (bread) selectBungeoppangTray(bread.id); }}>
              {bread ? <span className="bung25-stock-bread" style={ingredientStyle(bread.filling)}>
                <BreadPortraitV5 filling={bread.filling} /><small>{BREAD_NAMES[bread.filling]}</small>
              </span> : <span>{i + 1}</span>}
            </button>
          </li>;
        })}</ol>
      </aside>
      <div className="bung25-waste">
        <button type="button" className="bung25-trash" disabled={!active || !s.wasteTarget} aria-label="선택한 빵 쓰레기통에 버리기"
          onClick={e => { e.currentTarget.blur(); trashBungeoppangSelection(); }}>
          <svg viewBox="0 0 32 36" aria-hidden="true"><path d="M5 9h22M12 9V4h8v5M8 13l2 19h12l2-19M13 16v11m6-11v11" /></svg><span>버리기</span>
        </button>
        <button type="button" className="bung25-waste-select" aria-pressed={s.choosingWaste} disabled={!active}
          onClick={e => { e.currentTarget.blur(); toggleBungeoppangWaste(); }}>철판 빵 선택</button>
      </div>
    </div>
    <p className="bung25-instruction" role="status">{wasteHint}<span>Q W E / A S D 조리 · 휠 재료 변경 · R 준비된 주문 자동 전달</span></p>
    {s.orderError && <div className="bung-v5-delivery-error" role="alert">{s.orderError}
      <button disabled={!active || s.orderPending} onClick={() => void requestV5Delivery()}>같은 납품 다시 확인</button>
    </div>}
    {s.feedback.at(-1) && <div className="bung25-receipt" role="status">{s.feedback.at(-1)!.message}</div>}
  </>;
}
