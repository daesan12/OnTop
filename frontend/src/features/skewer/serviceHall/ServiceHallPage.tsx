import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { DISHWASHING_PREVIEW, HallPreview, STATUS_LABEL } from './previewModel'
import { TABLES, STATIONS, tableDestination } from './plan'
import type { Point } from './plan'
import { ServiceScene } from './rendering/ServiceScene'
import { MenuArt, disposeMenuArt } from './MenuArt'
import { HallIcon } from './Icons'
import { ServiceHud, actionUnavailable } from './ServiceHud'
import { OrderContents } from './OrderContents'
import type { HallDriver } from '../coop/drivers'
import { useGameDragScroll } from '../useGameDragScroll'
import { ExitConfirmation } from '../ExitConfirmation'
import './serviceHall.css'
import './serviceHud.css'
import './serviceVenue.css'

const anchor = (name: string) => ({ left: `var(--hall-${name}-x,50%)`, top: `var(--hall-${name}-y,50%)` }) as CSSProperties
export default function ServiceHallPage({ driver, inputBlocked = false }: { driver?: HallDriver; inputBlocked?: boolean } = {}) {
  useGameDragScroll('.service-hall', !driver?.online)
  const model = useRef<HallDriver | null>(null); model.current ??= driver ?? new HallPreview()
  const host = useRef<HTMLDivElement>(null), keys = useRef(new Set<string>()), guide = useRef<HTMLDialogElement>(null), storage = useRef<HTMLDialogElement>(null)
  const [localPaused, setLocalPaused] = useState(false)
  const blockedRef = useRef(false); blockedRef.current = inputBlocked || localPaused
  const [view, setView] = useState(() => model.current!.view()), [error, setError] = useState('')
  useEffect(() => {
    if (!host.current) return
    let scene: ServiceScene | undefined, publishedAt = 0, wasStopped = false
    const stopped = () => guide.current?.open || blockedRef.current || document.hidden
    const keydown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey || event.isComposing || stopped() || storage.current?.open || event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable=true],dialog,[role=dialog]')) return
      if (event.code === 'Escape' && !event.repeat && !driver?.online && !model.current!.view().finished) {
        event.preventDefault(); keys.current.clear(); model.current!.release(); blockedRef.current = true; setLocalPaused(true); return
      }
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'].includes(event.code)) { event.preventDefault(); keys.current.add(event.code) }
      if (event.code === 'KeyE' && !event.repeat) { event.preventDefault(); model.current!.press() }
      if (event.code === 'KeyR' && !event.repeat) { event.preventDefault(); model.current!.pressSecondary() }
    }
    const keyup = (event: KeyboardEvent) => { keys.current.delete(event.code); if (event.code === 'KeyE') model.current!.release() }
    const blur = () => { keys.current.clear(); model.current!.release() }
    try {
      scene = new ServiceScene(host.current, dt => {
        const k = keys.current, dx = Number(k.has('KeyD') || k.has('ArrowRight')) - Number(k.has('KeyA') || k.has('ArrowLeft')), dz = Number(k.has('KeyS') || k.has('ArrowDown')) - Number(k.has('KeyW') || k.has('ArrowUp'))
        const stop = !!stopped()
        if (stop) keys.current.clear()
        if (!stop) model.current!.step(wasStopped ? 0 : dt, dx, dz)
        wasStopped = stop
        const current = model.current!.view(), now = performance.now()
        if (now - publishedAt > 80) { setView(current); publishedAt = now }
        return current
      }, p => model.current!.navigate(p), setError)
    } catch (error) { setError(error instanceof Error ? error.message : '매장 화면을 열지 못했어요.') }
    window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup); window.addEventListener('blur', blur)
    return () => { scene?.dispose(); disposeMenuArt(); window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); window.removeEventListener('blur', blur) }
  }, [])
  useEffect(() => {
    if (view.storageOpen && !storage.current?.open) { keys.current.clear(); storage.current?.showModal() }
    else if (!view.storageOpen && storage.current?.open) storage.current.close()
  }, [view.storageOpen])
  const navigate = (p: Point) => { keys.current.clear(); model.current!.navigate(p) }, at = model.current.nearest()
  const blocked = model.current.blockedReason() ?? actionUnavailable(view, at), label = blocked ?? model.current.actionLabel()
  const secondaryLabel = model.current.secondaryLabel(), secondaryBlocked = model.current.secondaryBlockedReason()
  const readyToAct = !blocked && !!at && (at.kind !== 'table' || !['clean', 'eating'].includes(view.tables.find(t => t.id === at.id)!.status))
  const washing = view.washer.load.length > 0, dirty = view.dirtyDishes.length > 0
  const washProgress = washing ? Math.round((1 - view.washer.remaining / DISHWASHING_PREVIEW.cycleSeconds) * 100) : 0
  const reset = () => { keys.current.clear(); model.current = new HallPreview(); setView(model.current.view()) }
  return <main className="service-hall" data-testid="service-hall">
    <div className="service-stage" ref={host}>
      <div className="service-overlays">
        {TABLES.map(plan => {
          const table = view.tables.find(t => t.id === plan.id)!, waiting = table.status === 'unreceived'
          const showFood = waiting || table.status === 'ready'
          const remainingDishes = table.bill?.dishes.filter(d => !d.delivered) ?? []
          const sakeLeft = table.bill ? table.bill.sake - table.bill.sakeDelivered : 0
          return <div key={plan.id} data-table={plan.id} data-capacity={plan.capacity} data-status={table.status}>
            <button className={`service-table-target${at?.kind === 'table' && at.id === plan.id ? ' is-near' : ''}`} style={anchor(`table-${plan.id}`)} aria-label={`${plan.id}번 ${plan.capacity}인 테이블로 이동`} title={`${plan.id}번 · ${STATUS_LABEL[table.status]}`} onClick={event => { navigate(tableDestination(view.position, plan)); event.currentTarget.blur() }} />
            {table.status !== 'clean' ? <div className={`service-bubble is-${table.status}${showFood ? ' is-order' : ''}`} style={anchor(`bubble-${plan.id}`)} role="img" aria-label={`${plan.id}번 ${STATUS_LABEL[table.status]}${showFood ? `: 남은 꼬치 ${remainingDishes.length}개, 사케 ${sakeLeft}병` : ''}`}>
              {showFood ? <OrderContents table={plan.id} dishes={remainingDishes} sake={sakeLeft} />
                : <div className="service-bubble-heading"><b>{String(plan.id).padStart(2, '0')}</b><span className="service-bubble-state">{table.status === 'eating' ? '식사 중' : STATUS_LABEL[table.status]}</span><HallIcon name={table.status === 'dirty' ? 'broom' : table.status === 'cooking' ? 'pot' : table.status === 'eating' ? 'check' : 'order'} /></div>}
            </div> : null}
          </div>
        })}
        <button className="service-station" style={anchor('orders')} onClick={event => { navigate(STATIONS.orders); event.currentTarget.blur() }} aria-label="주문 전달대로 이동"><HallIcon name="order" />주문 전달</button>
        <button className="service-station" style={anchor('pickup')} onClick={event => { navigate(STATIONS.pickup); event.currentTarget.blur() }} aria-label="음식 수령대로 이동"><HallIcon name="cloche" />음식 수령{view.pass.length ? <b>{view.pass.length}</b> : null}</button>
        <button className="service-fridge" style={anchor('fridge')} onClick={event => { navigate(STATIONS.fridge); event.currentTarget.blur() }} aria-label="사케 냉장고로 이동"><HallIcon name="sake" />사케 냉장고</button>
        <button className="service-station service-storage-station" style={anchor('storage')} onClick={event => { navigate(STATIONS.storage); event.currentTarget.blur() }} aria-label="꼬치 임시 보관대로 이동"><HallIcon name="storage" />꼬치 보관{view.stored.length ? <b>{view.stored.length}</b> : null}</button>
        <button className={`service-station service-washer${washing ? ' is-washing' : ''}`} data-state={washing ? 'washing' : 'idle'} style={anchor('washer')}
          onClick={event => { navigate(STATIONS.washer); event.currentTarget.blur() }} aria-label="자동 식기세척기로 이동">
          <span className="service-washer-title"><HallIcon name="washer" />자동 식기세척기</span>
          <small>{washing ? `세척 중 · ${Math.ceil(view.washer.remaining)}초` : view.washer.completed ? '세척 완료 · 투입 가능' : 'E로 식기 넣기'}</small>
          {washing ? <span className="service-wash-meter" role="progressbar" aria-label="자동 세척 진행" aria-valuemin={0} aria-valuemax={100} aria-valuenow={washProgress}><i style={{ width: `${washProgress}%` }} /></span> : null}
        </button>
        {view.queue.length ? <div className="service-queue" style={anchor('queue')}><HallIcon name="people" />입구 대기 <b>{view.queue.length}팀</b></div> : null}
        {at ? <button className={`service-action${view.clean ? ' is-cleaning' : ''}${blocked ? ' is-blocked' : ''}`} style={{ ...anchor('action'), '--clean': `${(view.clean?.progress ?? 0) * 100}%` } as CSSProperties}
          disabled={!readyToAct} aria-label={`E ${label}`} onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); model.current!.press() }} onPointerUp={() => model.current!.release()} onPointerCancel={() => model.current!.release()}
          onKeyDown={event => { if ((event.code === 'Space' || event.code === 'Enter') && !event.repeat) { event.preventDefault(); model.current!.press() } }} onKeyUp={event => { if (event.code === 'Space' || event.code === 'Enter') { event.preventDefault(); model.current!.release() } }}><kbd>E</kbd><span>{view.clean ? `청소 중 ${Math.round(view.clean.progress * 100)}%` : label}{!blocked && at.kind === 'table' && view.tables.find(t => t.id === at.id)?.status === 'dirty' ? <small>1.5초 유지 · 이동하면 취소</small> : null}</span></button> : null}
        {secondaryLabel ? <button className="service-secondary-action" style={anchor('action')} disabled={!!secondaryBlocked} title={secondaryBlocked ?? undefined} aria-label={`R ${secondaryLabel}`} onClick={() => { model.current!.pressSecondary(); setView(model.current!.view()) }}><kbd>R</kbd>{secondaryLabel}</button> : null}
      </div>
    </div>
    <ServiceHud view={view} />
    <nav className="service-tools" aria-label="게임 도구">{!driver?.online ? <button aria-label="일시정지" onClick={() => { keys.current.clear(); model.current!.release(); setLocalPaused(true); setView(model.current!.view()) }}><HallIcon name="pause" /></button> : null}<button aria-label="서빙 이용 안내" onClick={() => { keys.current.clear(); model.current!.release(); guide.current?.showModal(); setView(model.current!.view()) }}><HallIcon name="help" /></button>{!driver?.online ? <button onClick={reset} title="배치 초기화" aria-label="배치 초기화"><HallIcon name="reset" /></button> : null}</nav>
    {view.message ? <p className={`service-feedback${view.message.startsWith('오배송') ? ' is-misdelivery' : ''}`} role="status" key={view.revision}>{view.message}</p> : null}
    {error ? <p className="service-error" role="alert">{error}</p> : null}
    {!driver?.online ? <ExitConfirmation open={localPaused} onContinue={() => setLocalPaused(false)} onExit={() => location.assign('/vr-zone.html')} /> : null}
    <dialog className="service-guide service-storage-dialog" ref={storage} aria-label="보관한 꼬치 선택" onClose={() => { model.current!.closeStorage(); setView(model.current!.view()) }}>
      <button className="service-guide-close" aria-label="보관대 닫기" onClick={() => { model.current!.closeStorage(); setView(model.current!.view()) }}>×</button>
      <h2>보관한 꼬치</h2><p>테이블 번호와 그림을 보고 골라 주세요. 들고 있는 접시 {view.carry.length}/2</p>
      <div className="service-storage-grid">{view.stored.map((dish, index) => <button key={dish.id} className="service-storage-dish" data-stored-id={dish.id} aria-label={`${dish.table}번 보관 접시 ${index + 1} 받기`} disabled={view.carry.length >= 2 || dirty || view.finished} onClick={() => { model.current!.takeStored(dish.id); setView(model.current!.view()) }}><strong>{String(dish.table).padStart(2, '0')}번 테이블</strong><MenuArt recipe={dish.recipe} label={`${dish.table}번 보관 꼬치 그림`} /><span>이 접시 받기</span></button>)}</div>
      <p className="service-storage-time">고르는 동안에도 영업 시간은 흘러요.</p>
    </dialog>
    {view.finished && !driver?.online ? <section className="service-complete" aria-label="영업 결과"><h2>영업 완료!</h2><p>서빙 완료 {view.served}팀</p><strong>{view.score.toLocaleString('ko-KR')}점</strong><button onClick={reset}>다시 시작</button><small>연습 모드 · 엽전과 랭킹 기록 없음</small></section> : null}
    <dialog className="service-guide" ref={guide} aria-label="서빙 이용 안내"><button className="service-guide-close" onClick={() => guide.current?.close()} aria-label="안내 닫기">×</button><h2>서빙과 식기 수거를 나눠요</h2><p>{driver?.online ? '친구와 같은 가게를 운영하고 있어요. 이 안내를 보는 동안에도 공동 영업 시간은 흘러요.' : '손님과 주방을 오가며 서빙을 연습해 보세요.'}</p><ol><li><HallIcon name="order" /><div><strong>그림 주문 받기</strong><p>손님에게 이동해 E로 받고, 뒤쪽 주문 전달대에 넘겨보세요.</p></div></li><li><HallIcon name="cloche" /><div><strong>접시 두 개 · 사케 두 병</strong><p>{driver?.online ? '요리사가 제출한 접시를 받아 냉장고를 거쳐 주문한 테이블에 서빙해요.' : '미리 준비된 6번 접시를 수령해 냉장고를 거쳐 서빙해 보세요.'} 음식을 들고 있으면 청소할 수 없어요. 주문에 맞는 음식 없이 서빙하면 10점 감점돼요(최저 0점). 잘못 가져간 음식은 트레이에 남아요.</p></div></li><li><HallIcon name="storage" /><div><strong>잘못 챙긴 음식은 내려놓기</strong><p>냉장고에서 R로 사케를 반납해요. 꼬치 보관대에서 E로 접시를 맡기고, 빈손일 때 E 또는 R로 그림을 골라 다시 받아요. 접시를 들고 있으면 R로 받을 수 있어요.</p></div></li><li><HallIcon name="dishes" /><div><strong>빈손으로 정리 · 식기 두 테이블분</strong><p>손님이 떠난 자리에서 E를 1.5초 유지해요. 정리 2점과 수거 2점을 받아요. 이동하거나 키를 놓으면 취소돼요. 수거한 자리는 바로 다시 사용할 수 있어요.</p></div></li><li><HallIcon name="washer" /><div><strong>세척기에 넣고 업무 재개</strong><p>식기를 들면 주문 접수·전달과 음식 수령을 할 수 없어요. 세척기에 E로 넣으면 테이블분마다 3점을 받고 다시 업무를 할 수 있어요.</p></div></li></ol><p className="service-guide-note">세척은 8초, 한 번에 최대 2테이블분이에요. 세척 중 추가 투입은 기다려야 해요. {driver?.online ? '보상과 팀 기록은 영업이 끝나면 확인할 수 있어요.' : '연습 모드에서는 엽전과 랭킹을 기록하지 않아요.'}</p><button className="service-guide-start" onClick={() => guide.current?.close()}>매장 둘러보기</button></dialog>
  </main>
}
