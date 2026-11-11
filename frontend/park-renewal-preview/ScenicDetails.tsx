import {useMemo} from 'react'
import {BufferGeometry,Float32BufferAttribute} from 'three'
import {terrain,paving,retaining,lakeWater,lakeShore,lakeBed,forestTrailMeshes,island,islandShore,lamps,benches,perimeterPoints} from './landscape'
import {heightAt} from './plan'
import {PreviewPathMaterial} from './PreviewPathMaterial'
import {PreviewTreeBatches} from './PreviewTreeBatches'
import {ReferenceBench} from '../src/world/art/ReferenceBenchFrames'
import {ParkLamps} from '../src/world/art/ParkFurniture'
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
const boundaryGeometry=(()=>{const points=perimeterPoints(),p:number[]=[],indices:number[]=[];points.forEach(v=>p.push(v.x,v.y,v.z,v.x,-4,v.z));for(let i=0;i<points.length-1;i++){const k=i*2;indices.push(k,k+2,k+1,k+1,k+2,k+3)}const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(p,3));g.setIndex(indices);g.computeVertexNormals();return g})()
function DirectionSigns(){const objects=useMemo(()=>SIGNPOSTS.map(s=>({s,group:orientWayfinding(factory('sign',s.boards.length===3?{variant:'crossroads',destinations:s.boards.map(b=>({label:b.label,direction:'right'}))}:{variant:'wood-arrow',label:s.boards[0]!.label,direction:'right'}),s)})),[]);return <>{objects.map(({s,group},i)=><group key={i} name={'advance-wayfinding-'+i} userData={{boards:s.boards}} position={[s.x,heightAt(s.x,s.z),s.z]}><primitive object={group} dispose={null}/></group>)}</>}
export function ScenicDetails(){
 return <>
  <mesh geometry={boundaryGeometry} receiveShadow><meshLambertMaterial color="#9caa83" side={2}/></mesh>
  <mesh position={[0,-4.1,0]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[2000,2000]}/><meshLambertMaterial color="#e8e8da"/></mesh>
  <mesh geometry={terrain} receiveShadow><meshLambertMaterial vertexColors/></mesh>
  <mesh name="steep-bank-stone-retaining-faces" geometry={retaining}><ParkStoneMaterial large/></mesh>
  <SecretWallDoors/>
  <group name="masonry-retaining-corner-seals">{SUMMIT_OUTLINE.map(([x,z],i)=>{const bottom=RETAINING_FOOTING_Y,top=SUMMIT_HEIGHT+.085;return <mesh key={i} position={[x,(top+bottom)/2,z]}><boxGeometry args={[.2,top-bottom,.2]}/><ParkStoneMaterial large/></mesh>})}</group>
  <mesh geometry={paving} receiveShadow><PreviewPathMaterial/></mesh>
  {forestTrailMeshes.map(t=><mesh key={t.id} name={t.id} geometry={t.geometry}><meshLambertMaterial color="#acaa84"/></mesh>)}
  <mesh geometry={lakeBed}><meshLambertMaterial color="#597c64"/></mesh>
  <OriginalPlaza/><ParkBoundary/><LakeAndParkDetails/>
  <mesh geometry={lakeShore}><meshLambertMaterial color="#b6b39b" side={2}/></mesh>
  <mesh name="large-lake-water" geometry={lakeWater}><meshPhongMaterial color="#719f99" shininess={55} specular="#c2e0d4" transparent opacity={.68} depthWrite={false}/></mesh>
  <mesh geometry={islandShore}><meshLambertMaterial color="#aeb18a"/></mesh><mesh geometry={island}><meshLambertMaterial color="#859a5d"/></mesh>
  <PreviewTreeBatches/>
  <ParkLamps placements={lampposts}/>
  {benches.map(({point:[x,z],yaw},i)=><ReferenceBench key={i} name={'renewal-bench-'+i} position={[x,heightAt(x,z)+.12,z]} yaw={yaw}/>)}
  <DirectionSigns/><HillsideFinishing/><JumpEnclosure/>

 </>
}
