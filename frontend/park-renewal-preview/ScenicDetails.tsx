import {useMemo} from 'react'
import {BufferGeometry,Float32BufferAttribute} from 'three'
import {terrain,paving,retaining,lakeShore,lakeBed,forestTrailMeshes,island,islandShore,lamps,benches,perimeterPoints} from './landscape'
import {BRIDGE,heightAt,LAKE,site,STATION_STEPS} from './plan'
import {Water} from '../src/world/art/WaterGarden'
import {PreviewPathMaterial} from './PreviewPathMaterial'
import {PreviewTreeBatches} from './PreviewTreeBatches'
import {ReferenceBench} from '../src/world/art/ReferenceBenchFrames'
import {ParkLamps} from '../src/world/art/ParkFurniture'
import {NightLighting} from '../src/world/NightLighting'
import type {QualityPreset} from '../src/config'
import {ParkStoneMaterial} from './ParkStoneMaterial'
import {SUMMIT_OUTLINE,SUMMIT_HEIGHT} from './hybridTerrainPlan'
import {RETAINING_FOOTING_Y} from './siteFinishingPlan'
import {HillsideFinishing} from './HillsideFinishing'
import {factory} from './assetFactories'
import {JumpEnclosure} from './JumpEnclosure'
import {LakeAndParkDetails} from './LakeAndParkDetails'
import {ParkBoundary,OriginalPlaza} from './ParkBoundary'
import {orientWayfinding} from './wayfindingArt'
import {SIGNPOSTS} from './landscapePlan'
import {SecretWallDoors} from './SecretWallDoors'
const lampposts=lamps.map(([x,z])=>[x,heightAt(x,z),z]as const)
function terrainUnderStructure(x0:number,x1At:(z:number)=>number,z0:number,z1:number){
 const positions:number[]=[],colors:number[]=[],indices:number[]=[]
 const columns=Math.ceil((x1At((z0+z1)/2)-x0)/.25),rows=Math.ceil((z1-z0)/.25)
 for(let row=0;row<=rows;row++)for(let column=0;column<=columns;column++){
  const z=z0+(z1-z0)*row/rows,x=x0+(x1At(z)-x0)*column/columns
  const tone=.68+.035*Math.sin(x*.37+z*.29)
  positions.push(x,heightAt(x,z)+.068,z)
  colors.push(tone*.69,tone*.87,tone*.48)
  if(row&&column){
   const i=row*(columns+1)+column
   indices.push(i-columns-2,i-1,i-columns-1,i-columns-1,i-1,i)
  }
 }
 const g=new BufferGeometry()
 g.setAttribute('position',new Float32BufferAttribute(positions,3))
 g.setAttribute('color',new Float32BufferAttribute(colors,3))
 g.setIndex(indices)
 g.computeVertexNormals()
 return g
}
const balloon=site('balloon')
// Follow the existing curved stone bank, ending on the grass side of its crest.
const westBankGrassEdge=(z:number)=>LAKE.x-(LAKE.rx+.025)*Math.sqrt(1-((z-LAKE.z)/(LAKE.rz+.02))**2)
const supportGround=[
 terrainUnderStructure(BRIDGE.x0-.24,westBankGrassEdge,BRIDGE.z-BRIDGE.width/2-.09,BRIDGE.z+BRIDGE.width/2+.09),
 terrainUnderStructure(balloon.x-STATION_STEPS.halfX-.08,()=>balloon.x+STATION_STEPS.halfX+.08,
  balloon.z+STATION_STEPS.z0-.1,balloon.z+STATION_STEPS.z1+.08),
]
const boundaryGeometry=(()=>{const points=perimeterPoints(),p:number[]=[],indices:number[]=[];points.forEach(v=>p.push(v.x,v.y,v.z,v.x,-4,v.z));for(let i=0;i<points.length-1;i++){const k=i*2;indices.push(k,k+2,k+1,k+1,k+2,k+3)}const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(p,3));g.setIndex(indices);g.computeVertexNormals();return g})()
function DirectionSigns(){const objects=useMemo(()=>SIGNPOSTS.map(s=>({s,group:orientWayfinding(factory('sign',s.boards.length===3?{variant:'crossroads',destinations:s.boards.map(b=>({label:b.label,direction:'right'}))}:{variant:'wood-arrow',label:s.boards[0]!.label,direction:'right'}),s)})),[]);return <>{objects.map(({s,group},i)=><group key={i} name={'advance-wayfinding-'+i} userData={{boards:s.boards}} position={[s.x,heightAt(s.x,s.z),s.z]}><primitive object={group} dispose={null}/></group>)}</>}
export function ScenicGround(){
 return <>
  <mesh geometry={boundaryGeometry} receiveShadow><meshLambertMaterial color="#9caa83" side={2}/></mesh>
  <mesh position={[0,-4.1,0]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[2000,2000]}/><meshLambertMaterial color="#e8e8da"/></mesh>
  <mesh geometry={terrain} receiveShadow><meshLambertMaterial vertexColors/></mesh>
  {supportGround.map((geometry,index)=><mesh key={index} geometry={geometry} receiveShadow><meshLambertMaterial vertexColors/></mesh>)}
  <mesh geometry={paving} receiveShadow><PreviewPathMaterial/></mesh>
  {forestTrailMeshes.map(t=><mesh key={t.id} name={t.id} geometry={t.geometry}><meshLambertMaterial color="#acaa84"/></mesh>)}
 </>
}
export function ScenicDetails({nightQuality,distantReady=true,live=false,includeGround=true}:{nightQuality?:QualityPreset;distantReady?:boolean;live?:boolean;includeGround?:boolean}={}){
 return <>
  {includeGround&&<ScenicGround/>}
  <mesh name="steep-bank-stone-retaining-faces" geometry={retaining} userData={{keepOpaque:true}}><ParkStoneMaterial large twoSided/></mesh>
  <SecretWallDoors/>
  <group name="masonry-retaining-corner-seals" userData={{keepOpaque:true}}>{SUMMIT_OUTLINE.map(([x,z],i)=>{const bottom=RETAINING_FOOTING_Y,top=SUMMIT_HEIGHT+.085;return <mesh key={i} position={[x,(top+bottom)/2,z]}><boxGeometry args={[.2,top-bottom,.2]}/><ParkStoneMaterial large/></mesh>})}</group>
  <mesh geometry={lakeBed}><meshLambertMaterial color="#597c64"/></mesh>
  {includeGround&&<><OriginalPlaza/><ParkBoundary/></>}<LakeAndParkDetails live={live}/>
  <mesh geometry={lakeShore}><meshLambertMaterial color="#b6b39b" side={2}/></mesh>
  <Water position={[LAKE.x,LAKE.y,LAKE.z]} radius={[LAKE.rx,LAKE.rz]}/>
  <mesh geometry={islandShore}><meshLambertMaterial color="#aeb18a"/></mesh><mesh geometry={island}><meshLambertMaterial color="#859a5d"/></mesh>
  <PreviewTreeBatches/>
  <ParkLamps placements={lampposts}/>
  {nightQuality&&<NightLighting quality={nightQuality} placements={lampposts}/>}
  {benches.map(({point:[x,z],yaw},i)=><ReferenceBench key={i} name={'renewal-bench-'+i} position={[x,heightAt(x,z)+.12,z]} yaw={yaw}/>)}
  <DirectionSigns/><HillsideFinishing/>{distantReady&&<JumpEnclosure/>}

 </>
}
