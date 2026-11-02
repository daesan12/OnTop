import { seatScope, useTableLobby } from '../../features/tableLobby/state'
import { useEffect } from 'react'
import { create } from 'zustand'
import { useGame } from '../store'
import { forfeitBlocksInput, useForfeit } from '../forfeit'
import { useSession } from '../../network/worldClient'
import { parkRuntime } from '../../park/runtime/runtime'
import { itemPreview, type Placement } from './placement'
import type { Card } from './protocol'
import type { Piece } from './replay'

const empty = { item:null as Card | null, targets:[] as string[], placement:null as Placement | null, pinned:false, notice:'', dialogOpen:false }
export const useAlkkagiUI = create(() => ({ ...empty }))
export function cancelAlkkagiItem() { useAlkkagiUI.setState({ item:null,targets:[],placement:null,pinned:false }) }
export function useAlkkagiControls() {
  const session=useSession(), game=useGame(), ui=useAlkkagiUI()
  useForfeit(s=>s.attempt)
  const lookScope=useTableLobby(s=>s.lookScope), looking=!!seatScope(session) && lookScope===seatScope(session)
  const g=game.game?.alkkagi ? game.game : null, state=g?.alkkagi ?? null
  const actor=g?.role === 'PLAYER' ? state!.players.indexOf(session.sessionId) : -1
  const ready=actor>=0 && session.status==='connected' && !session.pending && !game.pending && !game.uncertain
    && !forfeitBlocksInput(g?.gameId ?? '') && g?.gameId===game.permittedGameId && game.recovery==='RESTORED' && (g?.version ?? -1)>=game.awaitingVersion
  const canItem=ready && !ui.dialogOpen && !looking && state?.turn===actor && state.stage==='AIMING' && !state.itemUsedThisTurn
  useEffect(cancelAlkkagiItem,[state?.gameId,state?.version,session.status,looking])
  const act=(input:Record<string,unknown>) => { if(parkRuntime.actAlkkagi) void parkRuntime.actAlkkagi(input) }
  const preview=itemPreview(state,ui.item?.type ?? '',ui.targets,ui.placement)
  const submitItem=(card:Card,targets:string[],placement:Placement|null) => {
    const result=itemPreview(state,card.type,targets,placement)
    if(!canItem || !result.valid)return false
    act({type:'ITEM_USE',cardId:card.id,targetPieceIds:targets,...(placement ? {placement} : {})})
    cancelAlkkagiItem()
    return true
  }
  const selectItem=(card:Card) => {
    if(!canItem)return
    const same=useAlkkagiUI.getState().item?.id===card.id
    cancelAlkkagiItem()
    if(same)return
    if(card.type==='EXTRA_SHOT')submitItem(card,[],null)
    else useAlkkagiUI.setState({item:card,notice:''})
  }
  const chooseTarget=(piece:Piece) => {
    const current=useAlkkagiUI.getState(),card=current.item
    if(!canItem || !card)return
    const targets=current.targets.includes(piece.id) ? current.targets.filter(x=>x!==piece.id)
      : card.type==='SWAP' ? [...current.targets.slice(-1),piece.id] : [piece.id]
    useAlkkagiUI.setState({targets,placement:null})
    if(card.type!=='RELOCATE')submitItem(card,targets,null)
  }
  const pickPlacement=(x:number,y:number,pin?:boolean) => {
    const current=useAlkkagiUI.getState(),card=current.item
    if(!canItem || !card)return
    const placement={x,y,angle:current.placement?.angle ?? 0}
    useAlkkagiUI.setState({placement,pinned:false})
    if(pin)submitItem(card,current.targets,placement)
  }
  return {session,game,g,state,actor,ready,looking,canItem,preview,act,ui,chooseTarget,selectItem,pickPlacement}
}
