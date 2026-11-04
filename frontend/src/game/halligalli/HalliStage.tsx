import { Fragment } from 'react'
import { CardBack, FruitCard } from './FruitCard'
import { FlipTimerBar } from './FlipTimerBar'
import { bellLabel, useBellMark } from './Bell'
import { pileText, stateLabel, turnLabel, type HalliTableProps } from './HalliTable'
import { stageRef } from './anchors'
import { HalliFlights } from './HalliFlights'

/**
 * Table-anchored layout for wide screens. The 3D board (HalliBoard) places every element each frame: face-up cards
 * lie flat on the felt, labels hang off each seat's edge. The bell itself is 3D; here it only has an accessible
 * button over it. Same inputs as HalliTable.
 */
export function HalliStage({ halli, gameId, viewerId, names, canFlip, canRing, onFlip, onRing, keyHint = false }: HalliTableProps) {
  const playing = halli.status === 'PLAYING', mark = useBellMark(halli, gameId)
  return <div className="hg-stage" data-players={halli.players.length}>
    {halli.players.map(p => {
      const own = p.userId === viewerId, turn = playing && halli.turnUserId === p.userId, out = stateLabel(p)
      const outKind = out ? (p.forfeited ? 'forfeited' : 'eliminated') : undefined
      return <Fragment key={p.userId}>
        <div ref={stageRef(`face:${p.userId}`)} className="hg-stage-face" data-out={outKind} role="group"
          aria-label={`${names[p.userId]} 공개 더미 ${p.faceUpCount}장`}>
          {p.topCard ? <FruitCard key={`${p.faceUpCount}:${p.topCard.fruit}${p.topCard.count}`} card={p.topCard} />
            : <span className="hg-empty" aria-label="공개 카드 없음" />}
        </div>
        {/* The pile itself is 3D; this transparent button lies on its top so the own pile is clickable and focusable. */}
        {own && turn && <button ref={stageRef(`draw:${p.userId}`)} type="button" className="hg-stage-draw" disabled={!canFlip} onClick={onFlip}
          aria-label={`내 뒷면 카드 ${p.drawCount}장 · 눌러서 공개`}>{p.drawCount > 0 && <CardBack />}</button>}
        <section ref={stageRef(`label:${p.userId}`)} className="hg-seat hg-stage-seat" data-turn={turn || undefined}
          data-own={own || undefined} data-out={outKind}
          aria-label={`${names[p.userId]}${turn ? ` · ${turnLabel(halli, p, own)}` : ''}${out ? ` · ${out}` : ''}`}>
          {own ? <>
            {/* Own status bar, docked at the bottom centre: name | state | counts, timer | Space hint. */}
            <strong>{names[p.userId]}</strong>
            {(out || turn) && <><i className="hg-sep" aria-hidden="true" />
              <span className="hg-badge" data-kind={outKind ?? 'turn'}>{out || turnLabel(halli, p, own)}</span></>}
            <i className="hg-sep" aria-hidden="true" />
            <span className="hg-own-count">남은 카드 {p.drawCount}</span>
            <span className="hg-own-count">펼친 카드 {p.faceUpCount}</span>
            {turn && <FlipTimerBar halli={halli} emphasis />}
            {keyHint && playing && <><i className="hg-sep" aria-hidden="true" /><p className="hg-keys"><kbd>Space</kbd> 종 치기</p></>}
          </> : <>
            <header className="hg-seat-name">
              <strong>{names[p.userId]}</strong>
              {out ? <span className="hg-badge" data-kind={outKind}>{out}</span>
                : turn ? <span className="hg-badge" data-kind="turn">{turnLabel(halli, p, own)}</span> : null}
            </header>
            <small className="hg-stage-piles">{pileText(p)}</small>
            {turn && <FlipTimerBar halli={halli} />}
          </>}
        </section>
      </Fragment>
    })}
    {/*
      Keyboard and screen-reader bell. Pointer events pass through to the 3D bell, so a mouse click is handled once,
      by the 3D bell; Enter here and Space anywhere use the same ring path.
    */}
    <button ref={stageRef('bell')} type="button" className="hg-stage-bell" data-state={mark ?? (halli.bellWindowId === null ? 'closed' : 'open')}
      disabled={!canRing} aria-keyshortcuts="Space" aria-label={bellLabel(halli, mark)} onClick={onRing}>
      {mark && <span>{mark === 'queued' ? '대기' : '쳤음'}</span>}
    </button>
    <HalliFlights layout="stage" />
    {playing && halli.turnUserId === null && <div className="hg-stage-hud">
      <p className="hg-last-chance">공개할 카드가 없어요 · 마지막 종 기회</p><FlipTimerBar halli={halli} />
    </div>}
  </div>
}
