import { create } from 'zustand'
import { useSession } from '../../network/worldClient'
import type { ParkRuntimePort } from '../../park/runtime/contracts'
import { useGame } from '../store'
import { useOneCardPranks } from './prankEvents'
import { ONECARD_DEFENSE_ENABLED, useOneCardDefense } from './defenseEvents'

export interface HeldCardTarget { userId: string; index: number; version: number }
export const useHeldCardPicking = create<{ hover: HeldCardTarget | null; selected: HeldCardTarget | null }>(() => ({ hover: null, selected: null }))
export function spectatorCardAvailable(target: HeldCardTarget) {
  const game = useGame.getState().game, player = game?.onecard?.players.find(player => player.userId === target.userId)
  return game?.role === 'SPECTATOR' && game.version === target.version && game.onecard?.status === 'PLAYING'
    && !!player?.active && Number.isInteger(target.index) && target.index >= 0 && target.index < player.cardCount
}
export function spectatorCardEligible(target: HeldCardTarget) {
  if (!spectatorCardAvailable(target)) return false
  const game = useGame.getState().game!, state = game.onecard!, session = useSession.getState()
  const prank = useOneCardPranks.getState(), defense = useOneCardDefense.getState(), turn = `${target.userId}/${state.turnCount}`
  return session.status === 'connected' && state.stage === 'PLAYING' && state.turnUserId === target.userId
    && prank.enabled && !prank.pending && !prank.effect && prank.usedTurn !== turn
    && (prank.immune[target.userId] ?? 0) <= performance.now()
    && ONECARD_DEFENSE_ENABLED && defense.enabled && !defense.pending && defense.usedTurn !== turn
    && (defense.blocks[`${session.sessionId}/${target.userId}`] ?? 0) <= performance.now()
}
export function previewHeldCard(target: HeldCardTarget | null) {
  const old = useHeldCardPicking.getState().hover
  if (old?.userId === target?.userId && old?.index === target?.index && old?.version === target?.version) return
  useHeldCardPicking.setState({ hover: target })
}
export function chooseHeldCard(runtime: Pick<ParkRuntimePort, 'flipOneCardHand'>, target: HeldCardTarget) {
  if (!spectatorCardAvailable(target)) return
  useHeldCardPicking.setState({ selected: target })
  if (spectatorCardEligible(target)) void runtime.flipOneCardHand?.(target.userId, target.index, target.version)
}
