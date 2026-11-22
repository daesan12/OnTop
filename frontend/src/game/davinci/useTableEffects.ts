import { useLayoutEffect, useRef, useState } from 'react'
import { playSfx } from '../../audio/sfx'
import { newTileEvent, type DrawEffect, type GuessEffect } from './effects'
import { supplyPose } from './layout'
import type { DavinciState } from './protocol'

export function useTableEffects(gameId: string, state: DavinciState | null | undefined, scale: number, connected: boolean, audible: boolean) {
  const previous = useRef<{ gameId: string; state: DavinciState; scale: number } | null>(null)
  const [visual, setVisual] = useState<{ draw: DrawEffect | null; guess: GuessEffect | null }>({ draw: null, guess: null })
  useLayoutEffect(() => {
    const prior = previous.current
    if (!state || !connected) {
      previous.current = null
      if (prior) setVisual({ draw: null, guess: null })
      return
    }
    previous.current = { gameId, state, scale }
    if (prior?.gameId !== gameId) { setVisual({ draw: null, guess: null }); return }
    const event = newTileEvent(prior.state, state), started = performance.now()
    if (event?.kind === 'DRAW' && event.tileId) {
      const index = prior.state.supply.findIndex(t => t.id === event.tileId), tile = prior.state.supply[index]
      if (tile) setVisual(v => ({ ...v, draw: { tileId: tile.id, actor: event.actorUserId, color: tile.color,
        from: supplyPose(index, prior.state.supply.length, prior.scale), started } }))
    } else if (event?.kind === 'GUESS' && event.tileId && event.correct !== null) {
      setVisual(v => ({ ...v, guess: { tileId: event.tileId!, actor: event.actorUserId, correct: event.correct!, started } }))
    }
    if (audible && event && !document.hidden && ['DRAW', 'GUESS'].includes(event.kind))
      playSfx(event.kind === 'GUESS' && !event.correct ? 'ui-click' : 'omok-place', undefined, .55)
  }, [gameId, state, scale, connected, audible])
  return visual
}
