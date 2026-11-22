
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

import {JumpEnclosure} from './JumpEnclosure'
import {LakeAndParkDetails} from './LakeAndParkDetails'
import {ParkBoundary,OriginalPlaza} from './ParkBoundary'
import {DirectionSigns} from './DirectionSigns'

import {SecretWallDoors} from './SecretWallDoors'
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
  <DirectionSigns live={live}/><HillsideFinishing/>{distantReady&&<JumpEnclosure/>}

 </>
}
