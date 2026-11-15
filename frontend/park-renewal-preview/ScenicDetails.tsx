import {useMemo} from 'react'
import {benches} from './landscape'
import {LakeSurface,ParkPathLights,RetainingFace} from './EntranceLandscape'
import {heightAt} from './plan'
import {ScenicGround} from './ScenicGround'
import {PreviewTreeBatches} from './PreviewTreeBatches'
import {ReferenceBench} from '../src/world/art/ReferenceBenchFrames'
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
function DirectionSigns(){const objects=useMemo(()=>SIGNPOSTS.map(s=>({s,group:orientWayfinding(factory('sign',s.boards.length===3?{variant:'crossroads',destinations:s.boards.map(b=>({label:b.label,direction:'right'}))}:{variant:'wood-arrow',label:s.boards[0]!.label,direction:'right'}),s)})),[]);return <>{objects.map(({s,group},i)=><group key={i} name={'advance-wayfinding-'+i} userData={{boards:s.boards}} position={[s.x,heightAt(s.x,s.z),s.z]}><primitive object={group} dispose={null}/></group>)}</>}
export function ScenicDetails({nightQuality,distantReady=true,live=false,includeGround=true,includeTrees=true,includeLandscape=true}:{nightQuality?:QualityPreset;distantReady?:boolean;live?:boolean;includeGround?:boolean;includeTrees?:boolean;includeLandscape?:boolean}={}){
 return <>
  {includeGround&&<ScenicGround/>}
  {includeLandscape&&<RetainingFace/>}
  <SecretWallDoors/>
  <group name="masonry-retaining-corner-seals" userData={{keepOpaque:true}}>{SUMMIT_OUTLINE.map(([x,z],i)=>{const bottom=RETAINING_FOOTING_Y,top=SUMMIT_HEIGHT+.085;return <mesh key={i} position={[x,(top+bottom)/2,z]}><boxGeometry args={[.2,top-bottom,.2]}/><ParkStoneMaterial large/></mesh>})}</group>
  {includeGround&&<><OriginalPlaza/><ParkBoundary/></>}<LakeAndParkDetails live={live} includeCurbs={includeLandscape}/>
  {includeLandscape&&<LakeSurface/>}
  {includeTrees&&<PreviewTreeBatches/>}
  {includeLandscape&&<ParkPathLights quality={nightQuality}/>}
  {benches.map(({point:[x,z],yaw},i)=><ReferenceBench key={i} name={'renewal-bench-'+i} position={[x,heightAt(x,z)+.12,z]} yaw={yaw}/>)}
  <DirectionSigns/><HillsideFinishing/>{distantReady&&<JumpEnclosure/>}

 </>
}
