import {useFrame} from '@react-three/fiber'
import {BufferGeometry,Float32BufferAttribute,Shape,Path,ShapeGeometry} from 'three'
import {Instances,type Part} from '../world/art/Instances'
import {buildingParts} from '../world/art/buildingParts'
import {MEDIA_BUILDINGS} from '../world/art/cityLayout'
import {MediaBuilding} from '../world/art/MediaBuilding'
import {DistantLandscape} from '../world/art/DistantLandscape'
import {createCityStreets} from '../world/art/CityStreets'
import {UrbanMaterial} from '../world/art/UrbanMaterials'
import {EnvironmentScene} from '../world/EnvironmentScene'
import {ENVIRONMENT} from '../config/environment'
import {boundaryFrame,streetPropFrame,layoutContextBuildings,CITY_BASE_Y,STREET} from './contextPlan'

function ring(inner:number,outer:number,y=CITY_BASE_Y+.12){
 const positions:number[]=[],indices:number[]=[],n=420
 for(let i=0;i<=n;i++){const a=i/n*Math.PI*2;for(const offset of[inner,outer]){const p=boundaryFrame(a,offset);positions.push(p.x,y,p.z)}if(i<n){const k=i*2;indices.push(k,k+2,k+1,k+1,k+2,k+3)}}
 const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return g
}
function cityGround(){
 const s=new Shape();s.moveTo(-1500,-1500);s.lineTo(1500,-1500);s.lineTo(1500,1500);s.lineTo(-1500,1500);s.closePath();const hole=new Path()
 for(let i=0;i<=420;i++){const p=boundaryFrame(i/420*Math.PI*2);if(i===0)hole.moveTo(p.x,-p.z);else hole.lineTo(p.x,-p.z)}hole.closePath();s.holes.push(hole)
 const g=new ShapeGeometry(s);g.rotateX(-Math.PI/2);g.translate(0,CITY_BASE_Y-.1,0);return g
}
const ground=cityGround(),asphalt=ring(...STREET.road),innerWalk=ring(...STREET.innerWalk,CITY_BASE_Y+.18),outerWalk=ring(...STREET.outerWalk,CITY_BASE_Y+.18),innerCurb=ring(8.75,9.05,CITY_BASE_Y+.23),outerCurb=ring(22.95,23.25,CITY_BASE_Y+.23)
const nativeStreets=createCityStreets(180)
const streetParts=(parts:readonly Part[]):Part[]=>parts.map(p=>{
 const frame=streetPropFrame(p.p[0],p.p[2]),a=p.r?.[1]??0,normalYaw=Math.atan2(frame.nx,frame.nz),quarter=Math.round(normalYaw/(Math.PI/2))*Math.PI/2
 return {...p,p:[frame.x,p.p[1]+CITY_BASE_Y+.12,frame.z],r:[p.r?.[0]??0,a+normalYaw-quarter,p.r?.[2]??0]}
})
const metal=streetParts(nativeStreets.metal),lights=streetParts(nativeStreets.lights),round=streetParts(nativeStreets.round)
const markings:Part[]=streetParts(nativeStreets.paint.filter(p=>p.p[1]>.5||Math.max(...p.s)<6&&Math.min(p.s[0],p.s[2])>.2))
for(const[offset,width,dashed,color]of[[15.87,.1,false,'#d5ac45'],[16.13,.1,false,'#d5ac45'],[9.5,.12,false,'#e8e5d9'],[22.5,.12,false,'#e8e5d9'],[12.7,.11,true,'#e8e5d9'],[19.3,.11,true,'#e8e5d9']] as const){
 let distance=0
 for(let i=0;i<420;i++){const a=boundaryFrame(i/420*Math.PI*2,offset),b=boundaryFrame((i+1)/420*Math.PI*2,offset),dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz),x=(a.x+b.x)/2,z=(a.z+b.z)/2;distance+=l
  if(Math.min(Math.abs(x),Math.abs(z))<6||dashed&&distance%6>3)continue
  markings.push({p:[x,CITY_BASE_Y+.135,z],s:[width,.018,l+.02],r:[0,Math.atan2(dx,dz),0],c:color})
 }
}
const layout=layoutContextBuildings(MEDIA_BUILDINGS)
function buildings(){const stone:Part[]=[],glass:Part[]=[],trim:Part[]=[]
 for(const b of layout.blocks){const parts=buildingParts(b);for(const[list,source]of[[stone,parts.stone],[glass,parts.glass],[trim,parts.metal]]as const)for(const p of source){const c=Math.cos(b.yaw),s=Math.sin(b.yaw);list.push({...p,p:[b.x+c*p.p[0]+s*p.p[2],CITY_BASE_Y+p.p[1],b.z-s*p.p[0]+c*p.p[2]],r:[p.r?.[0]??0,b.yaw+(p.r?.[1]??0),p.r?.[2]??0]})}}
 return {stone,glass,trim}
}
const city=buildings()
const media=layout.media
function EnvironmentDistance(){useFrame(({scene})=>{if(scene.fog&&'near'in scene.fog){scene.fog.near=620;scene.fog.far=1800}},-99);return null}
export function ParkEnvironment({night}:{night:boolean}){return <><EnvironmentScene fixedTime={ENVIRONMENT.epochMs+ENVIRONMENT.dayDurationMs*(night?.02:.6)}/><EnvironmentDistance/></>}
export function CityBackdrop(){
 return <group name="renewal-city-context" userData={{walkable:false,source:'existing-city-assets',advertising:false}}>
  <mesh name="outside-park-ground" geometry={ground}><meshLambertMaterial color="#b4bbaa" side={2}/></mesh>
  <mesh name="curved-city-carriageway" geometry={asphalt}><UrbanMaterial kind="asphalt" color="#656c6c"/></mesh>
  {[innerWalk,outerWalk].map((g,i)=><mesh key={i} name={'city-pavement-'+i} geometry={g}><meshLambertMaterial color="#c6c5b8" side={2}/></mesh>)}
  {[innerCurb,outerCurb].map((g,i)=><mesh key={i} geometry={g}><meshLambertMaterial color="#d3cfc0" side={2}/></mesh>)}
  <Instances parts={markings} shadow={false}><boxGeometry/></Instances>
  <Instances parts={metal} shadow={false}><boxGeometry/></Instances>
  <Instances parts={round} shadow={false}><cylinderGeometry args={[1,1,1,12]}/></Instances>
  <Instances parts={lights} shadow={false} material={<meshBasicMaterial color="#eedfb4"/>}><boxGeometry/></Instances>
  <group name="reused-city-buildings" userData={{keepOpaque:true}}>
   <Instances parts={city.stone} shadow={false}><boxGeometry/></Instances>
   <Instances parts={city.glass} shadow={false} material={<UrbanMaterial kind="glass"/>}><boxGeometry/></Instances>
   <Instances parts={city.trim} shadow={false}><boxGeometry/></Instances>
   <group position={[0,CITY_BASE_Y,0]}>{media.map(b=><MediaBuilding key={b.id} b={b} advertising={false}/>)}</group>
  </group>
  <group name="retained-mountains-and-seoul-tower" rotation={[0,Math.PI,0]}><DistantLandscape anchorTowerToRidge/></group>
 </group>
}
