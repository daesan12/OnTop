import {lakeShore,lakeBed,island,islandShore,lamps,retaining} from './landscape'
import {heightAt,LAKE} from './plan'
import {Water} from '../src/world/art/WaterGarden'
import {ParkStoneMaterial} from './ParkStoneMaterial'
import {PreservedFitness} from './PreservedFitness'
import {PreservedFountain} from './PreservedFountain'
import {ParkLamps} from '../src/world/art/ParkFurniture'
import {NightLighting} from '../src/world/NightLighting'
import type {QualityPreset} from '../src/config'

const lampposts=lamps.map(([x,z])=>[x,heightAt(x,z),z]as const)

export function LakeSurface() {
 return <>
  <mesh geometry={lakeBed}><meshLambertMaterial color="#597c64"/></mesh>
  <mesh geometry={lakeShore}><meshLambertMaterial color="#b6b39b" side={2}/></mesh>
  <Water position={[LAKE.x,LAKE.y,LAKE.z]} radius={[LAKE.rx,LAKE.rz]}/>
  <mesh geometry={islandShore}><meshLambertMaterial color="#aeb18a"/></mesh><mesh geometry={island}><meshLambertMaterial color="#859a5d"/></mesh>
 </>
}

export function RetainingFace() {
 return (
  <mesh name="steep-bank-stone-retaining-faces" geometry={retaining} userData={{keepOpaque:true}}><ParkStoneMaterial large twoSided/></mesh>
 )
}

export function ParkPathLights({quality}: {quality?: QualityPreset}) {
 return <>
  <ParkLamps placements={lampposts}/>
  {quality&&<NightLighting quality={quality} placements={lampposts}/>}
 </>
}

export function EntranceLandscape({quality, showFitnessStations}: {quality: QualityPreset; showFitnessStations: boolean}) {
 return <>
  <RetainingFace />
  <LakeSurface />
  <PreservedFitness showStations={showFitnessStations} />
  <PreservedFountain />
  <ParkPathLights quality={quality} />
 </>
}
