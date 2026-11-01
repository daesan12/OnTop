import {useEffect,useMemo,useRef,useState} from 'react'
import {useFrame} from '@react-three/fiber'
import {BoxGeometry,BufferGeometry,Color,CylinderGeometry,ExtrudeGeometry,Float32BufferAttribute,Group,InstancedMesh,LatheGeometry,LineBasicMaterial,MeshStandardMaterial,Object3D,Path,Shape,Vector2} from 'three'
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js'
import {TABLES,serviceWalkHeight,tableScale,type TableAnchor} from '../../park/mapConfig'
import {estimatedServerTime,useSession} from '../../network/worldClient'
import {DEBRIS_COINS,DEBRIS_RETENTION,debrisPieces,debrisVisible,type ParkDebris,useParkDebris} from './state'
import {createBackTexture} from '../../game/onecard/artwork'
import {farkleArt} from '../../game/farkle/art/FarkleProps'
import {debrisLanding,debrisPose} from './motion'

const anchors=new Map(TABLES.map(table=>[table.id,table]))
const box=new RoundedBoxGeometry(1.5,.065,1.5,2,.018)
const wood=new MeshStandardMaterial({color:'#b18043',roughness:.8})
const felt=new MeshStandardMaterial({color:'#285342',roughness:.9})
const lineMaterial=new LineBasicMaterial({color:'#47301c'})
const card=new BoxGeometry(.23,.015,.34)
const pawn=new LatheGeometry([[.045,0],[.045,.025],[.025,.04],[.02,.09],[.035,.11],[.03,.14],[0,.15]].map(([x,y])=>new Vector2(x,y)),12)
let cardMaterial:MeshStandardMaterial|undefined
const pieceMaterial=(code:ParkDebris['gameCode'])=>code==='ONE_CARD'?(cardMaterial??=new MeshStandardMaterial({map:createBackTexture(),roughness:.9}))
  :code==='DICE'||code==='DICE_LEDGER'?farkleArt().boneMaterials[0]!:stoneMaterial
const gridPoints:number[]=[]
for(let i=0;i<15;i++){const n=(i/14-.5)*1.34;gridPoints.push(-.67,.034,n,.67,.034,n,n,.034,-.67,n,.034,.67)}
const grid=new BufferGeometry().setAttribute('position',new Float32BufferAttribute(gridPoints,3))
const gold=new MeshStandardMaterial({color:'#e6b84f',metalness:.7,roughness:.35,emissive:'#9c661b',emissiveIntensity:.16})
const coinShape=new Shape();coinShape.absarc(0,0,.085,0,Math.PI*2,false)
const hole=new Path();hole.moveTo(-.027,-.027);hole.lineTo(-.027,.027);hole.lineTo(.027,.027);hole.lineTo(.027,-.027);hole.closePath();coinShape.holes.push(hole)
const coin=new ExtrudeGeometry(coinShape,{depth:.016,bevelEnabled:true,bevelSize:.003,bevelThickness:.003,bevelSegments:1,curveSegments:14})
coin.rotateX(-Math.PI/2)
const counter=new CylinderGeometry(.046,.046,.016,12)
const alkkagiRed=new MeshStandardMaterial({color:'#a93439',roughness:.8})
const stoneMaterial=new MeshStandardMaterial({color:'#ffffff',roughness:.4})
const stoneColors=[new Color('#272421'),new Color('#ede8db')]
const noRaycast=()=>{}

