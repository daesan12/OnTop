import {useEffect,useRef,useState,type ReactNode} from 'react'
import {useFrame} from '@react-three/fiber'
import type {Group} from 'three'
import {estimatedServerTime,useSession} from '../../network/worldClient'
import {useGame} from '../../game/store'
import {activeParkDebris,DEBRIS_DURATION,DEBRIS_LAUNCH,useParkDebris} from './state'

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
  const root=useRef<Group>(null)
  useFrame(()=>{
    if(!root.current)return
    const session=useSession.getState(),binding=session.bindings.find(b=>b.channelId===session.roomId&&b.anchorId===anchorId)
    const game=useGame.getState().game
    const current=session.tableStates[binding?.tableId??'']?.gameId
      ??(game&&((session.tableId||session.watchedTableId)===binding?.tableId)?game.gameId:null)
    const now=estimatedServerTime()
    root.current.visible=!useParkDebris.getState().items.some(item=>item.anchorId===anchorId
      &&(!current||current===item.gameId)&&now-Date.parse(item.occurredAt)>=DEBRIS_LAUNCH)
  })
  return <group ref={root} name={'game-surface-'+anchorId}>{children}</group>
}
