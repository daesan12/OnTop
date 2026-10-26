import { useEffect, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import leafImage from '../../assets/park-leaf.png'
import coinImage from '../../assets/yeopjeon-icon.png'
import { equipSlots, type EquipSlot } from '../../network/equipment'
import { useSession } from '../../network/worldClient'
import { inputState } from '../../world/inputOwnership'
import type { OwnedItem } from '../shop/contracts'
import wardrobeIcon from '../parkMenus/icons/dock-wardrobe.svg'
import {
  cancelWardrobePreview, closeWardrobe, openWardrobe, previewWardrobeItem, refreshWardrobe, resetWardrobe,
  setWardrobeFilter, setWardrobeQuery, slotLabels, useWardrobe, wearPreviewedItem, type WardrobeFilter,
} from './state'
import { WardrobePreview } from './WardrobePreview'
import hairIcon from './icons/slot-hair.svg'
import faceIcon from './icons/slot-face.svg'
import topIcon from './icons/slot-top.svg'
import bottomIcon from './icons/slot-bottom.svg'
import shoesIcon from './icons/slot-shoes.svg'
import './wardrobe.css'

const slotIcons: Record<EquipSlot, string> = { HAIR: hairIcon, FACE: faceIcon, TOP: topIcon, BOTTOM: bottomIcon, SHOES: shoesIcon }
const tabs: WardrobeFilter[] = ['ALL', ...equipSlots]
const QUARTER_TURN = Math.PI / 4

/** Dock 옷장 button; the wardrobe is only for walking in the park, not while seated or using a facility. */
export function WardrobeLauncher() {
  const disabled = useSession(s => s.status !== 'connected' || !s.roomId
    || !!(s.tableId || s.benchId || s.fitnessId || s.telescopeId || s.watchedTableId))
  return <button className="park-shop-launcher" type="button" aria-label="옷장" aria-haspopup="dialog"
    disabled={disabled} onClick={openWardrobe}>
    <img src={wardrobeIcon} alt="" /><span>옷장</span>
  </button>
}

function ItemArt({ owned }: { owned: OwnedItem }) {
  // Items carry an imageKey but no artwork ships yet; the slot icon stands in for it.
  return <span className="wardrobe-art" data-slot={owned.item.equipSlot}><img src={slotIcons[owned.item.equipSlot!]} alt="" /></span>
}

export function WardrobeScreen() {
  const s = useWardrobe()
  const owner = useSession(state => state.sessionId)
  const panel = useRef<HTMLDialogElement>(null), previousFocus = useRef<HTMLElement | null>(null)
  const yaw = useRef(0), drag = useRef<{ x: number; yaw: number } | null>(null)
  useEffect(() => {
    const unsubscribe = useSession.subscribe((next, old) => {
      const { owner: wardrobeOwner } = useWardrobe.getState()
      if (next.sessionId && wardrobeOwner && next.sessionId !== wardrobeOwner) resetWardrobe()
      else if (next.status !== 'connected' || next.roomId !== old.roomId
        || next.tableId || next.benchId || next.fitnessId || next.telescopeId) closeWardrobe()
    })
    window.addEventListener('ontop-manual-open', closeWardrobe)
    return () => { unsubscribe(); window.removeEventListener('ontop-manual-open', closeWardrobe); resetWardrobe() }
  }, [])
  useLayoutEffect(() => {
    const element = panel.current
    if (s.open && element && !element.open) {
      previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      if (document.pointerLockElement) document.exitPointerLock()
      yaw.current = 0
      element.showModal()
    } else if (!s.open && element?.open) {
      element.close()
      if (!inputState.manualOpen) (document.querySelector<HTMLCanvasElement>('canvas.park-canvas, canvas') ?? previousFocus.current)?.focus({ preventScroll: true })
    }
  }, [s.open])

  const query = s.query.trim()
  const visible = s.items.filter(owned => (s.filter === 'ALL' || owned.item.equipSlot === s.filter)
    && (!query || owned.item.name.includes(query)))
  const preview = s.items.find(owned => owned.userItemId === s.previewId)
  const worn = (slot: EquipSlot) => s.items.find(owned => owned.equipped && owned.item.equipSlot === slot)
  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    drag.current = { x: event.clientX, yaw: yaw.current }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current) yaw.current = drag.current.yaw + (event.clientX - drag.current.x) * 0.01
  }

  return <dialog ref={panel} className="wardrobe" aria-label="마이룸 옷장"
    onCancel={event => { event.preventDefault(); closeWardrobe() }}
    onClose={() => { if (!panel.current?.open && useWardrobe.getState().open) closeWardrobe() }}
    onKeyDown={event => {
      // World shortcuts never fire behind the wardrobe; Tab stays inside it.
      event.stopPropagation()
      if (event.key !== 'Tab') return
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)')].filter(el => el.getClientRects().length > 0)
      const first = controls[0], last = controls.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }}>
    {s.open && s.owner === owner && <>
      <header className="wardrobe-title">
        <img src={leafImage} alt="" />
        <div><h2>마이룸</h2><p>공원에서 꾸미는 나의 캐릭터</p></div>
      </header>
      <div className="wardrobe-top-actions">
        <span className="wardrobe-coin" aria-label="보유 엽전"><img src={coinImage} alt="" />{s.balance === null ? '—' : s.balance.toLocaleString('ko-KR')}냥</span>
        <button type="button" className="wardrobe-close" aria-label="옷장 닫기" onClick={closeWardrobe}>×</button>
      </div>

      <nav className="wardrobe-slots" aria-label="착용 부위">
        {equipSlots.map(slot => {
          const item = worn(slot)
          return <button key={slot} type="button" aria-pressed={s.filter === slot} onClick={() => setWardrobeFilter(s.filter === slot ? 'ALL' : slot)}>
            <span className="wardrobe-slots__icon"><img src={slotIcons[slot]} alt="" /></span>
            <span><b>{slotLabels[slot]}</b><small>{item ? item.item.name : '기본'}</small></span>
          </button>
        })}
      </nav>

      <section className="wardrobe-stage" aria-label="캐릭터 미리보기">
        <div className="wardrobe-stage__viewport" onPointerDown={startDrag} onPointerMove={moveDrag}
          onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}>
          <WardrobePreview yaw={yaw} />
        </div>
        <div className="wardrobe-stage__controls">
          <button type="button" aria-label="왼쪽으로 돌리기" onClick={() => { yaw.current -= QUARTER_TURN }}>‹</button>
          <span>{preview ? `미리보기 · ${preview.item.name}` : '내 캐릭터'}</span>
          <button type="button" aria-label="오른쪽으로 돌리기" onClick={() => { yaw.current += QUARTER_TURN }}>›</button>
        </div>
        {preview && <p className="wardrobe-stage__note" role="note">의상 3D 모델이 준비되면 캐릭터에 바로 보여요. 지금은 착용 정보만 바뀌어요.</p>}
      </section>
      <p className="wardrobe-hint"><span aria-hidden="true">🖱</span>드래그로 회전 · Esc 닫기</p>

      <section className="wardrobe-panel" aria-labelledby="wardrobe-heading">
        <header className="wardrobe-panel__header">
          <h3 id="wardrobe-heading"><svg viewBox="0 0 32 24" aria-hidden="true"><path d="M16 6a3 3 0 1 1 3 3l-3 2.2L3.4 19.5A1.6 1.6 0 0 0 4.4 22h23.2a1.6 1.6 0 0 0 1-2.5L16 11.2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>나의 옷장</h3>
          <label className="wardrobe-search">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" /><path d="m20 20-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            <input type="search" aria-label="아이템 찾기" placeholder="아이템 찾기" value={s.query} onChange={event => setWardrobeQuery(event.target.value)} />
          </label>
        </header>
        <div className="wardrobe-tabs" role="group" aria-label="부위 분류">
          {tabs.map(tab => <button key={tab} type="button" aria-pressed={s.filter === tab} onClick={() => setWardrobeFilter(tab)}>
            {tab === 'ALL' ? '전체' : slotLabels[tab]}
          </button>)}
        </div>

        <div className="wardrobe-list" aria-busy={s.loading}>
          {s.unavailable ? <div className="wardrobe-empty" role="status">
            <b>옷장이 아직 준비 중이에요</b><p>서버에서 옷장 기능을 켜면 보유한 의상이 여기에 보여요.</p>
          </div> : s.error && !s.ready ? <div className="wardrobe-empty" role="alert">
            <b>옷장을 불러오지 못했어요</b><p>{s.error}</p>
            <button type="button" onClick={() => void refreshWardrobe()}>다시 불러오기</button>
          </div> : !s.ready ? <div className="wardrobe-empty" role="status"><b>옷장을 여는 중이에요…</b></div>
          : !s.items.length ? <div className="wardrobe-empty" role="status">
            <b>아직 가진 의상이 없어요</b><p>상점에서 의상을 구매하면 여기에서 골라 입을 수 있어요.</p>
          </div> : !visible.length ? <div className="wardrobe-empty" role="status">
            <b>찾는 의상이 없어요</b><p>다른 부위를 고르거나 검색어를 바꿔 보세요.</p>
          </div> : <ul className="wardrobe-grid">
            {visible.map(owned => <li key={owned.userItemId}>
              <button type="button" className="wardrobe-card" aria-pressed={owned.userItemId === s.previewId}
                aria-label={`${owned.item.name} ${slotLabels[owned.item.equipSlot!]}${owned.equipped ? ' 착용 중' : ''}`}
                disabled={!!s.equipping} onClick={() => previewWardrobeItem(owned.userItemId)}>
                <ItemArt owned={owned} />
                {owned.equipped ? <span className="wardrobe-badge wardrobe-badge--worn">착용 중</span>
                  : owned.userItemId === s.previewId && <span className="wardrobe-badge wardrobe-badge--preview">미리보기</span>}
                <span className="wardrobe-card__text"><b>{owned.item.name}</b><small>{slotLabels[owned.item.equipSlot!]}</small></span>
              </button>
            </li>)}
          </ul>}
          {s.error && s.ready && <p className="wardrobe-message" role="alert">{s.error}</p>}
        </div>

        <footer className="wardrobe-detail" aria-live="polite">
          {preview ? <>
            <ItemArt owned={preview} />
            <div className="wardrobe-detail__text"><b>{preview.item.name}</b><small>{slotLabels[preview.item.equipSlot!]} | 보유 아이템</small></div>
            <div className="wardrobe-detail__actions">
              <button type="button" className="wardrobe-wear" disabled={preview.equipped || !!s.equipping || s.loading} onClick={() => void wearPreviewedItem()}>
                {s.equipping ? '착용하는 중…' : preview.equipped ? '착용 중' : '착용하기'}
              </button>
              <button type="button" className="wardrobe-cancel" disabled={!!s.equipping} onClick={cancelWardrobePreview}>미리보기 취소</button>
            </div>
          </> : <p className="wardrobe-detail__empty">{s.notice || '입어 볼 의상을 골라 주세요.'}</p>}
          {s.equipError && <p className="wardrobe-message" role="alert">{s.equipError}</p>}
        </footer>
      </section>
    </>}
  </dialog>
}
