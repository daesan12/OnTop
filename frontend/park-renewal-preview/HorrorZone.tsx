import {DoubleSide} from 'three'
import {horrorGround} from './horrorPlan'
import {horrorShell,horrorArt,horrorRamp,HORROR_LAMPS,HORROR_PENDANTS} from './horrorGeometry'
import {HorrorStoneMaterial} from './HorrorStoneMaterial'
import {HallDetails} from './InteriorDetails'
import {InteriorEncounters} from './InteriorEncounters'

export function HorrorZone(){
 return <group name="underground-horror-zone">
   <HallDetails/>
   <InteriorEncounters/>
   <ambientLight color="#b0b8a9" intensity={.25}/>
   {Object.entries(horrorShell).map(([k,g])=><mesh key={k} name={'opaque-underground-shell-'+k} geometry={g} userData={{keepOpaque:true}}><HorrorStoneMaterial/></mesh>)}
   <mesh geometry={horrorRamp} name="exit-return-ramp" userData={{keepOpaque:true}}><meshLambertMaterial color="#535a4c" side={DoubleSide}/></mesh>
   {Object.entries(horrorArt).map(([k,g])=><mesh key={k} geometry={g} name={'horror-'+k} userData={{keepOpaque:true}}>{k==='glow'?<meshBasicMaterial vertexColors toneMapped={false}/>:k==='stone'?<HorrorStoneMaterial/>:<meshLambertMaterial vertexColors flatShading side={DoubleSide} transparent={false}/>}</mesh>)}
   {HORROR_LAMPS.filter((_,i)=>i%2===0).map(([x,z],i)=><pointLight key={i} position={[x,horrorGround(x,z)+3,z]} color={i===4?'#8bb49a':'#d79b51'} intensity={34} distance={17} decay={1.4}/>)}
   {HORROR_PENDANTS.map(([x,z],i)=><pointLight key={'pendant-'+i} position={[x,12.1,z]} color={i===1?'#a7b49a':'#d5ae6c'} intensity={65} distance={27} decay={1.4}/>)}
 </group>
}
