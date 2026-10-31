import { useEffect } from 'react'
import { create } from 'zustand'
import { useGame } from '../store'
import { useSession } from '../../network/worldClient'
import { parkRuntime } from '../../park/runtime/runtime'
import { itemPreview, type Placement } from './placement'
import type { Card } from './protocol'
import type { Piece } from './replay'

const empty = { item:null as Card | null, targets:[] as string[], placement:null as Placement | null, pinned:false, notice:'' }
export const useAlkkagiUI = create(() => ({ ...empty }))
export function cancelAlkkagiItem() { useAlkkagiUI.setState({ item:null,targets:[],placement:null,pinned:false }) }
export function useAlkkagiControls() {
  const session=useSession(), game=useGame(), ui=useAlkkagiUI()
  const g=game.game?.alkkagi ? game.game : null, state=g?.alkkagi ?? null
  const actor=g?.role === 'PLAYER' ? state!.players.indexOf(session.sessionId) : -1
  const ready=actor>=0 && session.status==='connected' && !session.pending && !game.pending && !game.uncertain
    && g?.gameId===game.permittedGameId && game.recovery==='RESTORED' && (g?.version ?? -1)>=game.awaitingVersion
  const canItem=ready && state?.turn===actor && state.stage==='AIMING' && !state.itemUsedThisTurn
  useEffect(cancelAlkkagiItem,[state?.gameId,state?.version,session.status])
  const act=(input:Record<string,unknown>) => { if(parkRuntime.actAlkkagi) void parkRuntime.actAlkkagi(input) }
  const preview=itemPreview(state,ui.item?.type ?? '',ui.targets,ui.placement)
  const chooseTarget=(piece:Piece) => useAlkkagiUI.setState(s=>({ targets:s.targets.includes(piece.id) ? s.targets.filter(x=>x!==piece.id)
    : s.item?.type==='SWAP' ? [...s.targets.slice(-1),piece.id] : [piece.id] }))
  return {session,game,g,state,actor,ready,canItem,preview,act,ui,chooseTarget}
}
