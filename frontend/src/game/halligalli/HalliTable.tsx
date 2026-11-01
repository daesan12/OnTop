import { CardBack, FruitCard } from './FruitCard'
import { FlipTimerBar } from './FlipTimerBar'
import { Bell } from './Bell'
import { seatSlots } from './actions'
import type { HalliGalli, HalliPlayer } from './protocol'

interface Props {
  halli: HalliGalli; gameId: string; viewerId: string; names: Record<string, string>
  canFlip: boolean; canRing: boolean; onFlip: () => void; onRing: () => void
  /** Players get the bell shortcut next to the bell, since the park key bar is hidden during the game. */
  keyHint?: boolean
}
const stateLabel = (p: HalliPlayer) => p.forfeited ? '기권' : p.eliminated ? '탈락' : ''

/** 2D table: own seat at the bottom, face-down pile beside the face-up top card, bell in the middle. */
export function HalliTable({ halli, gameId, viewerId, names, canFlip, canRing, onFlip, onRing, keyHint = false }: Props) {
  const slots = seatSlots(halli, viewerId), playing = halli.status === 'PLAYING'
  return <div className="hg-table" data-players={halli.players.length}>
    {halli.players.map((p, i) => {
      const own = p.userId === viewerId, turn = playing && halli.turnUserId === p.userId, out = stateLabel(p)
      return <section key={p.userId} className="hg-seat" data-slot={slots[i]} data-turn={turn || undefined}
        data-own={own || undefined} data-out={out ? (p.forfeited ? 'forfeited' : 'eliminated') : undefined}
        aria-label={`${names[p.userId]}${turn ? ' · 공개 차례' : ''}${out ? ` · ${out}` : ''}`}>
        <header className="hg-seat-name">
          <strong>{names[p.userId]}</strong>
          {out ? <span className="hg-badge" data-kind={p.forfeited ? 'forfeited' : 'eliminated'}>{out}</span>
            : turn ? <span className="hg-badge" data-kind="turn">공개 차례</span> : null}
          <span className="hg-count">{p.cardCount}장</span>
        </header>
        <div className="hg-piles">
          {own && turn ? <button type="button" className="hg-draw" disabled={!canFlip} onClick={onFlip}
            aria-label={`내 뒷면 카드 ${p.drawCount}장 · 눌러서 공개`}>
            {p.drawCount > 0 ? <CardBack size="small" /> : <span className="hg-empty" data-size="small" />}<b>{p.drawCount}</b>
          </button> : <div className="hg-draw" role="img" aria-label={`뒷면 카드 ${p.drawCount}장`}>
            {p.drawCount > 0 ? <CardBack size="small" /> : <span className="hg-empty" data-size="small" />}<b>{p.drawCount}</b>
          </div>}
          <div className="hg-faceup" aria-label={`공개 더미 ${p.faceUpCount}장`}>
            {p.topCard ? <FruitCard key={`${p.faceUpCount}:${p.topCard.fruit}${p.topCard.count}`} card={p.topCard} />
              : <span className="hg-empty" aria-label="공개 카드 없음" />}
            {p.faceUpCount > 1 && <small>{p.faceUpCount}장</small>}
          </div>
        </div>
        {turn && <FlipTimerBar halli={halli} emphasis={own} />}
      </section>
    })}
    <div className="hg-center">
      <Bell halli={halli} gameId={gameId} enabled={canRing} onRing={onRing} />
      {keyHint && playing && <p className="hg-keys"><kbd>Space</kbd> 종 치기</p>}
      {playing && halli.turnUserId === null && <><p className="hg-last-chance">공개할 카드가 없어요 · 마지막 종 기회</p><FlipTimerBar halli={halli} /></>}
    </div>
  </div>
}
