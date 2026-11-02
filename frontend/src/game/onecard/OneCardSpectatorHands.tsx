import { useEffect } from 'react'
import { useSession } from '../../network/worldClient'
import { useGame } from '../store'
import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import { useOneCardPranks } from './prankEvents'
import { useOneCardDefense } from './defenseEvents'
import { chooseHeldCard, previewHeldCard, spectatorCardAvailable, useHeldCardPicking } from './spectatorTargets'

/** Visual cards live exclusively in the avatar's hands. DOM supplies keyboard access and a small status line. */
export function OneCardSpectatorHands() {
  const game = useGame(s => s.game), prank = useOneCardPranks(), defense = useOneCardDefense()
  const profiles = useSession(s => s.profiles), runtime = useParkRuntime(), hover = useHeldCardPicking(s => s.hover)
  useEffect(() => {
    const { hover, selected } = useHeldCardPicking.getState()
    if (hover && !spectatorCardAvailable(hover)) previewHeldCard(null)
    if (selected && !spectatorCardAvailable(selected)) useHeldCardPicking.setState({ selected: null })
  }, [game])
  useEffect(() => () => useHeldCardPicking.setState({ hover: null, selected: null }), [])
  if (!game?.onecard || game.role !== 'SPECTATOR' || game.onecard.status !== 'PLAYING') return null
  const state = game.onecard, name = (id: string) => profiles[id]?.nickname ?? `참가자 ${state.players.findIndex(player => player.userId === id) + 1}`
  const hint = prank.effect ? `${name(prank.effect.targetUserId)}의 카드 ${prank.effect.count}장이 뒤집혔어요`
    : defense.pending || prank.pending || defense.attempts.length ? '손을 뻗는 중 · 상대가 방어할 수 있어요'
      : prank.usedTurn === `${state.turnUserId}/${state.turnCount}` ? '복구 완료 · 이번 차례의 장난은 사용했어요'
        : defense.usedTurn === `${state.turnUserId}/${state.turnCount}` ? '이번 차례의 장난을 사용했어요'
          : hover ? `${name(hover.userId)} · ${hover.index + 1}번째 카드` : ''
  return <>
    <div className="visually-hidden" role="group" aria-label="손에 든 카드 키보드 선택">
      {state.players.filter(player => player.active && player.cardCount > 0).map(player => <div key={player.userId} role="group" aria-label={`${name(player.userId)} 손패 · ${player.cardCount}장`}>
        {Array.from({ length: player.cardCount }, (_, index) => <button key={index} type="button" tabIndex={index === 0 ? 0 : -1}
          aria-label={`${name(player.userId)}의 ${index + 1}번째 카드 선택`} onFocus={() => previewHeldCard({ userId: player.userId, index, version: game.version })}
          onBlur={() => previewHeldCard(null)} onClick={() => chooseHeldCard(runtime, { userId: player.userId, index, version: game.version })}
          onKeyDown={event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
            event.preventDefault(); event.stopPropagation()
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? player.cardCount - 1
              : Math.max(0, Math.min(player.cardCount - 1, index + (event.key === 'ArrowRight' ? 1 : -1)))
            event.currentTarget.parentElement?.querySelectorAll('button')[next]?.focus()
          }}>{index + 1}</button>)}
      </div>)}
    </div>
    {hint && <p className="onecard-spectator-hint" role="status">{hint}</p>}
  </>
}
