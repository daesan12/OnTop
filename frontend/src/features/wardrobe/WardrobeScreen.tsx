import { useLayoutEffect, useRef } from 'react'
import leafImage from '../../assets/entry/park-leaf.webp'
import coinImage from '../../assets/entry/yeopjeon-icon.webp'
import { equipSlots, type EquipSlot } from '../../network/equipment'
import { useSession } from '../../network/worldClient'
import type { OwnedItem } from '../shop/contracts'
import {
  cancelWardrobePreview, closeWardrobe, groupLabels, groupOf, itemLabel, OUTFIT_SLOTS, previewWardrobeItem, refreshWardrobe, setPieces,
  setWardrobeFilter, setWardrobeQuery, slotLabels, takeOffPreviewedItem, turnWardrobeView, useWardrobe, wardrobeGroups, wearPreviewedItem,
  type WardrobeFilter, type WardrobeGroup,
} from './state'
import { wornPiece } from '../../world/art/characterLook'
import { knownWholeSkin } from '../../world/art/wholeSkin'
import { WARDROBE_OUTFITS_ENABLED } from './feature'
import { wardrobeView } from './view'
import { outfitImage, setImage, useItemArt, type CharacterVariant } from './itemArt'
import './wardrobe.css'

const tabs: WardrobeFilter[] = ['ALL', ...wardrobeGroups]
const QUARTER_TURN = Math.PI / 4
const walkKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'Space'])

function ItemArt({ owned, variant }: { owned: OwnedItem; variant: CharacterVariant }) {
  const art = useItemArt(variant, owned.item.equipSlot!, owned.item.name)
  return <span className="wardrobe-art" data-slot={owned.item.equipSlot} data-whole-skin={!!knownWholeSkin(owned.item.imageKey)}>
    <img src={setImage(owned.item.setCode) ?? outfitImage(owned.item.imageKey, owned.item.equipSlot!) ?? art} alt="" />
  </span>
}

/** A round bubble round the avatar: what is worn in that place, or the character's own default. The outfit's bubble
 * shows the worn outfit (its set's picture, else its top's, else whichever piece is on). */
