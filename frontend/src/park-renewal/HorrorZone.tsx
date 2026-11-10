import {useSyncExternalStore} from 'react'
import {DoubleSide,type Group,type Mesh} from 'three'
import {HORROR,HORROR_PORTALS,horrorState,subscribeHorror,horrorGround,inHorror} from './horrorPlan'
import {horrorShell,horrorArt,horrorRamp,HORROR_LAMPS,HORROR_PENDANTS} from './horrorGeometry'
import {ParkStoneMaterial} from './ParkStoneMaterial'
import {HorrorStoneMaterial} from './HorrorStoneMaterial'

export const horrorRenderGate={content:null as Group|null,doors:new Map<string,Mesh>()}
/** Called after movement/camera correction and before the same frame is rendered. */
export function syncHorrorRenderGate(x:number,y:number,z:number,walking:boolean){
 const visible=walking&&horrorState.inside&&inHorror(x,z)&&y>HORROR.floor&&y<HORROR.ceiling
 if(horrorRenderGate.content)horrorRenderGate.content.visible=visible
 for(const door of horrorRenderGate.doors.values())door.visible=!visible
 return visible
}

export function HorrorZone(){
 const inside=useSyncExternalStore(subscribeHorror,()=>horrorState.inside)
 return <group name="underground-horror-zone" userData={{localOnly:true}}>
  {HORROR_PORTALS.map(p=><mesh key={p.id} ref={door=>{if(door)horrorRenderGate.doors.set(p.id,door);else horrorRenderGate.doors.delete(p.id)}} visible={!inside} name={'concealed-'+p.id+'-stone-door'} position={[p.x+p.outward*.025,p.floor+p.height/2,p.z]} userData={{keepOpaque:true}}><boxGeometry args={[.4,p.height+.06,p.width+.08]}/><ParkStoneMaterial large twoSided/></mesh>)}
  <group ref={g=>{horrorRenderGate.content=g}} name="horror-interior-camera-gate" visible={inside}>
   <ambientLight color="#b0b8a9" intensity={.25}/>
   {Object.entries(horrorShell).map(([k,g])=><mesh key={k} name={'opaque-underground-shell-'+k} geometry={g} userData={{keepOpaque:true}}><HorrorStoneMaterial/></mesh>)}
   <mesh geometry={horrorRamp} name="exit-return-ramp" userData={{keepOpaque:true}}><meshLambertMaterial color="#535a4c" side={DoubleSide}/></mesh>
   {Object.entries(horrorArt).map(([k,g])=><mesh key={k} geometry={g} name={'horror-'+k} userData={{keepOpaque:true}}>{k==='glow'?<meshBasicMaterial vertexColors toneMapped={false}/>:k==='stone'?<HorrorStoneMaterial/>:<meshLambertMaterial vertexColors flatShading side={DoubleSide} transparent={false}/>}</mesh>)}
   {HORROR_LAMPS.filter((_,i)=>i%2===0).map(([x,z],i)=><pointLight key={i} position={[x,horrorGround(x,z)+3,z]} color={i===4?'#8bb49a':'#d79b51'} intensity={34} distance={17} decay={1.4}/>)}
   {HORROR_PENDANTS.map(([x,z],i)=><pointLight key={'pendant-'+i} position={[x,12.1,z]} color={i===1?'#a7b49a':'#d5ae6c'} intensity={65} distance={27} decay={1.4}/>)}
  </group>
 </group>
}
