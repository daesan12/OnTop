import { AlkkagiSpectatorLabels } from './AlkkagiSpectatorLabels'
import { SeatedLookButton } from '../../features/tableLobby/SeatedLookButton'
import { useEffect, useState } from 'react'
import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import { OmokSurrender } from '../OmokSurrender'
import { AlkkagiCardAward, AlkkagiChoiceFan } from './AlkkagiCardReveal'
import { AlkkagiItemCard } from './AlkkagiItemCard'
import { useAlkkagiControls, useAlkkagiUI, cancelAlkkagiItem } from './parkControls'
import './park.css'

/** 공원 장면은 그대로 두고 오목과 같은 최소 HUD만 겹친다. */
export function AlkkagiPanel() {
  const {session,game,g,state,actor,ready,canItem,preview,act,ui}=useAlkkagiControls()
  const runtime=useParkRuntime(), [now,setNow]=useState(Date.now())
  useEffect(()=>{
    if(!state)return
    const wall=state.serverNow,mono=performance.now(), update=()=>setNow(wall+performance.now()-mono)
    update();const timer=setInterval(update,100);return ()=>clearInterval(timer)
  },[state?.serverNow])
  useEffect(()=>{useAlkkagiUI.setState({notice:''})},[])
  if(!state || !g)return null
  const choice=g.alkkagiHand?.choice,left=Math.max(0,Math.ceil((state.turnDeadline-now)/1000))
  const name=(i:number)=>session.profiles[state.players[i]!]?.nickname ?? (i===0 ? '홍팀' : '청팀')
  return <section className="alkkagi-hud" aria-label="알까기 경기">
    <header className="alkkagi-match-header"><div data-turn={state.turn===0}><b>{name(0)}</b><span>홍 · {state.pieces.filter(p=>p.alive&&p.owner===0).length}알</span></div>
      <div className="alkkagi-clock"><small>알까기</small><strong>{state.stage==='AIMING' ? left : state.stage==='CHOOSING' ? '비책' : state.stage==='FINISHED' ? '종료' : '충돌'}</strong></div>
      <div data-turn={state.turn===1}><b>{name(1)}</b><span>청 · {state.pieces.filter(p=>p.alive&&p.owner===1).length}알</span></div></header>
    {(game.error || ui.notice)&&<p className="alkkagi-hint" role="alert">{game.error || ui.notice}</p>}
    {state.stage==='AIMING'&&left<=10&&<strong className="alkkagi-warning">{left}초 남았습니다</strong>}
    <div className="alkkagi-actions">{actor>=0&&<SeatedLookButton />}{actor>=0 ? <OmokSurrender context={{userId:session.sessionId,gameId:g.gameId,version:g.version}} disabled={!ready}/>
      : <button onClick={()=>void runtime.unwatchGame()}>관전 종료</button>}
      {game.uncertain&&<button onClick={()=>void runtime.checkRecovery()}>경기 다시 확인</button>}</div>
    {actor>=0&&<footer className="alkkagi-hand"><span>내 비책 {g.alkkagiHand?.cards.length ?? 0}장</span><div>{g.alkkagiHand?.cards.map(c=><AlkkagiItemCard key={c.id} type={c.type} selected={ui.item?.id===c.id} disabled={!canItem}
      onClick={()=>{cancelAlkkagiItem();useAlkkagiUI.setState({item:c})}}/>)}</div>
      {ui.item&&canItem&&<div className="alkkagi-item-confirm"><p>{preview.reason}</p><button disabled={!preview.valid} onClick={()=>act({type:'ITEM_USE',cardId:ui.item!.id,targetPieceIds:ui.targets,...(ui.placement ? {placement:ui.placement} : {})})}>아이템 확정</button>
        <button onClick={cancelAlkkagiItem}>아이템 취소</button>{ui.pinned&&<button onClick={()=>useAlkkagiUI.setState({pinned:false})}>위치 다시 고르기</button>}</div>}</footer>}
    <AlkkagiSpectatorLabels />
    <AlkkagiCardAward hand={g.alkkagiHand} />
    {choice&&<AlkkagiChoiceFan key={choice.id} choice={choice} ready={ready}
      seconds={Math.max(0,Math.ceil((choice.deadline-now)/1000))}
      choose={optionId=>act({type:'CARD_CHOOSE',choiceId:choice.id,optionId})} />}
  </section>
}
