import { FocusWood } from '../omok/BoardWood'
import { alkkagiSocialView, useAlkkagiSocial } from './spectatorEvents'
import { parkRuntime } from '../../park/runtime/runtime'
import { useGame } from '../store'
import { useSession } from '../../network/worldClient'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Group } from 'three'
import { OMOK_FOCUS_LAYER } from '../../world/omokCamera'
import { seatScope, useTableLobby } from '../../features/tableLobby/state'
import type { TableAnchor } from '../../config'
import { AlkkagiScene } from './AlkkagiBoard'
import { AlkkagiBoardSurface } from './AlkkagiBoardSurface'
import { AlkkagiReplay } from './replay'
import { useAlkkagiControls, useAlkkagiUI, cancelAlkkagiItem } from './parkControls'

/** TableShell의 좌표/크기와 같은 월드 Canvas에 배치한다. */
export function ParkAlkkagiBoard({anchor}:{anchor:TableAnchor}) {
  const root=useRef<Group>(null)
  const socialMarks=useAlkkagiSocial(s=>s.marks)
  const lookScope=useTableLobby(s=>s.lookScope), spectatorView=useTableLobby(s=>s.spectatorView)
  const session=useSession(),g=useGame(s=>s.game?.alkkagi ? s.game : null)
  const binding=session.bindings.find(b=>b.channelId===session.roomId && b.anchorId===anchor.id)
  const relevant=!!binding && !!g && (g.role==='PLAYER' ? session.tableId : session.watchedTableId)===binding.tableId
  const selected=!!binding && session.tableStates[binding.tableId]?.gameCode==='ALKKAGI'
  const focused=relevant && (g?.role==='PLAYER' ? lookScope!==seatScope(session) : spectatorView==='board')
  useLayoutEffect(()=>{
    if(!focused || !root.current)return
    const changed:Group[]=[]
    root.current.traverse(object=>{if(!object.layers.isEnabled(OMOK_FOCUS_LAYER)){object.layers.enable(OMOK_FOCUS_LAYER);changed.push(object as Group)}})
    return ()=>changed.forEach(object=>object.layers.disable(OMOK_FOCUS_LAYER))
  },[focused,g?.version,socialMarks])
  if(!selected && !relevant)return null
  return <>
    <mesh name={'alkkagi-focus-surface-' + anchor.id} visible={focused} layers-mask={1 << OMOK_FOCUS_LAYER}
      position={[0,1.06,0]} rotation={[-Math.PI/2,0,0]} raycast={()=>{}}>
      <planeGeometry args={[14,14]} /><FocusWood />
    </mesh>
    <group ref={root} onClick={e=>{if(relevant)e.stopPropagation()}} name="alkkagi-world-board" position={[0,1.12,0]} scale={.14}>
    {relevant ? <LiveAlkkagiSurface /> : <AlkkagiBoardSurface onPointerDown={()=>{}} onPointerMove={()=>{}} />}
  </group>
  </>
}
function LiveAlkkagiSurface() {
  const {state,session,game,actor,ready,looking,canItem,preview,act,ui,chooseTarget}=useAlkkagiControls()
  const spectatorBoard=useTableLobby(s=>s.spectatorView)==='board'
  const spectating=actor<0 && spectatorBoard && session.status==='connected' && session.mapCompatible && !game.uncertain && game.game?.gameId===game.watchedGameId
  const replay=useMemo(()=>new AlkkagiReplay(),[])
  useEffect(()=>{replay.clear()},[state?.gameId,replay])
  useEffect(()=>{if(state)replay.push(state.version,state,performance.now())},[state,replay])
  if(!state)return null
  return <AlkkagiScene actor={actor} state={{...state,social:alkkagiSocialView(state.gameId,state.turnNumber,state.stage==='AIMING',session.sessionId)}} replay={replay}
      enabled={(spectating || ready && !looking && state.turn===actor) && state.stage==='AIMING'}
      shoot={(p,dx,dy,power)=>{if(spectating)void parkRuntime.sendAlkkagiSpectator?.({kind:'ADVICE',pieceId:p.id,dx,dy,power});else act({type:'SHOT',pieceId:p.id,dx,dy,power})}}
      explain={notice=>useAlkkagiUI.setState({notice})} blockedReason="현재 차례·연결 상태를 확인해주세요."
      itemMode={canItem ? ui.item?.type ?? null : null} itemTargets={ui.targets} pickTarget={chooseTarget} cancelItem={cancelAlkkagiItem}
      placement={ui.placement} pinned={ui.pinned} previewValid={preview.valid}
      pickPlacement={(x,y,pin)=>{if(canItem && !ui.pinned)useAlkkagiUI.setState({placement:{x,y,angle:ui.placement?.angle ?? 0},pinned:!!pin})}}
      rotatePlacement={delta=>useAlkkagiUI.setState(s=>({placement:s.placement && {...s.placement,angle:Math.atan2(Math.sin(s.placement.angle+delta),Math.cos(s.placement.angle+delta))}}))}
      cursor={(x,y)=>{if(spectating)void parkRuntime.sendAlkkagiSpectator?.({kind:'CURSOR',x,y})}} />
}
