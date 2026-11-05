import { useLayoutEffect, useRef } from 'react'
import { displayNickname, type PublicDisplayName } from '../../features/gameMaster/displayName'
import type { OneCard } from './protocol'
import './onecardOpponentHud.css'

type Profile = PublicDisplayName & { nicknameKnown?: boolean }
export interface OpponentRow { userId: string; name: string; count: string; current: boolean; forfeited: boolean }

/** Public seat order without the viewer. Counts come only from the server's public state; unknown names use the seat label. */
export function opponentRows(state: OneCard, ownId: string, profiles: Readonly<Record<string, Profile | undefined>>): OpponentRow[] {
  return state.players.flatMap((player, index) => {
    if (player.userId === ownId) return []
    const profile = profiles[player.userId], fallback = `참가자 ${index + 1}`
    return [{
      userId: player.userId,
      name: profile && profile.nicknameKnown !== false ? displayNickname(profile, fallback) : fallback,
      count: !player.active ? '기권' : Number.isInteger(player.cardCount) && player.cardCount >= 0 ? `${player.cardCount}장` : '',
      current: player.active && player.userId === state.turnUserId,
      forfeited: !player.active,
    }]
  })
}

type Box = Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>
export const handCovers = (hud: Box, cards: readonly Box[]) =>
  cards.some(card => card.left < hud.right && card.right > hud.left && card.top < hud.bottom && card.bottom > hud.top)
export type OpponentHudFit = 'full' | 'compact' | 'hidden'
/** First layout that leaves every resting hand card uncovered. The hand itself never moves for this aid. */
export function fitOpponentHud(measure: (fit: OpponentHudFit) => Box | null, cards: readonly Box[]): OpponentHudFit {
  for (const fit of ['full', 'compact'] as const) {
    const box = measure(fit)
    if (!box || box.right <= box.left || !handCovers(box, cards)) return fit
  }
  return 'hidden'
}

/** At 1280×720 the fan rises above the chat and reaches under the clock; shrink, then step aside, only when it does. */
function useHandClearance(active: boolean, rows: number, handCount: number) {
  const ref = useRef<HTMLUListElement>(null)
  useLayoutEffect(() => {
    const hud = ref.current, root = hud?.closest<HTMLElement>('.onecard-game-hud'), hand = root?.querySelector<HTMLElement>('.onecard-hand')
    if (!active || !hud || !root || !hand) return
    let frame = 0
    const update = () => {
      frame = 0
      // A hovered, selected or dragged card is lifted only for a moment and is painted above this aid anyway.
      const cards = [...hand.querySelectorAll('.onecard-hand-card:not(:hover,:focus-visible,[aria-pressed=true],[data-dragging=true])')]
        .map(card => card.getBoundingClientRect())
      // Synchronous layout reads within one frame: no intermediate size is ever painted.
      hud.dataset.fit = fitOpponentHud(fit => { hud.dataset.fit = fit; return hud.getBoundingClientRect() }, cards)
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update) }
    // Card size follows the hand box; the chat clearance moves the hand through CSS variables on the panel root.
    const resize = new ResizeObserver(schedule), style = new MutationObserver(schedule)
    resize.observe(hand); style.observe(root, { attributes: true, attributeFilter: ['style'] })
    // Dealing and re-fanning animate card transforms; check again once they settle.
    hand.addEventListener('transitionend', schedule); window.addEventListener('resize', schedule); update()
    return () => {
      resize.disconnect(); style.disconnect(); cancelAnimationFrame(frame)
      hand.removeEventListener('transitionend', schedule); window.removeEventListener('resize', schedule)
    }
  }, [active, rows, handCount])
  return ref
}

/** Player-only aid under the common turn clock. The hidden roster already announces the same facts to screen readers. */
export function OneCardOpponentHud({ state, ownId, profiles, handCount }: {
  state: OneCard; ownId: string; profiles: Readonly<Record<string, Profile | undefined>>; handCount: number
}) {
  const rows = state.status === 'PLAYING' ? opponentRows(state, ownId, profiles) : []
  const ref = useHandClearance(rows.length > 0, rows.length, handCount)
  if (!rows.length) return null
  return <ul ref={ref} className="onecard-opponent-hud" aria-hidden="true">
    {rows.map(row => <li key={row.userId} data-current={row.current || undefined} data-forfeited={row.forfeited || undefined}>
      <span className="onecard-opponent-name">{row.name}</span>
      {row.count && <b className="onecard-opponent-count">{row.count}</b>}
    </li>)}
  </ul>
}
