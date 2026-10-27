import { useLayoutEffect, useRef } from 'react'
import leafImage from '../../assets/park-leaf.png'
import coinImage from '../../assets/yeopjeon-icon.png'
import { equipSlots, type EquipSlot } from '../../network/equipment'
import { useSession } from '../../network/worldClient'
import type { OwnedItem } from '../shop/contracts'
import {
  cancelWardrobePreview, closeWardrobe, previewWardrobeItem, refreshWardrobe,
  setWardrobeFilter, setWardrobeQuery, slotLabels, turnWardrobeView, useWardrobe, wearPreviewedItem, type WardrobeFilter,
} from './state'
import { wardrobeView } from './view'
import { useItemArt, type CharacterVariant } from './itemArt'
import './wardrobe.css'

const tabs: WardrobeFilter[] = ['ALL', ...equipSlots]
const QUARTER_TURN = Math.PI / 4
const walkKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'Space'])

function ItemArt({ owned, variant }: { owned: OwnedItem; variant: CharacterVariant }) {
  return <span className="wardrobe-art" data-slot={owned.item.equipSlot}>
    <img src={useItemArt(variant, owned.item.equipSlot!, owned.item.name)} alt="" />
  </span>
}

/** A round bubble round the avatar: what is worn in that slot, or the character's own default part. */
function SlotBubble({ slot, worn, variant, active }: { slot: EquipSlot; worn?: OwnedItem; variant: CharacterVariant; active: boolean }) {
  const art = useItemArt(variant, slot, worn?.item.name)
  return <button type="button" className="wardrobe-bubble" data-slot={slot} aria-pressed={active}
    onClick={() => setWardrobeFilter(active ? 'ALL' : slot)}>
    <span className="wardrobe-bubble__art" data-kind={worn ? 'item' : 'part'}>
      <img src={art} alt="" />
    </span>
    <b>{slotLabels[slot]}</b>
    <small>{worn ? worn.item.name : '기본'}</small>
  </button>
}

function Leaf({ className }: { className: string }) {
  return <svg className={`wardrobe-leaf ${className}`} viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3 21C3 11 9 4 21 3c0 11-7 18-18 18Z" fill="#8fd07a" />
    <path d="M4 20 15 9" stroke="#5f9c4f" strokeWidth="1.4" strokeLinecap="round" fill="none" />
  </svg>
}

export function WardrobeScreen() {
  const s = useWardrobe()
  const owner = useSession(state => state.sessionId)
  const variant: CharacterVariant = useSession(state => state.profiles[state.sessionId]?.character === 'girl' ? 'girl' : 'man')
  const stage = useRef<HTMLElement>(null)
  const shown = s.open && s.owner === owner
  // The park camera frames the avatar inside the stage box, wherever the layout puts it.
  useLayoutEffect(() => {
    if (!shown) return
    const canvas = () => document.querySelector<HTMLCanvasElement>('canvas.park-canvas, canvas')
    const frame = () => {
      const box = stage.current?.getBoundingClientRect()
      if (!box || !innerWidth || !innerHeight) return
      wardrobeView.x = (box.left + box.width / 2) / innerWidth * 2 - 1
      wardrobeView.y = 1 - (box.top + box.height / 2) / innerHeight * 2
      wardrobeView.fill = Math.max(0.2, box.height * 0.82 / innerHeight)
    }
    frame()
    // A new layout moves the camera sideways; look again for an angle nothing stands in front of.
    const resize = () => { frame(); wardrobeView.chooseClearView = true }
    if (document.pointerLockElement) document.exitPointerLock()
    canvas()?.focus({ preventScroll: true })
    const keys = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null
      // A clicked wardrobe button keeps focus; walking keys hand it back to the park so the avatar moves.
      if (walkKeys.has(event.code) && target?.closest('.wardrobe') && !target.closest('input')
        && !event.ctrlKey && !event.altKey && !event.metaKey) canvas()?.focus({ preventScroll: true })
    }
    addEventListener('resize', resize)
    addEventListener('keydown', keys, true)
    return () => { removeEventListener('resize', resize); removeEventListener('keydown', keys, true) }
  }, [shown])
  if (!shown) return null

  const query = s.query.trim()
  const visible = s.items.filter(owned => (s.filter === 'ALL' || owned.item.equipSlot === s.filter)
    && (!query || owned.item.name.includes(query)))
  const preview = s.items.find(owned => owned.userItemId === s.previewId)
  const worn = (slot: EquipSlot) => s.items.find(owned => owned.equipped && owned.item.equipSlot === slot)
  const bubble = (slot: EquipSlot) => <SlotBubble key={slot} slot={slot} worn={worn(slot)} variant={variant} active={s.filter === slot} />

  // Not a modal: the park stays live behind it, so the avatar keeps walking while you change.
  return <section className="wardrobe" aria-label="마이룸 옷장">
    <header className="wardrobe-title">
      <img src={leafImage} alt="" />
      <div><h2>마이룸</h2><p>공원에서 꾸미는 나의 캐릭터</p></div>
    </header>
    <div className="wardrobe-top-actions">
      <span className="wardrobe-coin" aria-label="보유 엽전"><img src={coinImage} alt="" />{s.balance === null ? '—' : s.balance.toLocaleString('ko-KR')}냥</span>
      <button type="button" className="wardrobe-close" aria-label="옷장 닫기" onClick={closeWardrobe}>×</button>
    </div>

    <section ref={stage} className="wardrobe-stage" aria-label="캐릭터 미리보기">
      <svg className="wardrobe-vines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <path d="M31 20 A38 30 0 0 0 31 72" />
        <path d="M69 20 A38 30 0 0 1 69 72" />
      </svg>
      <nav className="wardrobe-bubbles" aria-label="착용 부위">
        {/* A ring round the avatar: head, face and feet on its left, top and bottom on its right. */}
        <div className="wardrobe-bubbles__side" data-side="left">{(['HAIR', 'FACE', 'SHOES'] as const).map(bubble)}</div>
        <div className="wardrobe-bubbles__side" data-side="right">{(['TOP', 'BOTTOM'] as const).map(bubble)}</div>
      </nav>
      <Leaf className="wardrobe-leaf--a" /><Leaf className="wardrobe-leaf--b" /><Leaf className="wardrobe-leaf--c" /><Leaf className="wardrobe-leaf--d" />
      <div className="wardrobe-stage__controls">
        <button type="button" aria-label="왼쪽으로 돌리기" onClick={() => turnWardrobeView(-QUARTER_TURN)}>‹</button>
        <span>{preview ? `미리보기 · ${preview.item.name}` : '내 캐릭터'}</span>
        <button type="button" aria-label="오른쪽으로 돌리기" onClick={() => turnWardrobeView(QUARTER_TURN)}>›</button>
      </div>
      {preview && <p className="wardrobe-stage__note" role="note">의상 3D 모델이 준비되면 캐릭터에 바로 보여요. 지금은 착용 정보만 바뀌어요.</p>}
    </section>
    <p className="wardrobe-hint"><span aria-hidden="true">🖱</span>WASD 이동 · 드래그로 회전 · Esc 닫기</p>

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
              <ItemArt owned={owned} variant={variant} />
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
          <ItemArt owned={preview} variant={variant} />
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
  </section>
}
