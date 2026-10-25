import { useEffect, useLayoutEffect, useRef } from 'react'
import { useSession } from '../../network/worldClient'
import { emptyEquipment } from '../../network/equipment'
import { inputState } from '../../world/inputOwnership'
import { closeShop, equipShopItem, openShop, purchaseShopItem, refreshShop, resetShop,
  selectShopItem, setShopQuantity, useShop } from './controller'
import type { ShopItem } from './contracts'
import './shop.css'

const slotNames = { HAIR: '머리', FACE: '얼굴', TOP: '상의', BOTTOM: '하의', SHOES: '신발' }
const money = (value: number) => `${value.toLocaleString('ko-KR')}냥`
const category = (item: ShopItem) => item.equipSlot ? slotNames[item.equipSlot] : item.itemType === 'EQUIPMENT' ? '의상' : '소비 아이템'

export function ShopLauncher() {
  const status = useSession(s => s.status), room = useSession(s => s.roomId)
  return <button className="park-shop-launcher park-exit" type="button" aria-label="상점·보유 아이템 열기"
    aria-haspopup="dialog" disabled={status !== 'connected' || !room} onClick={openShop}>상점 · 옷장</button>
}
export function ShopPanel() {
  const s = useShop(), panel = useRef<HTMLDialogElement>(null), previousFocus = useRef<HTMLElement | null>(null)
  const approved = useSession(state => state.equipment[state.sessionId] ?? emptyEquipment)
  const owner = useSession(state => state.sessionId)
  useEffect(() => {
    const unsubscribe = useSession.subscribe((next, old) => {
      if (next.sessionId && useShop.getState().owner && next.sessionId !== useShop.getState().owner) resetShop()
      else if (next.status !== 'connected' || next.roomId !== old.roomId) closeShop()
    })
    window.addEventListener('ontop-manual-open', closeShop)
    return () => { unsubscribe(); window.removeEventListener('ontop-manual-open', closeShop); resetShop() }
  }, [])
  useLayoutEffect(() => {
    const element = panel.current
    if (s.open && element && !element.open) {
      previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      if (document.pointerLockElement) document.exitPointerLock()
      element.showModal()
    } else if (!s.open && element?.open) {
      element.close()
      if (!inputState.manualOpen) (document.querySelector<HTMLCanvasElement>('canvas') ?? previousFocus.current)?.focus({ preventScroll: true })
    }
  }, [s.open])
  const busy = s.purchasing || !!s.equipping
  const selection = s.selected, validQuantity = !!selection && Number.isInteger(selection.quantity)
    && selection.quantity > 0 && selection.quantity <= 2147483647 && Number.isSafeInteger(selection.quantity * selection.item.price)
  return <dialog ref={panel} className="shop-panel" aria-label="온탑 상점과 옷장"
    onCancel={event => { event.preventDefault(); closeShop() }} onClose={() => { if (!panel.current?.open && useShop.getState().open) closeShop() }}
    onKeyDown={event => {
      event.stopPropagation()
      if (event.key !== 'Tab') return
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)')].filter(el => el.getClientRects().length > 0)
      const first = controls[0], last = controls.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }}>
    {s.open && s.owner === owner && <>
      <header className="shop-heading"><div><small>온탑 · 엽전 가게</small><h2>상점과 나의 옷장</h2></div><button aria-label="상점 닫기" onClick={closeShop}>×</button></header>
      <div className="shop-wallet" aria-label="상점 지갑 잔액">
        <span>보유 엽전 <strong>{s.wallet ? money(s.wallet.balance) : '—냥'}</strong></span>
        <span>사용 가능 <strong>{s.wallet ? money(s.wallet.availableBalance) : '—냥'}</strong></span>
        {s.wallet && s.wallet.reservedBalance > 0 && <small>경기 참가금으로 {money(s.wallet.reservedBalance)} 예약 중</small>}
      </div>
      <nav className="shop-tabs" aria-label="상점 메뉴"><button aria-pressed={s.tab === 'shop'} onClick={() => useShop.setState({ tab: 'shop' })}>상품 목록</button>
        <button aria-pressed={s.tab === 'inventory'} onClick={() => useShop.setState({ tab: 'inventory' })}>보유 아이템</button>
        <button className="shop-refresh" disabled={s.loading || busy} onClick={() => void refreshShop()}>목록·잔액 다시 확인</button></nav>
      <div className="shop-content">
        {s.loading && <p role="status">목록과 잔액을 확인하고 있어요.</p>}
        {s.walletError && <p role="alert" className="shop-error">{s.walletError}</p>}
        {s.attempt && <section className="shop-purchase-check" aria-label="구매 결과 재확인"><h3>구매 결과 확인이 필요해요</h3>
          <p>{s.attempt.name} · {s.attempt.quantity}개</p><p>결과를 확인할 때까지 다른 구매를 잠시 기다려 주세요.</p>
          <button disabled={busy} onClick={() => void purchaseShopItem()}>{s.purchasing ? '구매 확인 중…' : '같은 구매 다시 확인'}</button></section>}
        {s.purchaseError && <p role="alert" className="shop-error">{s.purchaseError}</p>}
        {s.equipError && <p role="alert" className="shop-error">{s.equipError}</p>}
        {s.notice && <p role="status" className="shop-notice">{s.notice}</p>}
        {s.receipt && <section className="shop-receipt" aria-label="구매 영수증"><h3>구매 완료</h3><p>{s.receipt.quantity}개 · {money(s.receipt.totalPrice)}</p>
          <small>구매 당시 잔액 {money(s.receipt.balanceAfter)} · 현재 잔액은 위에서 확인해 주세요.</small></section>}
        {s.tab === 'shop' ? <section aria-label="판매 상품 목록">
          {s.productError && <p role="alert" className="shop-error">{s.productError}</p>}
          {s.productsReady && !s.items.length && <p>지금 판매 중인 상품이 없어요.</p>}
          <ul className="shop-items">{s.items.map(item => {
            const owned = item.itemType === 'EQUIPMENT' && s.inventoryReady && s.inventory.some(o => o.item.itemId === item.itemId)
            return <li className="shop-item" key={item.itemId}><span className="shop-item-mark" aria-hidden="true">{item.equipSlot ? '衣' : '物'}</span>
              <div><small>{category(item)}</small><h3>{item.name}</h3><p>{money(item.price)}</p></div>
              <button aria-label={`${item.name} 구매 선택`} disabled={busy || !!s.attempt || !s.productsReady || !!owned}
                onClick={() => selectShopItem(item)}>{owned ? '보유 중' : '구매 선택'}</button></li>
          })}</ul>
        </section> : <section aria-label="나의 보유 아이템 목록">
          {s.inventoryError && <p role="alert" className="shop-error">{s.inventoryError}</p>}
          {s.inventoryReady && !s.inventory.length && <p>아직 보유한 아이템이 없어요.</p>}
          <ul className="shop-items">{s.inventory.map(owned => <li className="shop-item" key={owned.userItemId}>
            <span className="shop-item-mark" aria-hidden="true">{owned.item.equipSlot ? '衣' : '物'}</span>
            <div><small>{category(owned.item)}</small><h3>{owned.item.name}</h3><p>{owned.quantity}개{s.equipping === owned.userItemId ? ' · 장착 확인 중…' : owned.equipped ? ' · 장착됨' : ''}</p></div>
            {owned.item.itemType === 'EQUIPMENT' && <button aria-label={`${owned.item.name} 장착`} disabled={busy || !!s.attempt || !s.inventoryReady || !owned.item.equipSlot || owned.equipped}
              onClick={() => void equipShopItem(owned)}>{owned.equipped ? '장착됨' : !owned.item.equipSlot ? '장착 준비 중' : '장착'}</button>}
          </li>)}</ul>
          <p className="shop-appearance" aria-label="외형 반영 상태">{approved.length ? '서버의 장착 정보를 받았어요. 상품별 의상 외형은 준비 중으로, 기본 캐릭터가 표시돼요.'
            : s.inventory.some(o => o.equipped) ? '서버의 캐릭터 장착 정보를 기다리고 있어요. 상품별 의상 외형은 준비 중이에요.' : '상품별 의상 외형은 준비 중이에요. 장착 정보는 서버에 저장돼요.'}</p>
        </section>}
        {selection && !s.attempt && <section className="shop-purchase-check" aria-label="구매 내용 확인"><h3>{selection.item.name} 구매</h3>
          {selection.item.itemType === 'CONSUMABLE' ? <label>구매 수량 <input type="number" min="1" max="2147483647" step="1" value={Number.isNaN(selection.quantity) ? '' : selection.quantity}
            onChange={event => setShopQuantity(event.currentTarget.valueAsNumber)} disabled={busy} /></label> : <p>의상 1개</p>}
          <p>표시 금액 {validQuantity ? money(selection.item.price * selection.quantity) : '수량을 확인해 주세요'}</p>
          <div><button disabled={!validQuantity || busy || !s.productsReady} onClick={() => void purchaseShopItem()}>구매 확정</button>
            <button disabled={busy} onClick={() => useShop.setState({ selected: null, purchaseError: '' })}>선택 취소</button></div></section>}
      </div>
      <footer>Esc로 닫기 · 실제 구매 결과를 확인한 뒤 보유 목록과 잔액이 갱신됩니다.</footer>
    </>}
  </dialog>
}