function SlotBubble({ group, worn, label, variant, active }: { group: WardrobeGroup; worn?: OwnedItem; label?: string; variant: CharacterVariant; active: boolean }) {
  const slot: EquipSlot = worn?.item.equipSlot ?? (group === 'OUTFIT' ? 'TOP' : group)
  const art = useItemArt(variant, slot, worn?.item.name)
  return <button type="button" className="wardrobe-bubble" data-slot={group} aria-pressed={active}
    onClick={() => setWardrobeFilter(active ? 'ALL' : group)}>
    <span className="wardrobe-bubble__art" data-kind={worn ? 'item' : 'part'}>
      <img src={(worn && (setImage(worn.item.setCode) ?? outfitImage(worn.item.imageKey, slot))) ?? art} alt="" />
    </span>
    <b>{groupLabels[group]}</b>
    <small>{worn ? label ?? worn.item.name : '기본'}</small>
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
  // A set is one card (its top, else its first piece): it is only worn whole. It shows under each of its slots.
  const cards = s.items.filter(owned => !owned.item.setCode || setPieces(s.items, owned).reduce((pick, other) =>
    other.item.equipSlot === 'TOP' ? other : pick, setPieces(s.items, owned)[0]) === owned)
  const slotsOf = (owned: OwnedItem) => equipSlots.filter(slot => setPieces(s.items, owned).some(other => other.item.equipSlot === slot))
  const groupsOf = (owned: OwnedItem) => wardrobeGroups.filter(group => slotsOf(owned).some(slot => groupOf(slot) === group))
  const label = (owned: OwnedItem) => itemLabel(s.items, owned)
  const outfitPieces = (owned: OwnedItem) => slotsOf(owned).filter(slot => OUTFIT_SLOTS.includes(slot)).map(slot => slotLabels[slot]).join('·')
  // An outfit set reads "옷 한 벌"; a set reaching the head too lists its places; a single outfit piece says which.
  const slotText = (owned: OwnedItem) => {
    const groups = groupsOf(owned)
    if (owned.item.setCode) return groups.length === 1 && groups[0] === 'OUTFIT' ? `옷 한 벌 · ${outfitPieces(owned)}` : `세트 · ${groups.map(group => groupLabels[group]).join('·')}`
    return groups[0] === 'OUTFIT' ? `옷 · ${slotLabels[owned.item.equipSlot!]}` : groupLabels[groups[0]!]
  }
  const detailText = (owned: OwnedItem) => owned.item.setCode ? `${slotText(owned)} | 한 벌로만 입어요`
    : groupOf(owned.item.equipSlot!) === 'OUTFIT' ? `${slotText(owned)} | 나머지는 기본 옷으로 입어요` : `${slotText(owned)} | 보유 아이템`
  const visible = cards.filter(owned => (s.filter === 'ALL' || groupsOf(owned).includes(s.filter))
    && (!query || label(owned).includes(query) || setPieces(s.items, owned).some(other => other.item.name.includes(query))))
  const preview = s.items.find(owned => owned.userItemId === s.previewId)
  const incompatibleSkin = !!preview && !!knownWholeSkin(preview.item.imageKey)
    && knownWholeSkin(preview.item.imageKey)!.variant !== variant
  const previewed = (owned: OwnedItem) => !!preview && setPieces(s.items, owned).includes(preview)
  const worn = (group: WardrobeGroup) => group === 'OUTFIT'
    ? OUTFIT_SLOTS.map(slot => s.items.find(owned => owned.equipped && owned.item.equipSlot === slot)).find(Boolean)
    : s.items.find(owned => owned.equipped && owned.item.equipSlot === group)
  const bubble = (group: WardrobeGroup) => {
    const on = worn(group)
    return <SlotBubble key={group} group={group} worn={on} label={on && label(on)} variant={variant} active={s.filter === group} />
  }

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
        {/* Round the avatar: head and face on its left, the outfit on its right. */}
        <div className="wardrobe-bubbles__side" data-side="left">{(['HAIR', 'FACE'] as const).map(bubble)}</div>
        <div className="wardrobe-bubbles__side" data-side="right">{(['OUTFIT'] as const).map(bubble)}</div>
      </nav>
      <Leaf className="wardrobe-leaf--a" /><Leaf className="wardrobe-leaf--b" /><Leaf className="wardrobe-leaf--c" /><Leaf className="wardrobe-leaf--d" />
      <div className="wardrobe-stage__controls">
        <button type="button" aria-label="왼쪽으로 돌리기" onClick={() => turnWardrobeView(-QUARTER_TURN)}>‹</button>
        <span>{preview ? `미리보기 · ${label(preview)}` : '내 캐릭터'}</span>
        <button type="button" aria-label="오른쪽으로 돌리기" onClick={() => turnWardrobeView(QUARTER_TURN)}>›</button>
      </div>
      {preview && knownWholeSkin(preview.item.imageKey) && <p className="wardrobe-stage__note" role="note">남자 캐릭터 전용 · 머리·얼굴·옷을 한 번에 입는 스킨이에요.</p>}
      {preview && !knownWholeSkin(preview.item.imageKey) && !wornPiece(preview.item.imageKey) && <p className="wardrobe-stage__note" role="note">의상 3D 모델이 준비되면 캐릭터에 바로 보여요. 지금은 착용 정보만 바뀌어요.</p>}
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
          {tab === 'ALL' ? '전체' : groupLabels[tab]}
        </button>)}
      </div>

      <div className="wardrobe-list" aria-busy={s.loading}>
        {!WARDROBE_OUTFITS_ENABLED ? <div className="wardrobe-empty" role="status">
          <b>의상은 곧 열려요</b><p>지금은 기본 옷만 입을 수 있어요. 여러 의상을 골라 입는 기능을 준비하고 있어요.</p>
        </div> : s.unavailable ? <div className="wardrobe-empty" role="status">
          <b>옷장이 아직 준비 중이에요</b><p>서버에서 옷장 기능을 켜면 보유한 의상이 여기에 보여요.</p>
        </div> : s.error && !s.ready ? <div className="wardrobe-empty" role="alert">
          <b>옷장을 불러오지 못했어요</b><p>{s.error}</p>
          <button type="button" onClick={() => void refreshWardrobe()}>다시 불러오기</button>
        </div> : !s.ready ? <div className="wardrobe-empty" role="status"><b>옷장을 여는 중이에요…</b></div>
        : !s.items.length ? <div className="wardrobe-empty" role="status">
          <b>아직 가진 의상이 없어요</b><p>상점에서 의상을 구매하면 여기에서 골라 입을 수 있어요.</p>
        </div> : !visible.length ? <div className="wardrobe-empty" role="status">
          <b>찾는 의상이 없어요</b><p>다른 칸을 고르거나 검색어를 바꿔 보세요.</p>
        </div> : <ul className="wardrobe-grid">
          {visible.map(owned => <li key={owned.userItemId}>
            <button type="button" className="wardrobe-card" aria-pressed={previewed(owned)}
              aria-label={`${label(owned)} ${slotText(owned)}${owned.equipped ? ' 착용 중' : ''}`}
              disabled={!!s.equipping} onClick={() => previewWardrobeItem(owned.userItemId)}>
              <ItemArt owned={owned} variant={variant} />
              {owned.equipped ? <span className="wardrobe-badge wardrobe-badge--worn">착용 중</span>
                : previewed(owned) && <span className="wardrobe-badge wardrobe-badge--preview">미리보기</span>}
              <span className="wardrobe-card__text"><b>{label(owned)}</b><small>{slotText(owned)}</small></span>
            </button>
          </li>)}
        </ul>}
        {s.error && s.ready && <p className="wardrobe-message" role="alert">{s.error}</p>}
      </div>

      <footer className="wardrobe-detail" aria-live="polite">
        {preview ? <>
          <ItemArt owned={preview} variant={variant} />
          <div className="wardrobe-detail__text"><b>{label(preview)}</b><small>{detailText(preview)}</small></div>
          <div className="wardrobe-detail__actions">
            {preview.equipped
              ? <button type="button" className="wardrobe-wear" disabled={!!s.equipping || s.loading} onClick={() => void takeOffPreviewedItem()}>
                {s.equipping ? '벗는 중…' : preview.item.setCode ? '세트 벗기' : '벗기'}
              </button>
              : <button type="button" className="wardrobe-wear" disabled={!!s.equipping || s.loading || incompatibleSkin} onClick={() => void wearPreviewedItem()}>
                {s.equipping ? '착용하는 중…' : preview.item.setCode ? '세트 입기' : '착용하기'}
              </button>}
            <button type="button" className="wardrobe-cancel" disabled={!!s.equipping} onClick={cancelWardrobePreview}>미리보기 취소</button>
          </div>
        </> : <p className="wardrobe-detail__empty">{s.notice || '입어 볼 의상을 골라 주세요.'}</p>}
        {s.equipError && <p className="wardrobe-message" role="alert">{s.equipError}</p>}
      </footer>
    </section>
  </section>
}
