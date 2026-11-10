import { HallIcon } from './Icons'
import { MenuArt } from './MenuArt'
import { OrderContents } from './OrderContents'
import type { HallView } from './previewModel'
import type { Station } from './plan'
import { BusinessStatus } from '../BusinessStatus'

type Nearby = { kind: 'table'; id: number } | { kind: Station } | null

/** 표시용 안내만 계산한다. 실제 행동과 허용 여부는 기존 드라이버/서버에서 판정한다. */
export function actionUnavailable(view: HallView, at: Nearby): string | null {
  if (!at) return null
  if (at.kind === 'orders' && !view.held.length) return '손님에게 주문표를 먼저 받아주세요'
  if (at.kind === 'pickup') return view.carry.length >= 2 ? '접시가 가득 찼어요 · 서빙하거나 보관하세요' : !view.pass.length ? '요리사가 접시를 완성하고 있어요' : null
  if (at.kind === 'fridge' && view.sake >= 2) return '사케 두 병을 들고 있어요 · R로 반납 가능'
  if (at.kind === 'table') {
    const table = view.tables.find(t => t.id === at.id)
    if (table?.status === 'unreceived' && view.held.length >= 2) return '주문표 두 장을 주방에 먼저 전달하세요'
    if (table?.bill && ['collected', 'cooking', 'ready'].includes(table.status)
      && !view.carry.length && !view.sake) return '음식이나 사케를 먼저 가져오세요'
  }
  return null
}

export function nextTask(view: HallView) {
  if (view.finished) return '영업이 끝났어요'
  if (view.dirtyDishes.length) return '수거한 식기를 세척기에 넣어주세요'
  if (view.held.length) return '받은 주문표를 주방 전달대에 넘겨주세요'
  if (view.carry.length) return `${[...new Set(view.carry.map(d => `${String(d.table).padStart(2, '0')}번`))].join('·')} 테이블에 접시를 전달하세요`
  if (view.sake) return '사케를 서빙하거나 냉장고에서 R로 반납하세요'
  if (view.pass.length) return '주방에 완성된 접시가 있어요'
  if (view.tables.some(t => t.status === 'unreceived')) return '그림 말풍선이 있는 손님에게 주문을 받아보세요'
  if (view.tables.some(t => t.status === 'dirty')) return '빈손으로 자리를 정리하고 식기를 수거하세요'
  return '홀을 살펴보며 다음 손님을 맞이하세요'
}

export function ServiceHud({ view, paused = false }: { view: HallView; paused?: boolean }) {
  const dirty = view.dirtyDishes.length > 0, food = view.carry.length > 0 || view.sake > 0
  return <>
    <BusinessStatus seconds={view.remaining} score={view.score} served={view.served} paused={paused} />
    <section className="service-held" aria-label="받은 주문표">
      <h2>주문표 <b>{view.held.length}/2</b></h2>
      <div>{[0, 1].map(index => { const table = view.tables.find(t => t.id === view.held[index]); return <div className={`service-held-ticket${table ? '' : ' is-empty'}`} key={index}>
        {table ? <>
          <div className="service-receipt-heading" aria-hidden="true"><span>주문전표</span><span>주방용</span></div>
          <OrderContents table={table.id} dishes={table.bill!.dishes} sake={table.bill!.sake} />
        </> : <small aria-label="주문표 없음">—</small>}
      </div> })}</div>
      <p className="service-panel-note">{dirty ? '식기를 내려놓으면 주문 업무를 할 수 있어요' : view.held.length ? '주문 전달대에서 E로 넘겨주세요' : '손님 앞에서 E로 주문을 받아요'}</p>
    </section>
    <section className={`service-carry${dirty ? ' is-dirty-carry' : ''}`} data-carry-mode={dirty ? 'dirty' : food ? 'food' : 'empty'} aria-label={dirty ? '운반 중인 더러운 식기' : '들고 있는 음식'}>
      <div className="service-cart-frame" aria-hidden="true">
        <i className="service-cart-handle" /><i className="service-cart-post is-left" /><i className="service-cart-post is-right" />
        <i className="service-cart-shelf is-upper" /><i className="service-cart-shelf is-lower" />
        <i className="service-cart-wheel is-left" /><i className="service-cart-wheel is-right" />
      </div>
      <h2><HallIcon name={dirty ? 'dishes' : 'cloche'} />{dirty ? '수거한 식기' : '서빙 카트'}<b>{dirty ? `${view.dirtyDishes.length}/2테이블분` : `접시 ${view.carry.length}/2 · 사케 ${view.sake}/2`}</b></h2>
      {dirty ? <div className="service-dirty-slots">{[0, 1].map(i => <div className={`service-dirty-slot${view.dirtyDishes[i] ? ' is-full' : ''}`} key={i}><HallIcon name="dishes" />{view.dirtyDishes[i] ? <><strong>{String(view.dirtyDishes[i].table).padStart(2, '0')}번 식기</strong><small>{view.dirtyDishes[i].settings}인분 수거</small></> : <small>추가 수거 가능</small>}</div>)}</div>
        : <div className="service-carry-slots">{[0, 1].map(i => <div className={`service-plate-slot${view.carry[i] ? ' is-full' : ''}`} key={i}>{view.carry[i] ? <div className="service-order-cells"><b className="service-order-number">{String(view.carry[i].table).padStart(2, '0')}</b><div className="service-order-recipes"><div className="service-order-recipe"><MenuArt recipe={view.carry[i].recipe} label={`${view.carry[i].table}번 운반 접시`} angled /><b className="service-order-quantity">×1</b></div></div></div> : <small>빈 운반 칸</small>}</div>)}<div className="service-bottle-slots" aria-label={`사케 ${view.sake}병`}>{[0, 1].map(i => <span key={i} className={`service-bottle-slot${view.sake > i ? ' is-full' : ''}`} aria-hidden="true"><HallIcon name="sake" /></span>)}</div></div>}
      <p className="service-carry-rule">{dirty ? '주문·음식 업무는 세척기에 넣은 뒤 가능해요' : food ? '꼬치 보관대 E · 사케 냉장고 R로 내려놓기' : '빈손이에요 · 주문 접수와 식기 수거 가능'}</p>
    </section>
    <footer className="service-controls"><p className="service-next-task">{nextTask(view)}</p><div><span><kbd>WASD</kbd> 이동</span><span><kbd>E</kbd> 상호작용</span><span><kbd>R</kbd> 반납·재수령</span></div></footer>
    <p className="service-viewport-note">키보드·마우스로 플레이해요.<br />넓은 가로 화면에서 매장 전체를 확인해주세요.</p>
  </>
}
