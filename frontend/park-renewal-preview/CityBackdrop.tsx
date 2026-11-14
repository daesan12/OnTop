import {lazy,Suspense,useMemo,useState} from 'react'
import {cameraWorldPosition} from '../src/world/xrView'
import {useFrame} from '@react-three/fiber'
import {BufferGeometry,Float32BufferAttribute,Shape,Path,ShapeGeometry} from 'three'
import {Instances,type Part} from '../src/world/art/Instances'
import {buildingParts} from '../src/world/art/buildingParts'
import {MEDIA_BUILDINGS} from '../src/world/art/cityLayout'
import {DistantLandscape} from './original/world/art/DistantLandscape'
import {createCityStreets} from '../src/world/art/CityStreets'
import {UrbanMaterial} from '../src/world/art/UrbanMaterials'
import {EnvironmentScene} from '../src/world/EnvironmentScene'
import {ENVIRONMENT} from '../src/config/environment'
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
export type CityLayout = typeof layout
const CityBuildings=lazy(()=>import('./CityBuildings'))

let lowCity: {stone:Part[];glass:Part[]} | undefined
function getDistantCity(){
 if(lowCity)return lowCity
 const stone:Part[]=[],glass:Part[]=[]
 for(const b of [...layout.blocks,...layout.media]){
  const variant='variant' in b?b.variant:b.id==='east-media'?1:0
  const parts=buildingParts({...b,variant})
  const c=Math.cos(b.yaw),s=Math.sin(b.yaw)
  const place=(p:Part):Part=>({...p,p:[b.x+c*p.p[0]+s*p.p[2],CITY_BASE_Y+p.p[1],b.z-s*p.p[0]+c*p.p[2]],r:[0,b.yaw+(p.r?.[1]??0),0]})
  for(const p of parts.stone.filter((_,i)=>i!==1))stone.push(place(p))
  for(const p of parts.glass){
   const front=place(p),yaw=front.r![1]
   // A distant camera has less depth precision. Separate the window plane
   // from the opaque facade so neither surface flickers against the other.
   glass.push({...front,p:[front.p[0]+Math.sin(yaw)*.36,front.p[1],front.p[2]+Math.cos(yaw)*.36],s:[p.s[0],p.s[1],1]})
  }
 }
 return lowCity={stone,glass}
}

function DistantCity(){
 const city=useMemo(getDistantCity,[])
 return <group name="renewal-city-distant" userData={{keepOpaque:true,distanceProxy:true}}>
  <Instances parts={city.stone} shadow={false}><boxGeometry/></Instances>
  <Instances parts={city.glass} shadow={false} material={<UrbanMaterial kind="glass"/>}><planeGeometry/></Instances>
 </group>
}

const skyline=[...layout.blocks,...layout.media].map(b=>({...b,c:Math.cos(b.yaw),s:Math.sin(b.yaw)}))
function CitySkyline({distanceLod}:{distanceLod:boolean}){
 const [detailed,setDetailed]=useState(!distanceLod)
 useFrame(({camera})=>{
  if(!distanceLod)return
  const view=cameraWorldPosition(camera)
  const radius=detailed?44:32
  const near=skyline.some(b=>{
   const dx=view.x-b.x,dz=view.z-b.z
   const x=Math.max(0,Math.abs(dx*b.c-dz*b.s)-b.w/2),z=Math.max(0,Math.abs(dx*b.s+dz*b.c)-b.d/2)
   return x*x+z*z<radius*radius
  })
  if(near!==detailed)setDetailed(near)
 },.65)
 if(!distanceLod)return <CityBuildings layout={layout}/>
 return detailed
  ? <Suspense fallback={<DistantCity/>}><CityBuildings layout={layout}/></Suspense>
  : <DistantCity/>
}
function EnvironmentDistance(){useFrame(({scene})=>{if(scene.fog&&'near'in scene.fog){scene.fog.near=620;scene.fog.far=1800}},-99);return null}
export function ParkEnvironment({night}:{night:boolean}){return <><EnvironmentScene fixedTime={ENVIRONMENT.epochMs+ENVIRONMENT.dayDurationMs*(night?.02:.6)}/><EnvironmentDistance/></>}
export function CityBackdrop({distanceLod=false}:{distanceLod?:boolean}={}){
 return <group name="renewal-city-context" userData={{walkable:false,source:'existing-city-assets',advertising:false}}>
  <mesh name="outside-park-ground" geometry={ground}><meshLambertMaterial color="#b4bbaa" side={2}/></mesh>
  <mesh name="curved-city-carriageway" geometry={asphalt}><UrbanMaterial kind="asphalt" color="#656c6c"/></mesh>
  {[innerWalk,outerWalk].map((g,i)=><mesh key={i} name={'city-pavement-'+i} geometry={g}><meshLambertMaterial color="#c6c5b8" side={2}/></mesh>)}
  {[innerCurb,outerCurb].map((g,i)=><mesh key={i} geometry={g}><meshLambertMaterial color="#d3cfc0" side={2}/></mesh>)}
  <Instances parts={markings} shadow={false}><boxGeometry/></Instances>
  <Instances parts={metal} shadow={false}><boxGeometry/></Instances>
  <Instances parts={round} shadow={false}><cylinderGeometry args={[1,1,1,12]}/></Instances>
  <Instances parts={lights} shadow={false} material={<meshBasicMaterial color="#eedfb4"/>}><boxGeometry/></Instances>
  <CitySkyline distanceLod={distanceLod}/>
  <group name="retained-mountains-and-seoul-tower" rotation={[0,Math.PI,0]}><DistantLandscape anchorTowerToRidge/></group>
 </group>
}
