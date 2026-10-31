import {useMemo,useRef} from 'react'
import {useFrame} from '@react-three/fiber'
import {BoxGeometry,BufferGeometry,Color,CylinderGeometry,ExtrudeGeometry,Float32BufferAttribute,Group,InstancedMesh,LineBasicMaterial,MeshStandardMaterial,Object3D,Path,Shape} from 'three'
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js'
import {TABLES,serviceWalkHeight,tableScale,type TableAnchor} from '../../park/mapConfig'
import {estimatedServerTime,useSession} from '../../network/worldClient'
import {DEBRIS_COINS,DEBRIS_STONES,type ParkDebris,useParkDebris} from './state'
import {debrisLanding,debrisPose} from './motion'

const anchors=new Map(TABLES.map(table=>[table.id,table]))
const box=new RoundedBoxGeometry(1.5,.065,1.5,2,.018)
const wood=new MeshStandardMaterial({color:'#b18043',roughness:.8})
const felt=new MeshStandardMaterial({color:'#285342',roughness:.9})
const lineMaterial=new LineBasicMaterial({color:'#47301c'})
const die=new BoxGeometry(.13,.13,.13),card=new BoxGeometry(.23,.015,.34)
const ivory=new MeshStandardMaterial({color:'#f1e6cf'}),red=new MeshStandardMaterial({color:'#9b3e2d'})
const gridPoints:number[]=[]
for(let i=0;i<15;i++){const n=(i/14-.5)*1.34;gridPoints.push(-.67,.034,n,.67,.034,n,n,.034,-.67,n,.034,.67)}
const grid=new BufferGeometry().setAttribute('position',new Float32BufferAttribute(gridPoints,3))
const gold=new MeshStandardMaterial({color:'#e6b84f',metalness:.7,roughness:.35,emissive:'#9c661b',emissiveIntensity:.16})
const coinShape=new Shape();coinShape.absarc(0,0,.085,0,Math.PI*2,false)
const hole=new Path();hole.moveTo(-.027,-.027);hole.lineTo(-.027,.027);hole.lineTo(.027,.027);hole.lineTo(.027,-.027);hole.closePath();coinShape.holes.push(hole)
const coin=new ExtrudeGeometry(coinShape,{depth:.016,bevelEnabled:true,bevelSize:.003,bevelThickness:.003,bevelSegments:1,curveSegments:14})
coin.rotateX(-Math.PI/2)
const counter=new CylinderGeometry(.046,.046,.016,12)
const stoneMaterial=new MeshStandardMaterial({color:'#ffffff',roughness:.4})
const stoneColors=[new Color('#272421'),new Color('#ede8db')]
const noRaycast=()=>{}

function ThrownBoard({code}:{code:ParkDebris['gameCode']}){
  return <group><mesh geometry={box} material={code==='OMOK'?wood:felt} raycast={noRaycast}/>
    {code==='OMOK'?<lineSegments geometry={grid} material={lineMaterial} raycast={noRaycast}/>
      : code==='LIAR_BRIDGE'?Array.from({length:8},(_,i)=><mesh key={i} geometry={counter} material={i%2?wood:gold} position={[(i%4-1.5)*.27,.044,Math.floor(i/4)*.55-.275]} raycast={noRaycast}/>)
      : code==='DICE'||code==='DICE_LEDGER'?[-.3,0,.3].map((x,i)=><mesh key={x} geometry={die} material={ivory} position={[x,.1,(i%2-.5)*.3]} raycast={noRaycast}/>)
      :[-.22,.22].map((x,i)=><mesh key={x} geometry={card} material={i?ivory:red} position={[x,.045,0]} rotation={[0,(i-.5)*.2,0]} raycast={noRaycast}/>)}
  </group>
}
function DebrisBatch({item,anchor}:{item:ParkDebris;anchor:TableAnchor}){
  const root=useRef<Group>(null),board=useRef<Group>(null),coins=useRef<InstancedMesh>(null)
  const stones=useRef<InstancedMesh>(null)
  const scratch=useMemo(()=>new Object3D(),[]),settled=useRef(false)
  const reduced=useMemo(()=>window.matchMedia('(prefers-reduced-motion: reduce)'),[])
  const scale=tableScale(anchor),at=Date.parse(item.occurredAt)
  const paths=useMemo(()=>Array.from({length:DEBRIS_COINS+1+(item.gameCode==='OMOK'?DEBRIS_STONES:0)},(_,n)=>{
    const p=debrisLanding(item,n-1),x=anchor.position[0]+p.x*scale,z=anchor.position[2]+p.z*scale
    return {floor:(serviceWalkHeight(x,z)-anchor.position[1])/scale+(n===0?.045:n>DEBRIS_COINS?.009:.012)}
  }),[item,anchor,scale])
  useFrame(({camera})=>{
    if(!root.current||!board.current||!coins.current)return
    const age=estimatedServerTime()-at
    root.current.visible=age>=0&&Math.hypot(camera.position.x-anchor.position[0],camera.position.z-anchor.position[2])<65
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
      for(let n=0;n<DEBRIS_STONES;n++){
        const p=debrisPose(item,DEBRIS_COINS+n,sampleAge,1.136,paths[DEBRIS_COINS+1+n]!.floor)
        scratch.position.set(p.x,p.y,p.z);scratch.rotation.set(p.rx,p.ry,p.rz)
        scratch.scale.setScalar(p.visible&&item.parts.includes('stone-'+n)?1:0)
        scratch.updateMatrix();stones.current.setMatrixAt(n,scratch.matrix)
        stones.current.setColorAt(n,stoneColors[n%2]!)
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
    {item.gameCode==='OMOK'&&<instancedMesh ref={stones} name={'park-debris-stones-'+item.id} args={[counter,stoneMaterial,DEBRIS_STONES]} frustumCulled={false} raycast={noRaycast} dispose={null}/>}
  </group>
}
export function ParkDebrisScene(){
  const items=useParkDebris(s=>s.items)
  const channelId=useParkDebris(s=>s.channelId)
  const ready=useSession(s=>s.status==='connected'&&s.mapCompatible&&s.roomId===channelId)
  if(!ready)return null
  return <group name="park-persistent-debris">{items.map(item=>{const anchor=anchors.get(item.anchorId)
    return anchor?<DebrisBatch key={item.id+'/'+item.parts.join(',')} item={item} anchor={anchor}/>:null})}</group>
}
