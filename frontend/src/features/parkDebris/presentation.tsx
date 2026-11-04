import {useEffect,useMemo,useRef,useState,type ReactNode} from 'react'
import {useFrame} from '@react-three/fiber'
import type {Group} from 'three'
import {estimatedServerTime,useSession} from '../../network/worldClient'
import {useGame} from '../../game/store'
import {activeParkDebris,DEBRIS_DURATION,useParkDebris} from './state'
import {debrisHidesSurface,reducedMotionQuery} from './motion'

export function useDebrisPresentation(tableId:string){
  const items=useParkDebris(s=>s.items),[,update]=useState(0)
  const active=activeParkDebris(tableId,estimatedServerTime())
  useEffect(()=>{
    if(!active)return
    const timer=setTimeout(()=>update(n=>n+1),Math.max(0,Date.parse(active.occurredAt)+DEBRIS_DURATION-estimatedServerTime())+20)
    return()=>clearTimeout(timer)
  },[items,tableId,active])
  return active
}

/** Hide only the loose game surface, keeping the real park table/chairs usable. */
export function DebrisGameSurface({anchorId,children}:{anchorId:string;children:ReactNode}){
  const root=useRef<Group>(null),reduced=useMemo(reducedMotionQuery,[]),latched=useRef(new Set<string>())
  useFrame(()=>{
    if(!root.current)return
    const session=useSession.getState(),binding=session.bindings.find(b=>b.channelId===session.roomId&&b.anchorId===anchorId)
    const game=useGame.getState().game
    const current=session.tableStates[binding?.tableId??'']?.gameId
      ??(game&&((session.tableId||session.watchedTableId)===binding?.tableId)?game.gameId:null)
    const now=estimatedServerTime(),items=useParkDebris.getState().items,motionReduced=!!reduced?.matches
    for(const id of latched.current)if(!items.some(item=>item.id===id))latched.current.delete(id)
    root.current.visible=!items.some(item=>item.anchorId===anchorId
      &&(!current||current===item.gameId)&&debrisHidesSurface(item,now,motionReduced,latched.current))
  })
  return <group ref={root} name={'game-surface-'+anchorId}>{children}</group>
}
