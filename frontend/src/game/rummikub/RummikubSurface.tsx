import { useLoader } from '@react-three/fiber'
import { CanvasTexture, TextureLoader } from 'three'
import { useShallow } from 'zustand/react/shallow'
import type { TableAnchor } from '../../park/tablePlacement'
import { tableSeats } from '../../park/tablePlacement'
import { useSession } from '../../network/worldClient'
import { useGame } from '../store'
import { useTableGameCode } from '../../features/tableLobby/tableGamePresentation'
import { canActRummikub } from './actions'
import { useRummikubDraft, toggleRummikubTile, sortRummikubTiles } from './draft'
import type { Tile, Placed } from './protocol'

const ink = { BLACK:'#242320', BLUE:'#164d99', RED:'#a82620', YELLOW:'#9e6400' }
const labels = new Map<string,CanvasTexture>()
function numberMap(tile:Tile|Placed) {
  const key=`${tile.color}:${tile.number}`
  if(!labels.has(key)) { const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d')!;ctx.font='bold 90px Georgia';ctx.fillStyle=ink[tile.color??'BLACK'];ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(tile.number),64,66);labels.set(key,new CanvasTexture(c)) }
  return labels.get(key)!
}
function Block({tile,x,z,selected,enabled}:{tile:Tile|Placed;x:number;z:number;selected:boolean;enabled:boolean}) {
  const [face,joker] = useLoader(TextureLoader, ['/art/rummikub/tile-ontop.png','/art/rummikub/joker-ontop.png'])
  return <group position={[x,selected?.1:.035,z]} onClick={e=>{e.stopPropagation();if(enabled)toggleRummikubTile(tile.id)}}>
    <mesh><boxGeometry args={[.135,.04,.18]}/><meshStandardMaterial color={selected?'#f0be54':'#795036'}/></mesh>
    <mesh renderOrder={1} rotation={[-Math.PI/2,0,0]} position={[0,.022,0]}><planeGeometry args={[.14,.19]}/><meshBasicMaterial map={face} transparent depthWrite={false}/></mesh>
    {tile.id.startsWith('JOKER') ? <mesh renderOrder={2} rotation={[-Math.PI/2,0,0]} position={[0,.024,0]}><planeGeometry args={[.1,.12]}/><meshBasicMaterial map={joker} transparent depthWrite={false}/></mesh>
      : <mesh renderOrder={2} rotation={[-Math.PI/2,0,0]} position={[0,.025,-.01]}><planeGeometry args={[.1,.115]}/><meshBasicMaterial map={numberMap(tile)} transparent depthWrite={false}/></mesh>}
    {tile.id.startsWith('JOKER') && tile.number>0 && <mesh renderOrder={3} rotation={[-Math.PI/2,0,0]} position={[.035,.027,.055]}><planeGeometry args={[.055,.06]}/><meshBasicMaterial map={numberMap(tile)} transparent depthWrite={false}/></mesh>}
  </group>
}

/** 기존 테이블 로컬 좌표만 사용하며 충돌체를 추가하지 않는다. */
export function RummikubSurface({anchor}:{anchor:TableAnchor}) {
  const s=useSession(useShallow(s=>({bindings:s.bindings,roomId:s.roomId,tableId:s.tableId,watchedTableId:s.watchedTableId,seatIndex:s.seatIndex,status:s.status,sessionId:s.sessionId}))), g=useGame(v=>v.game?.rummikub?v.game:null), ui=useRummikubDraft()
  const selectedGame=useTableGameCode(anchor.id)==='RUMMIKUB'
  const rackArt=useLoader(TextureLoader, '/art/rummikub/rack-ontop.png')
  const binding=s.bindings.find(b=>b.channelId===s.roomId&&b.anchorId===anchor.id)
  const relevant=!!g&&!!binding&&(g.role==='PLAYER'?s.tableId:s.watchedTableId)===binding.tableId
  const seat=relevant&&g?.role==='PLAYER'?tableSeats(anchor)[s.seatIndex]:undefined
  if(!selectedGame&&!relevant)return null
  const melds=relevant?(ui.source===g!.rummikub ? ui.draft??g!.rummikub.melds : g!.rummikub.melds):[]
  const publicIds=new Set(melds.flat().map(t=>t.id))
  const hand=sortRummikubTiles(relevant&&g?.role==='PLAYER'?(g.rummikubHand?.tiles??[]).filter(t=>!publicIds.has(t.id)):[],ui.sort)
  const enabled=relevant&&s.status==='connected'&&canActRummikub(s.sessionId,{kind:'draw'})
  const width=Math.max(14,...melds.map(m=>m.length)), factor=Math.min(1,14/width,5/Math.max(5,melds.length))
  return <group name={`supae-table-${anchor.id}`} scale={.6} position={[0,1.1,0]} rotation={[0,seat?Math.atan2(seat.x,seat.z):0,0]}>
    <mesh position={[0,-.018,-.15]}><boxGeometry args={[2.35,.025,1.65]}/><meshStandardMaterial color="#244d40" roughness={.85}/></mesh>
    <group scale={factor} position={[0,0,-.66]}>{melds.map((meld,row)=><group key={row} position={[0,0,row*.23]}>{meld.map((tile,i)=><Block key={tile.id} tile={tile} x={(i-(meld.length-1)/2)*.16} z={0} selected={ui.selected.includes(tile.id)} enabled={enabled&&(g!.rummikub.players.find(p=>p.userId===s.sessionId)?.registered===true||!!g!.rummikubHand?.tiles.some(t=>t.id===tile.id))}/>)}</group>)}</group>
    {hand.length>0&&<group position={[0,.04,.75]} scale={Math.min(1,2/Math.ceil(hand.length/14))}>
      <mesh position={[0,-.04,0]}><boxGeometry args={[2.32,.07,.45]}/><meshStandardMaterial color="#69452f"/></mesh>
      <mesh position={[0,0,.22]}><boxGeometry args={[2.32,.1,.035]}/><meshStandardMaterial color="#bb9257"/></mesh>
      <mesh position={[0,.035,-.24]}><planeGeometry args={[2.32,.26]}/><meshBasicMaterial map={rackArt} transparent/></mesh>
      {hand.map((tile,i)=><Block key={tile.id} tile={tile} x={(i%14-6.5)*.158} z={Math.floor(i/14)*.23-.08} selected={ui.selected.includes(tile.id)} enabled={enabled}/>)}
    </group>}
  </group>
}