function ThrownBoard({code}:{code:ParkDebris['gameCode']}){
  return <group><mesh geometry={box} material={code==='OMOK'||code==='ALKKAGI'?wood:felt} raycast={noRaycast}/>
    {code==='OMOK'?<lineSegments geometry={grid} material={lineMaterial} raycast={noRaycast}/>
      : code==='ALKKAGI'?Array.from({length:8},(_,i)=><mesh key={i} geometry={counter} material={i<4?alkkagiRed:felt} scale={[1.5,1.5,1.5]} position={[(i%4-1.5)*.25,.05,i<4?-.4:.4]} raycast={noRaycast}/>)
      : null}
  </group>
}
function DebrisBatch({item,anchor}:{item:ParkDebris;anchor:TableAnchor}){
  const root=useRef<Group>(null),board=useRef<Group>(null),coins=useRef<InstancedMesh>(null)
  const stones=useRef<InstancedMesh>(null)
  const parts=useMemo(()=>debrisPieces(item.gameCode),[item.gameCode])
  const scratch=useMemo(()=>new Object3D(),[]),settled=useRef(false)
  const reduced=useMemo(()=>window.matchMedia('(prefers-reduced-motion: reduce)'),[])
  const scale=tableScale(anchor),at=Date.parse(item.occurredAt)
  useEffect(()=>{
    const coinInstances=coins.current,pieceInstances=stones.current
    return()=>{coinInstances?.dispose();pieceInstances?.dispose()}
  },[])
  const paths=useMemo(()=>Array.from({length:DEBRIS_COINS+1+parts.length},(_,n)=>{
    const p=debrisLanding(item,n-1),x=anchor.position[0]+p.x*scale,z=anchor.position[2]+p.z*scale
    const pieceHeight=item.gameCode==='DICE'||item.gameCode==='DICE_LEDGER'?.075:.012
    return {floor:(serviceWalkHeight(x,z)-anchor.position[1])/scale+(n===0?.045:n>DEBRIS_COINS?pieceHeight:.012)}
  }),[item,anchor,scale,parts])
  useFrame(({camera})=>{
    if(!root.current||!board.current||!coins.current)return
    const age=estimatedServerTime()-at
    root.current.visible=debrisVisible(item,estimatedServerTime())&&Math.hypot(camera.position.x-anchor.position[0],camera.position.z-anchor.position[2])<65
    if(!root.current.visible||settled.current)return
    const sampleAge=reduced.matches?3000:age
    const b=debrisPose(item,-1,sampleAge,1.09,paths[0]!.floor)
    board.current.visible=b.visible&&item.parts.includes('board')
    board.current.position.set(b.x,b.y,b.z);board.current.rotation.set(b.rx,b.ry,b.rz)
    for(let n=0;n<DEBRIS_COINS;n++){
      const p=debrisPose(item,n,sampleAge,1.16,paths[n+1]!.floor)
      scratch.position.set(p.x,p.y,p.z);scratch.rotation.set(p.rx,p.ry,p.rz)
      scratch.scale.setScalar(p.visible&&item.parts.includes('coin-'+n)?1:0)
      scratch.updateMatrix();coins.current.setMatrixAt(n,scratch.matrix)
    }
    coins.current.instanceMatrix.needsUpdate=true
    if(stones.current){
      for(let n=0;n<parts.length;n++){
        const p=debrisPose(item,DEBRIS_COINS+n,sampleAge,1.136,paths[DEBRIS_COINS+1+n]!.floor)
        scratch.position.set(p.x,p.y,p.z);scratch.rotation.set(p.rx,p.ry,p.rz)
        scratch.scale.setScalar(p.visible&&item.parts.includes(parts[n]!)?1:0)
        scratch.updateMatrix();stones.current.setMatrixAt(n,scratch.matrix)
        stones.current.setColorAt(n,item.gameCode==='OMOK'?stoneColors[n%2]!:new Color(item.gameCode==='LIAR_BRIDGE'?n%2?'#dc404d':'#a45ddd':'#ffffff'))
      }
      stones.current.instanceMatrix.needsUpdate=true
      stones.current.instanceColor!.needsUpdate=true
    }
    settled.current=b.settled
    root.current.userData.settled=settled.current
  })
  return <group ref={root} name={'park-debris-'+item.id} position={[...anchor.position]} scale={scale}
    dispose={null} userData={{debrisId:item.id,gameId:item.gameId,cleanableObjects:item.parts.map(part=>item.id+'/'+part),cosmetic:true}}>
    <group ref={board} name={'park-debris-board-'+item.id}><ThrownBoard code={item.gameCode}/></group>
    <instancedMesh ref={coins} name={'park-debris-coins-'+item.id} args={[coin,gold,DEBRIS_COINS]} frustumCulled={false} raycast={noRaycast} dispose={null}/>
    <instancedMesh ref={stones} name={(item.gameCode==='OMOK'?'park-debris-stones-':'park-debris-pieces-')+item.id}
      args={[item.gameCode==='ONE_CARD'?card:item.gameCode==='DICE'||item.gameCode==='DICE_LEDGER'?farkleArt().dice:item.gameCode==='LIAR_BRIDGE'?pawn:counter,pieceMaterial(item.gameCode),parts.length]}
      frustumCulled={false} raycast={noRaycast} dispose={null}/>
  </group>
}
export function ParkDebrisScene(){
  const items=useParkDebris(s=>s.items)
  const [clock,setClock]=useState(0)
  useEffect(()=>{
    const now=estimatedServerTime(),next=Math.min(...items.map(item=>Date.parse(item.occurredAt)+DEBRIS_RETENTION).filter(at=>at>now))
    if(!Number.isFinite(next))return
    const timer=setTimeout(()=>setClock(n=>n+1),Math.max(0,next-now)+1)
    return()=>clearTimeout(timer)
  },[items,clock])
  const channelId=useParkDebris(s=>s.channelId)
  const ready=useSession(s=>s.status==='connected'&&s.mapCompatible&&s.roomId===channelId)
  if(!ready)return null
  return <group name="park-persistent-debris">{items.filter(item=>Date.parse(item.occurredAt)+DEBRIS_RETENTION>estimatedServerTime()).map(item=>{const anchor=anchors.get(item.anchorId)
    return anchor?<DebrisBatch key={item.id+'/'+item.parts.join(',')} item={item} anchor={anchor}/>:null})}</group>
}
